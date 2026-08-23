// Ojas — NHCX Manual-Portal Claim Recording (P2 #8).
//
// For hospitals that submit NHCX claims through the external portal (not via
// direct API), authorized operators record the official external transaction
// reference here.
//
// POST /api/abdm/nhcx/manual-claim
//
// Requires:
//   claimId        — the NHCX claim id this submission is for
//   externalTxnId  — the official external reference (REQUIRED, no exceptions)
//
// Semantics (P2 #9):
//   environment = MANUAL_PORTAL
//   source = MANUAL_PORTAL
//   isAuthoritative = true  (operator explicitly recording an official txn)
//   canUseForBilling = false  (NEVER auto-authorize billing from manual record)
//
// Audit (P2 #10):
//   NHCX_MANUAL_PORTAL_CLAIM_RECORDED with actor, hospital, patient,
//   claim, externalTxnId, timestamp, environment, source.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole, requireTenantAccess } from "@/lib/auth";
import { audit, getClientIp, jsonError } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import { validate, ValidationError, nhcxManualClaimSchema } from "@/lib/validation";

type Ctx = { params: Promise<{}> };

async function POSTImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);

  let body;
  try {
    body = validate(nhcxManualClaimSchema, await req.json());
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid request body", 400);
  }

  // P2 (#8): externalTxnId is STRICTLY required.
  if (!body.externalTxnId || body.externalTxnId.trim().length === 0) {
    return jsonError("externalTxnId is required for manual portal recording", 400);
  }

  // Find the NHCX claim (tenant-scoped).
  const claim = await db.nhcxClaim.findFirst({
    where: { claimId: body.claimId, hospitalId: user.hospitalId },
    include: { patient: { select: { id: true, fullName: true } } },
  });
  if (!claim) return jsonError("NHCX claim not found", 404);
  await requireTenantAccess(user, claim.hospitalId);

  // Idempotency: same externalTxnId → no-op replay.
  const existing = await db.externalTransaction.findFirst({
    where: {
      integration: "NHCX_CLAIM",
      externalTransactionId: body.externalTxnId,
      hospitalId: user.hospitalId,
    },
  });
  if (existing) {
    return Response.json({
      ok: true,
      replayed: true,
      externalTransactionId: existing.id,
      message: "Manual claim already recorded — idempotent replay.",
    });
  }

  // Create the ExternalTransaction record (MANUAL_PORTAL).
  const extTxn = await db.externalTransaction.create({
    data: {
      hospitalId: user.hospitalId,
      patientId: claim.patientId,
      claimId: claim.id,
      integration: "NHCX_CLAIM",
      payer: null,
      environment: "MANUAL_PORTAL",
      status: "COMPLETED",
      externalTransactionId: body.externalTxnId,
      externalReference: body.claimId,
      submittedAt: new Date(),
      acknowledgedAt: new Date(),
      completedAt: new Date(),
    },
  });

  // Update the NHCX claim: mark as submitted via MANUAL_PORTAL.
  // isAuthoritative=true (operator confirmed the external submission), but
  // the claim does NOT auto-transition to APPROVED/PAID — that requires the
  // explicit claim-result workflow (existing transition logic).
  await db.nhcxClaim.update({
    where: { id: claim.id },
    data: {
      // Mark as acknowledged (the external portal accepted it).
      // The existing state machine handles further transitions.
      integrationSource: "MANUAL_PORTAL",
      submittedAt: claim.submittedAt ?? new Date(),
    },
  });

  // P2 (#10): audit.
  await audit({
    hospitalId: user.hospitalId,
    actorId: user.sub,
    action: "NHCX_MANUAL_PORTAL_CLAIM_RECORDED",
    target: claim.id,
    detail: `externalTxnId=${body.externalTxnId} · environment=MANUAL_PORTAL · source=MANUAL_PORTAL · isAuthoritative=true · canUseForBilling=false (requires explicit confirmation)`,
    ip: getClientIp(req),
  });

  return Response.json({
    ok: true,
    externalTransactionId: extTxn.id,
    externalTxnId: body.externalTxnId,
    claimId: claim.claimId,
    isAuthoritative: true,
    canUseForBilling: false,
    message: "Manual claim recorded. Billing requires explicit claim-result confirmation.",
  });
}

export const POST = withErrors(POSTImpl);
