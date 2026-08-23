// Ojas — Recovery milestone tracker API. CRUD for recovery milestones.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole, requireTenantAccess } from "@/lib/auth";
import { withErrors } from "@/lib/api-handler";
import { jsonError, audit, getClientIp } from "@/lib/server-utils";
import { parseBody, milestoneCreateSchema, milestoneUpdateSchema, ValidationError } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

const MILESTONE_TYPES = ["FIRST_WALK", "WOUND_CHECK", "SUTURE_REMOVAL", "STAPLE_REMOVAL", "DRESSING_CHANGE", "PHYSIOTHERAPY", "FOLLOW_UP", "OTHER"];

// GET — list milestones for a patient
async function GETImpl(_req: NextRequest, ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR", "DOCTOR"]);
  const { id } = await ctx.params;
  const patient = await db.patient.findUnique({ where: { id } });
  if (!patient) return jsonError("Patient not found", 404);
  await requireTenantAccess(user, patient.hospitalId);
  const milestones = await db.milestone.findMany({
    where: { patientId: id },
    orderBy: { targetDate: "asc" },
  });
  return Response.json({ milestones });
}

// POST — add a milestone
async function POSTImpl(req: NextRequest, ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR", "DOCTOR"]);
  const { id } = await ctx.params;
  const patient = await db.patient.findUnique({ where: { id } });
  if (!patient) return jsonError("Patient not found", 404);
  await requireTenantAccess(user, patient.hospitalId);
  let body: {
    type: "FIRST_WALK" | "WOUND_CHECK" | "SUTURE_REMOVAL" | "STAPLE_REMOVAL" | "DRESSING_CHANGE" | "PHYSIOTHERAPY" | "FOLLOW_UP" | "OTHER";
    label: string;
    targetDate: string;
    notes?: string | null;
  };
  try {
    body = await parseBody(req, milestoneCreateSchema);
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid body", 400);
  }
  void MILESTONE_TYPES;
  const milestone = await db.milestone.create({
    data: {
      hospitalId: patient.hospitalId, patientId: patient.id,
      type: body.type, label: body.label,
      targetDate: new Date(body.targetDate),
      notes: body.notes || null,
    },
  });
  await db.timelineEvent.create({
    data: {
      hospitalId: patient.hospitalId, patientId: patient.id,
      eventType: "MILESTONE_ADDED", title: `Milestone added: ${body.label}`,
      detail: `Target: ${new Date(body.targetDate).toLocaleDateString("en-IN")}`,
      actorId: user.sub, occurredAt: new Date(),
    },
  });
  await audit({ hospitalId: patient.hospitalId, actorId: user.sub, action: "milestone.add", target: milestone.id, detail: `${body.label} for ${patient.fullName}`, ip: getClientIp(req) });
  return Response.json({ milestone }, { status: 201 });
}

// PATCH — complete or update a milestone
async function PATCHImpl(req: NextRequest, ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR", "DOCTOR"]);
  const { id } = await ctx.params;
  const patient = await db.patient.findUnique({ where: { id } });
  if (!patient) return jsonError("Patient not found", 404);
  await requireTenantAccess(user, patient.hospitalId);
  let body: {
    milestoneId: string;
    status?: "PENDING" | "COMPLETED" | "MISSED";
    completedAt?: string | null;
    notes?: string | null;
  };
  try {
    body = await parseBody(req, milestoneUpdateSchema);
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid body", 400);
  }
  const milestone = await db.milestone.findUnique({ where: { id: body.milestoneId } });
  if (!milestone || milestone.patientId !== id) return jsonError("Milestone not found", 404);
  const data: Record<string, unknown> = {};
  if (body.status && ["PENDING", "COMPLETED", "MISSED"].includes(body.status)) data.status = body.status;
  if (body.status === "COMPLETED" && !body.completedAt) data.completedAt = new Date();
  if (body.completedAt) data.completedAt = new Date(body.completedAt);
  if (typeof body.notes === "string") data.notes = body.notes;
  const updated = await db.milestone.update({ where: { id: body.milestoneId }, data });
  if (body.status === "COMPLETED") {
    await db.timelineEvent.create({
      data: {
        hospitalId: patient.hospitalId, patientId: patient.id,
        eventType: "MILESTONE_COMPLETED", title: `Milestone completed: ${milestone.label}`,
        detail: `Completed on ${new Date().toLocaleDateString("en-IN")}`,
        actorId: user.sub, occurredAt: new Date(),
      },
    });
  }
  await audit({ hospitalId: patient.hospitalId, actorId: user.sub, action: "milestone.update", target: milestone.id, detail: JSON.stringify(data), ip: getClientIp(req) });
  return Response.json({ milestone: updated });
}

export const GET = withErrors(GETImpl);
export const POST = withErrors(POSTImpl);
export const PATCH = withErrors(PATCHImpl);
