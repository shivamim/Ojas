// Ojas — settings API. Hospital settings + active session management.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole, requireTenantAccess } from "@/lib/auth";
import { audit, getClientIp, jsonError } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import { parseBody, settingsUpdateSchema, ValidationError } from "@/lib/validation";

type Ctx = { params: Promise<{}> };

async function GETImpl() {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);
  const hospital = await db.hospital.findUnique({
    where: { id: user.hospitalId },
    include: { settings: true, subscriptions: true },
  });
  if (!hospital) return jsonError("Hospital not found", 404);
  return Response.json({ hospital, settings: hospital.settings, subscription: hospital.subscriptions[0] || null });
}

async function PATCHImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);
  let body: {
    recoveryWindowDays?: number;
    checkinCadenceHours?: number;
    whatsappEnabled?: boolean;
    emailDigestEnabled?: boolean;
    aiTriageEnabled?: boolean;
    notificationPreferences?: string;
  };
  try {
    body = await parseBody(req, settingsUpdateSchema);
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid body", 400);
  }
  const data: Record<string, unknown> = {};
  if (typeof body.recoveryWindowDays === "number") data.recoveryWindowDays = body.recoveryWindowDays;
  if (typeof body.checkinCadenceHours === "number") data.checkinCadenceHours = body.checkinCadenceHours;
  if (typeof body.whatsappEnabled === "boolean") data.whatsappEnabled = body.whatsappEnabled;
  if (typeof body.emailDigestEnabled === "boolean") data.emailDigestEnabled = body.emailDigestEnabled;
  if (typeof body.aiTriageEnabled === "boolean") data.aiTriageEnabled = body.aiTriageEnabled;
  await db.hospitalSettings.upsert({
    where: { hospitalId: user.hospitalId },
    create: { hospitalId: user.hospitalId, ...data },
    update: data,
  });
  await audit({ hospitalId: user.hospitalId, actorId: user.sub, action: "settings.update", detail: JSON.stringify(data), ip: getClientIp(req) });
  return Response.json({ ok: true });
}

// GET /api/settings/sessions — list active sessions for current user
export async function sessionsList() {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR", "DOCTOR", "SUPER_ADMIN"]);
  const sessions = await db.session.findMany({
    where: { userId: user.sub, revokedAt: null },
    orderBy: { lastUsedAt: "desc" },
  });
  return Response.json({ sessions });
}

export const GET = withErrors(GETImpl);

export const PATCH = withErrors(PATCHImpl);
