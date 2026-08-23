// Ojas — single consent record API: revoke (PATCH), no DELETE (append-only audit).
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireAuth, requireTenantAccess } from "@/lib/auth";
import { audit, getClientIp, jsonError } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";

type Ctx = { params: Promise<{ id: string }> };

// PATCH /api/consent/[id] — revoke a specific consent record
async function PATCHImpl(req: NextRequest, ctx: Ctx) {
  const user = requireAuth(await getCurrentUser());
  const { id } = await ctx.params;
  const consentRecord = await db.consentRecord.findUnique({ where: { id } });
  if (!consentRecord) return jsonError("Consent record not found", 404);
  await requireTenantAccess(user, consentRecord.hospitalId);
  if (consentRecord.revokedAt) return jsonError("Consent already revoked", 409);

  const updated = await db.consentRecord.update({
    where: { id },
    data: { revokedAt: new Date() },
  });

  await audit({
    hospitalId: consentRecord.hospitalId,
    actorId: user.sub,
    action: "consent.revoke",
    target: consentRecord.id,
    detail: `Purpose: ${consentRecord.purpose}`,
    ip: getClientIp(req),
  });

  return Response.json({ consentRecord: updated });
}

// DELETE is not allowed — consent records are append-only for audit compliance
async function DELETEImpl() {
  return jsonError("Consent records cannot be deleted (append-only for DPDP audit)", 405);
}

export const PATCH = withErrors(PATCHImpl);
export const DELETE = withErrors(DELETEImpl);
