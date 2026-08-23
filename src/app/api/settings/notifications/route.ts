// Ojas — notification preferences API. Stores per-hospital notification
// toggles as a JSON string in HospitalSettings.notificationPreferences.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { audit, getClientIp, jsonError } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import { parseBody, notificationPrefsSchema, ValidationError } from "@/lib/validation";

type Ctx = { params: Promise<{}> };

interface NotificationPrefs {
  emailDailyDigest: boolean;
  whatsappDeliveryReports: boolean;
  escalationAlerts: boolean;
  checkinReminders: boolean;
}

const DEFAULT_PREFS: NotificationPrefs = {
  emailDailyDigest: true,
  whatsappDeliveryReports: false,
  escalationAlerts: true,
  checkinReminders: true,
};

function parsePrefs(raw: string | null | undefined): NotificationPrefs {
  if (!raw) return { ...DEFAULT_PREFS };
  try {
    const parsed = JSON.parse(raw);
    return {
      emailDailyDigest: typeof parsed.emailDailyDigest === "boolean" ? parsed.emailDailyDigest : DEFAULT_PREFS.emailDailyDigest,
      whatsappDeliveryReports: typeof parsed.whatsappDeliveryReports === "boolean" ? parsed.whatsappDeliveryReports : DEFAULT_PREFS.whatsappDeliveryReports,
      escalationAlerts: typeof parsed.escalationAlerts === "boolean" ? parsed.escalationAlerts : DEFAULT_PREFS.escalationAlerts,
      checkinReminders: typeof parsed.checkinReminders === "boolean" ? parsed.checkinReminders : DEFAULT_PREFS.checkinReminders,
    };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}

async function GETImpl() {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);
  const settings = await db.hospitalSettings.findUnique({ where: { hospitalId: user.hospitalId } });
  const prefs = parsePrefs(settings?.notificationPreferences);
  return Response.json({ preferences: prefs });
}

async function PATCHImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);
  let body: Partial<NotificationPrefs>;
  try {
    body = await parseBody(req, notificationPrefsSchema) as Partial<NotificationPrefs>;
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid body", 400);
  }

  // Load current prefs so we merge rather than replace
  const settings = await db.hospitalSettings.findUnique({ where: { hospitalId: user.hospitalId } });
  const current = parsePrefs(settings?.notificationPreferences);

  const merged: NotificationPrefs = {
    emailDailyDigest: typeof body.emailDailyDigest === "boolean" ? body.emailDailyDigest : current.emailDailyDigest,
    whatsappDeliveryReports: typeof body.whatsappDeliveryReports === "boolean" ? body.whatsappDeliveryReports : current.whatsappDeliveryReports,
    escalationAlerts: typeof body.escalationAlerts === "boolean" ? body.escalationAlerts : current.escalationAlerts,
    checkinReminders: typeof body.checkinReminders === "boolean" ? body.checkinReminders : current.checkinReminders,
  };

  await db.hospitalSettings.upsert({
    where: { hospitalId: user.hospitalId },
    create: { hospitalId: user.hospitalId, notificationPreferences: JSON.stringify(merged) },
    update: { notificationPreferences: JSON.stringify(merged) },
  });

  await audit({
    hospitalId: user.hospitalId,
    actorId: user.sub,
    action: "settings.notifications.update",
    detail: JSON.stringify(merged),
    ip: getClientIp(req),
  });

  return Response.json({ ok: true, preferences: merged });
}

export const GET = withErrors(GETImpl);
export const PATCH = withErrors(PATCHImpl);
