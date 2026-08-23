// Ojas — NHCX Manual-Portal Eligibility Recording (P2 #8).
//
// For hospitals that submit NHCX coverage eligibility through the external
// portal (not via direct API), authorized operators record the official
// external transaction reference here.
//
// POST /api/abdm/nhcx/manual-eligibility
//
// Requires:
//   claimId        — the NHCX claim id this eligibility is for
//   externalTxnId  — the official external reference (REQUIRED, no exceptions)
//
// Semantics (P2 #9):
//   environment = MANUAL_PORTAL
//   source = MANUAL_PORTAL
//   isAuthoritative = true  (operator explicitly recording an official txn)
//   canUseForBilling = false  (NEVER auto-authorize billing from manual record)
//
// Billing authorization requires a separate explicit internal confirmation
// operation that sets canUseForBilling=true after review.
//
// Audit (P2 #10):
//   NHCX_MANUAL_PORTAL_ELIGIBILITY_RECORDED with actor, hospital, patient,
//   claim, externalTxnId, timestamp, environment, source.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole, requireTenantAccess } from "@/lib/auth";
import { audit, getClientIp, jsonError } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import { validate, ValidationError, nhcxManualEligibilitySchema } from "@/lib/validation";

type Ctx = { params: Promise<{}> };

async function POSTImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);

  let body;
  try {
    body = validate(nhcxManualEligibilitySchema, await req.json());
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid request body", 400);
  }

  // P2 (#8): externalTxnId is STRICTLY required. No exceptions.
  // This is the official external reference from the insurer/TPA/portal.
  if (!body.externalTxnId || body.externalTxnId.trim().length === 0) {
    return jsonError("externalTxnId is required for manual portal recording", 400);
  }

  // Find the NHCX claim this eligibility is for (tenant-scoped).
  const claim = await db.nhcxClaim.findFirst({
    where: { claimId: body.claimId, hospitalId: user.hospitalId },
    include: { patient: { select: { id: true, fullName: true } } },
  });
  if (!claim) return jsonError("NHCX claim not found", 404);
  await requireTenantAccess(user, claim.hospitalId);

  // Check for an existing ExternalTransaction with the same externalTxnId
  // (idempotency — recording the same external reference twice is a no-op).
  const existing = await db.externalTransaction.findFirst({
    where: {
      integration: "NHCX_COVERAGE_ELIGIBILITY",
      externalTransactionId: body.externalTxnId,
      hospitalId: user.hospitalId,
    },
  });
  if (existing) {
    return Response.json({
      ok: true,
      replayed: true,
      externalTransactionId: existing.id,
      message: "Manual eligibility already recorded — idempotent replay.",
    });
  }

  // Create the ExternalTransaction record (MANUAL_PORTAL).
  const extTxn = await db.externalTransaction.create({
    data: {
      hospitalId: user.hospitalId,
      patientId: claim.patientId,
      claimId: claim.id,
      integration: "NHCX_COVERAGE_ELIGIBILITY",
      payer: null,
      environment: "MANUAL_PORTAL",
      status: "COMPLETED",
      externalTransactionId: body.externalTxnId,
      externalReference: body.claimId,
      submittedAt: new Date(),
      acknowledgedAt: new Date(),
      completedAt: new Date(),
      // P2 (#9): manual submission is authoritative (operator recording an
      // official external txn) but canUseForBilling stays false until an
      // explicit internal billing confirmation.
      responseHash: null,
    },
  });

  // Update the NHCX coverage eligibility record if one exists.
  // isAuthoritative=true (operator confirmed), but canUseForBilling is NOT
  // a field on the eligibility record — billing authorization is a separate
  // step that happens via the claim-result/billing workflow.
  if (claim.abhaIdentityId) {
    const eligibility = await db.nhcxCoverageEligibility.findFirst({
      where: { abhaIdentityId: claim.abhaIdentityId, hospitalId: user.hospitalId },
      orderBy: { createdAt: "desc" },
    });
    if (eligibility) {
      await db.nhcxCoverageEligibility.update({
        where: { id: eligibility.id },
        data: {
          eligible: true,
          eligibleAmount: body.approvedAmount ? Number(body.approvedAmount) : null,
          environmentState: "MANUAL_PORTAL" as never,
          source: "MANUAL_PORTAL",
          isAuthoritative: true,
          respondedAt: new Date(),
        },
      });
    }
  }

  // P2 (#10): audit the manual recording.
  await audit({
    hospitalId: user.hospitalId,
    actorId: user.sub,
    action: "NHCX_MANUAL_PORTAL_ELIGIBILITY_RECORDED",
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
    message: "Manual eligibility recorded. Billing requires explicit confirmation.",
  });
}

export const POST = withErrors(POSTImpl);
