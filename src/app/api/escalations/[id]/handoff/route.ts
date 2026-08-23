// Ojas — Escalation handoff API. Transfers an escalation's assignment to
// another team member. Logged to audit trail + timeline.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole, requireTenantAccess } from "@/lib/auth";
import { withErrors } from "@/lib/api-handler";
import { jsonError, audit, getClientIp } from "@/lib/server-utils";
import { parseBody, escalationHandoffSchema, ValidationError } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

async function POSTImpl(req: NextRequest, ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR", "DOCTOR"]);
  const { id } = await ctx.params;
  let body: { assignToId: string; note?: string | null };
  try {
    body = await parseBody(req, escalationHandoffSchema);
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid body", 400);
  }

  const escalation = await db.escalation.findUnique({
    where: { id },
    include: { patient: true },
  });
  if (!escalation) return jsonError("Escalation not found", 404);
  await requireTenantAccess(user, escalation.hospitalId);

  // Verify the target user is in the same hospital
  const targetUser = await db.user.findUnique({ where: { id: body.assignToId } });
  if (!targetUser) return jsonError("Target user not found", 404);
  if (targetUser.hospitalId !== escalation.hospitalId) return jsonError("Cannot assign to a user outside your hospital", 403);

  const previousAssignee = await db.user.findUnique({
    where: { id: escalation.assignedToId || "" },
    select: { name: true },
  }).catch(() => null);

  const updated = await db.escalation.update({
    where: { id },
    data: { assignedToId: body.assignToId, status: "IN_PROGRESS" },
  });

  await db.timelineEvent.create({
    data: {
      hospitalId: escalation.hospitalId,
      patientId: escalation.patientId,
      eventType: "HANDOFF",
      title: `Escalation handed off to ${targetUser.name}`,
      detail: `From ${previousAssignee?.name || "unassigned"} → ${targetUser.name}${body.note ? `. Note: ${body.note}` : ""}`,
      actorId: user.sub,
      occurredAt: new Date(),
    },
  });

  await audit({
    hospitalId: escalation.hospitalId,
    actorId: user.sub,
    action: "escalation.handoff",
    target: escalation.id,
    detail: `${previousAssignee?.name || "unassigned"} → ${targetUser.name}${body.note ? ` — ${body.note}` : ""}`,
    ip: getClientIp(req),
  });

  return Response.json({
    escalation: updated,
    assignee: { id: targetUser.id, name: targetUser.name, role: targetUser.role },
    message: `Escalation assigned to ${targetUser.name}`,
  });
}

export const POST = withErrors(POSTImpl);
