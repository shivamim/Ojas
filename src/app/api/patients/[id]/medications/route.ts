// Ojas — Patient medication tracking API. CRUD for prescribed medications.
// N5: isHighAlert and alertCategory fields for high-alert medication flagging.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole, requireTenantAccess } from "@/lib/auth";
import { withErrors } from "@/lib/api-handler";
import { jsonError, audit, getClientIp } from "@/lib/server-utils";
import { parseBody, medicationSchema, medicationUpdateSchema, ValidationError } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

// GET /api/patients/[id]/medications — list medications for a patient
async function GETImpl(_req: NextRequest, ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR", "DOCTOR"]);
  const { id } = await ctx.params;
  const patient = await db.patient.findUnique({ where: { id } });
  if (!patient) return jsonError("Patient not found", 404);
  await requireTenantAccess(user, patient.hospitalId);
  const medications = await db.medication.findMany({
    where: { patientId: id },
    orderBy: { startDate: "desc" },
  });
  return Response.json({ medications });
}

// POST /api/patients/[id]/medications — add a medication
async function POSTImpl(req: NextRequest, ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR", "DOCTOR"]);
  const { id } = await ctx.params;
  const patient = await db.patient.findUnique({ where: { id } });
  if (!patient) return jsonError("Patient not found", 404);
  await requireTenantAccess(user, patient.hospitalId);
  let body: {
    name: string;
    dosage: string;
    frequency: string;
    startDate: string;
    endDate?: string | null;
    notes?: string | null;
    isHighAlert: boolean;
    alertCategory: "STANDARD" | "HIGH_ALERT";
  };
  try {
    body = await parseBody(req, medicationSchema);
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid body", 400);
  }

  // N5: alertCategory defaults to STANDARD (or HIGH_ALERT if isHighAlert=true).
  // The schema already enforces the enum + default, so body.alertCategory +
  // body.isHighAlert are typed + safe here.
  const isHighAlert = body.isHighAlert;
  const alertCategory = body.alertCategory;

  const med = await db.medication.create({
    data: {
      hospitalId: patient.hospitalId, patientId: patient.id,
      name: body.name, dosage: body.dosage, frequency: body.frequency,
      startDate: new Date(body.startDate),
      endDate: body.endDate ? new Date(body.endDate) : null,
      notes: body.notes || null,
      isHighAlert,
      alertCategory,
    },
  });
  await db.timelineEvent.create({
    data: {
      hospitalId: patient.hospitalId, patientId: patient.id,
      eventType: "MEDICATION_ADDED", title: `Medication added: ${body.name}${isHighAlert ? " (HIGH ALERT)" : ""}`,
      detail: `${body.dosage}, ${body.frequency}`,
      actorId: user.sub, occurredAt: new Date(),
    },
  });
  await audit({ hospitalId: patient.hospitalId, actorId: user.sub, action: "medication.add", target: med.id, detail: `${body.name} for ${patient.fullName}${isHighAlert ? " [HIGH_ALERT]" : ""}`, ip: getClientIp(req) });
  return Response.json({ medication: med }, { status: 201 });
}

// PATCH /api/patients/[id]/medications — update a medication (status change, add end date)
async function PATCHImpl(req: NextRequest, ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR", "DOCTOR"]);
  const { id } = await ctx.params;
  const patient = await db.patient.findUnique({ where: { id } });
  if (!patient) return jsonError("Patient not found", 404);
  await requireTenantAccess(user, patient.hospitalId);
  let body: {
    medicationId: string;
    status?: "ACTIVE" | "COMPLETED" | "DISCONTINUED";
    endDate?: string | null;
    notes?: string | null;
    isHighAlert?: boolean;
    alertCategory?: "STANDARD" | "HIGH_ALERT";
  };
  try {
    body = await parseBody(req, medicationUpdateSchema);
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid body", 400);
  }
  const med = await db.medication.findUnique({ where: { id: body.medicationId } });
  if (!med || med.patientId !== id) return jsonError("Medication not found", 404);
  const data: Record<string, unknown> = {};
  if (body.status) data.status = body.status;
  if (body.endDate) data.endDate = new Date(body.endDate);
  if (typeof body.notes === "string") data.notes = body.notes;
  // N5: Update high-alert fields
  if (typeof body.isHighAlert === "boolean") data.isHighAlert = body.isHighAlert;
  if (body.alertCategory) data.alertCategory = body.alertCategory;
  const updated = await db.medication.update({ where: { id: body.medicationId }, data });
  await audit({ hospitalId: patient.hospitalId, actorId: user.sub, action: "medication.update", target: med.id, detail: JSON.stringify(data), ip: getClientIp(req) });
  return Response.json({ medication: updated });
}

export const GET = withErrors(GETImpl);
export const POST = withErrors(POSTImpl);
export const PATCH = withErrors(PATCHImpl);
