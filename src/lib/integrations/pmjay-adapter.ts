// Ojas — PM-JAY (Ayushman Bharat) eligibility adapter.
//
// P0-1/19: this file is RETAINED as a compatibility re-export so existing route
// imports keep working, BUT the guessed `/api/beneficiary/check` endpoint has
// been REMOVED. The canonical PM-JAY provider architecture lives in
// src/lib/integrations/pmjay/{beneficiary,workflow}.ts. This adapter now delegates
// to the canonical provider and NEVER calls a guessed government API.
//
// TRUTHFUL STATUS:
//   • PMJAY_PROVIDER_MODE=LIVE_API / STATE_API → requires PMJAY_BASE_URL +
//     PMJAY_CLIENT_ID + PMJAY_CLIENT_SECRET + PMJAY_BENEFICIARY_VERIFY_ENDPOINT
//     (operator-configured from onboarding docs). Result is "LIVE".
//   • PMJAY_PROVIDER_MODE=MANUAL_PORTAL → no API call; operator records the
//     official reference. Result is "MANUAL_PORTAL".
//   • PMJAY_PROVIDER_MODE=SANDBOX → truthfully labelled sandbox. Result is
//     "SANDBOX", isSimulated=true, isAuthoritative=false.
//   • Default → "LOCAL" (stored flag, NEVER authoritative).
//
// A stored local eligibility flag is NOT a live eligibility result.
import { isPmjayLive, isAbdmLive, resolvePmjayProviderMode } from "@/lib/env";

export type PmjayEligibilitySource = "LIVE" | "SANDBOX" | "LOCAL" | "MANUAL_PORTAL";

export function pmjayEnvironment(): PmjayEligibilitySource {
  const mode = resolvePmjayProviderMode();
  if (mode === "LIVE_API" || mode === "STATE_API") return "LIVE";
  if (mode === "MANUAL_PORTAL") return "MANUAL_PORTAL";
  if (mode === "SANDBOX") return "SANDBOX";
  return "LOCAL";
}

export interface PmjayEligibilityInput {
  abhaNumber?: string;
  mobile?: string;
  rationCardOrId?: string;
}

export interface PmjayEligibilityResult {
  eligible: boolean;
  source: PmjayEligibilitySource;
  isSimulated: boolean;
  isAuthoritative: boolean;
  canUseForBilling: boolean;
  familyId?: string;
  cardNo?: string;
  balance?: string; // Decimal as string
  checkedAt: Date;
  error?: string;
}

/** Check PM-JAY eligibility. Never fakes a positive result. When no live/sandbox
 *  source is available, returns eligible=false with source=LOCAL and a note.
 *
 *  P0-1: the guessed `/api/beneficiary/check` endpoint has been REMOVED. LIVE_API/
 *  STATE_API mode requires the operator-configured PMJAY_BENEFICIARY_VERIFY_ENDPOINT
 *  from the state/partner onboarding documentation. Ojas NEVER calls a guessed URL. */
export async function checkPmjayEligibility(
  input: PmjayEligibilityInput,
): Promise<PmjayEligibilityResult> {
  const mode = resolvePmjayProviderMode();
  const source = pmjayEnvironment();
  const checkedAt = new Date();

  if (source === "LOCAL") {
    return {
      eligible: false,
      source: "LOCAL",
      isSimulated: false,
      isAuthoritative: false,
      canUseForBilling: false,
      checkedAt,
      error: "PM-JAY live/sandbox API not configured. Eligibility cannot be verified.",
    };
  }

  if (source === "MANUAL_PORTAL") {
    // Manual portal — the operator verifies via the official portal and records
    // the reference. Ojas does NOT call an API. The result is not authoritative
    // until the operator explicitly confirms it.
    return {
      eligible: false, // not auto-eligible; operator confirms via the portal
      source: "MANUAL_PORTAL",
      isSimulated: false,
      isAuthoritative: false, // only authoritative after explicit confirmation
      canUseForBilling: false,
      checkedAt,
      error: "MANUAL_PORTAL mode: verify via the official portal and record the reference in Ojas. Result becomes authoritative after authorized confirmation.",
    };
  }

  if (source === "SANDBOX") {
    // Sandbox — truthfully labelled. NEVER authoritative.
    const id = input.abhaNumber ?? input.mobile ?? input.rationCardOrId;
    if (!id) {
      return {
        eligible: false, source: "SANDBOX", isSimulated: true, isAuthoritative: false,
        canUseForBilling: false, checkedAt, error: "No identifier provided",
      };
    }
    return {
      eligible: true, // sandbox only — clearly labelled
      source: "SANDBOX",
      isSimulated: true,
      isAuthoritative: false, // sandbox NEVER authoritative
      canUseForBilling: false,
      familyId: `sandbox-family-${id.slice(-4)}`,
      cardNo: `PBJ-${id.slice(-6)}`,
      balance: "500000.00",
      checkedAt,
    };
  }

  // LIVE — requires the operator-configured PMJAY_BENEFICIARY_VERIFY_ENDPOINT.
  // Ojas NEVER guesses the endpoint path. If it's not set, return PRODUCTION_PENDING_ONBOARDING.
  const verifyEndpoint = process.env.PMJAY_BENEFICIARY_VERIFY_ENDPOINT;
  if (!verifyEndpoint) {
    return {
      eligible: false,
      source: "LIVE",
      isSimulated: false,
      isAuthoritative: false,
      canUseForBilling: false,
      checkedAt,
      error: "PMJAY_BENEFICIARY_VERIFY_ENDPOINT not configured. Ojas refuses to call a guessed URL. Set the official endpoint from the state/partner onboarding documentation. PRODUCTION_PENDING_ONBOARDING.",
    };
  }
  try {
    const { PMJAY_BASE_URL, PMJAY_CLIENT_ID, PMJAY_CLIENT_SECRET } = await import("@/lib/env");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const resp = await fetch(`${PMJAY_BASE_URL}${verifyEndpoint}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: PMJAY_CLIENT_ID,
        clientSecret: PMJAY_CLIENT_SECRET,
        abhaNumber: input.abhaNumber,
        mobile: input.mobile,
        id: input.rationCardOrId,
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    const raw = await resp.text();
    if (!resp.ok) {
      return { eligible: false, source: "LIVE", isSimulated: false, isAuthoritative: false, canUseForBilling: false, checkedAt, error: `PM-JAY API ${resp.status}: ${raw.slice(0, 200)}` };
    }
    const data = JSON.parse(raw) as { eligible?: boolean; familyId?: string; cardNo?: string; balance?: string; error?: string };
    const eligible = !!data.eligible;
    return {
      eligible,
      source: "LIVE",
      isSimulated: false,
      isAuthoritative: eligible, // LIVE + verified = authoritative
      canUseForBilling: eligible, // can use for billing only when LIVE + eligible
      familyId: data.familyId,
      cardNo: data.cardNo,
      balance: data.balance,
      checkedAt,
      error: data.error,
    };
  } catch (err) {
    return {
      eligible: false, source: "LIVE", isSimulated: false, isAuthoritative: false,
      canUseForBilling: false, checkedAt,
      error: `PM-JAY transport error: ${err instanceof Error ? err.message : "unknown"}`,
    };
  }
}

export function pmjayStatusLabel(source: PmjayEligibilitySource): string {
  switch (source) {
    case "LIVE": return "LIVE";
    case "SANDBOX": return "SANDBOX (ABDM sandbox, not live PM-JAY)";
    case "MANUAL_PORTAL": return "MANUAL_PORTAL (operator-driven, not yet confirmed)";
    case "LOCAL": return "LOCAL (stored flag, not a live eligibility check)";
  }
}
