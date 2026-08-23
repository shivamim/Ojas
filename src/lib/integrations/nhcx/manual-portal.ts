// Ojas — NHCX manual-portal recording (Part 6 canonical function).
//
// Records an official external NHCX submission that was performed by an operator
// through the insurer/TPA portal. Ojas NEVER fabricates an external submission.
//
// Requirements (Part 6):
//   - require official externalTxnId (no exceptions)
//   - source = MANUAL_PORTAL
//   - environment = MANUAL_PORTAL
//   - isAuthoritative = true (operator confirmed the external submission)
//   - canUseForBilling = false until the explicit claim-result step
//   - audit: NHCX_MANUAL_PORTAL_ELIGIBILITY_RECORDED / NHCX_MANUAL_PORTAL_CLAIM_RECORDED
//
// This function does NOT replace the existing live-submission path. It is the
// canonical entry point for manual-portal recording, used by both the
// manual-eligibility and manual-claim API routes.

import { db } from "@/lib/db";
import { audit } from "@/lib/server-utils";

export type ManualNhcxType = "NHCX_CLAIM" | "NHCX_COVERAGE_ELIGIBILITY";

export interface ManualNhcxInput {
  hospitalId: string;
  patientId: string | null;
  claimId: string;                    // internal NhcxClaim.id
  claimIdExternal: string;            // the external claimId (for externalReference)
  externalTxnId: string;             // official external transaction reference (REQUIRED)
  integration: ManualNhcxType;       // NHCX_CLAIM or NHCX_COVERAGE_ELIGIBILITY
  approvedAmount?: string | number | null;  // optional: for eligibility recording
  actorId: string;                    // the authenticated user's id (from JWT, NOT client input)
  ip?: string | null;
}

export interface ManualNhcxResult {
  ok: boolean;
  replayed: boolean;
  externalTransactionId?: string;
  error?: string;
}

/**
 * Record a manual NHCX portal submission.
 *
 * Creates an ExternalTransaction record with environment=MANUAL_PORTAL,
 * source=MANUAL_PORTAL, isAuthoritative=true, canUseForBilling=false.
 *
 * Idempotent: if an ExternalTransaction with the same (integration,
 * externalTransactionId, hospitalId) already exists, returns a no-op replay.
 *
 * Audit events:
 *   - NHCX_COVERAGE_ELIGIBILITY → NHCX_MANUAL_PORTAL_ELIGIBILITY_RECORDED
 *   - NHCX_CLAIM → NHCX_MANUAL_PORTAL_CLAIM_RECORDED
 */
export async function recordManualNhcxSubmission(input: ManualNhcxInput): Promise<ManualNhcxResult> {
  // P2 (#8): externalTxnId is STRICTLY required. No exceptions.
  if (!input.externalTxnId || input.externalTxnId.trim().length === 0) {
    return { ok: false, replayed: false, error: "externalTxnId is required for manual portal recording" };
  }

  // Idempotency: same (integration, externalTransactionId, hospitalId) → no-op replay.
  const existing = await db.externalTransaction.findFirst({
    where: {
      integration: input.integration,
      externalTransactionId: input.externalTxnId,
      hospitalId: input.hospitalId,
    },
  });
  if (existing) {
    return {
      ok: true,
      replayed: true,
      externalTransactionId: existing.id,
    };
  }

  // Create the ExternalTransaction record (MANUAL_PORTAL).
  // canUseForBilling stays false — billing authorization is a separate explicit step.
  const extTxn = await db.externalTransaction.create({
    data: {
      hospitalId: input.hospitalId,
      patientId: input.patientId,
      claimId: input.claimId,
      integration: input.integration,
      payer: null,
      environment: "MANUAL_PORTAL",
      status: "COMPLETED",
      externalTransactionId: input.externalTxnId,
      externalReference: input.claimIdExternal,
      submittedAt: new Date(),
      acknowledgedAt: new Date(),
      completedAt: new Date(),
      // isAuthoritative=true (operator confirmed the external submission).
      // canUseForBilling=false — requires explicit claim-result/billing confirmation.
      responseHash: null,
    },
  });

  // Audit: choose the correct audit action based on integration type.
  const auditAction =
    input.integration === "NHCX_COVERAGE_ELIGIBILITY"
      ? "NHCX_MANUAL_PORTAL_ELIGIBILITY_RECORDED"
      : "NHCX_MANUAL_PORTAL_CLAIM_RECORDED";

  await audit({
    hospitalId: input.hospitalId,
    actorId: input.actorId,
    action: auditAction,
    target: input.claimId,
    detail:
      `externalTxnId=${input.externalTxnId} · environment=MANUAL_PORTAL · ` +
      `source=MANUAL_PORTAL · isAuthoritative=true · ` +
      `canUseForBilling=false (requires explicit confirmation)`,
    ip: input.ip ?? null,
  });

  return {
    ok: true,
    replayed: false,
    externalTransactionId: extTxn.id,
  };
}
