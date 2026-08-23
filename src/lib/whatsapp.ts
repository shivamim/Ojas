// Ojas — WhatsApp Cloud API integration (real, not simulated).
//
// Sends outbound template messages via the Meta WhatsApp Business Cloud API and
// surfaces a clear error when the integration is not configured. Inbound
// delivery/read receipts are handled in /api/whatsapp/inbound (see status update
// handler).
//
// ── Prerequisites (set in .env) ──────────────────────────────────────────────
//   WHATSAPP_ACCESS_TOKEN      — permanent or system-user access token
//   WHATSAPP_PHONE_NUMBER_ID   — the WhatsApp Business phone number ID
//   WHATSAPP_APP_SECRET        — used to verify inbound webhook signatures
//   WHATSAPP_VERIFY_TOKEN      — used for the webhook verification challenge
//
// ── Message template to register in Meta Business Manager ───────────────────
// Register a template named "checkin_reminder" (language en_US, category
// MARKETING or UTILITY per your Meta approval) with this body:
//
//   Hi {{1}}, this is a check-in from {{2}}. Please reply with how you are
//   feeling today — your pain level (0-10), temperature, and any symptoms.
//
// Template parameters:
//   {{1}} = patient first name (e.g. "Ramesh") — first name only, never full
//   {{2}} = hospital display name (e.g. "Ojas Demo Hospital")
//
// WhatsApp requires pre-approved templates for the first outbound message in
// a 24-hour window; replies inside an open 24h customer-service window can use
// free-form text. This implementation uses the template path for reliability.

import { decryptPII, lookupHash } from "@/lib/crypto";
import { db } from "@/lib/db";
import { assertWhatsAppConfigCoherent, isWhatsAppLive } from "@/lib/env";

const WHATSAPP_API_BASE = "https://graph.facebook.com/v20.0";
const TEMPLATE_NAME = "checkin_reminder";
const TEMPLATE_LANGUAGE = "en_US";

export class WhatsAppNotConfiguredError extends Error {
  constructor() {
    super(
      "WhatsApp Cloud API is not configured. Set WHATSAPP_ACCESS_TOKEN and WHATSAPP_PHONE_NUMBER_ID in the environment to send outbound messages."
    );
    this.name = "WhatsAppNotConfiguredError";
  }
}

export class WhatsAppSendError extends Error {
  status: number;
  constructor(message: string, status: number) {
    super(message);
    this.name = "WhatsAppSendError";
    this.status = status;
  }
}

/** Returns true when the WhatsApp Cloud API credentials are configured. */
export function isWhatsAppConfigured(): boolean {
  return isWhatsAppLive;
}

/** V3-H: assert the WhatsApp configuration is coherent BEFORE any send.
 *  Executed at the send runtime path (not just defined). In production, a
 *  half-configured state (missing app-secret, verify-token, phone-number-id, or
 *  access-token) throws — no silent send with a broken config. */
function assertSendConfigCoherent(): void {
  // enabled=true because a send is being attempted → all send-side + webhook
  // secrets must be present.
  assertWhatsAppConfigCoherent({ enabled: true });
  if (!isWhatsAppLive) {
    throw new WhatsAppNotConfiguredError();
  }
}

interface SendResult {
  /** Meta's message ID — persist on the Message row for receipt matching. */
  whatsappMessageId: string;
}

/**
 * Send a check-in reminder template message to a patient's mobile.
 * Throws WhatsAppNotConfiguredError if env vars are missing, or
 * WhatsAppSendError if Meta rejects the send (with the Meta error surfaced).
 */
export async function sendCheckinReminder(args: {
  toMobileE164: string; // e.g. "+919876543210"
  patientFirstName: string;
  hospitalName: string;
}): Promise<SendResult> {
  // V3-H: execute the coherent-config assertion at the send runtime path.
  assertSendConfigCoherent();
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN!;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!;

  const url = `${WHATSAPP_API_BASE}/${phoneNumberId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to: args.toMobileE164.replace(/^\+/, ""), // Meta wants the number without "+"
    type: "template",
    template: {
      name: TEMPLATE_NAME,
      language: { code: TEMPLATE_LANGUAGE },
      components: [
        {
          type: "body",
          parameters: [
            { type: "text", text: args.patientFirstName },
            { type: "text", text: args.hospitalName },
          ],
        },
      ],
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  const data = await res.json().catch(() => ({})) as {
    messages?: Array<{ id: string }>;
    error?: { message?: string; code?: number; type?: string; fbtrace_id?: string };
  };

  if (!res.ok) {
    const detail = data.error?.message
      ? `WhatsApp API error ${data.error.code ?? res.status}: ${data.error.message}`
      : `WhatsApp API returned HTTP ${res.status}`;
    throw new WhatsAppSendError(detail, res.status);
  }

  const waId = data.messages?.[0]?.id;
  if (!waId) {
    throw new WhatsAppSendError("WhatsApp API accepted the request but returned no message id", res.status);
  }
  return { whatsappMessageId: waId };
}

/**
 * Look up an outbound Message row by its stored WhatsApp provider message ID
 * (used by the inbound webhook to route delivery/read receipts).
 */
export async function findMessageByProviderId(providerMessageId: string) {
  return db.message.findFirst({
    where: { providerMessageId },
  });
}

/** Resolve a patient's decrypted mobile (E.164) for outbound sending. */
export async function getPatientMobileE164(patientId: string): Promise<string | null> {
  const p = await db.patient.findUnique({
    where: { id: patientId },
    select: { mobileEncrypted: true, mobileHash: true },
  });
  if (!p?.mobileEncrypted) return null;
  try {
    return decryptPII(p.mobileEncrypted);
  } catch {
    return null;
  }
}

/**
 * Send a free-form text message to a patient/family mobile. Works inside an
 * open 24-hour customer-service window (i.e. after the contact last replied).
 * Used by the family-companion cron for daily recovery updates. If the window
 * is closed, Meta rejects and this throws WhatsAppSendError — the caller marks
 * the update FAILED (no silent simulation).
 */
export async function sendTextMessage(args: {
  toMobileE164: string;
  body: string;
}): Promise<SendResult> {
  // V3-H: execute the coherent-config assertion at the send runtime path.
  assertSendConfigCoherent();
  const accessToken = process.env.WHATSAPP_ACCESS_TOKEN!;
  const phoneNumberId = process.env.WHATSAPP_PHONE_NUMBER_ID!;
  const url = `${WHATSAPP_API_BASE}/${phoneNumberId}/messages`;
  const payload = {
    messaging_product: "whatsapp",
    to: args.toMobileE164.replace(/^\+/, ""),
    type: "text",
    text: { body: args.body.slice(0, 4096) }, // WhatsApp text cap
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const data = await res.json().catch(() => ({})) as {
    messages?: Array<{ id: string }>;
    error?: { message?: string; code?: number };
  };
  if (!res.ok) {
    const detail = data.error?.message
      ? `WhatsApp API error ${data.error.code ?? res.status}: ${data.error.message}`
      : `WhatsApp API returned HTTP ${res.status}`;
    throw new WhatsAppSendError(detail, res.status);
  }
  const waId = data.messages?.[0]?.id;
  if (!waId) {
    throw new WhatsAppSendError("WhatsApp API accepted the request but returned no message id", res.status);
  }
  return { whatsappMessageId: waId };
}

/** Re-export crypto helpers for tests that import from this module. */
export { lookupHash };
