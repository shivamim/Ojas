// Ojas — PM-JAY domain: beneficiary identification + verification.
//
// A `pmjayEligible=true` flag is NEVER authoritative. The authoritative result
// is a PmjayBeneficiary row with verificationStatus=VERIFIED/KYC_VERIFIED and
// a verificationSource of LIVE_EXTERNAL (or MANUAL_PORTAL after authorized
// hospital confirmation). LOCAL_RECORD is never treated as live eligibility.
//
// Modes: LIVE_API | STATE_API | MANUAL_PORTAL | SANDBOX | LOCAL.
// MANUAL_PORTAL is a VALID production workflow — the operator performs the
// official BIS/state-portal verification and records the official reference
// number in Ojas. Ojas never invents an unofficial PM-JAY endpoint.
import { db } from "@/lib/db";
import { resolvePmjayProviderMode, resolvePmjayProviderModeForHospital as resolveModeFromProfile, isPmjayLive } from "@/lib/env";
import { Prisma } from "@prisma/client";

export type PmjayMode = "LIVE_API" | "STATE_API" | "MANUAL_PORTAL" | "SANDBOX" | "LOCAL";

/**
 * DEPRECATED global resolver. Kept for genuinely global (non-hospital-specific)
 * operations only. Hospital-specific workflows MUST use pmjayModeForHospital().
 */
export function pmjayMode(): PmjayMode {
  return resolvePmjayProviderMode();
}

/**
 * Hospital-aware PM-JAY mode resolver (Part 5).
 *
 * Resolution order (strict precedence):
 *   1. HospitalIntegrationProfile.pmjayMode (if set) — SOURCE OF TRUTH
 *   2. PMJAY_PROVIDER_MODE env var (controlled fallback)
 *   3. LOCAL (safe default — never auto-promotes to LIVE)
 *
 * Hospital-specific configuration OVERRIDES the global mode. A local/manual
 * workflow can never become LIVE automatically.
 *
 * All hospital-specific beneficiary/claim/preauth business workflows MUST use
 * this resolver instead of the deprecated global pmjayMode().
 */
export async function pmjayModeForHospital(hospitalId: string): Promise<PmjayMode> {
  const profile = await db.hospitalIntegrationProfile.findUnique({
    where: { hospitalId },
    select: { pmjayMode: true },
  });
  // resolveModeFromProfile handles: profile mode (if set) → env fallback → LOCAL
  return resolveModeFromProfile(profile?.pmjayMode ?? null) as PmjayMode;
}

export interface BeneficiaryIdentifyInput {
  hospitalId: string;
  patientId: string;
  abhaIdentityId?: string | null;
  beneficiaryReference: string;  // ration card / mobile-linked / PMJAY ref
  identificationMethod: string; // "OTP" | "DEMOGRAPHIC" | "BIS" | "PORTAL"
}

export interface BeneficiaryIdentifyResult {
  ok: boolean;
  beneficiaryId: string;
  status: string;
  source: string;
  isAuthoritative: boolean;
  mode: PmjayMode;
  externalTxnId?: string;
  error?: string;
}

/** Identify a PM-JAY beneficiary. Creates the PmjayBeneficiary row. The actual
 *  external verification (if any) happens via verifyBeneficiary(). */
export async function identifyBeneficiary(input: BeneficiaryIdentifyInput): Promise<BeneficiaryIdentifyResult> {
  // Part 5: hospital-aware resolver — profile.pmjayMode overrides global env.
  const mode = await pmjayModeForHospital(input.hospitalId);
  const existing = await db.pmjayBeneficiary.findFirst({
    where: { hospitalId: input.hospitalId, patientId: input.patientId },
  });
  if (existing) {
    return {
      ok: true, beneficiaryId: existing.id, status: existing.verificationStatus,
      source: existing.verificationSource, isAuthoritative: existing.isAuthoritative,
      mode: existing.providerMode as PmjayMode, externalTxnId: existing.externalTxnId ?? undefined,
    };
  }
  const beneficiary = await db.pmjayBeneficiary.create({
    data: {
      hospitalId: input.hospitalId,
      patientId: input.patientId,
      abhaIdentityId: input.abhaIdentityId ?? null,
      beneficiaryReference: input.beneficiaryReference,
      verificationStatus: "IDENTIFIED",
      verificationMethod: input.identificationMethod,
      verificationSource: "LOCAL_RECORD",
      providerMode: mode,
      isAuthoritative: false,
    },
  });
  return {
    ok: true, beneficiaryId: beneficiary.id, status: "IDENTIFIED",
    source: "LOCAL_RECORD", isAuthoritative: false, mode,
    error: mode === "LOCAL"
      ? "PM-JAY provider mode is LOCAL — beneficiary is identified locally only. Verify via the official portal/API for an authoritative result."
      : undefined,
  };
}

/** Verify a beneficiary against the official PM-JAY ecosystem.
 *  - LIVE_API/STATE_API: calls the configured endpoint (timeout 10s, no infinite retry).
 *  - MANUAL_PORTAL: records the official reference + verification the operator performed.
 *  - SANDBOX: returns a clearly-labelled sandbox result.
 *  - LOCAL: cannot verify — returns NOT_IDENTIFIED-equivalent with an error. */
export async function verifyBeneficiary(
  beneficiaryId: string,
  opts: { actorId: string; externalTxnId?: string; rawResponse?: string },
): Promise<BeneficiaryIdentifyResult> {
  const beneficiary = await db.pmjayBeneficiary.findUnique({ where: { id: beneficiaryId } });
  if (!beneficiary) throw new Error("Beneficiary not found");
  // Part 5: hospital-aware resolver — uses the beneficiary's hospital context.
  const mode = beneficiary.hospitalId
    ? await pmjayModeForHospital(beneficiary.hospitalId)
    : pmjayMode(); // safe global fallback if no hospital assigned

  if (mode === "LOCAL") {
    return {
      ok: false, beneficiaryId, status: beneficiary.verificationStatus,
      source: "LOCAL_RECORD", isAuthoritative: false, mode,
      error: "PM-JAY provider mode is LOCAL — cannot verify against the official ecosystem. Set PMJAY_PROVIDER_MODE or record a MANUAL_PORTAL verification.",
    };
  }

  if (mode === "MANUAL_PORTAL") {
    // Operator performed verification through the official portal. Record the
    // official reference + raw response. MANUAL_PORTAL is authoritative ONLY
    // after authorized hospital confirmation.
    if (!opts.externalTxnId) {
      return {
        ok: false, beneficiaryId, status: beneficiary.verificationStatus,
        source: "MANUAL_PORTAL", isAuthoritative: false, mode,
        error: "MANUAL_PORTAL verification requires an official externalTxnId (portal reference).",
      };
    }
    const updated = await db.pmjayBeneficiary.update({
      where: { id: beneficiaryId },
      data: {
        verificationStatus: "VERIFIED",
        verificationSource: "MANUAL_PORTAL",
        externalTxnId: opts.externalTxnId,
        rawResponse: opts.rawResponse ?? null,
        verifiedAt: new Date(),
        isAuthoritative: true, // operator-confirmed portal result
      },
    });
    return {
      ok: true, beneficiaryId, status: "VERIFIED", source: "MANUAL_PORTAL",
      isAuthoritative: true, mode, externalTxnId: opts.externalTxnId,
    };
  }

  if (mode === "SANDBOX") {
    const updated = await db.pmjayBeneficiary.update({
      where: { id: beneficiaryId },
      data: {
        verificationStatus: "VERIFIED",
        verificationSource: "SANDBOX",
        externalTxnId: `sandbox-${Date.now()}`,
        verifiedAt: new Date(),
        isAuthoritative: false, // sandbox NEVER authoritative
      },
    });
    return {
      ok: true, beneficiaryId, status: "VERIFIED", source: "SANDBOX",
      isAuthoritative: false, mode, externalTxnId: updated.externalTxnId ?? undefined,
    };
  }

  // LIVE_API / STATE_API — real official endpoint via the PM-JAY transport.
  if (!isPmjayLive) {
    return {
      ok: false, beneficiaryId, status: beneficiary.verificationStatus,
      source: "LOCAL_RECORD", isAuthoritative: false, mode,
      error: `${mode} requires PMJAY_BASE_URL + PMJAY_CLIENT_ID + PMJAY_CLIENT_SECRET.`,
    };
  }
  // V3-21: the exact official PM-JAY verification endpoint must come from the
  // state/partner onboarding documentation via PMJAY_BENEFICIARY_VERIFY_ENDPOINT.
  // Ojas NEVER guesses an endpoint path like "/api/v1/beneficiary/verify".
  const verifyEndpoint = process.env.PMJAY_BENEFICIARY_VERIFY_ENDPOINT ?? "";
  if (!verifyEndpoint) {
    await db.pmjayBeneficiary.update({
      where: { id: beneficiaryId },
      data: { verificationStatus: "FAILED", failureReason: "PMJAY_BENEFICIARY_VERIFY_ENDPOINT not configured. Ojas refuses to POST to a guessed URL. Use MANUAL_PORTAL mode or set the official endpoint from onboarding documentation." },
    });
    return {
      ok: false, beneficiaryId, status: "FAILED", source: "LOCAL_RECORD",
      isAuthoritative: false, mode,
      error: "PMJAY_BENEFICIARY_VERIFY_ENDPOINT not configured. Use MANUAL_PORTAL mode, or set the official endpoint from the state/partner onboarding documentation. PRODUCTION_PENDING_ONBOARDING.",
    };
  }
  try {
    const result = await callOfficialPmjayVerify(beneficiary.beneficiaryReference ?? "", verifyEndpoint, opts.externalTxnId);
    const updated = await db.pmjayBeneficiary.update({
      where: { id: beneficiaryId },
      data: {
        verificationStatus: result.verified ? "VERIFIED" : "REJECTED",
        verificationSource: "LIVE_EXTERNAL",
        externalTxnId: result.externalTxnId,
        rawResponse: result.rawResponse,
        verifiedAt: new Date(),
        isAuthoritative: result.verified,
        failureReason: result.verified ? null : result.error ?? null,
      },
    });
    return {
      ok: result.verified, beneficiaryId, status: updated.verificationStatus,
      source: "LIVE_EXTERNAL", isAuthoritative: result.verified, mode,
      externalTxnId: result.externalTxnId, error: result.error,
    };
  } catch (err) {
    await db.pmjayBeneficiary.update({
      where: { id: beneficiaryId },
      data: { verificationStatus: "FAILED", failureReason: err instanceof Error ? err.message : "unknown" },
    });
    return {
      ok: false, beneficiaryId, status: "FAILED", source: "LIVE_EXTERNAL",
      isAuthoritative: false, mode, error: err instanceof Error ? err.message : "unknown",
    };
  }
}

/** Transport boundary to the official PM-JAY verification endpoint.
 *  Takes the operator-configured endpoint path — NEVER a guessed URL. */
async function callOfficialPmjayVerify(
  beneficiaryReference: string,
  endpointPath: string,
  externalTxnId?: string,
): Promise<{ verified: boolean; externalTxnId?: string; rawResponse?: string; error?: string }> {
  const { PMJAY_BASE_URL, PMJAY_CLIENT_ID, PMJAY_CLIENT_SECRET } = await import("@/lib/env");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const resp = await fetch(`${PMJAY_BASE_URL}${endpointPath}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        clientId: PMJAY_CLIENT_ID,
        clientSecret: PMJAY_CLIENT_SECRET,
        beneficiaryReference,
        externalTxnId,
      }),
      signal: controller.signal,
    });
    const raw = await resp.text();
    if (!resp.ok) return { verified: false, rawResponse: raw, error: `PM-JAY API ${resp.status}` };
    const data = JSON.parse(raw) as { verified?: boolean; externalTxnId?: string; error?: string };
    return {
      verified: !!data.verified,
      externalTxnId: data.externalTxnId,
      rawResponse: raw,
      error: data.error,
    };
  } catch (err) {
    return { verified: false, error: `PM-JAY transport error: ${err instanceof Error ? err.message : "unknown"}` };
  } finally {
    clearTimeout(timeout);
  }
}

/** Authoritative eligibility check: returns true ONLY when the beneficiary is
 *  verified AND the source is LIVE_EXTERNAL or MANUAL_PORTAL. Never true for
 *  LOCAL/SANDBOX. This is the gate for billing/claims. */
export async function isBeneficiaryAuthoritative(beneficiaryId: string): Promise<boolean> {
  const b = await db.pmjayBeneficiary.findUnique({ where: { id: beneficiaryId } });
  if (!b) return false;
  return b.isAuthoritative && (b.verificationStatus === "VERIFIED" || b.verificationStatus === "KYC_VERIFIED");
}

/** Decimal helper for PM-JAY money fields. */
export function toDecimal(v: string | number | Prisma.Decimal | null | undefined): Prisma.Decimal {
  if (v === null || v === undefined || v === "") return new Prisma.Decimal("0");
  return new Prisma.Decimal(v);
}

// ── P0-5: PM-JAY authoritative-result protection ─────────────────────────────
//
// A domain rule that prevents non-authoritative eligibility from being used to
// create an authoritative claim, approve billing, create settlement assumptions,
// or mark a patient as genuinely PM-JAY eligible.
//
// Rules:
//   LIVE_EXTERNAL → potentially authoritative (if verified)
//   MANUAL_PORTAL → authoritative only after explicit authorized hospital confirmation
//   STATE_API → authoritative only after verified external response
//   SANDBOX → NEVER authoritative
//   SIMULATED → NEVER authoritative
//   LOCAL → NEVER authoritative

export class PmjayAuthoritativeResultError extends Error {
  status = 400;
}

export interface PmjayResultContext {
  source: string;        // "LIVE_EXTERNAL" | "MANUAL_PORTAL" | "STATE_API" | "SANDBOX" | "SIMULATED" | "LOCAL"
  isAuthoritative: boolean;
  environment: string;   // "LIVE" | "SANDBOX" | "MANUAL_PORTAL" | "LOCAL"
  integration: string;   // "PMJAY"
  verified: boolean;
}

/**
 * Assert that a PM-JAY result is authoritative — i.e. it can be used for
 * billing/claim/settlement. Throws PmjayAuthoritativeResultError if the result
 * is sandbox/simulated/local or otherwise non-authoritative.
 *
 * This is the SERVER-SIDE domain gate. A sandbox result can NEVER reach a
 * financial settlement workflow, regardless of what the API response says.
 */
export function assertAuthoritativePmjayResult(result: PmjayResultContext): void {
  const source = result.source.toUpperCase();
  // SANDBOX / SIMULATED / LOCAL are NEVER authoritative — no exceptions.
  if (source === "SANDBOX" || source === "SIMULATED" || source === "LOCAL" || source === "LOCAL_RECORD") {
    throw new PmjayAuthoritativeResultError(
      `PM-JAY result is not authoritative (source=${result.source}, environment=${result.environment}). ` +
      "Sandbox/simulated/local results can never be used for billing, claims, or settlement."
    );
  }
  // LIVE_EXTERNAL / STATE_API → authoritative only if verified + isAuthoritative.
  if (source === "LIVE_EXTERNAL" || source === "STATE_API") {
    if (!result.verified || !result.isAuthoritative) {
      throw new PmjayAuthoritativeResultError(
        `PM-JAY result is not authoritative (source=${result.source}, verified=${result.verified}, isAuthoritative=${result.isAuthoritative}). ` +
        "Live/State results require verification before use in billing/claims."
      );
    }
    return; // authoritative
  }
  // MANUAL_PORTAL → authoritative only after explicit authorized hospital confirmation
  // (isAuthoritative is set true only when an authorized operator confirmed the portal result).
  if (source === "MANUAL_PORTAL") {
    if (!result.isAuthoritative) {
      throw new PmjayAuthoritativeResultError(
        `PM-JAY result is not authoritative (source=MANUAL_PORTAL). ` +
        "Manual portal results require explicit authorized hospital confirmation before use in billing/claims."
      );
    }
    return; // authoritative after confirmation
  }
  // Unknown source — fail closed.
  throw new PmjayAuthoritativeResultError(
    `PM-JAY result has unknown source (${result.source}). Cannot determine authoritativeness — failing closed.`
  );
}

/**
 * Check (non-throwing) whether a PM-JAY result can be used for a claim.
 * Returns true only when the result is authoritative per the rules above.
 */
export function canUsePmjayResultForClaim(result: PmjayResultContext): boolean {
  try {
    assertAuthoritativePmjayResult(result);
    return true;
  } catch {
    return false;
  }
}
