// Ojas — Mark a FamilyUpdate as delivered/read.
//
// P0 FIX: this route was previously UNAUTHENTICATED — anyone could update any
// hospital's FamilyUpdate status. Now requires HOSPITAL_ADMIN/COORDINATOR auth +
// tenant ownership verification. Status updates from WhatsApp delivery receipts
// are handled INSIDE the authenticated webhook flow (/api/whatsapp/inbound),
// NOT via this public endpoint.
//
// This route is for INTERNAL use (e.g. a coordinator manually marking a
// family update as failed). It enforces:
//   • authentication (cookie-based JWT)
//   • role authorization (HOSPITAL_ADMIN, COORDINATOR)
//   • tenant ownership (the FamilyUpdate must belong to the caller's hospital)
//   • validated request body (Zod)
//   • forward-only status advancement (can't go from READ back to SENT)
//   • audit logging
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { audit, getClientIp, jsonError } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import { validate, ValidationError } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

const familyUpdateStatusSchema = z.object({
  status: z.enum(["SENT", "DELIVERED", "READ", "FAILED"]),
}).strict();

// Forward-only status ordering — prevents replay/backward status changes.
const STATUS_ORDER: Record<string, number> = {
  QUEUED: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: 4,
};

async function PATCHImpl(req: NextRequest, ctx: Ctx) {
  // P0: require authentication + role authorization.
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);

  const { id } = await ctx.params;

  // P0: validate request body.
  let body;
  try {
    body = validate(familyUpdateStatusSchema, await req.json());
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid request body", 400);
  }

  // P0: tenant ownership — the FamilyUpdate must belong to the caller's hospital.
  const update = await db.familyUpdate.findFirst({
    where: { id, hospitalId: user.hospitalId },
    select: { id: true, hospitalId: true, status: true, patientId: true },
  });
  if (!update) return jsonError("Not found", 404);

  // P0: forward-only status — can't go backward (e.g. READ → SENT).
  const currentOrder = STATUS_ORDER[update.status] ?? 0;
  const newOrder = STATUS_ORDER[body.status] ?? 0;
  if (body.status !== "FAILED" && newOrder <= currentOrder) {
    return jsonError(`Status cannot go backward (${update.status} → ${body.status})`, 400);
  }

  // Build the update data.
  const data: Record<string, unknown> = { status: body.status };
  if (body.status === "DELIVERED") data.deliveredAt = new Date();
  if (body.status === "READ") {
    data.deliveredAt = data.deliveredAt ?? new Date();
    data.readAt = new Date();
  }
  if (body.status === "FAILED") {
    data.status = "FAILED";
  }

  await db.familyUpdate.update({ where: { id }, data });

  // P0: audit the status change.
  await audit({
    hospitalId: user.hospitalId,
    actorId: user.sub,
    action: "FAMILY_UPDATE_STATUS_CHANGED",
    target: `familyUpdate:${id}`,
    detail: `Status: ${update.status} → ${body.status}. Patient: ${update.patientId}.`,
    ip: getClientIp(req),
  });

  return Response.json({ ok: true });
}

export const PATCH = withErrors(PATCHImpl);
