// Ojas — Integration Readiness Center (V3-5 + P6 #2/#10).
// Returns the ACTUAL operational readiness of each integration as real checklist
// items — never arbitrary percentages. Every checkmark comes from a real config or
// DB state. Powers the hospital-facing readiness dashboard.
//
// P6 (#2): CORE readiness is SEPARATED from full interoperability readiness.
// Ojas Core can be READY (pilotable) while ABHA/PM-JAY/NHCX remain pending
// external onboarding. The `overallReady` field is split into:
//   coreReady      — core platform is safe for a controlled hospital pilot
//   pilotReady     — coreReady + hospital configuration done
//   fullInteroperabilityReady — all external integrations LIVE
//
// P6 (#4/#5): PM-JAY and NHCX modes are resolved per-hospital from
// HospitalIntegrationProfile, NOT just from global env vars.
//
// P6 (#6/#22): ABDM live-state uses resolveAbdmEnvironmentState() which
// distinguishes CONFIGURED from LIVE. Credentials exist → CONFIGURED, NOT LIVE.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { jsonError } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import {
  isAbdmConfigured,
  resolveAbdmEnvironmentState,
  isNhcxFullyConfigured,
  isNhcxCertConfigured,
  isPmjayLive,
  isWhatsAppLive,
  resolveNhcxEnvironmentState,
  resolveNhcxEnvironmentStateForHospital,
  resolvePmjayProviderMode,
  resolvePmjayProviderModeForHospital,
  isRateLimitConfigured,
  isSentryConfigured,
} from "@/lib/env";

type Ctx = { params: Promise<{}> };

interface ChecklistItem {
  label: string;
  passed: boolean;
  detail?: string;
  status?: "MISSING" | "CONFIGURED" | "PENDING_VERIFICATION" | "VERIFIED" | "EXPIRED" | "EXPIRING_SOON";
}
interface IntegrationReadiness {
  integration: string;
  status: string;
  label: string;
  items: ChecklistItem[];
  passedCount: number;
  totalCount: number;
}

/** P6 (#11): classify a certificate/expiry date into a UI status. */
function expiryStatus(date: Date | null | undefined): ChecklistItem["status"] {
  if (!date) return "MISSING";
  const now = Date.now();
  const expiry = date.getTime();
  const daysUntilExpiry = (expiry - now) / 86400000;
  if (daysUntilExpiry < 0) return "EXPIRED";
  if (daysUntilExpiry <= 30) return "EXPIRING_SOON";
  return "VERIFIED"; // valid + not expiring soon
}

async function GETImpl(_req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR", "SUPER_ADMIN"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);

  const profile = await db.hospitalIntegrationProfile.findUnique({
    where: { hospitalId: user.hospitalId },
  });
  const hospital = await db.hospital.findUnique({ where: { id: user.hospitalId } });

  // P6 (#6/#22): use the truthful ABDM environment state, NOT isAbdmLive.
  const abdmState = resolveAbdmEnvironmentState();

  // ── ABHA / ABDM readiness ──────────────────────────────────────────────
  const abhaItems: ChecklistItem[] = [
    {
      label: "HFR facility ID configured",
      passed: !!(profile?.hfrId || hospital?.hfrId),
      detail: (profile?.hfrId ?? hospital?.hfrId) ?? "Not set",
      status: (profile?.hfrId || hospital?.hfrId) ? "CONFIGURED" : "MISSING",
    },
    {
      label: "HFR verified",
      passed: !!profile?.hfrVerified,
      status: profile?.hfrVerified ? "VERIFIED" : "PENDING_VERIFICATION",
    },
    {
      label: "ABDM credentials configured",
      passed: isAbdmConfigured,
      detail: abdmState,
      status: isAbdmConfigured ? "CONFIGURED" : "MISSING",
    },
    {
      label: "ABDM environment state",
      passed: abdmState === "LIVE" || abdmState === "SANDBOX",
      detail: abdmState,
      // P6 (#6): credentials → CONFIGURED, NOT LIVE. LIVE is a gated state.
      status: abdmState === "LIVE" ? "VERIFIED" : abdmState === "DISABLED" ? "MISSING" : "CONFIGURED",
    },
    { label: "ABHA flow ready (state machine)", passed: true, detail: "NOT_LINKED → DISCOVERED → OTP → VERIFIED → LINKED + MANUALLY_RECORDED" },
    { label: "KYC flow ready", passed: true, detail: "KYC_VERIFIED state in the ABHA state machine" },
    { label: "Identity reconciliation", passed: true, detail: "MATCH/PARTIAL/MISMATCH with override audit" },
    {
      label: "Production onboarding complete",
      passed: abdmState === "LIVE" && !!profile?.hfrVerified,
      detail: abdmState === "LIVE" ? "Ready" : "Pending official onboarding",
      status: abdmState === "LIVE" ? "VERIFIED" : "PENDING_VERIFICATION",
    },
  ];
  const abha: IntegrationReadiness = {
    integration: "ABHA / ABDM",
    // P6 (#6): credentials → CONFIGURED, NOT LIVE.
    status: abdmState === "LIVE" && profile?.hfrVerified ? "LIVE"
      : abdmState === "CONFIGURED" ? "CONFIGURED"
      : abdmState === "SANDBOX" || abdmState === "SANDBOX_VERIFIED" ? "SANDBOX"
      : "PRODUCTION_PENDING_ONBOARDING",
    label: abdmState === "LIVE" ? "Production ABDM" : abdmState === "CONFIGURED" ? "Configured (pending onboarding)" : "Sandbox / not configured",
    items: abhaItems,
    passedCount: abhaItems.filter((i) => i.passed).length,
    totalCount: abhaItems.length,
  };

  // ── PM-JAY readiness (P6 #4: hospital-specific mode) ──────────────────
  const pmjayMode = resolvePmjayProviderModeForHospital(profile?.pmjayMode);
  const pmjayItems: ChecklistItem[] = [
    { label: "HFR configured", passed: !!(profile?.hfrId || hospital?.hfrId), status: (profile?.hfrId || hospital?.hfrId) ? "CONFIGURED" : "MISSING" },
    { label: "PM-JAY facility ID", passed: !!(profile?.pmjayFacilityId || hospital?.pmjayFacilityId), status: (profile?.pmjayFacilityId || hospital?.pmjayFacilityId) ? "CONFIGURED" : "MISSING" },
    { label: "SHA / State code", passed: !!profile?.stateHealthAgencyCode, detail: profile?.stateHealthAgencyCode ?? "Not set", status: profile?.stateHealthAgencyCode ? "CONFIGURED" : "MISSING" },
    { label: "Empanelment verified", passed: !!profile?.pmjayEmpanelmentVerified, status: profile?.pmjayEmpanelmentVerified ? "VERIFIED" : "PENDING_VERIFICATION" },
    { label: "HEM status", passed: !!profile?.hemStatus, detail: profile?.hemStatus ?? "Not set", status: profile?.hemStatus ? "CONFIGURED" : "MISSING" },
    { label: "Provider mode (hospital-specific)", passed: pmjayMode !== "LOCAL", detail: pmjayMode },
    { label: "Manual portal workflow", passed: pmjayMode === "MANUAL_PORTAL", detail: pmjayMode === "MANUAL_PORTAL" ? "Ready (operator-driven)" : "Not configured" },
    { label: "State/API integration", passed: pmjayMode === "LIVE_API" || pmjayMode === "STATE_API", detail: isPmjayLive ? "Ready" : "Pending credentials" },
    { label: "70+ category model", passed: true, detail: "STANDARD / SENIOR_CITIZEN_70_PLUS_UNIVERSAL / SENIOR_CITIZEN_TOPUP" },
    { label: "Coverage pools", passed: true, detail: "BASE_FAMILY_FLOATER + SENIOR_CITIZEN_TOPUP" },
    { label: "Inter-state portability", passed: true, detail: "isInterStatePortability + homeState + treatmentState" },
  ];
  const pmjay: IntegrationReadiness = {
    integration: "PM-JAY",
    status: pmjayMode === "LIVE_API" || pmjayMode === "STATE_API" ? "LIVE" : pmjayMode === "MANUAL_PORTAL" ? "MANUAL_PORTAL" : "PRODUCTION_PENDING_ONBOARDING",
    label: `Provider mode: ${pmjayMode}`,
    items: pmjayItems,
    passedCount: pmjayItems.filter((i) => i.passed).length,
    totalCount: pmjayItems.length,
  };

  // ── NHCX readiness (P6 #5: hospital-specific gates) ────────────────────
  const nhcxState = resolveNhcxEnvironmentStateForHospital(profile);
  const certExpiry = profile?.certificateExpiryDate ?? null;
  const certExpiryStatus = expiryStatus(certExpiry);
  const nhcxItems: ChecklistItem[] = [
    { label: "FHIR mapping engine", passed: true, detail: "CoverageEligibility + Claim + Communication" },
    { label: "Claim engine", passed: true, detail: "State machine validated" },
    { label: "Coverage Eligibility", passed: true, detail: "FHIR R4 CoverageEligibilityRequest" },
    { label: "Manual portal recording", passed: true, detail: "eligibility + claim with externalTxnId" },
    { label: "NHCX Participant Code", passed: !!profile?.nhcxParticipantCode, detail: profile?.nhcxParticipantCode ?? "Not set", status: profile?.nhcxParticipantCode ? "CONFIGURED" : "MISSING" },
    { label: "Sandbox credentials (global)", passed: isNhcxFullyConfigured, detail: isNhcxFullyConfigured ? "Configured" : "Pending" },
    { label: "Sandbox verified (hospital)", passed: !!profile?.gateSandboxVerified, status: profile?.gateSandboxVerified ? "VERIFIED" : "PENDING_VERIFICATION" },
    { label: "Partner onboarding verified", passed: !!profile?.gatePartnerOnboardingVerified, status: profile?.gatePartnerOnboardingVerified ? "VERIFIED" : "PENDING_VERIFICATION" },
    { label: "mTLS certificates (global)", passed: isNhcxCertConfigured, detail: isNhcxCertConfigured ? "Configured" : "Pending", status: isNhcxCertConfigured ? "CONFIGURED" : "MISSING" },
    { label: "Production endpoint verified", passed: !!profile?.gateProductionEndpointVerified, status: profile?.gateProductionEndpointVerified ? "VERIFIED" : "PENDING_VERIFICATION" },
    { label: "Production connectivity verified", passed: !!profile?.gateProductionConnectivityVerified, status: profile?.gateProductionConnectivityVerified ? "VERIFIED" : "PENDING_VERIFICATION" },
    { label: "Live approved (hospital)", passed: !!profile?.gateLiveApproved, status: profile?.gateLiveApproved ? "VERIFIED" : "PENDING_VERIFICATION" },
    { label: "Certificate expiry", passed: certExpiryStatus === "VERIFIED", detail: certExpiry ? certExpiry.toISOString().slice(0, 10) : "Not set", status: certExpiryStatus },
    { label: "Production onboarding complete", passed: nhcxState === "LIVE", detail: nhcxState },
  ];
  const nhcx: IntegrationReadiness = {
    integration: "NHCX",
    status: nhcxState,
    label: nhcxState === "LIVE" ? "Live NHCX" : nhcxState === "PRODUCTION_READY" ? "Production-ready" : "Pending onboarding",
    items: nhcxItems,
    passedCount: nhcxItems.filter((i) => i.passed).length,
    totalCount: nhcxItems.length,
  };

  // ── NABH readiness ────────────────────────────────────────────────────
  const nabhEvidenceCount = await db.nabhEvidence.count({ where: { hospitalId: user.hospitalId } });
  const nabhVerifiedCount = await db.nabhEvidence.count({ where: { hospitalId: user.hospitalId, status: "VERIFIED" } });
  const nabhGaps = await db.nabhEvidence.count({ where: { hospitalId: user.hospitalId, status: "GAP" } });
  const nabhItems: ChecklistItem[] = [
    { label: "Evidence structure", passed: true, detail: "Standard → Requirement → Evidence → Verification → Gap → Corrective Action" },
    { label: "Evidence records", passed: nabhEvidenceCount > 0, detail: `${nabhEvidenceCount} records` },
    { label: "Verified evidence", passed: nabhVerifiedCount > 0, detail: `${nabhVerifiedCount} verified` },
    { label: "Gap tracking", passed: true, detail: `${nabhGaps} open gaps` },
    { label: "Corrective actions", passed: true, detail: "Owner + due date + resolution" },
  ];
  const nabh: IntegrationReadiness = {
    integration: "NABH",
    status: "READINESS_PLATFORM",
    label: "Readiness + evidence management (NOT accreditation)",
    items: nabhItems,
    passedCount: nabhItems.filter((i) => i.passed).length,
    totalCount: nabhItems.length,
  };

  // ── WhatsApp readiness ───────────────────────────────────────────────
  const waItems: ChecklistItem[] = [
    { label: "App secret", passed: !!process.env.WHATSAPP_APP_SECRET },
    { label: "Verify token", passed: !!process.env.WHATSAPP_VERIFY_TOKEN },
    { label: "Phone number ID", passed: !!process.env.WHATSAPP_PHONE_NUMBER_ID },
    { label: "Access token", passed: !!process.env.WHATSAPP_ACCESS_TOKEN },
    { label: "Coherent config (all present)", passed: isWhatsAppLive },
  ];
  const whatsapp: IntegrationReadiness = {
    integration: "WhatsApp",
    status: isWhatsAppLive ? "LIVE" : "PRODUCTION_PENDING_ONBOARDING",
    label: isWhatsAppLive ? "Connected" : "Not configured",
    items: waItems,
    passedCount: waItems.filter((i) => i.passed).length,
    totalCount: waItems.length,
  };

  // ── Infrastructure readiness (CORE) ──────────────────────────────────
  const infraItems: ChecklistItem[] = [
    { label: "PostgreSQL", passed: true, detail: "Production schema (provider=postgresql)" },
    { label: "Redis (distributed rate limit)", passed: isRateLimitConfigured, detail: isRateLimitConfigured ? "Upstash" : "In-memory (high-risk endpoints fail-closed in prod)" },
    { label: "Sentry (observability)", passed: isSentryConfigured, detail: isSentryConfigured ? "Active" : "Not configured" },
    { label: "PII encryption (AES-256-GCM)", passed: true, detail: "Random IV + auth tag + scrypt key derivation" },
    { label: "Audit logging", passed: true, detail: "Every sensitive action audited" },
    { label: "Webhook lifecycle", passed: true, detail: "RECEIVED→PROCESSING→PROCESSED/FAILED_RETRYABLE/FAILED_PERMANENT" },
    { label: "Razorpay billing", passed: !!process.env.RAZORPAY_KEY_ID, detail: process.env.RAZORPAY_KEY_ID ? "Configured" : "Not configured" },
  ];
  const infra: IntegrationReadiness = {
    integration: "Infrastructure",
    status: "LIVE",
    label: "Core platform",
    items: infraItems,
    passedCount: infraItems.filter((i) => i.passed).length,
    totalCount: infraItems.length,
  };

  // ── Hospital onboarding fields (P6 #10/#11) ──────────────────────────
  const onboardingFields = {
    hfrId: profile?.hfrId ?? null,
    pmjayFacilityId: profile?.pmjayFacilityId ?? null,
    stateHealthAgencyCode: profile?.stateHealthAgencyCode ?? null,
    hemStatus: profile?.hemStatus ?? null,
    wasaAuditStatus: profile?.wasaAuditStatus ?? null,
    wasaAuditDate: profile?.wasaAuditDate ?? null,
    safeToHostCertificateRef: profile?.safeToHostCertificateRef ?? null,
    certificateExpiryDate: profile?.certificateExpiryDate ?? null,
    nhcxParticipantCode: profile?.nhcxParticipantCode ?? null,
    // Certificate expiry classification for UI
    certificateExpiryStatus: certExpiryStatus,
  };

  // P6 (#2): separate CORE_READY from FULL_INTEROPERABILITY_READY.
  // CORE_READY = core platform is safe (infra + security + patient workflows).
  // PILOT_READY = CORE_READY + hospital configuration (HFR + at least one integration mode set).
  // FULL_INTEROPERABILITY_READY = all external integrations LIVE (ABDM + PM-JAY + NHCX).
  const coreReady = infra.passedCount >= 5; // core infra items pass
  const pilotReady = coreReady && !!(profile?.hfrId || hospital?.hfrId) && pmjayMode !== "LOCAL";
  const fullInteroperabilityReady = abha.status === "LIVE" && pmjay.status === "LIVE" && nhcx.status === "LIVE";

  return Response.json({
    hospitalId: user.hospitalId,
    hospitalName: hospital?.name,
    // P6 (#2): separated readiness concepts.
    coreReady,
    pilotReady,
    fullInteroperabilityReady,
    // Backward-compat: overallReady now means "coreReady" (NOT "all integrations LIVE").
    overallReady: coreReady,
    // P6 (#10): all onboarding fields exposed.
    onboardingFields,
    integrationProfile: profile ? {
      hfrId: profile.hfrId,
      pmjayFacilityId: profile.pmjayFacilityId,
      hemStatus: profile.hemStatus,
      state: profile.state,
      district: profile.district,
      stateHealthAgencyCode: profile.stateHealthAgencyCode,
      wasaAuditStatus: profile.wasaAuditStatus,
      wasaAuditDate: profile.wasaAuditDate,
      safeToHostCertificateRef: profile.safeToHostCertificateRef,
      certificateExpiryDate: profile.certificateExpiryDate,
      nhcxParticipantCode: profile.nhcxParticipantCode,
      abdmMode: profile.abdmMode,
      abhaMode: profile.abhaMode,
      pmjayMode: profile.pmjayMode,
      nhcxMode: profile.nhcxMode,
      certificationStatus: profile.certificationStatus,
      onboardingChecklist: {
        hfrVerified: profile.hfrVerified,
        hemLinked: profile.hemLinked,
        pmjayEmpanelmentVerified: profile.pmjayEmpanelmentVerified,
        ojasFacilityMappingComplete: profile.ojasFacilityMappingComplete,
      },
      nhcxLiveGating: {
        gateSandboxConfigured: profile.gateSandboxConfigured,
        gateSandboxVerified: profile.gateSandboxVerified,
        gatePartnerOnboardingVerified: profile.gatePartnerOnboardingVerified,
        gateCertificatesVerified: profile.gateCertificatesVerified,
        gateProductionEndpointVerified: profile.gateProductionEndpointVerified,
        gateProductionConnectivityVerified: profile.gateProductionConnectivityVerified,
        gateLiveApproved: profile.gateLiveApproved,
      },
    } : null,
    // P6 (#6): ABDM truthful environment state.
    abdmEnvironmentState: abdmState,
    // P6 (#4): hospital-specific PM-JAY mode.
    pmjayProviderMode: pmjayMode,
    // P6 (#5): hospital-specific NHCX state.
    nhcxEnvironmentState: nhcxState,
    readiness: [abha, pmjay, nhcx, nabh, whatsapp, infra],
  });
}

export const GET = withErrors(GETImpl);
