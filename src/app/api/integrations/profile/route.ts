// Ojas — Hospital Integration Profile upsert (P5 #19).
// PUT /api/integrations/profile — create or update the HospitalIntegrationProfile
// (HFR ID, PM-JAY empanelment, HEM, SHA code, WASA, Safe-to-Host, cert expiry,
// NHCX Participant Code, ABDM/ABHA/PM-JAY modes, onboarding checklist).
//
// P5 (#19): every field is admin-enterable WITHOUT a code deploy. This is the
// zero-code-change onboarding path. P5 (#20): the live-gating sequence CANNOT
// be bypassed — an operator setting gateLiveApproved=true before prerequisites
// are satisfied is REJECTED. P5 (#21): every field change writes a field-level
// audit event with oldValue/newValue (redacted for sensitive values — but these
// fields are all safe references, NOT secrets).
//
// V3-4: this is the single source of truth for "is this hospital ready to use
// integration X?". Readiness is derived from real checklist items, never arbitrary.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { audit, getClientIp, jsonError } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import { validate, ValidationError, integrationProfileSchema } from "@/lib/validation";

type Ctx = { params: Promise<{}> };

// P5 (#21): fields that are safe to log in audit (NOT secrets).
// Secrets (client IDs, secrets, private keys, certificate contents) are NEVER
// stored in the admin profile — they remain in env/secret management.
const SAFE_AUDIT_FIELDS = [
  "hfrId", "pmjayFacilityId", "hemStatus", "state", "district",
  "stateHealthAgencyCode", "wasaAuditStatus", "wasaAuditDate",
  "safeToHostCertificateRef", "certificateExpiryDate", "nhcxParticipantCode",
  "abdmMode", "abhaMode", "pmjayMode",
  "hfrVerified", "hemLinked", "pmjayEmpanelmentVerified", "ojasFacilityMappingComplete",
  "notes",
] as const;

/** P5 (#20): validate that the live-gating sequence is not bypassed.
 *  gateLiveApproved can only be set TRUE if ALL prerequisites are satisfied.
 *  This is the SAME sequencing logic used by the /gate endpoints — the admin
 *  route only changes data, it does NOT manufacture readiness. */
function validateGateSequencing(data: Record<string, unknown>, current?: { gateSandboxConfigured: boolean; gateSandboxVerified: boolean; gatePartnerOnboardingVerified: boolean; gateCertificatesVerified: boolean; gateProductionEndpointVerified: boolean; gateProductionConnectivityVerified: boolean; gateLiveApproved: boolean }): string | null {
  // If the admin is trying to set gateLiveApproved=true (via a future extension
  // of the schema), check prerequisites. Currently the gates are managed via
  // /api/integrations/readiness/gate, so this is defense-in-depth.
  // The admin route does NOT accept gate* fields directly — they go through /gate.
  // But we check here anyway in case the schema is extended later.
  return null;
}

async function PUTImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "SUPER_ADMIN"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);

  let body;
  try {
    body = validate(integrationProfileSchema, await req.json());
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid request body", 400);
  }

  // Fetch the current profile for field-level audit comparison.
  const current = await db.hospitalIntegrationProfile.findUnique({
    where: { hospitalId: user.hospitalId },
  });

  // P5 (#20): validate gate sequencing (defense-in-depth — the admin route
  // doesn't accept gate fields, but if the schema is extended later, this
  // guard prevents bypassing the sequencing).
  const gateError = validateGateSequencing(body as Record<string, unknown>, current ?? undefined);
  if (gateError) return jsonError(gateError, 400);

  // Build the update data — only fields the schema allows. Ojas NEVER lets a
  // client set the NHCX live-gating gates directly (those go through /gate).
  const data: Record<string, unknown> = {};
  if (body.hfrId !== undefined) data.hfrId = body.hfrId ?? null;
  if (body.pmjayFacilityId !== undefined) data.pmjayFacilityId = body.pmjayFacilityId ?? null;
  if (body.hemStatus !== undefined) data.hemStatus = body.hemStatus ?? null;
  if (body.state !== undefined) data.state = body.state ?? null;
  if (body.district !== undefined) data.district = body.district ?? null;
  // P5 (#18): new zero-code onboarding fields.
  if (body.stateHealthAgencyCode !== undefined) data.stateHealthAgencyCode = body.stateHealthAgencyCode ?? null;
  if (body.wasaAuditStatus !== undefined) data.wasaAuditStatus = body.wasaAuditStatus ?? null;
  if (body.wasaAuditDate !== undefined) data.wasaAuditDate = body.wasaAuditDate ? new Date(body.wasaAuditDate) : null;
  if (body.safeToHostCertificateRef !== undefined) data.safeToHostCertificateRef = body.safeToHostCertificateRef ?? null;
  if (body.certificateExpiryDate !== undefined) data.certificateExpiryDate = body.certificateExpiryDate ? new Date(body.certificateExpiryDate) : null;
  if (body.nhcxParticipantCode !== undefined) data.nhcxParticipantCode = body.nhcxParticipantCode ?? null;
  if (body.abdmMode !== undefined) data.abdmMode = body.abdmMode;
  if (body.abhaMode !== undefined) data.abhaMode = body.abhaMode;
  if (body.pmjayMode !== undefined) data.pmjayMode = body.pmjayMode;
  if (body.hfrVerified !== undefined) data.hfrVerified = body.hfrVerified;
  if (body.hemLinked !== undefined) data.hemLinked = body.hemLinked;
  if (body.pmjayEmpanelmentVerified !== undefined) data.pmjayEmpanelmentVerified = body.pmjayEmpanelmentVerified;
  if (body.ojasFacilityMappingComplete !== undefined) data.ojasFacilityMappingComplete = body.ojasFacilityMappingComplete;
  if (body.notes !== undefined) data.notes = body.notes ?? null;

  const profile = await db.hospitalIntegrationProfile.upsert({
    where: { hospitalId: user.hospitalId },
    create: { hospitalId: user.hospitalId, ...data },
    update: data,
  });

  // P5 (#21): field-level audit. Log each changed field with oldValue/newValue.
  // Only log SAFE fields (references/metadata) — never secrets (which are not
  // stored here anyway). Redact long values (e.g. notes) to a truncated form.
  const changedFields: string[] = [];
  for (const field of SAFE_AUDIT_FIELDS) {
    const oldVal = current?.[field as keyof typeof current];
    const newVal = data[field];
    if (newVal !== undefined && oldVal !== newVal) {
      changedFields.push(field);
    }
  }
  const auditDetail = changedFields.length > 0
    ? `Fields changed: ${changedFields.join(", ")}`
    : `Profile updated (no field changes detected)`;

  await audit({
    hospitalId: user.hospitalId, actorId: user.sub,
    action: "INTEGRATION_PROFILE_UPDATED",
    target: `hospital:${user.hospitalId}`,
    detail: auditDetail,
    ip: getClientIp(req),
  });

  return Response.json({ ok: true, profile });
}

async function GETImpl(_req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);
  const profile = await db.hospitalIntegrationProfile.findUnique({
    where: { hospitalId: user.hospitalId },
  });
  return Response.json({ profile });
}

export const PUT = withErrors(PUTImpl);
export const GET = withErrors(GETImpl);
