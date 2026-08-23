// Ojas — single-patient API: detail, update, soft-delete.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireAuth, requireRole, requireTenantAccess } from "@/lib/auth";
import { decryptPII, encryptPII, maskMobile } from "@/lib/crypto";
import { audit, getClientIp, jsonError } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import { parseBody, patientUpdateSchema, ValidationError, type PatientUpdate } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

async function GETImpl(_req: NextRequest, ctx: Ctx) {
  const user = requireAuth(await getCurrentUser());
  const { id } = await ctx.params;
  const patient = await db.patient.findUnique({
    where: { id },
    include: {
      checkins: { orderBy: { scheduledFor: "asc" } },
      escalations: { orderBy: { createdAt: "desc" } },
      timelineEvents: { orderBy: { occurredAt: "desc" }, take: 50 },
      consentRecords: { orderBy: { createdAt: "desc" } },
      followUpPlans: { orderBy: { plannedDate: "asc" } },
      dischargeSummary: true,
      familyUpdates: { orderBy: { createdAt: "desc" }, take: 20 },
    },
  });
  if (!patient || patient.deletedAt) return jsonError("Patient not found", 404);
  await requireTenantAccess(user, patient.hospitalId);
  return Response.json({
    patient: {
      ...patient,
      mobileMasked: maskMobile(decryptPII(patient.mobileEncrypted)),
      mobileEncrypted: undefined,
      mobileHash: undefined,
      addressEncrypted: patient.addressEncrypted ? maskMobile(decryptPII(patient.addressEncrypted)) : null,
      nextOfKinContactEncrypted: patient.nextOfKinContactEncrypted ? maskMobile(decryptPII(patient.nextOfKinContactEncrypted)) : null,
      familyContactEncrypted: patient.familyContactEncrypted ? maskMobile(decryptPII(patient.familyContactEncrypted)) : null,
    },
  });
}

async function PATCHImpl(req: NextRequest, ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR", "DOCTOR"]);
  const { id } = await ctx.params;
  const patient = await db.patient.findUnique({ where: { id } });
  if (!patient || patient.deletedAt) return jsonError("Patient not found", 404);
  await requireTenantAccess(user, patient.hospitalId);

  let body: PatientUpdate;
  try {
    body = await parseBody(req, patientUpdateSchema);
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid body", 400);
  }

  const data: Record<string, unknown> = {};
  if (body.status) {
    data.status = body.status;
    // N3: Set lostToFollowupReason when status changes to LOST_TO_FOLLOWUP
    if (body.status === "LOST_TO_FOLLOWUP" && body.lostToFollowupReason) {
      data.lostToFollowupReason = body.lostToFollowupReason;
    }
    // Clear lostToFollowupReason if status changes away from LOST_TO_FOLLOWUP
    if (body.status !== "LOST_TO_FOLLOWUP" && patient.lostToFollowupReason) {
      data.lostToFollowupReason = null;
    }
  }
  if (typeof body.comorbidities === "string") data.comorbidities = body.comorbidities;
  if (typeof body.address === "string") data.addressEncrypted = encryptPII(body.address);
  if (typeof body.nextOfKinContact === "string") data.nextOfKinContactEncrypted = encryptPII(body.nextOfKinContact);
  if (typeof body.nextOfKinName === "string") data.nextOfKinName = body.nextOfKinName;
  if (typeof body.uhid === "string") data.uhid = body.uhid;
  if (typeof body.dateOfBirth === "string") data.dateOfBirth = new Date(body.dateOfBirth);
  if (typeof body.lostToFollowupReason === "string") data.lostToFollowupReason = body.lostToFollowupReason;
  // ── P0.2: Family fields ────────────────────────────────────────────
  if (typeof body.familyContact === "string") {
    const { lookupHash } = await import("@/lib/crypto");
    data.familyContactEncrypted = encryptPII(body.familyContact);
    data.familyContactHash = lookupHash(body.familyContact);
  }
  if (typeof body.familyName === "string") data.familyName = body.familyName;
  if (typeof body.familyRelation === "string") data.familyRelation = body.familyRelation;
  if (body.familyLanguage) data.familyLanguage = body.familyLanguage;
  if (typeof body.familyOptIn === "boolean") data.familyOptIn = body.familyOptIn;

  const updated = await db.patient.update({ where: { id }, data });
  await db.timelineEvent.create({
    data: {
      hospitalId: patient.hospitalId, patientId: patient.id,
      eventType: "STATUS_CHANGE", title: `Status changed to ${data.status || "updated"}`,
      detail: `By ${user.name}`, actorId: user.sub, occurredAt: new Date(),
    },
  });
  await audit({ hospitalId: patient.hospitalId, actorId: user.sub, action: "patient.update", target: patient.id, detail: JSON.stringify(data), ip: getClientIp(req) });
  return Response.json({ patient: updated });
}

// DELETE — soft-delete a patient. Preserves de-identified audit records.
async function DELETEImpl(req: NextRequest, ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN"]);
  const { id } = await ctx.params;
  const patient = await db.patient.findUnique({ where: { id } });
  if (!patient || patient.deletedAt) return jsonError("Patient not found", 404);
  await requireTenantAccess(user, patient.hospitalId);

  // Soft-delete: set deletedAt, retain all records for audit.
  await db.patient.update({
    where: { id },
    data: { deletedAt: new Date(), status: "LOST_TO_FOLLOWUP", lostToFollowupReason: "TRANSFERRED" },
  });
  await db.timelineEvent.create({
    data: {
      hospitalId: patient.hospitalId, patientId: patient.id,
      eventType: "PATIENT_SOFT_DELETED", title: "Patient record soft-deleted",
      detail: `By ${user.name} (${user.email}). Records retained for audit.`,
      actorId: user.sub, occurredAt: new Date(),
    },
  });
  await audit({
    hospitalId: patient.hospitalId, actorId: user.sub, action: "patient.soft_delete",
    target: patient.id, detail: `Soft-deleted ${patient.fullName}`,
    ip: getClientIp(req),
  });
  return Response.json({ ok: true });
}

export const GET = withErrors(GETImpl);

export const PATCH = withErrors(PATCHImpl);

export const DELETE = withErrors(DELETEImpl);
