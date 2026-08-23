// Ojas — Family Recovery Companion API (P0.2).
// POST   /api/family-updates         — Create (queue) a family update.
// GET    /api/family-updates         — List family updates (scoped to hospital).
// PATCH  /api/family-updates/[id]    — Mark as delivered/read (webhook callback).
// POST   /api/family-updates/send    — Cron: send all QUEUED updates via WhatsApp.
// POST   /api/whatsapp/inbound       — HMAC-verified inbound family reply.
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser, requireAuth, requireTenantAccess } from "@/lib/auth";
import { jsonError, audit, getClientIp } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import {
  createFamilyUpdate,
  composeDailyRecoveryUpdate,
  composeEscalationNotice,
  composeMedicationReminder,
  type FamilyUpdateType,
  type FamilyLanguage,
} from "@/lib/family-companion";

type Ctx = { params: Promise<{}> };

const createSchema = z.object({
  patientId: z.string().min(1),
  type: z.enum([
    "DAILY_RECOVERY",
    "MEDICATION_REMINDER",
    "APPOINTMENT_ALERT",
    "ESCALATION_NOTICE",
    "MILESTONE_ACHIEVED",
  ]),
  content: z.string().optional(),
  language: z.enum([
    "HINGLISH", "HINDI", "ENGLISH", "TAMIL", "TELUGU", "MARATHI", "BENGALI",
  ]).optional(),
});

// POST /api/family-updates
async function POSTImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireAuth(await getCurrentUser());
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid request body", 400);
  const { patientId, type, content, language } = parsed.data;

  // Tenant scope check.
  const patient = await db.patient.findFirst({
    where: { id: patientId, deletedAt: null },
    select: { id: true, hospitalId: true, familyOptIn: true, familyContactEncrypted: true, familyName: true, familyLanguage: true },
  });
  if (!patient) return jsonError("Patient not found", 404);
  await requireTenantAccess(user, patient.hospitalId);

  if (!patient.familyOptIn || !patient.familyContactEncrypted) {
    return jsonError("Family has not opted in to updates", 400);
  }

  // For ESCALATION_NOTICE / MEDICATION_REMINDER with no content, compose from helpers.
  let finalContent = content;
  if (!finalContent) {
    if (type === "ESCALATION_NOTICE") {
      finalContent = composeEscalationNotice({
        familyName: patient.familyName,
        language: (patient.familyLanguage as FamilyLanguage) || language,
        reason: "Triage flagged HIGH/CRITICAL in latest check-in",
      });
    } else if (type === "MEDICATION_REMINDER") {
      finalContent = composeMedicationReminder({
        familyName: patient.familyName,
        medicationName: "next scheduled medication",
        language: (patient.familyLanguage as FamilyLanguage) || language,
      });
    } else if (type === "DAILY_RECOVERY") {
      // composeDailyRecoveryUpdate will be invoked inside createFamilyUpdate
    } else {
      return jsonError(`Content required for type ${type}`, 400);
    }
  }

  const updateId = await createFamilyUpdate({
    patientId,
    hospitalId: patient.hospitalId,
    type: type as FamilyUpdateType,
    language: language as FamilyLanguage | undefined,
    content: finalContent,
  });
  await audit({
    hospitalId: patient.hospitalId,
    actorId: user.sub,
    action: "FAMILY_UPDATE_CREATED",
    target: patientId,
    detail: `type=${type}`,
    ip: getClientIp(req),
  });
  return Response.json({ id: updateId, status: "QUEUED" }, { status: 201 });
}

// GET /api/family-updates?patientId=...&status=...
async function GETImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireAuth(await getCurrentUser());
  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get("patientId");
  const status = searchParams.get("status");
  const limit = Math.min(parseInt(searchParams.get("limit") || "50", 10), 200);

  const where: Record<string, unknown> = {};
  if (user.role !== "SUPER_ADMIN") where.hospitalId = user.hospitalId;
  else if (searchParams.get("hospitalId")) where.hospitalId = searchParams.get("hospitalId");
  if (patientId) where.patientId = patientId;
  if (status) where.status = status;

  const updates = await db.familyUpdate.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
    include: {
      patient: { select: { fullName: true, surgeryType: true, dischargeDate: true } },
    },
  });
  return Response.json({ updates });
}

export const POST = withErrors(POSTImpl);
export const GET = withErrors(GETImpl);
