// Ojas — Discharge checklist API. CRUD for checklist items per patient.
// A default checklist is auto-created at enrollment; coordinators check items off.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole, requireTenantAccess } from "@/lib/auth";
import { withErrors } from "@/lib/api-handler";
import { jsonError, audit, getClientIp } from "@/lib/server-utils";
import { parseBody, checklistItemCreateSchema, checklistItemUpdateSchema, ValidationError } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

// GET — list checklist items for a patient
async function GETImpl(_req: NextRequest, ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR", "DOCTOR"]);
  const { id } = await ctx.params;
  const patient = await db.patient.findUnique({ where: { id } });
  if (!patient) return jsonError("Patient not found", 404);
  await requireTenantAccess(user, patient.hospitalId);
  const items = await db.dischargeChecklist.findMany({
    where: { patientId: id },
    orderBy: [{ category: "asc" }, { createdAt: "asc" }],
  });
  const total = items.length;
  const checked = items.filter((i) => i.checked).length;
  return Response.json({ items, summary: { total, checked, remaining: total - checked, completionRate: total > 0 ? Math.round((checked / total) * 100) : 0 } });
}

// POST — add a checklist item
async function POSTImpl(req: NextRequest, ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR", "DOCTOR"]);
  const { id } = await ctx.params;
  const patient = await db.patient.findUnique({ where: { id } });
  if (!patient) return jsonError("Patient not found", 404);
  await requireTenantAccess(user, patient.hospitalId);
  let body: {
    item: string;
    category: "DISCHARGE_SUMMARY" | "MEDICATION_REVIEW" | "FOLLOW_UP_BOOKED" | "TRANSPORT" | "FAMILY_BRIEFED" | "DPDPA_CONSENT" | "OTHER";
    notes?: string | null;
  };
  try {
    body = await parseBody(req, checklistItemCreateSchema);
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid body", 400);
  }
  const item = await db.dischargeChecklist.create({
    data: {
      hospitalId: patient.hospitalId, patientId: patient.id,
      item: body.item, category: body.category, notes: body.notes || null,
    },
  });
  await audit({ hospitalId: patient.hospitalId, actorId: user.sub, action: "checklist.add", target: item.id, detail: body.item, ip: getClientIp(req) });
  return Response.json({ item }, { status: 201 });
}

// PATCH — toggle or update a checklist item
async function PATCHImpl(req: NextRequest, ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR", "DOCTOR"]);
  const { id } = await ctx.params;
  const patient = await db.patient.findUnique({ where: { id } });
  if (!patient) return jsonError("Patient not found", 404);
  await requireTenantAccess(user, patient.hospitalId);
  let body: {
    itemId: string;
    checked?: boolean;
    notes?: string | null;
  };
  try {
    body = await parseBody(req, checklistItemUpdateSchema);
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid body", 400);
  }
  const item = await db.dischargeChecklist.findUnique({ where: { id: body.itemId } });
  if (!item || item.patientId !== id) return jsonError("Item not found", 404);
  const data: Record<string, unknown> = {};
  if (typeof body.checked === "boolean") {
    data.checked = body.checked;
    data.checkedAt = body.checked ? new Date() : null;
    data.checkedById = body.checked ? user.sub : null;
  }
  if (typeof body.notes === "string") data.notes = body.notes;
  const updated = await db.dischargeChecklist.update({ where: { id: body.itemId }, data });
  if (body.checked) {
    await db.timelineEvent.create({
      data: {
        hospitalId: patient.hospitalId, patientId: patient.id,
        eventType: "CHECKLIST_ITEM_CHECKED", title: `Checklist: ${item.item}`,
        detail: `Checked by ${user.name}`,
        actorId: user.sub, occurredAt: new Date(),
      },
    });
  }
  await audit({ hospitalId: patient.hospitalId, actorId: user.sub, action: "checklist.update", target: item.id, detail: JSON.stringify(data), ip: getClientIp(req) });
  return Response.json({ item: updated });
}

export const GET = withErrors(GETImpl);
export const POST = withErrors(POSTImpl);
export const PATCH = withErrors(PATCHImpl);
