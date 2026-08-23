// Ojas — NHCX claim state machine.
//
// Status transitions are validated here — clients CANNOT set status directly.
// The route handler calls applyClaimTransition(claim, action) which validates
// the transition is legal for the current status, throws on illegal moves, and
// returns the new status + any derived field updates.
//
// Submission is idempotent: a clientRequestId (Ojas-generated) is stored on the
// claim and a UNIQUE constraint prevents duplicate submissions. Re-submitting
// with the same clientRequestId returns the existing claim instead of creating
// a duplicate.
//
// This is a STATE MACHINE only. The actual NHCX transport (FHIR mapping +
// HTTP submission to the NHCX ecosystem) lives in src/lib/integrations/nhcx-adapter.ts
// and is labelled SANDBOX/WORKFLOW_ONLY until a real NHCX production certificate +
// endpoint is configured (see INTEGRATIONS.md).

export type ClaimStatus =
  | "DRAFT"
  | "PREAUTH_PENDING"
  | "PREAUTH_APPROVED"
  | "PREAUTH_REJECTED"
  | "CLAIM_SUBMITTED"
  | "ACKNOWLEDGED"
  | "UNDER_REVIEW"
  | "APPROVED"
  | "PARTIALLY_APPROVED"
  | "REJECTED"
  | "PAID"
  | "FAILED"
  | "WITHDRAWN";

export type ClaimAction =
  | "submit_preauth"
  | "approve_preauth"
  | "reject_preauth"
  | "submit_claim"
  | "acknowledge"
  | "start_review"
  | "approve"
  | "partially_approve"
  | "reject"
  | "mark_paid"
  | "fail"
  | "withdraw";

// Legal transitions: from -> set of actions allowed in that state.
const TRANSITIONS: Record<ClaimStatus, ClaimAction[]> = {
  DRAFT: ["submit_preauth", "withdraw"],
  PREAUTH_PENDING: ["approve_preauth", "reject_preauth", "fail", "withdraw"],
  PREAUTH_APPROVED: ["submit_claim", "withdraw"],
  PREAUTH_REJECTED: ["withdraw"],
  CLAIM_SUBMITTED: ["acknowledge", "fail", "withdraw"],
  ACKNOWLEDGED: ["start_review", "approve", "reject", "fail", "withdraw"],
  UNDER_REVIEW: ["approve", "partially_approve", "reject", "fail", "withdraw"],
  APPROVED: ["mark_paid", "withdraw"],
  PARTIALLY_APPROVED: ["mark_paid", "withdraw"],
  REJECTED: ["withdraw"],
  PAID: [],
  FAILED: ["submit_preauth", "submit_claim"],
  WITHDRAWN: [],
};

export class ClaimTransitionError extends Error {
  status = 400;
}

export interface TransitionResult {
  status: ClaimStatus;
  approvedAmount?: unknown;
  patientShare?: unknown;
  rejectionReason?: string | null;
  submittedAt?: Date;
  preAuthRespondedAt?: Date;
}

/** Validate + apply a claim transition. Throws ClaimTransitionError on illegal moves. */
export function applyClaimTransition(
  current: ClaimStatus,
  action: ClaimAction,
  opts: {
    approvedAmount?: string | null;
    patientShare?: string | null;
    rejectionReason?: string | null;
  } = {},
): TransitionResult {
  const allowed = TRANSITIONS[current] ?? [];
  if (!allowed.includes(action)) {
    throw new ClaimTransitionError(
      `Illegal claim transition: ${current} -> ${action}. ` +
        `Allowed from ${current}: ${allowed.join(", ") || "(none - terminal state)"}`,
    );
  }

  const now = new Date();
  switch (action) {
    case "submit_preauth":
      return { status: "PREAUTH_PENDING", submittedAt: now };
    case "approve_preauth":
      return { status: "PREAUTH_APPROVED", preAuthRespondedAt: now };
    case "reject_preauth":
      return {
        status: "PREAUTH_REJECTED",
        preAuthRespondedAt: now,
        rejectionReason: opts.rejectionReason ?? "Pre-auth rejected by insurer",
      };
    case "submit_claim":
      return { status: "CLAIM_SUBMITTED", submittedAt: now };
    case "acknowledge":
      return { status: "ACKNOWLEDGED" };
    case "start_review":
      return { status: "UNDER_REVIEW" };
    case "approve":
      return {
        status: "APPROVED",
        approvedAmount: opts.approvedAmount,
        patientShare: opts.patientShare,
      };
    case "partially_approve":
      return {
        status: "PARTIALLY_APPROVED",
        approvedAmount: opts.approvedAmount,
        patientShare: opts.patientShare,
      };
    case "reject":
      return {
        status: "REJECTED",
        rejectionReason: opts.rejectionReason ?? "Claim rejected by insurer",
      };
    case "mark_paid":
      return { status: "PAID" };
    case "fail":
      return { status: "FAILED", rejectionReason: opts.rejectionReason ?? "Transport failure" };
    case "withdraw":
      return { status: "WITHDRAWN" };
    default:
      throw new ClaimTransitionError(`Unknown action: ${action}`);
  }
}

/** True if the claim is in a terminal state (no further transitions). */
export function isTerminal(status: ClaimStatus): boolean {
  return TRANSITIONS[status].length === 0;
}

/** True if a claim may still be (re)submitted. */
export function isSubmittable(status: ClaimStatus): boolean {
  return TRANSITIONS[status].some((a) => a === "submit_claim" || a === "submit_preauth");
}
