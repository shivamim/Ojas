// Ojas — erasure API (D2: Right to Erasure per DPDP 2025).
// Anonymizes a patient record while retaining clinical/audit trail data
// required for medical record-keeping. HOSPITAL_ADMIN only.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole, requireTenantAccess } from "@/lib/auth";
import { encryptPII, lookupHash } from "@/lib/crypto";
import { audit, getClientIp, jsonError, rateLimitStrict } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import { parseBody, erasureSchema, ValidationError } from "@/lib/validation";

type Ctx = { params: Promise<{}> };

// POST /api/erasure — anonymize a patient record per D2 (Right to Erasure)
async function POSTImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);
  const rl = await rateLimitStrict(`erasure:${user.sub}`, 5, 60);
  if (!rl.allowed) return jsonError("Too many erasure requests. Slow down.", 429);

  let body: { patientId: string; reason: string };
  try {
    body = await parseBody(req, erasureSchema);
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid request body", 400);
  }

  const patient = await db.patient.findUnique({ where: { id: body.patientId } });
  if (!patient) return jsonError("Patient not found", 404);
  await requireTenantAccess(user, patient.hospitalId);

  // Prevent double-erasure
  if (patient.fullName === "ANONYMIZED") {
    return jsonError("Patient record already anonymized", 409);
  }

  // Anonymize PII fields — null/hashes per D2 Right to Erasure
  // Retain clinical/audit trail data required for medical record-keeping
  const anonymizedMobile = "0000000000";
  const anonymizedMobileHash = lookupHash(anonymizedMobile);

  await db.patient.update({
    where: { id: patient.id },
    data: {
      fullName: "ANONYMIZED",
      mobileEncrypted: encryptPII(anonymizedMobile),
      mobileHash: anonymizedMobileHash,
      addressEncrypted: null,
      nextOfKinContactEncrypted: null,
      nextOfKinName: null,
      uhid: null,
      dateOfBirth: null,
      gender: "REDACTED",
      // Retain: age, surgeryType, surgeryDate, dischargeDate, comorbidities,
      // status, riskLevel, riskScore — clinical/audit data required for record-keeping
    },
  });

  // Log to AuditLog with action "patient.erasure"
  await audit({
    hospitalId: patient.hospitalId,
    actorId: user.sub,
    action: "patient.erasure",
    target: patient.id,
    detail: `Patient PII anonymized per D2 (Right to Erasure). Clinical data retained for medical record-keeping.`,
    ip: getClientIp(req),
  });

  await db.timelineEvent.create({
    data: {
      hospitalId: patient.hospitalId,
      patientId: patient.id,
      eventType: "DATA_ERASURE",
      title: "Patient data anonymized (Right to Erasure)",
      detail: `PII fields nullified/anonymized per DPDP 2025 D2. Clinical data retained.`,
      actorId: user.sub,
      occurredAt: new Date(),
    },
  });

  return Response.json({
    ok: true,
    message: "Patient PII anonymized per D2 (Right to Erasure). Clinical data retained for medical record-keeping.",
    patientId: patient.id,
  });
}

export const POST = withErrors(POSTImpl);
