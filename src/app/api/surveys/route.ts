// Ojas — Patient satisfaction survey API. Collects real patient feedback at
// the end of the recovery window. One survey per patient (enforced by schema).
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole, requireTenantAccess } from "@/lib/auth";
import { withErrors } from "@/lib/api-handler";
import { parseBody, surveySchema, ValidationError } from "@/lib/validation";
import { jsonError, audit, getClientIp } from "@/lib/server-utils";

type Ctx = { params: Promise<{}> };

// GET /api/surveys — list surveys for the hospital (with optional patientId filter)
async function GETImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);
  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get("patientId");
  const where: Record<string, unknown> = { hospitalId: user.hospitalId };
  if (patientId) where.patientId = patientId;
  const surveys = await db.satisfactionSurvey.findMany({
    where,
    orderBy: { collectedAt: "desc" },
    take: 200,
    include: { patient: { select: { fullName: true, surgeryType: true, age: true } } },
  });
  // Compute aggregate stats
  const total = surveys.length;
  const avgOverall = total > 0 ? Math.round((surveys.reduce((s, x) => s + x.overallRating, 0) / total) * 10) / 10 : null;
  const avgCare = total > 0 ? Math.round((surveys.filter(s => s.careQuality).reduce((s, x) => s + (x.careQuality || 0), 0) / total) * 10) / 10 : null;
  const avgCommunication = total > 0 ? Math.round((surveys.filter(s => s.communication).reduce((s, x) => s + (x.communication || 0), 0) / total) * 10) / 10 : null;
  const avgResponsiveness = total > 0 ? Math.round((surveys.filter(s => s.responsiveness).reduce((s, x) => s + (x.responsiveness || 0), 0) / total) * 10) / 10 : null;
  const recommendRate = surveys.filter(s => s.wouldRecommend).length > 0
    ? Math.round((surveys.filter(s => s.wouldRecommend).length / total) * 1000) / 10
    : null;
  // Rating distribution
  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 } as Record<number, number>;
  for (const s of surveys) distribution[s.overallRating] = (distribution[s.overallRating] || 0) + 1;
  return Response.json({
    surveys,
    aggregate: {
      total,
      avgOverall, avgCare, avgCommunication, avgResponsiveness, recommendRate,
      distribution,
    },
  });
}

// POST /api/surveys — collect a new survey for a patient
async function POSTImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);
  let body: {
    patientId: string;
    overallRating: number;
    careQuality?: number | null;
    communication?: number | null;
    responsiveness?: number | null;
    wouldRecommend?: boolean | null;
    freeText?: string | null;
  };
  try {
    body = await parseBody(req, surveySchema);
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid body", 400);
  }
  const patient = await db.patient.findUnique({ where: { id: body.patientId } });
  if (!patient) return jsonError("Patient not found", 404);
  await requireTenantAccess(user, patient.hospitalId);
  // Check for existing survey
  const existing = await db.satisfactionSurvey.findUnique({ where: { patientId: patient.id } });
  if (existing) return jsonError("A survey already exists for this patient", 409);
  const survey = await db.satisfactionSurvey.create({
    data: {
      hospitalId: patient.hospitalId,
      patientId: patient.id,
      overallRating: body.overallRating,
      careQuality: body.careQuality ?? null,
      communication: body.communication ?? null,
      responsiveness: body.responsiveness ?? null,
      wouldRecommend: body.wouldRecommend ?? null,
      freeText: body.freeText ?? null,
    },
  });
  await db.timelineEvent.create({
    data: {
      hospitalId: patient.hospitalId, patientId: patient.id,
      eventType: "SATISFACTION_SURVEY", title: `Satisfaction survey collected (${body.overallRating}/5)`,
      detail: body.freeText ? `Feedback: ${body.freeText.slice(0, 200)}` : "Survey collected.",
      actorId: user.sub, occurredAt: new Date(),
    },
  });
  await audit({
    hospitalId: patient.hospitalId, actorId: user.sub, action: "survey.collect",
    target: survey.id, detail: `${body.overallRating}/5 for ${patient.fullName}`,
    ip: getClientIp(req),
  });
  return Response.json({ survey }, { status: 201 });
}

export const GET = withErrors(GETImpl);
export const POST = withErrors(POSTImpl);
