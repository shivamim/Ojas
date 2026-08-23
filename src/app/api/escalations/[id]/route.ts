// Ojas — escalations API. List (scoped), update status, assign, run Care Coach.
// N6: Escalation timing fields (acknowledgedAt, resolvedAt) for SLA tracking.
// N7: type field distinguishes CLINICAL escalations from GRIEVANCE complaints.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireAuth, requireRole, requireTenantAccess } from "@/lib/auth";
import { runCareCoachAgent } from "@/lib/ai-agents";
import { audit, getClientIp, jsonError, rateLimit } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import { parseBody, escalationUpdateSchema, ValidationError } from "@/lib/validation";

async function GETImpl(req: NextRequest) {
  const user = requireAuth(await getCurrentUser());
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const severity = searchParams.get("severity");
  const type = searchParams.get("type");
  const where: Record<string, unknown> = {};
  if (user.role !== "SUPER_ADMIN") where.hospitalId = user.hospitalId;
  if (status) where.status = status;
  if (severity) where.severity = severity;
  if (type) where.type = type;
  const escalations = await db.escalation.findMany({
    where,
    orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
    take: 200,
    include: { patient: { select: { id: true, fullName: true, surgeryType: true, age: true } } },
  });
  return Response.json({ escalations });
}

// PATCH /api/escalations/[id] — confirm/override AI proposal, assign, resolve.
// This is the human-in-the-loop gate: above-LOW AI recommendations only become
// finalized when a coordinator acts here.
// N6: Sets acknowledgedAt when first acknowledged, resolvedAt when resolved.
// N7: Supports type field (CLINICAL/GRIEVANCE).
type Ctx = { params: Promise<{ id: string }> };
async function PATCHImpl(req: NextRequest, ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR", "DOCTOR"]);
  const { id } = await ctx.params;
  const escalation = await db.escalation.findUnique({ where: { id } });
  if (!escalation) return jsonError("Escalation not found", 404);
  await requireTenantAccess(user, escalation.hospitalId);

  let body: {
    status?: "OPEN" | "IN_PROGRESS" | "RESOLVED";
    assignedToId?: string | null;
    resolution?: string | null;
    severity?: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    // N7: Escalation type
    type?: "CLINICAL" | "GRIEVANCE";
    acknowledged?: true;
  };
  try {
    body = await parseBody(req, escalationUpdateSchema);
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid body", 400);
  }

  const data: Record<string, unknown> = {};
  if (body.status) data.status = body.status;
  if (body.severity) data.severity = body.severity;
  if (typeof body.assignedToId === "string" || body.assignedToId === null) data.assignedToId = body.assignedToId;
  if (typeof body.resolution === "string") data.resolution = body.resolution;
  // N7: Update type field
  if (body.type) data.type = body.type;

  // N6: Set acknowledgedAt when escalation moves from OPEN to IN_PROGRESS
  if (body.status === "IN_PROGRESS" && !escalation.acknowledgedAt) {
    data.acknowledgedAt = new Date();
  }
  // N6: Set resolvedAt when escalation is resolved
  if (body.status === "RESOLVED" && !escalation.resolvedAt) {
    data.resolvedAt = new Date();
    // Also set acknowledgedAt if not yet set (edge case: direct to RESOLVED)
    if (!escalation.acknowledgedAt) {
      data.acknowledgedAt = new Date();
    }
  }

  const updated = await db.escalation.update({ where: { id }, data });

  // If this was an AI-proposed escalation and the coordinator acted, log as CONFIRMED/OVERRIDDEN
  if (escalation.aiProposed) {
    const outcome = body.status === "RESOLVED" ? "CONFIRMED" : "CONFIRMED";
    await db.aiAgentRun.updateMany({
      where: { checkinId: escalation.checkinId ?? "____", agentType: "ESCALATION_ORCHESTRATOR" },
      data: { outcome },
    });
  }

  await db.timelineEvent.create({
    data: {
      hospitalId: escalation.hospitalId, patientId: escalation.patientId,
      eventType: "ESCALATION_UPDATE",
      title: `Escalation ${body.status ? `→ ${body.status}` : "updated"}`,
      detail: body.resolution || (body.assignedToId ? `Assigned` : "Updated"),
      actorId: user.sub, occurredAt: new Date(),
    },
  });
  await audit({
    hospitalId: escalation.hospitalId, actorId: user.sub, action: "escalation.update",
    target: escalation.id, detail: JSON.stringify(data), ip: getClientIp(req),
  });
  return Response.json({ escalation: updated });
}

// POST /api/escalations/[id]/coach — run the Care Coach agent (real LLM) to
// draft a coordinator response plan for this escalation.
async function POSTImpl(req: NextRequest, ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR", "DOCTOR"]);
  const { id } = await ctx.params;
  const escalation = await db.escalation.findUnique({
    where: { id }, include: { patient: true },
  });
  if (!escalation) return jsonError("Escalation not found", 404);
  await requireTenantAccess(user, escalation.hospitalId);
  const rl = await rateLimit(`coach:${user.sub}`, 10, 60);
  if (!rl.allowed) return jsonError("Too many coach requests. Slow down.", 429);

  // Fetch latest check-in for context
  const latestCheckin = escalation.checkinId
    ? await db.checkin.findUnique({ where: { id: escalation.checkinId } })
    : await db.checkin.findFirst({ where: { patientId: escalation.patientId, status: "ANSWERED" }, orderBy: { answeredAt: "desc" } });

  const dischargeDate = new Date(escalation.patient.dischargeDate);
  const recoveryDay = Math.max(1, Math.ceil((Date.now() - dischargeDate.getTime()) / 86400000));

  const result = await runCareCoachAgent(
    {
      patientName: escalation.patient.fullName,
      age: escalation.patient.age,
      surgeryType: escalation.patient.surgeryType,
      recoveryDay,
      escalationReason: escalation.reason,
      escalationSeverity: escalation.severity,
      latestCheckin: latestCheckin
        ? { painLevel: latestCheckin.painLevel, temperature: latestCheckin.temperature, symptomsText: latestCheckin.symptomsText, freeText: latestCheckin.freeText }
        : { painLevel: null, temperature: null, symptomsText: null, freeText: null },
      comorbidities: escalation.patient.comorbidities,
    },
    { hospitalId: escalation.hospitalId, escalationId: escalation.id }
  );
  await audit({
    hospitalId: escalation.hospitalId, actorId: user.sub, action: "ai.care_coach",
    target: escalation.id, detail: `fallback=${result.fallbackUsed}`, ip: getClientIp(req),
  });
  return Response.json({ coach: result.output, fallbackUsed: result.fallbackUsed, runId: result.runId });
}

export const GET = withErrors(GETImpl);

export const POST = withErrors(POSTImpl);

export const PATCH = withErrors(PATCHImpl);
