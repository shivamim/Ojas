// Ojas — Update/resolve a DPDP DSR.
// PATCH /api/dpdp/request/[id] — set status, response text, mark resolved.
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole, requireTenantAccess } from "@/lib/auth";
import { audit, getClientIp, jsonError } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";

type Ctx = { params: Promise<{ id: string }> };

const patchSchema = z.object({
  status: z.enum(["PENDING", "IN_REVIEW", "FULFILLED", "REJECTED"]).optional(),
  response: z.string().max(5000).optional(),
  resolved: z.boolean().optional(),
});

// P1 FIX: Status transition validation. Only valid transitions are allowed.
// Only HOSPITAL_ADMIN can mark FULFILLED or REJECTED (sensitive data actions).
const VALID_TRANSITIONS: Record<string, string[]> = {
  PENDING: ["IN_REVIEW", "REJECTED"],
  IN_REVIEW: ["FULFILLED", "REJECTED", "PENDING"],
  FULFILLED: [],  // Terminal state — no further transitions
  REJECTED: ["IN_REVIEW"],  // Can re-open a rejected request
};

async function PATCHImpl(req: NextRequest, ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN"]);
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid body", 400);

  const existing = await db.dpdpRequest.findUnique({
    where: { id },
    include: { patient: { select: { hospitalId: true } } },
  });
  if (!existing) return jsonError("Not found", 404);
  await requireTenantAccess(user, existing.patient.hospitalId);

  // P1 FIX: Validate status transition
  if (parsed.data.status && parsed.data.status !== existing.status) {
    const allowed = VALID_TRANSITIONS[existing.status] ?? [];
    if (!allowed.includes(parsed.data.status)) {
      return jsonError(`Invalid transition: ${existing.status} → ${parsed.data.status}`, 409);
    }
    // FULFILLED and REJECTED require explicit resolved=true or status confirmation
    // (already enforced by role check above — HOSPITAL_ADMIN only)
  }

  const data: Record<string, unknown> = {};
  if (parsed.data.status) data.status = parsed.data.status;
  if (typeof parsed.data.response === "string") data.response = parsed.data.response;
  if (parsed.data.resolved) {
    // P1 FIX: Only allow marking fulfilled if current state allows transition to FULFILLED
    const allowedFrom = VALID_TRANSITIONS[existing.status] ?? [];
    if (!allowedFrom.includes("FULFILLED")) {
      return jsonError(`Cannot mark as fulfilled from current state: ${existing.status}`, 409);
    }
    data.status = "FULFILLED";
    data.resolvedAt = new Date();
    data.resolvedById = user.sub;
  }
  const updated = await db.dpdpRequest.update({ where: { id }, data });
  await audit({
    hospitalId: existing.patient.hospitalId, actorId: user.sub, action: "DPDP_REQUEST_UPDATED",
    target: id, detail: `status_changed_to=${data.status ?? existing.status} resolved=${!!parsed.data.resolved}`, ip: getClientIp(req),
  });
  return Response.json({ request: updated });
}

export const PATCH = withErrors(PATCHImpl);
