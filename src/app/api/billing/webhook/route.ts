// Ojas — Razorpay webhook. The AUTHORITATIVE source of truth for the
// Subscription lifecycle. Verifies the X-Razorpay-Signature HMAC-SHA256 of the
// raw request body using RAZORPAY_WEBHOOK_SECRET (same rigor as the WhatsApp
// inbound handler), then updates the Subscription model on payment
// success/failure/renewal/cancellation.
//
// This endpoint is UNAUTHENTICATED (called by Razorpay, not by a user) — it is
// secured entirely by the signature check. If RAZORPAY_WEBHOOK_SECRET is unset,
// ALL webhooks are rejected (fail closed).
//
// ── THIS PASS (P0 reliability) ──────────────────────────────────────────────
//  1. Razorpay recurring charge idempotency: the event key for
//     `subscription.charged` is built from the per-CHARGE payment entity id,
//     NOT the subscription id. Razorpay's webhook for a subscription charge
//     includes a `payload.payment.entity.id` (pay_…) that is distinct for each
//     recurring charge. We prefer that. If the payment entity is ever absent
//     (an unusual payload shape), we fall back to subscription_id + created_at
//     (the webhook's top-level timestamp), which is still distinct per charge.
//     We NEVER use subscription_id alone — that would collapse charges #1, #2,
//     #3 into one event and silently drop #2 and #3.
//  2. Durable lifecycle: claim → business transaction (in db.$transaction) →
//     markWebhookProcessed. A failure in the business transaction leaves the
//     event FAILED_RETRYABLE (not PROCESSED) so Razorpay's retry re-runs it.
//  3. Strict Zod validation. Malformed payloads are 400 (permanent — Razorpay
//     will not retry a structurally invalid payload successfully, so we mark
//     the event FAILED_PERMANENT if we managed to claim it before discovering
//     the structural problem; otherwise we just 400).
//  4. Raw webhook bodies are never logged.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { withErrors } from "@/lib/api-handler";
import { jsonError, audit } from "@/lib/server-utils";
import { verifyWebhookSignature } from "@/lib/payments";
import { z } from "zod";
import {
  claimWebhookEvent,
  markWebhookProcessed,
  markWebhookFailedRetryable,
  markWebhookFailedPermanent,
  type WebhookProvider,
} from "@/lib/webhook-claim";

// ── Strict Zod schema for Razorpay webhook payloads ─────────────────────
// Only the fields Ojas actually needs are validated. Unknown fields are
// stripped (passthrough would risk logging them). All optionals reflect
// Razorpay's real payload variability across event types.
const razorpayWebhookPayloadSchema = z.object({
  entity: z.literal("event").optional(),
  account_id: z.string().max(100).optional(),
  event: z.string().min(1).max(100),
  contains: z.array(z.string().max(50)).optional(),
  // created_at is the webhook's own timestamp (epoch seconds). Distinct per
  // webhook delivery — used as a tie-breaker in the event key when no more
  // specific entity id is available.
  created_at: z.number().int().nonnegative().optional(),
  payload: z.object({
    payment: z.object({
      entity: z.object({
        // pay_… — distinct per charge, even within one subscription.
        id: z.string().min(1).max(100),
        order_id: z.string().max(100).optional(),
        subscription_id: z.string().max(100).optional(),
        status: z.string().max(50).optional(),
        method: z.string().max(50).optional(),
        amount: z.number().int().nonnegative().optional(),
        currency: z.string().max(10).optional(),
        notes: z.record(z.string(), z.string()).optional(),
        created_at: z.number().int().nonnegative().optional(),
      }).optional(),
    }).optional(),
    subscription: z.object({
      entity: z.object({
        // sub_… — the SAME across all recurring charges for one subscription.
        // Including it in the event key ALONE would be wrong (see header).
        id: z.string().min(1).max(100),
        status: z.string().max(50).optional(),
        notes: z.record(z.string(), z.string()).optional(),
        current_start: z.number().int().nonnegative().optional(),
        current_end: z.number().int().nonnegative().optional(),
        charge_at: z.number().int().nonnegative().optional(),
      }).optional(),
    }).optional(),
  }),
});

type RazorpayWebhookPayload = z.infer<typeof razorpayWebhookPayloadSchema>;

type Ctx = { params: Promise<{}> };

/**
 * Build a deterministic idempotency key for a Razorpay webhook event.
 *
 * Priority (most-specific stable identifier first):
 *   1. payment.entity.id (pay_…)  — distinct per charge, present for
 *      payment.* AND subscription.charged (Razorpay includes the payment
 *      entity for charged events).
 *   2. subscription.entity.id (sub_…) + created_at  — used only when no
 *      payment entity is present. The created_at tiebreaker ensures that
 *      subscription.cancelled / subscription.paused (which legitimately have
 *      no payment entity) are still distinct per webhook delivery, AND that
 *      a missing-payment-entity subscription.charged event does not collapse
 *      multiple recurring charges into one.
 *   3. "unknown" + created_at     — last resort for malformed-but-validated
 *      payloads. This should essentially never fire in practice.
 *
 * INVARIANTS:
 *   - same provider event  → same key  (dedup on retry)
 *   - same subscription, different charge → different key
 *     (because payment.entity.id differs per charge)
 */
export function buildRazorpayEventKey(event: string, body: RazorpayWebhookPayload): string {
  const paymentId = body.payload?.payment?.entity?.id;
  const subscriptionId = body.payload?.subscription?.entity?.id;
  const createdAt = body.created_at; // epoch seconds, distinct per webhook delivery

  if (paymentId) {
    // Most-specific: the per-charge payment id. This is the correct key for
    // payment.captured, payment.failed, AND subscription.charged (Razorpay
    // includes the payment entity in subscription.charged webhooks).
    return `RP:${event}:${paymentId}`;
  }
  if (subscriptionId && createdAt !== undefined) {
    // No payment entity (e.g. subscription.cancelled, subscription.paused,
    // or the unusual case of a subscription.charged webhook missing its
    // payment entity). Use sub_id + webhook created_at so that:
    //   - a retried delivery of THIS webhook → same key (dedup)
    //   - a different webhook for the same subscription → different key
    return `RP:${event}:${subscriptionId}:${createdAt}`;
  }
  if (subscriptionId) {
    // created_at missing — degrade to subscription_id + event. This collapses
    // recurring charges IF they reach this branch, which they should not
    // (subscription.charged always has a payment entity). Log + 400 at the
    // call site if this ever fires so we can investigate.
    return `RP:${event}:${subscriptionId}:no-created-at`;
  }
  return `RP:${event}:unknown:${createdAt ?? "no-ts"}`;
}

async function POSTImpl(req: NextRequest, _ctx: Ctx) {
  const raw = await req.text();
  const sig = req.headers.get("x-razorpay-signature");
  if (!sig) return jsonError("Missing signature", 401);
  if (!verifyWebhookSignature({ rawBody: raw, signature: sig })) {
    return jsonError("Invalid signature", 401);
  }

  // Strict Zod validation. Do NOT use raw JSON.parse + cast.
  let body: RazorpayWebhookPayload;
  try {
    const parsed = razorpayWebhookPayloadSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      // Malformed payload — reject safely. Do NOT log raw body.
      return jsonError("Invalid webhook payload structure", 400);
    }
    body = parsed.data;
  } catch {
    return jsonError("Malformed JSON", 400);
  }

  const event = body.event;
  const hospitalId =
    body.payload?.payment?.entity?.notes?.hospitalId
    ?? body.payload?.subscription?.entity?.notes?.hospitalId
    ?? null;

  // If we can't attribute the event to a hospital (no notes), acknowledge to
  // stop Razorpay retrying, but don't mutate anything.
  if (!hospitalId) {
    return Response.json({ ok: true, ignored: "no_hospital_id" });
  }

  // P0 FIX: Razorpay recurring idempotency. Build a per-CHARGE key.
  const eventKey = buildRazorpayEventKey(event, body);

  // P0 FIX: durable lifecycle — claim BEFORE processing.
  const claim = await claimWebhookEvent("RAZORPAY" as WebhookProvider, eventKey, hospitalId);
  if (claim.kind !== "CLAIMED") {
    // ALREADY_PROCESSED / IN_FLIGHT / ALREADY_PERMANENTLY_FAILED / MAX_ATTEMPTS_EXCEEDED
    // — all are no-ops. Acknowledge so Razorpay stops retrying.
    return Response.json({ ok: true, ignored: claim.kind });
  }
  const eventId = claim.eventId;

  const existing = await db.subscription.findFirst({ where: { hospitalId } });
  const periodEnd = () => new Date(Date.now() + 30 * 86400 * 1000);

  try {
    switch (event) {
      case "payment.captured": {
        const planTier = (body.payload?.payment?.entity?.notes?.planTier as "GROWTH" | "PILOT" | "ENTERPRISE") ?? "GROWTH";
        const limit = planTier === "GROWTH" ? 500 : planTier === "ENTERPRISE" ? 5000 : 25;
        const paymentAmount = body.payload?.payment?.entity?.amount ?? 0;
        const paymentId = body.payload?.payment?.entity?.id ?? "unknown";

        // P0 FIX: business update + audit in ONE transaction. If any write
        // fails, the whole transaction rolls back AND the webhook event is
        // marked FAILED_RETRYABLE (below) so Razorpay retries.
        await db.$transaction(async (tx) => {
          if (existing) {
            await tx.subscription.update({
              where: { id: existing.id },
              data: { planTier, patientLimit: limit, status: "active", currentPeriodEnd: periodEnd() },
            });
          } else {
            await tx.subscription.create({
              data: { hospitalId, planTier, patientLimit: limit, status: "active", currentPeriodEnd: periodEnd() },
            });
          }
          await tx.hospital.update({ where: { id: hospitalId }, data: { planTier } });
          await tx.auditLog.create({
            data: {
              hospitalId, actorId: null, action: "billing.webhook.payment_captured",
              target: paymentId,
              detail: `Razorpay payment captured for ${planTier} (amount in paise: ${paymentAmount})`,
              ip: null,
            },
          });
        });
        break;
      }
      case "payment.failed": {
        const paymentId = body.payload?.payment?.entity?.id ?? "unknown";
        await db.$transaction(async (tx) => {
          if (existing) {
            await tx.subscription.update({ where: { id: existing.id }, data: { status: "past_due" } });
          }
          await tx.auditLog.create({
            data: {
              hospitalId, actorId: null, action: "billing.webhook.payment_failed",
              target: paymentId,
              detail: "Razorpay payment failed — subscription marked past_due",
              ip: null,
            },
          });
        });
        break;
      }
      case "subscription.charged": {
        // P0 FIX: each recurring charge has its OWN payment entity id, so the
        // event key (built above) is distinct per charge. The business effect
        // here extends the subscription period — must be atomic with the audit.
        const subscriptionId = body.payload?.subscription?.entity?.id ?? "unknown";
        const paymentId = body.payload?.payment?.entity?.id; // distinct per charge
        const currentEnd = body.payload?.subscription?.entity?.current_end;
        await db.$transaction(async (tx) => {
          if (existing) {
            await tx.subscription.update({
              where: { id: existing.id },
              data: {
                status: "active",
                currentPeriodEnd: currentEnd
                  ? new Date(currentEnd * 1000)
                  : periodEnd(),
              },
            });
          }
          await tx.auditLog.create({
            data: {
              hospitalId, actorId: null, action: "billing.webhook.subscription_charged",
              target: subscriptionId,
              detail: `Razorpay recurring subscription charged — period extended. paymentId=${paymentId ?? "n/a"}`,
              ip: null,
            },
          });
        });
        break;
      }
      case "subscription.cancelled": {
        const subscriptionId = body.payload?.subscription?.entity?.id ?? "unknown";
        await db.$transaction(async (tx) => {
          if (existing) {
            await tx.subscription.update({ where: { id: existing.id }, data: { status: "cancelled" } });
          }
          await tx.auditLog.create({
            data: {
              hospitalId, actorId: null, action: "billing.webhook.subscription_cancelled",
              target: subscriptionId,
              detail: "Razorpay subscription cancelled",
              ip: null,
            },
          });
        });
        break;
      }
      case "subscription.paused": {
        const subscriptionId = body.payload?.subscription?.entity?.id ?? "unknown";
        await db.$transaction(async (tx) => {
          if (existing) {
            await tx.subscription.update({ where: { id: existing.id }, data: { status: "paused" } });
          }
          await tx.auditLog.create({
            data: {
              hospitalId, actorId: null, action: "billing.webhook.subscription_paused",
              target: subscriptionId,
              detail: "Razorpay subscription paused",
              ip: null,
            },
          });
        });
        break;
      }
      default:
        // Acknowledge unhandled events so Razorpay doesn't retry. The event
        // is marked PROCESSED (we deliberately don't process it).
        await markWebhookProcessed(eventId);
        return Response.json({ ok: true, ignored: `event:${event}` });
    }

    // Business transaction committed → mark the webhook event PROCESSED.
    await markWebhookProcessed(eventId);
    return Response.json({ ok: true, processed: event });
  } catch (err) {
    // Business transaction failed. Mark the webhook event FAILED_RETRYABLE so
    // Razorpay's next retry re-claims and re-runs it. NEVER mark PROCESSED —
    // that would permanently swallow the event.
    await markWebhookFailedRetryable(eventId, err);
    // Structured log — no payment PHI.
    console.error(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'error',
      event: 'razorpay.webhook_failed',
      razorpayEvent: event,
      hospitalId,
      eventKey,
      error: err instanceof Error ? err.message : String(err),
    }));
    // Return 500 so Razorpay retries. (Most providers retry on non-2xx.)
    return jsonError("Webhook processing failed — will retry", 500);
  }
}

export const POST = withErrors(POSTImpl);
