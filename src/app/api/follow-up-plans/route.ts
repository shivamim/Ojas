// Ojas — follow-up plans API (N2: first-class record linked to discharge).
// Captures the planned follow-up date, mode, and responsible clinician explicitly.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireAuth, requireTenantAccess } from "@/lib/auth";
import { audit, getClientIp, jsonError } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import { parseBody, followUpPlanSchema, ValidationError } from "@/lib/validation";

type Ctx = { params: Promise<{}> };

// GET /api/follow-up-plans — list follow-up plans (filtered by patientId or status)
async function GETImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireAuth(await getCurrentUser());
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);
  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get("patientId");
  const status = searchParams.get("status");
  const where: Record<string, unknown> = { hospitalId: user.hospitalId };
  if (patientId) where.patientId = patientId;
  if (status) where.status = status;

  const followUpPlans = await db.followUpPlan.findMany({
    where,
    orderBy: { plannedDate: "asc" },
    take: 200,
    include: { patient: { select: { id: true, fullName: true, surgeryType: true } } },
  });
  return Response.json({ followUpPlans });
}

// POST /api/follow-up-plans — create a follow-up plan
async function POSTImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireAuth(await getCurrentUser());
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);

  let body: {
    patientId: string;
    plannedDate: string;
    mode: "CALL" | "WHATSAPP" | "IN_PERSON" | "TELECONSULT";
    responsibleClinician?: string | null;
    notes?: string | null;
  };
  try {
    body = await parseBody(req, followUpPlanSchema);
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid request body", 400);
  }

  // Verify patient exists and belongs to the user's hospital
  const patient = await db.patient.findUnique({ where: { id: body.patientId } });
  if (!patient) return jsonError("Patient not found", 404);
  await requireTenantAccess(user, patient.hospitalId);

  const followUpPlan = await db.followUpPlan.create({
    data: {
      hospitalId: user.hospitalId,
      patientId: body.patientId,
      plannedDate: new Date(body.plannedDate),
      mode: body.mode,
      responsibleClinician: body.responsibleClinician || null,
      notes: body.notes || null,
      status: "SCHEDULED",
    },
  });

  await db.timelineEvent.create({
    data: {
      hospitalId: user.hospitalId,
      patientId: body.patientId,
      eventType: "FOLLOW_UP_PLANNED",
      title: "Follow-up plan created",
      detail: `${body.mode} follow-up scheduled for ${new Date(body.plannedDate).toISOString().slice(0, 10)}${body.responsibleClinician ? ` with ${body.responsibleClinician}` : ""}`,
      actorId: user.sub,
      occurredAt: new Date(),
    },
  });

  await audit({
    hospitalId: user.hospitalId,
    actorId: user.sub,
    action: "follow_up_plan.create",
    target: followUpPlan.id,
    detail: `Patient: ${patient.fullName}, mode: ${body.mode}, planned: ${new Date(body.plannedDate).toISOString().slice(0, 10)}`,
    ip: getClientIp(req),
  });

  return Response.json({ followUpPlan }, { status: 201 });
}

export const GET = withErrors(GETImpl);
export const POST = withErrors(POSTImpl);
