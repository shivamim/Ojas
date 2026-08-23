// Ojas — DPDP DSR (Data Subject Rights) request tracker.
// POST   /api/dpdp/request         — Submit a new DSR (ACCESS/CORRECTION/ERASURE/GRIEVANCE).
// GET    /api/dpdp/request         — List DSRs (filter by status).
// PATCH  /api/dpdp/request/[id]    — Update status / response / mark resolved.
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser, requireAuth, requireRole, requireTenantAccess } from "@/lib/auth";
import { audit, getClientIp, jsonError } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import { createDpdpRequest } from "@/lib/dpdp";

type Ctx = { params: Promise<{}> };

const createSchema = z.object({
  patientId: z.string().min(1),
  type: z.enum(["ACCESS", "CORRECTION", "ERASURE", "GRIEVANCE"]),
  description: z.string().max(1000).optional(),
});

async function POSTImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid request", 400);

  const patient = await db.patient.findFirst({
    where: { id: parsed.data.patientId, deletedAt: null },
    select: { id: true, hospitalId: true },
  });
  if (!patient) return jsonError("Patient not found", 404);
  await requireTenantAccess(user, patient.hospitalId);

  const id = await createDpdpRequest({
    hospitalId: patient.hospitalId,
    patientId: patient.id,
    type: parsed.data.type,
    description: parsed.data.description,
  });
  await audit({
    hospitalId: patient.hospitalId, actorId: user.sub, action: "DPDP_REQUEST_SUBMITTED",
    target: patient.id, detail: `type=${parsed.data.type} reqId=${id}`,
    ip: getClientIp(req),
  });
  return Response.json({ id, status: "PENDING" }, { status: 201 });
}

async function GETImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireAuth(await getCurrentUser());
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const where: Record<string, unknown> = {};
  if (user.role !== "SUPER_ADMIN") where.hospitalId = user.hospitalId;
  if (status) where.status = status;

  const requests = await db.dpdpRequest.findMany({
    where,
    orderBy: { requestedAt: "desc" },
    take: 200,
    include: { patient: { select: { fullName: true, surgeryType: true } } },
  });
  return Response.json({ requests });
}

export const POST = withErrors(POSTImpl);
export const GET = withErrors(GETImpl);
