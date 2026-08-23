// Ojas — NHCX live-gating state machine (V3-23).
//
// An operator CANNOT turn NHCX LIVE merely by setting an environment variable.
// LIVE requires a documented sequence of gates, each verified + recorded on the
// HospitalIntegrationProfile:
//
//   SANDBOX_CONFIGURED -> SANDBOX_VERIFIED -> PARTNER_ONBOARDING_VERIFIED ->
//   CERTIFICATES_VERIFIED -> PRODUCTION_ENDPOINT_VERIFIED ->
//   PRODUCTION_CONNECTIVITY_VERIFIED -> LIVE_APPROVED -> LIVE
//
// Each gate is a real checklist item stored in the DB. The operator advances
// gates by calling the gate-advance endpoint with evidence; Ojas records the
// timestamp + verifies the prerequisite env state. This makes live-readiness
// auditable + irreversible-by-mistake.
import { db } from "@/lib/db";
import {
  isNhcxFullyConfigured,
  isNhcxCertConfigured,
} from "@/lib/env";
import { NHCXCertificateManager, NHCXHealthCheck, type NhcxHealthStatus } from "./transport";

export type NhcxGate =
  | "SANDBOX_CONFIGURED"
  | "SANDBOX_VERIFIED"
  | "PARTNER_ONBOARDING_VERIFIED"
  | "CERTIFICATES_VERIFIED"
  | "PRODUCTION_ENDPOINT_VERIFIED"
  | "PRODUCTION_CONNECTIVITY_VERIFIED"
  | "LIVE_APPROVED"
  | "LIVE";

export const NHCX_GATE_ORDER: NhcxGate[] = [
  "SANDBOX_CONFIGURED",
  "SANDBOX_VERIFIED",
  "PARTNER_ONBOARDING_VERIFIED",
  "CERTIFICATES_VERIFIED",
  "PRODUCTION_ENDPOINT_VERIFIED",
  "PRODUCTION_CONNECTIVITY_VERIFIED",
  "LIVE_APPROVED",
  "LIVE",
];

export class NhcxLiveGatingError extends Error {
  status = 400;
}

/** Get the current highest gate reached for a hospital. */
export async function getCurrentNhcxGate(hospitalId: string): Promise<NhcxGate | null> {
  const profile = await db.hospitalIntegrationProfile.findUnique({ where: { hospitalId } });
  if (!profile) return null;
  if (profile.gateLiveApproved && profile.nhcxMode === "LIVE") return "LIVE";
  if (profile.gateLiveApproved) return "LIVE_APPROVED";
  if (profile.gateProductionConnectivityVerified) return "PRODUCTION_CONNECTIVITY_VERIFIED";
  if (profile.gateProductionEndpointVerified) return "PRODUCTION_ENDPOINT_VERIFIED";
  if (profile.gateCertificatesVerified) return "CERTIFICATES_VERIFIED";
  if (profile.gatePartnerOnboardingVerified) return "PARTNER_ONBOARDING_VERIFIED";
  if (profile.gateSandboxVerified) return "SANDBOX_VERIFIED";
  if (profile.gateSandboxConfigured) return "SANDBOX_CONFIGURED";
  return null;
}

/** Verify the prerequisites for a gate are met (env + prior gates). */
function verifyGatePrerequisites(gate: NhcxGate, profile: { gateSandboxConfigured: boolean; gateSandboxVerified: boolean; gatePartnerOnboardingVerified: boolean; gateCertificatesVerified: boolean; gateProductionEndpointVerified: boolean; gateProductionConnectivityVerified: boolean; gateLiveApproved: boolean }): string | null {
  switch (gate) {
    case "SANDBOX_CONFIGURED":
      if (!isNhcxFullyConfigured) return "NHCX sandbox credentials not configured (NHCX_BASE_URL + NHCX_CLIENT_ID + NHCX_CLIENT_SECRET required).";
      return null;
    case "SANDBOX_VERIFIED":
      if (!profile.gateSandboxConfigured) return "SANDBOX_CONFIGURED gate not passed.";
      return null;
    case "PARTNER_ONBOARDING_VERIFIED":
      if (!profile.gateSandboxVerified) return "SANDBOX_VERIFIED gate not passed.";
      return null;
    case "CERTIFICATES_VERIFIED":
      if (!profile.gatePartnerOnboardingVerified) return "PARTNER_ONBOARDING_VERIFIED gate not passed.";
      if (!isNhcxCertConfigured) return "mTLS certificates not configured (NHCX_CERT_PATH + NHCX_KEY_PATH required).";
      return null;
    case "PRODUCTION_ENDPOINT_VERIFIED":
      if (!profile.gateCertificatesVerified) return "CERTIFICATES_VERIFIED gate not passed.";
      return null;
    case "PRODUCTION_CONNECTIVITY_VERIFIED":
      if (!profile.gateProductionEndpointVerified) return "PRODUCTION_ENDPOINT_VERIFIED gate not passed.";
      return null;
    case "LIVE_APPROVED":
      if (!profile.gateProductionConnectivityVerified) return "PRODUCTION_CONNECTIVITY_VERIFIED gate not passed.";
      return null;
    case "LIVE":
      if (!profile.gateLiveApproved) return "LIVE_APPROVED gate not passed. An operator must explicitly approve LIVE.";
      return null;
  }
}

/** Advance a hospital to the next NHCX gate. Records the timestamp + verifies
 *  prerequisites. Throws NhcxLiveGatingError if prerequisites are missing.
 *
 *  P0-11: technical gates (CERTIFICATES_VERIFIED, PRODUCTION_ENDPOINT_VERIFIED,
 *  PRODUCTION_CONNECTIVITY_VERIFIED) are AUTO-VERIFIED via NHCXHealthCheck — an
 *  admin text field saying "verified" is NOT enough. Human/external gates
 *  (PARTNER_ONBOARDING_VERIFIED, LIVE_APPROVED) remain attested. */
export async function advanceNhcxGate(hospitalId: string, gate: NhcxGate, opts: { actorId: string; evidence?: string }): Promise<{ ok: boolean; gate: NhcxGate; }> {
  let profile = await db.hospitalIntegrationProfile.findUnique({ where: { hospitalId } });
  if (!profile) {
    profile = await db.hospitalIntegrationProfile.create({ data: { hospitalId } });
  }
  const blocker = verifyGatePrerequisites(gate, profile);
  if (blocker) throw new NhcxLiveGatingError(`Cannot advance to ${gate}: ${blocker}`);

  // P0-11: auto-verify technical gates via the health check. An admin's text
  // evidence is recorded but is NOT sufficient to pass these gates.
  if (gate === "CERTIFICATES_VERIFIED") {
    const certManager = new NHCXCertificateManager();
    const certResult = certManager.validate();
    if (!certResult.valid) {
      throw new NhcxLiveGatingError(`Cannot advance to CERTIFICATES_VERIFIED: certificate validation failed. ${certResult.error ?? "Certificate must parse, not be expired, and match the private key."}`);
    }
  }
  if (gate === "PRODUCTION_ENDPOINT_VERIFIED" || gate === "PRODUCTION_CONNECTIVITY_VERIFIED") {
    const healthCheck = new NHCXHealthCheck();
    const healthResult = await healthCheck.check();
    if (gate === "PRODUCTION_ENDPOINT_VERIFIED" && healthResult.status === "NOT_CONFIGURED") {
      throw new NhcxLiveGatingError("Cannot advance to PRODUCTION_ENDPOINT_VERIFIED: NHCX endpoint not configured (NHCX_BASE_URL + NHCX_CLIENT_ID + NHCX_CLIENT_SECRET required).");
    }
    if (gate === "PRODUCTION_CONNECTIVITY_VERIFIED") {
      if (healthResult.status !== "PASS") {
        throw new NhcxLiveGatingError(`Cannot advance to PRODUCTION_CONNECTIVITY_VERIFIED: NHCX health check did not pass (status=${healthResult.status}). ${healthResult.reason ?? "Endpoint must be reachable + TLS + cert valid + auth configured."}`);
      }
    }
  }

  const now = new Date();
  const update: Record<string, unknown> = {};
  switch (gate) {
    case "SANDBOX_CONFIGURED":
      update.gateSandboxConfigured = true;
      update.sandboxConfiguredAt = now;
      update.nhcxMode = "SANDBOX";
      break;
    case "SANDBOX_VERIFIED":
      update.gateSandboxVerified = true;
      update.sandboxVerifiedAt = now;
      update.nhcxMode = "SANDBOX_VERIFIED";
      break;
    case "PARTNER_ONBOARDING_VERIFIED":
      // Human/external attestation — remains operator-attested with evidence.
      update.gatePartnerOnboardingVerified = true;
      update.productionOnboardingStartedAt = now;
      update.nhcxMode = "PRODUCTION_PENDING_ONBOARDING";
      break;
    case "CERTIFICATES_VERIFIED":
      update.gateCertificatesVerified = true;
      break;
    case "PRODUCTION_ENDPOINT_VERIFIED":
      update.gateProductionEndpointVerified = true;
      break;
    case "PRODUCTION_CONNECTIVITY_VERIFIED":
      update.gateProductionConnectivityVerified = true;
      update.productionReadyAt = now;
      update.nhcxMode = "PRODUCTION_READY";
      break;
    case "LIVE_APPROVED":
      // Human/external attestation — the final operator approval. Audited.
      update.gateLiveApproved = true;
      update.liveApprovedAt = now;
      break;
    case "LIVE":
      // The final flip. Requires NHCX_ENVIRONMENT=LIVE env override too —
      // this double-gates LIVE: DB gate + operator env declaration.
      update.nhcxMode = "LIVE";
      break;
  }
  await db.hospitalIntegrationProfile.update({ where: { hospitalId }, data: update });
  // Audit the gate advance.
  await db.auditLog.create({
    data: {
      hospitalId,
      actorId: opts.actorId,
      action: `NHCX_GATE_ADVANCED:${gate}`,
      target: `hospital:${hospitalId}`,
      detail: `Advanced to NHCX gate ${gate}. Evidence: ${opts.evidence ?? "(none)"}. Technical gates auto-verified via NHCXHealthCheck.`,
    },
  });
  return { ok: true, gate };
}

/** Roll back a hospital's NHCX state (e.g. cert expiry, incident). Sets the
 *  nhcxMode to FAILED and clears the LIVE gates. Lower gates are preserved. */
export async function rollbackNhcxGate(hospitalId: string, reason: string, opts: { actorId: string }): Promise<{ ok: boolean }> {
  await db.hospitalIntegrationProfile.update({
    where: { hospitalId },
    data: {
      gateLiveApproved: false,
      gateProductionConnectivityVerified: false,
      nhcxMode: "FAILED",
    },
  });
  await db.auditLog.create({
    data: {
      hospitalId,
      actorId: opts.actorId,
      action: "NHCX_GATE_ROLLBACK",
      target: `hospital:${hospitalId}`,
      detail: `NHCX rolled back to FAILED. Reason: ${reason}`,
    },
  });
  return { ok: true };
}

/** True only when the hospital has reached the LIVE gate (DB) AND the env
 *  override is set. This is the authoritative "is NHCX live for this hospital?". */
export async function isNhcxLiveForHospital(hospitalId: string): Promise<boolean> {
  const gate = await getCurrentNhcxGate(hospitalId);
  if (gate !== "LIVE") return false;
  // The env override (NHCX_ENVIRONMENT=LIVE) is the second gate.
  return (process.env.NHCX_ENVIRONMENT ?? "").toUpperCase() === "LIVE" && isNhcxCertConfigured;
}
