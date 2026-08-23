// Ojas — Care pathway template API. Hospital admins can create/edit custom
// milestone templates per surgery type. At enrollment, if a template exists
// for the patient's surgery type, it's used instead of the built-in defaults.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { withErrors } from "@/lib/api-handler";
import { parseBody, pathwaySchema, pathwayUpdateSchema, ValidationError } from "@/lib/validation";
import { jsonError, audit, getClientIp } from "@/lib/server-utils";

type Ctx = { params: Promise<{}> };

// GET — list all templates for the hospital
async function GETImpl(_req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);
  const templates = await db.carePathwayTemplate.findMany({
    where: { hospitalId: user.hospitalId },
    orderBy: { surgeryType: "asc" },
  });
  return Response.json({
    templates: templates.map((t) => ({
      ...t,
      milestones: JSON.parse(t.milestones),
    })),
  });
}

// POST — create a new template
async function POSTImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);
  let body: {
    surgeryType: string;
    name: string;
    description?: string | null;
    milestones: { type: string; label: string; dayOffset: number }[];
    isActive: boolean;
  };
  try {
    body = await parseBody(req, pathwaySchema);
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid body", 400);
  }
  const existing = await db.carePathwayTemplate.findUnique({
    where: { hospitalId_surgeryType: { hospitalId: user.hospitalId, surgeryType: body.surgeryType } },
  });
  if (existing) return jsonError("A template for this surgery type already exists. Edit it instead.", 409);

  const template = await db.carePathwayTemplate.create({
    data: {
      hospitalId: user.hospitalId,
      surgeryType: body.surgeryType,
      name: body.name,
      description: body.description || null,
      milestones: JSON.stringify(body.milestones),
    },
  });
  await audit({ hospitalId: user.hospitalId, actorId: user.sub, action: "pathway.create", target: template.id, detail: `${body.name} for ${body.surgeryType}`, ip: getClientIp(req) });
  return Response.json({ template: { ...template, milestones: JSON.parse(template.milestones) } }, { status: 201 });
}

// PATCH — update a template
async function PATCHImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);
  let body: {
    id: string;
    name?: string;
    description?: string | null;
    milestones?: { type: string; label: string; dayOffset: number }[];
    isActive?: boolean;
  };
  try {
    body = await parseBody(req, pathwayUpdateSchema);
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid body", 400);
  }
  const existing = await db.carePathwayTemplate.findUnique({ where: { id: body.id } });
  if (!existing || existing.hospitalId !== user.hospitalId) return jsonError("Template not found", 404);
  const data: Record<string, unknown> = {};
  if (body.name) data.name = body.name;
  if (typeof body.description === "string") data.description = body.description;
  if (body.milestones) {
    data.milestones = JSON.stringify(body.milestones);
  }
  if (typeof body.isActive === "boolean") data.isActive = body.isActive;
  const updated = await db.carePathwayTemplate.update({ where: { id: body.id }, data });
  await audit({ hospitalId: user.hospitalId, actorId: user.sub, action: "pathway.update", target: body.id, detail: JSON.stringify(data), ip: getClientIp(req) });
  return Response.json({ template: { ...updated, milestones: JSON.parse(updated.milestones) } });
}

// DELETE — delete a template
async function DELETEImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return jsonError("id required", 400);
  const existing = await db.carePathwayTemplate.findUnique({ where: { id } });
  if (!existing || existing.hospitalId !== user.hospitalId) return jsonError("Template not found", 404);
  await db.carePathwayTemplate.delete({ where: { id } });
  await audit({ hospitalId: user.hospitalId, actorId: user.sub, action: "pathway.delete", target: id, ip: getClientIp(req) });
  return Response.json({ ok: true });
}

export const GET = withErrors(GETImpl);
export const POST = withErrors(POSTImpl);
export const PATCH = withErrors(PATCHImpl);
export const DELETE = withErrors(DELETEImpl);
