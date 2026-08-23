// Ojas — ABHA verification state machine.
//
// ABHA "found" (DISCOVERED) is NOT "verified". Only an OTP-confirmed link
// advances to VERIFIED/LINKED. This module is the single source of truth for
// legal ABHA state transitions; route handlers never set status directly.
//
// The actual ABDM transport (search-by-mobile, send-OTP, verify-OTP) lives in
// src/lib/integrations/abdm-adapter.ts. When ABDM_CLIENT_ID/SECRET are absent,
// the adapter runs in truthfully-labelled SANDBOX mode — it never fakes a
// VERIFIED result.

export type AbhaStatus =
  | "NOT_LINKED"
  | "DISCOVERED"
  | "OTP_PENDING"
  | "VERIFIED"
  | "KYC_VERIFIED"
  | "LINKED"
  | "REVOKED"
  | "FAILED"
  | "MANUALLY_RECORDED"; // P1 (#4): manual capture — NEVER authoritative, NEVER auto-transitions to VERIFIED/LINKED

export type AbhaAction =
  | "discover" // search-by-mobile returned an ABHA (NOT verified yet)
  | "send_otp" // ABDM accepted an OTP send request
  | "verify_otp_success" // OTP confirmed by ABDM -> VERIFIED
  | "verify_otp_fail" // OTP wrong / expired
  | "kyc" // KYC completed (demographic + identity proof) -> KYC_VERIFIED
  | "link" // verified/KYC AND consent-on-file -> LINKED
  | "revoke" // patient revoked the link
  | "fail" // ABDM transport error
  | "reset" // start over
  | "manual_capture"; // P1 (#4): manual data entry — record only, NOT verification

const TRANSITIONS: Record<AbhaStatus, AbhaAction[]> = {
  NOT_LINKED: ["discover", "fail", "manual_capture"],
  DISCOVERED: ["send_otp", "fail", "reset", "manual_capture"],
  OTP_PENDING: ["verify_otp_success", "verify_otp_fail", "fail", "reset"],
  VERIFIED: ["kyc", "link", "revoke", "reset"],
  KYC_VERIFIED: ["link", "revoke", "reset"],
  LINKED: ["revoke"],
  REVOKED: ["discover", "reset"],
  FAILED: ["discover", "reset"],
  // P1 (#4): MANUAL_RECORDED can only be reached via manual_capture. It CANNOT
  // auto-transition to VERIFIED/LINKED — that requires the actual official
  // verification flow (discover → OTP → verify). Only revoke/reset are allowed.
  MANUALLY_RECORDED: ["revoke", "reset", "discover"],
};

export class AbhaTransitionError extends Error {
  status = 400;
}

export interface AbhaTransitionResult {
  verificationStatus: AbhaStatus;
  verifiedAt?: Date;
  revokedAt?: Date;
}

export function applyAbhaTransition(current: AbhaStatus, action: AbhaAction): AbhaTransitionResult {
  const allowed = TRANSITIONS[current] ?? [];
  if (!allowed.includes(action)) {
    throw new AbhaTransitionError(
      `Illegal ABHA transition: ${current} -> ${action}. ` +
        `Allowed: ${allowed.join(", ") || "(none)"}`,
    );
  }
  const now = new Date();
  switch (action) {
    case "discover":
      return { verificationStatus: "DISCOVERED" };
    case "send_otp":
      return { verificationStatus: "OTP_PENDING" };
    case "verify_otp_success":
      return { verificationStatus: "VERIFIED", verifiedAt: now };
    case "verify_otp_fail":
      return { verificationStatus: "FAILED" };
    case "kyc":
      return { verificationStatus: "KYC_VERIFIED" };
    case "link":
      return { verificationStatus: "LINKED" };
    case "revoke":
      return { verificationStatus: "REVOKED", revokedAt: now };
    case "fail":
      return { verificationStatus: "FAILED" };
    case "reset":
      return { verificationStatus: "NOT_LINKED" };
    case "manual_capture":
      return { verificationStatus: "MANUALLY_RECORDED" };
    default:
      throw new AbhaTransitionError(`Unknown action: ${action}`);
  }
}

/** Human-readable label for UI truthfulness. */
export function abhaStatusLabel(status: AbhaStatus, sandboxMode: boolean): string {
  const live = sandboxMode ? "SANDBOX " : "";
  switch (status) {
    case "NOT_LINKED": return `${live}Not linked`;
    case "DISCOVERED": return `${live}Discovered (not verified)`;
    case "OTP_PENDING": return `${live}OTP pending`;
    case "VERIFIED": return `${live}Verified${sandboxMode ? " (sandbox)" : ""}`;
    case "KYC_VERIFIED": return `${live}KYC verified${sandboxMode ? " (sandbox)" : ""}`;
    case "LINKED": return `${live}Linked${sandboxMode ? " (sandbox)" : ""}`;
    case "REVOKED": return `${live}Revoked`;
    case "FAILED": return `${live}Verification failed`;
    case "MANUALLY_RECORDED": return `Manually recorded (unverified)`;
  }
}
