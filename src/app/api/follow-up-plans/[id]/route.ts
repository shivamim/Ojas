// Ojas — single follow-up plan API: update status (SCHEDULED → COMPLETED/MISSED/CANCELLED).
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireAuth, requireTenantAccess } from "@/lib/auth";
import { audit, getClientIp, jsonError } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import { parseBody, followUpPlanUpdateSchema, ValidationError } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/follow-up-plans/[id] — update follow-up plan status
async function PATCHImpl(req: NextRequest, ctx: Ctx) {
  const user = requireAuth(await getCurrentUser());
  const { id } = await ctx.params;
  const plan = await db.followUpPlan.findUnique({ where: { id } });
  if (!plan) return jsonError("Follow-up plan not found", 404);
  await requireTenantAccess(user, plan.hospitalId);

  let body: {
    status?: "SCHEDULED" | "COMPLETED" | "MISSED" | "CANCELLED";
    notes?: string | null;
    responsibleClinician?: string | null;
  };
  try {
    body = await parseBody(req, followUpPlanUpdateSchema);
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid body", 400);
  }

  const data: Record<string, unknown> = {};

  if (body.status) {
    data.status = body.status;
    // Set completedAt when status changes to COMPLETED
    if (body.status === "COMPLETED" && plan.status !== "COMPLETED") {
      data.completedAt = new Date();
    }
  }

  if (typeof body.notes === "string") data.notes = body.notes;
  if (typeof body.responsibleClinician === "string") data.responsibleClinician = body.responsibleClinician;

  const updated = await db.followUpPlan.update({
    where: { id },
    data,
  });

  if (body.status && body.status !== plan.status) {
    await db.timelineEvent.create({
      data: {
        hospitalId: plan.hospitalId,
        patientId: plan.patientId,
        eventType: "FOLLOW_UP_STATUS_CHANGE",
        title: `Follow-up plan → ${body.status}`,
        detail: `Follow-up (${plan.mode}) changed from ${plan.status} to ${body.status}`,
        actorId: user.sub,
        occurredAt: new Date(),
      },
    });
  }

  await audit({
    hospitalId: plan.hospitalId,
    actorId: user.sub,
    action: "follow_up_plan.update",
    target: plan.id,
    detail: `Status: ${plan.status} → ${body.status || plan.status}`,
    ip: getClientIp(req),
  });

  return Response.json({ followUpPlan: updated });
}

export const PATCH = withErrors(PATCHImpl);
