// Ojas — Check-in dispatch via the real WhatsApp Business Cloud API.
//
// Flow: create an OUTBOUND Message row (status QUEUED) → call Meta's Cloud API
// to send the "checkin_reminder" template → on success store the WhatsApp
// message ID and set Message.status=SENT + checkin.status=SENT → on failure set
// Message.status=FAILED, surface the error in the API response + TimelineEvent,
// and NEVER mark anything SENT that Meta did not accept.
//
// If WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID are unset, the route
// responds 503 with a clear message (no silent no-op, no crash).
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole, requireTenantAccess } from "@/lib/auth";
import { withErrors } from "@/lib/api-handler";
import { jsonError, audit, getClientIp } from "@/lib/server-utils";
import {
  sendCheckinReminder,
  getPatientMobileE164,
  WhatsAppNotConfiguredError,
  WhatsAppSendError,
  isWhatsAppConfigured,
} from "@/lib/whatsapp";

type Ctx = { params: Promise<{ id: string }> };

async function POSTImpl(req: NextRequest, ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR", "DOCTOR"]);
  const { id } = await ctx.params;
  const checkin = await db.checkin.findUnique({
    where: { id },
    include: { patient: true, hospital: true },
  });
  if (!checkin) return jsonError("Check-in not found", 404);
  await requireTenantAccess(user, checkin.hospitalId, { resourceType: "checkin", resourceId: id, ip: getClientIp(req) });
  if (checkin.status !== "SCHEDULED") return jsonError(`Check-in is already ${checkin.status}`, 400);

  // Create the outbound message row as QUEUED (the real Message lifecycle is
  // QUEUED → SENT → DELIVERED → READ / FAILED).
  const message = await db.message.create({
    data: {
      hospitalId: checkin.hospitalId,
      patientId: checkin.patientId,
      channel: "WHATSAPP",
      direction: "OUTBOUND",
      toAddress: "patient",
      body: `Check-in reminder (template: checkin_reminder) for ${checkin.patient.fullName} from ${checkin.hospital.name}.`,
      status: "QUEUED",
      checkinId: checkin.id,
    },
  });

  // If WhatsApp is not configured, fail the message clearly and stop.
  if (!isWhatsAppConfigured()) {
    await db.message.update({
      where: { id: message.id },
      data: { status: "FAILED" },
    });
    await db.timelineEvent.create({
      data: {
        hospitalId: checkin.hospitalId,
        patientId: checkin.patientId,
        eventType: "CHECKIN_DISPATCH_FAILED",
        title: "Check-in dispatch failed — WhatsApp not configured",
        detail: "Outbound WhatsApp send skipped: WHATSAPP_ACCESS_TOKEN / WHATSAPP_PHONE_NUMBER_ID are not set in the environment. Set them in .env to enable real dispatch.",
        actorId: user.sub,
        occurredAt: new Date(),
      },
    });
    return jsonError(
      "WhatsApp Cloud API is not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID in the environment to dispatch check-ins. The dispatch attempt was recorded as FAILED.",
      503,
      { messageId: message.id }
    );
  }

  // Resolve the patient's decrypted mobile (E.164) for the API call.
  const toMobile = await getPatientMobileE164(checkin.patientId);
  if (!toMobile) {
    await db.message.update({ where: { id: message.id }, data: { status: "FAILED" } });
    return jsonError("Patient has no decryptable mobile number on file. Cannot dispatch WhatsApp check-in.", 400, { messageId: message.id });
  }

  const patientFirstName = checkin.patient.fullName.trim().split(/\s+/)[0] || "Patient";

  // Call the real WhatsApp Cloud API.
  try {
    const { whatsappMessageId } = await sendCheckinReminder({
      toMobileE164: toMobile,
      patientFirstName,
      hospitalName: checkin.hospital.name,
    });

    // Meta accepted the send — mark SENT with the provider message ID so
    // inbound delivery/read receipts can match this row.
    const updatedMessage = await db.message.update({
      where: { id: message.id },
      data: { status: "SENT", providerMessageId: whatsappMessageId },
    });
    const updatedCheckin = await db.checkin.update({
      where: { id: checkin.id },
      data: { status: "SENT", sentAt: new Date() },
    });

    await db.timelineEvent.create({
      data: {
        hospitalId: checkin.hospitalId,
        patientId: checkin.patientId,
        eventType: "CHECKIN_DISPATCHED",
        title: "Check-in dispatched",
        detail: `WhatsApp check-in sent (provider message id: ${whatsappMessageId}). Delivery/read receipts will update the message status automatically.`,
        actorId: user.sub,
        occurredAt: new Date(),
      },
    });

    await audit({
      hospitalId: checkin.hospitalId,
      actorId: user.sub,
      action: "checkin.dispatch",
      target: checkin.id,
      detail: `Dispatched check-in to ${checkin.patient.fullName} via WhatsApp Cloud API (waMsgId=${whatsappMessageId})`,
      ip: getClientIp(req),
    });

    return Response.json({
      checkin: updatedCheckin,
      message: updatedMessage,
      whatsappMessageId,
      status: "SENT",
    });
  } catch (err) {
    // Meta rejected the send (or a network error). Mark FAILED, do NOT mark
    // the check-in SENT, and surface the real error.
    const errMsg = err instanceof WhatsAppSendError
      ? err.message
      : err instanceof WhatsAppNotConfiguredError
        ? err.message
        : err instanceof Error ? err.message : "Unknown WhatsApp send error";
    const httpStatus = err instanceof WhatsAppSendError ? err.status : 502;

    await db.message.update({ where: { id: message.id }, data: { status: "FAILED" } });
    await db.timelineEvent.create({
      data: {
        hospitalId: checkin.hospitalId,
        patientId: checkin.patientId,
        eventType: "CHECKIN_DISPATCH_FAILED",
        title: "Check-in dispatch failed — WhatsApp API error",
        detail: `Outbound WhatsApp send failed: ${errMsg}. The check-in remains SCHEDULED and can be retried. (messageId=${message.id})`,
        actorId: user.sub,
        occurredAt: new Date(),
      },
    });

    return jsonError(`WhatsApp dispatch failed: ${errMsg}`, httpStatus, { messageId: message.id });
  }
}

export const POST = withErrors(POSTImpl);
