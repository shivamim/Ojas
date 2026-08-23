// Ojas — PM-JAY beneficiary eligibility check.
// GET /api/abdm/pmjay?patientId=xxx
//
// V3 HARDENING (Issues B, C, D):
//   • The route ALWAYS invokes the PM-JAY adapter service — it NEVER returns
//     stored AbhaIdentity.pmjayEligible fields as a live result. Stored fields
//     are historical/local and are clearly labelled as such. (Issue B)
//   • The response carries explicit provenance metadata: `source` (LIVE |
//     SANDBOX | LOCAL) and `isSimulated`. A sandbox eligible=true can NEVER be
//     confused with a real eligible=true in business logic, billing, claims,
//     or UI. (Issue C)
//   • When no live/sandbox source is available, the response is `eligible: false`
//     with `source: "LOCAL"` and a clear message — NOT a fabricated positive. (Issue D)
//
// Architecture: API → auth → tenant → PM-JAY service → adapter → normalized → audit
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { audit, getClientIp, jsonError } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import {
  checkPmjayEligibility,
  pmjayEnvironment,
  pmjayStatusLabel,
  type PmjayEligibilityResult,
} from "@/lib/integrations/pmjay-adapter";
import { assertAuthoritativePmjayResult, canUsePmjayResultForClaim, type PmjayResultContext } from "@/lib/integrations/pmjay/beneficiary";
import { money, moneyToString } from "@/lib/money";
import { Prisma } from "@prisma/client";

type Ctx = { params: Promise<{}> };

async function GETImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);
  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get("patientId");
  if (!patientId) return jsonError("patientId required", 400);

  // Tenant-scoped patient + ABHA lookup.
  const abha = await db.abhaIdentity.findFirst({
    where: { patientId, hospitalId: user.hospitalId },
  });
  if (!abha) {
    return Response.json({
      ok: false, eligible: false, source: "LOCAL", isSimulated: false,
      reason: "ABHA identity not found. Create/verify ABHA first.",
    });
  }
  // ABHA must be VERIFIED (OTP-confirmed) before PM-JAY eligibility is meaningful.
  if (abha.verificationStatus !== "VERIFIED" && abha.verificationStatus !== "LINKED") {
    return Response.json({
      ok: false, eligible: false, source: "LOCAL", isSimulated: false,
      reason: "ABHA not verified. Complete verification before checking PM-JAY.",
      abhaStatus: abha.verificationStatus,
    });
  }

  // ── Always run the adapter. The adapter decides LIVE vs SANDBOX vs LOCAL
  //    based on env configuration and returns a truthful, source-tagged result. ──
  const result: PmjayEligibilityResult = await checkPmjayEligibility({
    abhaNumber: abha.abhaNumber ?? undefined,
  });

  // Persist the fresh eligibility result on the AbhaIdentity row with its
  // truthful source label. Stored fields are NEVER presented as live — they
  // carry pmjayEligibilitySource so any future reader knows the provenance.
  await db.abhaIdentity.update({
    where: { id: abha.id },
    data: {
      pmjayEligible: result.eligible,
      pmjayEligibilitySource: result.source,
      pmjayVerifiedAt: result.checkedAt,
      pmjayFamilyId: result.familyId ?? null,
      pmjayCardNo: result.cardNo ?? null,
      pmjayBalance: result.balance ? money(result.balance) as Prisma.Decimal : null,
    },
  });

  await audit({
    hospitalId: user.hospitalId, actorId: user.sub,
    action: result.source === "LIVE"
      ? "PMJAY_ELIGIBILITY_CHECKED_LIVE"
      : result.source === "SANDBOX"
        ? "PMJAY_ELIGIBILITY_CHECKED_SANDBOX"
        : "PMJAY_ELIGIBILITY_CHECKED_LOCAL",
    target: abha.id,
    detail: `PM-JAY check via adapter. Source=${result.source} (${pmjayStatusLabel(result.source)}). Eligible=${result.eligible}. ${result.error ?? ""}`.trim(),
    ip: getClientIp(req),
  });

  // V3-C: explicit provenance metadata. `isSimulated` is true ONLY when the
  // result is from a sandbox/simulated source — never for LIVE. This lets
  // billing/claims/reports gate on `source === "LIVE"` to prevent a sandbox
  // eligible from becoming a real eligible.
  return Response.json({
    ok: true,
    eligible: result.eligible,
    source: result.source,                      // LIVE | SANDBOX | LOCAL
    isSimulated: result.source !== "LIVE",       // explicit simulation flag
    label: pmjayStatusLabel(result.source),
    familyId: result.familyId,
    cardNo: result.cardNo,
    balance: result.balance,
    checkedAt: result.checkedAt,
    abhaNumber: abha.abhaNumber,
    error: result.error,
    // P0-4/P1-22: server-side authoritative-result protection. The domain rule
    // (assertAuthoritativePmjayResult) enforces that SANDBOX/SIMULATED/LOCAL
    // results can NEVER authorize billing — regardless of what the API response says.
    canUseForBilling: (() => {
      const ctx: PmjayResultContext = {
        source: result.source === "LIVE" ? "LIVE_EXTERNAL" : result.source,
        isAuthoritative: result.isAuthoritative,
        environment: result.source,
        integration: "PMJAY",
        verified: result.source === "LIVE" && result.eligible,
      };
      return canUsePmjayResultForClaim(ctx) && result.eligible;
    })(),
  });
}

export const GET = withErrors(GETImpl);
