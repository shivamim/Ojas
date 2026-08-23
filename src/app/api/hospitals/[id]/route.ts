// Ojas — single hospital: detail, update, soft-delete, list patients/users.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole, requireTenantAccess } from "@/lib/auth";
import { audit, getClientIp, jsonError } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import { parseBody, hospitalUpdateSchema, ValidationError } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

async function GETImpl(req: NextRequest, ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["SUPER_ADMIN", "HOSPITAL_ADMIN"]);
  const { id } = await ctx.params;
  const hospital = await db.hospital.findUnique({
    where: { id },
    include: {
      settings: true,
      subscriptions: true,
      users: { select: { id: true, name: true, email: true, role: true, createdAt: true } },
      _count: { select: { patients: true, checkins: true, escalations: true } },
    },
  });
  if (!hospital) return jsonError("Hospital not found", 404);
  if (user.role !== "SUPER_ADMIN") await requireTenantAccess(user, hospital.id);
  return Response.json({ hospital });
}

async function PATCHImpl(req: NextRequest, ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["SUPER_ADMIN", "HOSPITAL_ADMIN"]);
  const { id } = await ctx.params;
  const hospital = await db.hospital.findUnique({ where: { id } });
  if (!hospital) return jsonError("Hospital not found", 404);
  if (user.role !== "SUPER_ADMIN") await requireTenantAccess(user, hospital.id);
  let body: {
    name?: string;
    planTier?: "STARTER" | "PILOT" | "GROWTH" | "ENTERPRISE";
    bedCount?: number;
    nabhLevel?: string | null;
    city?: string | null;
  };
  try {
    body = await parseBody(req, hospitalUpdateSchema);
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid body", 400);
  }
  const data: Record<string, unknown> = {};
  if (body.name) data.name = body.name;
  if (body.planTier) data.planTier = body.planTier;
  if (typeof body.bedCount === "number") data.bedCount = body.bedCount;
  if (typeof body.nabhLevel === "string") data.nabhLevel = body.nabhLevel;
  if (typeof body.city === "string") data.city = body.city;
  const updated = await db.hospital.update({ where: { id }, data });
  await audit({ hospitalId: id, actorId: user.sub, action: "hospital.update", target: id, detail: JSON.stringify(data), ip: getClientIp(req) });
  return Response.json({ hospital: updated });
}

async function DELETEImpl(req: NextRequest, ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["SUPER_ADMIN"]);
  const { id } = await ctx.params;
  const updated = await db.hospital.update({ where: { id }, data: { deletedAt: new Date() } });
  await audit({ actorId: user.sub, action: "hospital.soft_delete", target: id, detail: updated.name, ip: getClientIp(req) });
  return Response.json({ ok: true });
}

export const GET = withErrors(GETImpl);

export const PATCH = withErrors(PATCHImpl);

export const DELETE = withErrors(DELETEImpl);
