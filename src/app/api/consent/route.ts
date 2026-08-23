// Ojas — consent API (D1: purpose-specific consent tracking per DPDP 2025).
// Each consent is for a single purpose (e.g. whatsapp_monitoring, ai_triage,
// data_sharing_hospital). Consent can be revoked independently per purpose.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireAuth, requireTenantAccess } from "@/lib/auth";
import { audit, getClientIp, jsonError, rateLimit } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import { parseBody, consentGrantSchema, consentRevokeQuerySchema, ValidationError } from "@/lib/validation";

type Ctx = { params: Promise<{}> };

// GET /api/consent — list consent records for the user's hospital
// Supports ?patientId= filter
async function GETImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireAuth(await getCurrentUser());
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);
  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get("patientId");
  const where: Record<string, unknown> = { hospitalId: user.hospitalId };
  if (patientId) where.patientId = patientId;
  const consentRecords = await db.consentRecord.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { patient: { select: { id: true, fullName: true } } },
  });
  return Response.json({ consentRecords });
}

// POST /api/consent — create a new purpose-specific consent record
async function POSTImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireAuth(await getCurrentUser());
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);
  const rl = await rateLimit(`consent:${user.sub}`, 30, 60);
  if (!rl.allowed) return jsonError("Too many requests. Slow down.", 429);

  let body: {
    patientId: string;
    purpose: "whatsapp_monitoring" | "ai_triage" | "data_sharing_hospital" | "data_sharing_insurance" | "care_coordination" | "health_information_exchange_planned" | "analytics_research" | "marketing";
    consentTextVersion: string;
  };
  try {
    body = await parseBody(req, consentGrantSchema);
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid request body", 400);
  }

  // Verify patient exists and belongs to the user's hospital
  const patient = await db.patient.findUnique({ where: { id: body.patientId } });
  if (!patient) return jsonError("Patient not found", 404);
  await requireTenantAccess(user, patient.hospitalId);

  // Check for duplicate active consent for same patient+purpose
  const existing = await db.consentRecord.findFirst({
    where: {
      patientId: body.patientId,
      hospitalId: user.hospitalId,
      purpose: body.purpose,
      revokedAt: null,
    },
  });
  if (existing) return jsonError("Active consent already exists for this purpose", 409);

  const consentRecord = await db.consentRecord.create({
    data: {
      patientId: body.patientId,
      hospitalId: user.hospitalId,
      purpose: body.purpose,
      consentTextVersion: body.consentTextVersion,
      ip: getClientIp(req),
    },
  });

  await audit({
    hospitalId: user.hospitalId,
    actorId: user.sub,
    action: "consent.grant",
    target: consentRecord.id,
    detail: `Purpose: ${body.purpose}, version: ${body.consentTextVersion}`,
    ip: getClientIp(req),
  });

  return Response.json({ consentRecord }, { status: 201 });
}

// PATCH /api/consent — revoke consent (bulk, by patientId+purpose or by id)
async function PATCHImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireAuth(await getCurrentUser());
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);

  let body: {
    id?: string;
    patientId?: string;
    purpose?: "whatsapp_monitoring" | "ai_triage" | "data_sharing_hospital" | "data_sharing_insurance" | "care_coordination" | "health_information_exchange_planned" | "analytics_research" | "marketing";
    reason?: string | null;
  };
  try {
    body = await parseBody(req, consentRevokeQuerySchema);
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid request body", 400);
  }

  let consentRecord;
  if (body.id) {
    consentRecord = await db.consentRecord.findUnique({ where: { id: body.id } });
  } else {
    consentRecord = await db.consentRecord.findFirst({
      where: {
        patientId: body.patientId!,
        purpose: body.purpose!,
        revokedAt: null,
      },
    });
  }

  if (!consentRecord) return jsonError("Consent record not found", 404);
  await requireTenantAccess(user, consentRecord.hospitalId);
  if (consentRecord.revokedAt) return jsonError("Consent already revoked", 409);

  const updated = await db.consentRecord.update({
    where: { id: consentRecord.id },
    data: { revokedAt: new Date() },
  });

  await audit({
    hospitalId: user.hospitalId,
    actorId: user.sub,
    action: "consent.revoke",
    target: consentRecord.id,
    detail: `Purpose: ${consentRecord.purpose}`,
    ip: getClientIp(req),
  });

  return Response.json({ consentRecord: updated });
}

export const GET = withErrors(GETImpl);
export const POST = withErrors(POSTImpl);
export const PATCH = withErrors(PATCHImpl);
