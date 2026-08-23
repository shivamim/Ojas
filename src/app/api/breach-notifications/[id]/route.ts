// Ojas — single breach notification API: update status (DRAFT → PENDING_APPROVAL → SENT).
// D3: DPDP Rules require notifying affected data principals within 72 hours.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole, requireTenantAccess } from "@/lib/auth";
import { audit, getClientIp, jsonError } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import { parseBody, breachStatusUpdateSchema, ValidationError } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/breach-notifications/[id] — update breach notification status
// Valid transitions: DRAFT → PENDING_APPROVAL → SENT
async function PATCHImpl(req: NextRequest, ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN"]);
  const { id } = await ctx.params;
  const breach = await db.breachNotification.findUnique({ where: { id } });
  if (!breach) return jsonError("Breach notification not found", 404);
  await requireTenantAccess(user, breach.hospitalId);

  let body: { status: "DRAFT" | "PENDING_APPROVAL" | "SENT"; approvedById?: string | null };
  try {
    body = await parseBody(req, breachStatusUpdateSchema);
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid body", 400);
  }

  const validStatuses = ["DRAFT", "PENDING_APPROVAL", "SENT"];

  // Validate status transition order
  const currentIdx = validStatuses.indexOf(breach.status);
  const newIdx = validStatuses.indexOf(body.status);
  if (newIdx < currentIdx)
    return jsonError(`Cannot transition from ${breach.status} back to ${body.status}`, 400);

  const data: Record<string, unknown> = { status: body.status };

  // When status changes to SENT, set notifiedAt timestamp
  if (body.status === "SENT" && breach.status !== "SENT") {
    data.notifiedAt = new Date();
  }

  // If approvedById is provided, store it
  if (body.approvedById) {
    data.approvedById = body.approvedById;
  }

  const updated = await db.breachNotification.update({
    where: { id },
    data,
  });

  await audit({
    hospitalId: breach.hospitalId,
    actorId: user.sub,
    action: "breach_notification.update",
    target: breach.id,
    detail: `Status: ${breach.status} → ${body.status}`,
    ip: getClientIp(req),
  });

  return Response.json({ breachNotification: updated });
}

export const PATCH = withErrors(PATCHImpl);
