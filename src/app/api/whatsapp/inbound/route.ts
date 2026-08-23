// Ojas — WhatsApp Business API inbound webhook. HARDENED (P0, pass 2).
//   GET  — verification challenge (Meta webhook setup)
//   POST — inbound messages from family members (routed to the Conversational
//          Agent) AND delivery/read receipts (status callbacks) that drive the
//          Message lifecycle QUEUED -> SENT -> DELIVERED -> READ / FAILED.
//
// ── THIS PASS (P0 reliability) ──────────────────────────────────────────────
// This handler now uses the durable WebhookEvent lifecycle in src/lib/webhook-claim.ts:
//
//   1. Verify HMAC signature (constant-time, fail closed).
//   2. Validate payload with Zod.
//   3. For each event (inbound message OR each status callback):
//        a. Compute a DETERMINISTIC providerEventKey. For status events this
//           is a SHA-256 hash of (messageId, status, recipientId, errors,
//           provider-supplied timestamp) — NEVER a Date.now() fallback, so a
//           re-delivered identical webhook produces the SAME key and is
//           de-duplicated; different statuses produce DIFFERENT keys.
//        b. Atomically claim the event (claimWebhookEvent). If ALREADY_PROCESSED
//           or IN_FLIGHT → return 200, no side effects. If CLAIMED → proceed.
//        c. Run the business transaction (insert message / update status).
//        d. On success → markWebhookProcessed. On transient failure →
//           markWebhookFailedRetryable (provider retry will reclaim).
//
// ── Tenant attribution (P1) ─────────────────────────────────────────────────
// For status callbacks, hospitalId is derived from the stored OUTBOUND Message
// row (matched on providerMessageId) — NOT from a nullable incoming field. This
// guarantees the audit log + any downstream business effect are attributed to
// the correct hospital.
//
// ── Status ordering (P0) ────────────────────────────────────────────────────
// A status callback never regresses a Message's state. READ cannot later become
// DELIVERED or SENT. Order: QUEUED(0) → SENT(1) → DELIVERED(2) → READ(3).
// FAILED is always applied (provider semantics: a later failure is meaningful
// even after delivery, e.g. media download failed).
import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { jsonError } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import { findPatientByFamilyContact } from "@/lib/family-companion";
import { createHmac, timingSafeEqual, createHash } from "crypto";
import { runConversationalAgent } from "@/lib/ai-agents";
import { z } from "zod";
import { whatsappWebhookSchema, validate, ValidationError } from "@/lib/validation";
import {
  WHATSAPP_APP_SECRET,
  WHATSAPP_VERIFY_TOKEN,
  WHATSAPP_PHONE_NUMBER_ID,
  isWhatsAppLive,
  isProduction,
} from "@/lib/env";
import {
  claimWebhookEvent,
  markWebhookProcessed,
  markWebhookFailedRetryable,
  markWebhookFailedPermanent,
  type WebhookProvider,
} from "@/lib/webhook-claim";

type Ctx = { params: Promise<{}> };

/** Verify Meta-style X-Hub-Signature-256 header (constant-time). */
function verifySignature(payload: string, signatureHeader: string | null): boolean {
  if (!signatureHeader) return false;
  const expected = signatureHeader.startsWith("sha256=")
    ? signatureHeader.slice(7)
    : signatureHeader;
  const computed = createHmac("sha256", WHATSAPP_APP_SECRET).update(payload).digest("hex");
  if (expected.length !== computed.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(computed));
  } catch {
    return false;
  }
}

// ── Status idempotency: DETERMINISTIC key (no Date.now fallback) ───────────────
// A re-delivered IDENTICAL status webhook MUST produce the same key. We hash
// the stable provider fields. Different statuses (sent/delivered/read/failed)
// for the same message produce DIFFERENT keys (so each transition is processed
// once). The provider-supplied `timestamp` (epoch seconds, present on every
// real Meta status event) is included; if it is ever absent, we hash the
// remaining stable fields rather than inventing a timestamp.
/**
 * Build a deterministic, status-aware idempotency key for WhatsApp status events.
 * Format: `WA:STATUS:{messageId}:{status}:{deterministicHash}`
 * where deterministicHash is a SHA-256 of the stable status fields (timestamp,
 * recipient_id, errors). The same webhook payload always produces the same key;
 * different statuses produce different keys.
 */
export function buildStatusEventKey(
  messageId: string,
  status: string,
  timestamp: string | undefined,
  recipientId: string | undefined,
  errors: Array<{ code?: number; title?: string; message?: string }> | undefined,
): string {
  const stable = JSON.stringify({
    // Include timestamp ONLY if the provider supplied it. Never fall back to
    // Date.now() — a re-delivered webhook with no timestamp must still hash
    // to the SAME key, which requires the hash input to be identical.
    ts: timestamp ?? null,
    rid: recipientId ?? null,
    // Errors array is part of the identity for failed events — different
    // failure reasons are distinct events.
    errs: (errors ?? []).map((e) => ({ c: e.code ?? null, t: e.title ?? null })),
  });
  const hash = createHash("sha256").update(stable).digest("hex").slice(0, 16);
  return `WA:STATUS:${messageId}:${status}:${hash}`;
}

// Map Meta's delivery status strings to the MessageStatus enum.
function mapMetaStatus(meta: string): "SENT" | "DELIVERED" | "READ" | "FAILED" | null {
  switch (meta) {
    case "sent": return "SENT";
    case "delivered": return "DELIVERED";
    case "read": return "READ";
    case "failed": return "FAILED";
    default: return null;
  }
}

/** Allowed forward status ordering. FAILED is applied unconditionally per
 *  provider semantics (a later failure after delivery is meaningful). */
const STATUS_ORDER = {
  QUEUED: 0,
  SENT: 1,
  DELIVERED: 2,
  READ: 3,
} as const;

/** Process delivery/read receipt callbacks — update the matching Message row.
 *  Idempotent: only advances forward in the lifecycle. Tenant attribution
 *  comes from the stored outbound Message (not a nullable incoming field). */
async function handleStatuses(
  statuses: Array<{
    id: string;
    status: string;
    timestamp?: string;
    recipient_id?: string;
    errors?: Array<{ code?: number; title?: string; message?: string }>;
  }>,
): Promise<void> {
  for (const s of statuses) {
    const mapped = mapMetaStatus(s.status);
    if (!mapped) continue;

    // 1. Derive tenant attribution from the STORED outbound record — the
    //    source of truth. P0 (#11/#12): the FamilyUpdate is now the
    //    authoritative owner of providerMessageId (durable outbox). We look
    //    it up FIRST; if not found, fall back to the Message table (legacy
    //    outbound messages not tied to a FamilyUpdate). We never trust a
    //    nullable incoming field for tenant attribution.
    const familyUpdate = await db.familyUpdate.findUnique({
      where: { providerMessageId: s.id },
      select: { id: true, hospitalId: true, patientId: true, status: true },
    }).catch(() => null);
    const msg = !familyUpdate ? await db.message.findFirst({
      where: { providerMessageId: s.id, direction: "OUTBOUND" },
      select: { id: true, hospitalId: true, patientId: true, status: true, body: true },
    }).catch(() => null) : null;
    // Even if no stored record is found, we still claim the event so a
    // duplicate retry doesn't keep re-running. hospitalId stays null only
    // in the genuinely-unknown case (e.g. message for a different provider
    // account, which the phone-number-id check already filtered out).
    const hospitalId = familyUpdate?.hospitalId ?? msg?.hospitalId ?? null;

    // 2. DETERMINISTIC idempotency key. Same payload → same key → dedup.
    //    Different status → different key → processed once each.
    const statusEventKey = buildStatusEventKey(
      s.id, s.status, s.timestamp, s.recipient_id, s.errors,
    );
    const claim = await claimWebhookEvent(
      "WHATSAPP" as WebhookProvider,
      statusEventKey,
      hospitalId,
    );
    if (claim.kind !== "CLAIMED") {
      // ALREADY_PROCESSED / IN_FLIGHT / ALREADY_PERMANENTLY_FAILED /
      // MAX_ATTEMPTS_EXCEEDED — all are no-ops for the caller (200).
      continue;
    }
    const eventId = claim.eventId;

    // 3. No stored record → nothing to update. Mark processed so a duplicate
    //    retry is deduped.
    if (!familyUpdate && !msg) {
      await markWebhookProcessed(eventId);
      continue;
    }

    try {
      // 4. Status ordering — never regress the state. Check BOTH the
      //    FamilyUpdate and the Message row (whichever exists).
      const currentStatus = familyUpdate?.status ?? msg!.status;
      const current = STATUS_ORDER[currentStatus as keyof typeof STATUS_ORDER] ?? 0;
      const incoming = STATUS_ORDER[mapped as keyof typeof STATUS_ORDER] ?? 0;
      if (mapped === "FAILED" || incoming > current) {
        const detail =
          mapped === "FAILED" && s.errors?.[0]
            ? `WhatsApp delivery failed (${s.errors[0].code ?? "?"}): ${s.errors[0].title ?? ""} - ${s.errors[0].message ?? ""}`
            : null;
        // Update the FamilyUpdate (authoritative outbox) if matched.
        if (familyUpdate) {
          const updateData: { status: "SENT" | "DELIVERED" | "READ" | "FAILED"; deliveredAt?: Date; readAt?: Date; failureReason?: string } = { status: mapped };
          if (mapped === "DELIVERED") updateData.deliveredAt = new Date();
          if (mapped === "READ") { updateData.deliveredAt = new Date(); updateData.readAt = new Date(); }
          if (mapped === "FAILED" && detail) updateData.failureReason = detail;
          await db.familyUpdate.update({
            where: { id: familyUpdate.id },
            data: updateData,
          });
        }
        // Also update the Message row if it exists (legacy/audit row).
        if (msg) {
          await db.message.update({
            where: { id: msg.id },
            data: { status: mapped, body: mapped === "FAILED" && detail ? detail : msg.body },
          });
        }
        // Audit the status transition (P1 audit coverage).
        await db.auditLog.create({
          data: {
            hospitalId,
            actorId: null,
            action: `whatsapp.status.${mapped.toLowerCase()}`,
            target: familyUpdate?.id ?? msg?.id ?? s.id,
            detail: `providerMessageId=${s.id}`,
            ip: null,
          },
        }).catch(() => { /* audit is best-effort; don't fail the webhook on audit error */ });
      }
      // 5. Business effect durable → mark the webhook event PROCESSED.
      await markWebhookProcessed(eventId);
    } catch (err) {
      // Transient failure (DB error, deadlock). Mark retryable so the next
      // provider retry reclaims and re-runs. NEVER mark PROCESSED here.
      await markWebhookFailedRetryable(eventId, err);
    }
  }
}

// GET — Meta webhook verification challenge.
async function GETImpl(req: NextRequest, _ctx: Ctx) {
  const { searchParams } = new URL(req.url);
  const mode = searchParams.get("hub.mode");
  const token = searchParams.get("hub.verify_token");
  const challenge = searchParams.get("hub.challenge");
  if (mode === "subscribe" && token === WHATSAPP_VERIFY_TOKEN && challenge) {
    return new NextResponse(challenge, { status: 200, headers: { "content-type": "text/plain" } });
  }
  return jsonError("Verification failed", 403);
}

// POST — Inbound message from a family member's WhatsApp, OR a delivery/read receipt.
async function POSTImpl(req: NextRequest, _ctx: Ctx) {
  const raw = await req.text();

  // 1. Verify HMAC signature (fail closed — no valid signature = 401).
  if (!verifySignature(raw, req.headers.get("x-hub-signature-256"))) {
    return jsonError("Invalid signature", 401);
  }

  // 2. Parse + validate payload with Zod.
  let body: z.infer<typeof whatsappWebhookSchema>;
  try {
    body = validate(whatsappWebhookSchema, JSON.parse(raw));
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(`Invalid payload: ${e.issues}`, 400);
    return jsonError("Malformed JSON", 400);
  }

  const value = body.entry?.[0]?.changes?.[0]?.value;
  if (!value) return Response.json({ ok: true, ignored: "no_value" });

  // 3. Phone-number-ID validation (prevents wrong-number / cross-tenant injection).
  const inboundPhoneId = value.metadata?.phone_number_id;
  if (isProduction && WHATSAPP_PHONE_NUMBER_ID && inboundPhoneId && inboundPhoneId !== WHATSAPP_PHONE_NUMBER_ID) {
    return jsonError("Unexpected phone_number_id", 403);
  }

  // ── Delivery / read receipts ─────────────────────────────────────────────
  if (value.statuses && value.statuses.length > 0) {
    await handleStatuses(value.statuses);
    return Response.json({ ok: true, processed: "statuses", count: value.statuses.length });
  }

  // ── Inbound messages ─────────────────────────────────────────────────────
  const message = value.messages?.[0];
  if (!message) return Response.json({ ok: true, ignored: "no_message" });

  const rawHash = createHash("sha256").update(raw).digest("hex").slice(0, 16);

  // 4. Durable lifecycle: claim the event BEFORE processing. A duplicate
  //    webhook retry (Meta sends these) is deduped here.
  const claim = await claimWebhookEvent("WHATSAPP" as WebhookProvider, message.id, null);
  if (claim.kind !== "CLAIMED") {
    return Response.json({ ok: true, ignored: "duplicate_event", providerEventId: message.id });
  }
  const eventId = claim.eventId;

  const fromMobile = "+" + message.from; // Meta sends without leading +
  const text = message.text?.body || "";
  if (!text) {
    await markWebhookProcessed(eventId);
    return Response.json({ ok: true, ignored: "non_text" });
  }

  // Look up patient by family contact. Tenant context is derived from the
  // patient record — a family contact can only ever map to ONE patient.
  let patient;
  try {
    patient = await findPatientByFamilyContact(fromMobile);
  } catch (err) {
    // Transient DB error — retryable. Provider will retry.
    await markWebhookFailedRetryable(eventId, err);
    return Response.json({ ok: true, deferred: "patient_lookup_failed" });
  }
  if (!patient) {
    // Not a known family contact — silently ignore (don't leak patient existence).
    // Mark PROCESSED so a duplicate retry is deduped.
    await markWebhookProcessed(eventId);
    return Response.json({ ok: true, ignored: "unknown_contact" });
  }

  // Persist the inbound message with the provider message id (UNIQUE column).
  // Even if a race beat the idempotency claim above, the DB unique constraint
  // rejects the duplicate insert.
  try {
    await db.message.create({
      data: {
        hospitalId: patient.hospitalId,
        patientId: patient.id,
        channel: "WHATSAPP",
        direction: "INBOUND",
        toAddress: "system",
        body: text,
        status: "READ",
        providerMessageId: message.id,
      },
    });
  } catch (err: unknown) {
    // Unique violation on providerMessageId → already stored by a concurrent
    // request. Treat as a successful no-op (idempotent). The code is P2002.
    const code = (err as { code?: string } | null | undefined)?.code;
    if (code === "P2002") {
      await markWebhookProcessed(eventId);
      return Response.json({ ok: true, ignored: "duplicate_message" });
    }
    // Other DB errors → retryable.
    await markWebhookFailedRetryable(eventId, err);
    return Response.json({ ok: true, deferred: "message_persist_failed" });
  }

  // Run the Conversational Agent on the reply. AI is NEVER the final clinical
  // authority — it flags concerns for human (coordinator) review/escalation.
  const recoveryDay = Math.max(
    1,
    Math.floor((Date.now() - patient.dischargeDate.getTime()) / (24 * 60 * 60 * 1000)) + 1,
  );
  try {
    const { output, runId } = await runConversationalAgent(
      {
        patientName: patient.fullName, // de-identified inside the agent
        surgeryType: patient.surgeryType,
        recoveryDay,
        patientReply: text,
        questionAsked: "Daily family update - please share any concerns",
      },
      { hospitalId: patient.hospitalId },
    );

    const concernKeywords = ["pain", "fever", "dawai", "dava", "problem", "worse", "halat"];
    const isConcern = concernKeywords.some((k) => text.toLowerCase().includes(k));
    if (isConcern || output.needsClarification) {
      await db.timelineEvent.create({
        data: {
          hospitalId: patient.hospitalId,
          patientId: patient.id,
          eventType: "FAMILY_MEMBER_REPORTED_CONCERN",
          title: "Family member reported a concern",
          detail: `Inbound WhatsApp: "${text.slice(0, 280)}" - Agent summary: ${output.summary}`,
          actorId: null,
          occurredAt: new Date(parseInt(message.timestamp) * 1000),
        },
      });
      await db.escalation.create({
        data: {
          hospitalId: patient.hospitalId,
          patientId: patient.id,
          severity: "MEDIUM",
          status: "OPEN",
          type: "CLINICAL",
          reason: `Family member reported concern via WhatsApp: "${text.slice(0, 200)}"`,
          aiProposed: true,
          aiConfidence: 0.6,
          aiRationale: `Conversational agent flagged needsClarification=${output.needsClarification}; summary: ${output.summary}`,
        },
      });
    }

    await db.auditLog.create({
      data: {
        hospitalId: patient.hospitalId,
        actorId: null,
        action: "FAMILY_WHATSAPP_REPLY_RECEIVED",
        target: patient.id,
        detail: `runId=${runId} concern=${isConcern}`,
        ip: null,
      },
    });

    // Business transaction committed successfully → mark the webhook event PROCESSED.
    await markWebhookProcessed(eventId);
  } catch (err) {
    // The inbound message itself was persisted (above), so the patient's
    // reply is not lost. The agent/escalation/timeline/audit failure is
    // retryable: mark the webhook FAILED_RETRYABLE so Meta's next retry
    // re-claims it. The unique constraint on providerMessageId means the
    // message.create() above will be a no-op on retry (P2002 → mark PROCESSED).
    await markWebhookFailedRetryable(eventId, err);
    // Structured log — do NOT include raw patient text.
    console.error(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      event: 'whatsapp.agent_error',
      patientId: patient.id,
      hospitalId: patient.hospitalId,
      error: err instanceof Error ? err.message : String(err),
    }));
  }

  return Response.json({ ok: true, whatsappLive: isWhatsAppLive });
}

export const GET = withErrors(GETImpl);
export const POST = withErrors(POSTImpl);
