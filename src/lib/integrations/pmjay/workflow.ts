// Ojas — PM-JAY preauth + claim + query workflow domain service.
//
// Implements: prepare packet → submit → pending → approved/rejected/query →
// settlement. Separates packageAmount, claimedAmount, approvedAmount,
// deductionAmount, patientShare, settledAmount — all Decimal.
//
// MANUAL_PORTAL mode is supported end-to-end: the operator submits through the
// official portal and records the official reference number in Ojas. Ojas
// tracks status + stores documents + never fabricates an external submission.
import { db } from "@/lib/db";
import { pmjayMode, pmjayModeForHospital, toDecimal, type PmjayMode } from "./beneficiary";
import { Prisma } from "@prisma/client";

// ── Preauth ────────────────────────────────────────────────────────────────────
export interface PreauthCreateInput {
  hospitalId: string;
  patientId: string;
  beneficiaryId: string;
  packageId?: string | null;
  clientRequestId: string;          // idempotency key
  admissionDate?: Date;
  diagnosis?: string;
  documents?: Array<{ type: string; name: string; storageRef: string }>;
  packageAmount?: string;
  estimatedAmount?: string;
}

export interface PreauthSubmitInput {
  preauthId: string;
  actorId: string;
  externalTxnId?: string;           // required for MANUAL_PORTAL
  rawResponse?: string;
}

/** Create a preauth packet in DRAFT state. Documents are stored as JSON. */
export async function createPreauth(input: PreauthCreateInput) {
  // Idempotency: if clientRequestId exists, return the existing preauth.
  const existing = await db.pmjayPreauth.findUnique({ where: { clientRequestId: input.clientRequestId } });
  if (existing) return { ok: true, preauth: existing, replayed: true };

  // Part 5: hospital-aware resolver — profile.pmjayMode overrides global env.
  const mode = await pmjayModeForHospital(input.hospitalId);
  const status: "DRAFT" | "DOCUMENTS_PENDING" = input.documents && input.documents.length > 0 ? "DRAFT" : "DOCUMENTS_PENDING";
  try {
    const preauth = await db.pmjayPreauth.create({
      data: {
        hospitalId: input.hospitalId,
        patientId: input.patientId,
        beneficiaryId: input.beneficiaryId,
        packageId: input.packageId ?? null,
        clientRequestId: input.clientRequestId,
        status,
        admissionDate: input.admissionDate ?? null,
        diagnosis: input.diagnosis ?? null,
        documents: input.documents ? JSON.stringify(input.documents) : null,
        packageAmount: input.packageAmount ? toDecimal(input.packageAmount) : null,
        estimatedAmount: input.estimatedAmount ? toDecimal(input.estimatedAmount) : null,
        providerMode: mode,
        source: "LOCAL_RECORD",
      },
    });
    return { ok: true, preauth, replayed: false };
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      const race = await db.pmjayPreauth.findUnique({ where: { clientRequestId: input.clientRequestId } });
      if (race) return { ok: true, preauth: race, replayed: true };
    }
    throw e;
  }
}

/** Submit a preauth. For MANUAL_PORTAL, the operator supplies externalTxnId
 *  from the official portal. For LIVE_API/STATE_API, Ojas calls the endpoint.
 *  For SANDBOX/LOCAL, Ojas records the submission but labels it non-authoritative. */
export async function submitPreauth(input: PreauthSubmitInput) {
  const preauth = await db.pmjayPreauth.findUnique({ where: { id: input.preauthId } });
  if (!preauth) throw new Error("Preauth not found");
  if (preauth.status !== "DRAFT" && preauth.status !== "DOCUMENTS_PENDING") {
    throw new Error(`Preauth cannot be submitted from status ${preauth.status}`);
  }
  const mode: PmjayMode = preauth.providerMode as PmjayMode;

  if (mode === "MANUAL_PORTAL" && !input.externalTxnId) {
    throw new Error("MANUAL_PORTAL submission requires an official externalTxnId (portal reference)");
  }

  let source: "LIVE_EXTERNAL" | "MANUAL_PORTAL" | "SANDBOX" | "LOCAL_RECORD" = "LOCAL_RECORD";
  let isAuthoritative = false;
  if (mode === "LIVE_API" || mode === "STATE_API") source = "LIVE_EXTERNAL";
  else if (mode === "MANUAL_PORTAL") { source = "MANUAL_PORTAL"; isAuthoritative = true; }
  else if (mode === "SANDBOX") source = "SANDBOX";

  const updated = await db.pmjayPreauth.update({
    where: { id: input.preauthId },
    data: {
      status: "SUBMITTED",
      submittedAt: new Date(),
      externalTxnId: input.externalTxnId ?? null,
      rawResponse: input.rawResponse ?? null,
      source,
      isAuthoritative,
    },
  });
  return { ok: true, preauth: updated };
}

// ── Claim ──────────────────────────────────────────────────────────────────────
export interface ClaimCreateInput {
  hospitalId: string;
  patientId: string;
  beneficiaryId: string;
  packageId?: string | null;
  preauthId?: string | null;
  clientRequestId: string;
  dischargeDate?: Date;
  documents?: Array<{ type: string; name: string; storageRef: string }>;
  packageAmount?: string;
  claimedAmount?: string;
}

export async function createClaim(input: ClaimCreateInput) {
  const existing = await db.pmjayClaim.findUnique({ where: { clientRequestId: input.clientRequestId } });
  if (existing) return { ok: true, claim: existing, replayed: true };

  // Part 5: hospital-aware resolver — profile.pmjayMode overrides global env.
  const mode = await pmjayModeForHospital(input.hospitalId);
  try {
    const claim = await db.pmjayClaim.create({
      data: {
        hospitalId: input.hospitalId,
        patientId: input.patientId,
        beneficiaryId: input.beneficiaryId,
        packageId: input.packageId ?? null,
        preauthId: input.preauthId ?? null,
        clientRequestId: input.clientRequestId,
        status: input.documents && input.documents.length > 0 ? "DRAFT" : "DOCUMENTS_PENDING",
        dischargeDate: input.dischargeDate ?? null,
        documents: input.documents ? JSON.stringify(input.documents) : null,
        packageAmount: input.packageAmount ? toDecimal(input.packageAmount) : null,
        claimedAmount: input.claimedAmount ? toDecimal(input.claimedAmount) : null,
        providerMode: mode,
        source: "LOCAL_RECORD",
      },
    });
    return { ok: true, claim, replayed: false };
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      const race = await db.pmjayClaim.findUnique({ where: { clientRequestId: input.clientRequestId } });
      if (race) return { ok: true, claim: race, replayed: true };
    }
    throw e;
  }
}

/** Record a claim approval/rejection/settlement with Decimal amounts.
 *  The amounts come from the official ecosystem (portal response or API). */
export async function recordClaimResult(
  claimId: string,
  opts: {
    status: "APPROVED" | "PARTIALLY_APPROVED" | "REJECTED" | "SETTLED" | "FAILED";
    approvedAmount?: string;
    deductionAmount?: string;
    patientShare?: string;
    settledAmount?: string;
    rejectionReason?: string;
    externalClaimId?: string;
    rawResponse?: string;
    actorId: string;
  },
) {
  const claim = await db.pmjayClaim.findUnique({ where: { id: claimId } });
  if (!claim) throw new Error("Claim not found");
  const source = claim.providerMode === "MANUAL_PORTAL" ? "MANUAL_PORTAL"
    : claim.providerMode === "SANDBOX" ? "SANDBOX"
    : claim.providerMode === "LOCAL" ? "LOCAL_RECORD"
    : "LIVE_EXTERNAL";
  const isAuthoritative = source === "LIVE_EXTERNAL" || source === "MANUAL_PORTAL";

  const updated = await db.pmjayClaim.update({
    where: { id: claimId },
    data: {
      status: opts.status,
      approvedAmount: opts.approvedAmount ? toDecimal(opts.approvedAmount) : claim.approvedAmount,
      deductionAmount: opts.deductionAmount ? toDecimal(opts.deductionAmount) : claim.deductionAmount,
      patientShare: opts.patientShare ? toDecimal(opts.patientShare) : claim.patientShare,
      settledAmount: opts.settledAmount ? toDecimal(opts.settledAmount) : claim.settledAmount,
      rejectionReason: opts.rejectionReason ?? null,
      externalClaimId: opts.externalClaimId ?? claim.externalClaimId,
      rawResponse: opts.rawResponse ?? claim.rawResponse,
      settledAt: opts.status === "SETTLED" ? new Date() : claim.settledAt,
      source,
      isAuthoritative,
    },
  });
  return { ok: true, claim: updated };
}

// ── Query / clarification workflow ────────────────────────────────────────────
export async function openQuery(
  claimId: string,
  opts: { type: "QUERY" | "CLARIFICATION" | "DOCUMENT_REQUEST"; reason: string; request?: string; responseDueAt?: Date; externalRef?: string },
) {
  // Mark the claim as QUERY_OPEN.
  await db.pmjayClaim.update({ where: { id: claimId }, data: { status: "QUERY_OPEN", queryReason: opts.reason } });
  const query = await db.pmjayQuery.create({
    data: {
      claimId,
      type: opts.type,
      status: "RESPONSE_REQUIRED",
      reason: opts.reason,
      request: opts.request ?? null,
      responseDueAt: opts.responseDueAt ?? null,
      externalRef: opts.externalRef ?? null,
    },
  });
  return { ok: true, query };
}

export async function respondToQuery(
  queryId: string,
  opts: { response: string; documents?: Array<{ type: string; name: string; storageRef: string }>; actorId: string },
) {
  const updated = await db.pmjayQuery.update({
    where: { id: queryId },
    data: {
      status: "RESPONSE_SUBMITTED",
      response: opts.response,
      documents: opts.documents ? JSON.stringify(opts.documents) : null,
      actorId: opts.actorId,
      respondedAt: new Date(),
    },
  });
  return { ok: true, query: updated };
}

export async function resolveQuery(queryId: string) {
  const q = await db.pmjayQuery.update({
    where: { id: queryId },
    data: { status: "RESOLVED", resolvedAt: new Date() },
  });
  // If the claim has no open queries, move it back to UNDER_REVIEW.
  const openCount = await db.pmjayQuery.count({ where: { claimId: q.claimId, status: { in: ["OPEN", "RESPONSE_REQUIRED", "RESPONSE_SUBMITTED"] } } });
  if (openCount === 0) {
    await db.pmjayClaim.update({ where: { id: q.claimId }, data: { status: "UNDER_REVIEW" } });
  }
  return { ok: true, query: q };
}

/** Money helper re-export. */
export { toDecimal, Prisma };
