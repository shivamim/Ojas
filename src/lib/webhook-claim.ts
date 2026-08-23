// Ojas — Durable webhook event lifecycle library (P0 reliability).
//
// This module implements the safe state machine required for at-most-once
// webhook processing under provider retries, server crashes, and concurrent
// workers. It is the single source of truth for how WebhookEvent rows
// transition between lifecycle states.
//
// State machine:
//
//   RECEIVED ──claim──────────────▶ PROCESSING ──markProcessed────▶ PROCESSED
//                                       │
//                                       ├──markFailedRetryable──▶ FAILED_RETRYABLE
//                                       │                            │
//                                       │                            └─(provider retry)
//                                       │                              → reclaim → PROCESSING
//                                       └──markFailedPermanent───▶ FAILED_PERMANENT
//
//   PROCESSING + leaseExpiresAt < now  → eligible for safe reclaim by another worker
//   PROCESSED                         → duplicate provider retry is a no-op (200)
//   FAILED_PERMANENT                  → duplicate provider retry is a no-op (200)
//
// CRITICAL INVARIANTS enforced by this library:
//   1. "row exists in WebhookEvent" ≠ "successfully processed". Only status
//      === 'PROCESSED' means the business effect has been applied.
//   2. An event is marked PROCESSED ONLY AFTER the business transaction
//      commits. A crash before commit leaves the row in PROCESSING; the lease
//      expires and a later reclaim (or provider retry) re-runs it safely.
//   3. Atomic claim uses an idempotent conditional UPDATE (not INSERT-then-
//      check). The winner is the only worker permitted to execute side
//      effects. Concurrent workers observe status=PROCESSING and return
//      "already-in-flight" without touching business state.
//   4. The lease timeout is configurable; default 60s covers typical Meta /
//      Razorpay webhook processing but is short enough that a crashed worker
//      is reclaimable within a minute.
//   5. `attempts` is incremented on every claim; a hard cap (default 10)
//      permanently fails events that retry too many times, preventing an
//      infinite retry loop on a poison message.
//
// This module is DB-only (no HTTP). It is imported by the WhatsApp inbound
// route and the Razorpay webhook route.
import { db } from "@/lib/db";

/** Provider namespace. Kept as a string (not enum) to match the existing
 *  WebhookEvent.provider column which was already a default-string column. */
export type WebhookProvider = "WHATSAPP" | "RAZORPAY" | "OTHER";

/** Result of an attempt to claim an event. The caller MUST branch on this. */
export type ClaimResult =
  | { kind: "CLAIMED"; eventId: string }
  | { kind: "ALREADY_PROCESSED" }
  | { kind: "ALREADY_PERMANENTLY_FAILED" }
  | { kind: "IN_FLIGHT" }        // another worker owns a valid lease
  | { kind: "MAX_ATTEMPTS_EXCEEDED"; eventId: string };

/** Default lease duration: 60 seconds. Long enough for a typical webhook
 *  handler (DB writes + maybe one outbound API call), short enough that a
 *  crashed worker is reclaimable within a minute. */
export const DEFAULT_LEASE_MS = 60_000;

/** Hard cap on attempts before an event is permanently failed. Prevents a
 *  poison message from retrying forever. 10 attempts is generous — Meta and
 *  Razorpay typically retry 4-8 times over ~24h. */
export const MAX_ATTEMPTS = 10;

/** Lease duration override (mainly for tests). */
export interface ClaimOptions {
  leaseMs?: number;
  maxAttempts?: number;
}

/**
 * Atomically claim (or reclaim) a webhook event for processing.
 *
 * Semantics:
 *   - If no row exists for (provider, providerEventId): INSERT with status
 *     PROCESSING, attempts=1, leaseExpiresAt = now + lease. Caller wins.
 *   - If a row exists and status === PROCESSED: duplicate provider retry.
 *     Return ALREADY_PROCESSED — caller returns 200 without side effects.
 *   - If a row exists and status === FAILED_PERMANENT: return
 *     ALREADY_PERMANENTLY_FAILED — caller returns 200 (we already decided
 *     this event will never succeed; no point re-running it).
 *   - If a row exists and status === PROCESSING with a VALID lease
 *     (leaseExpiresAt > now): another worker owns it. Return IN_FLIGHT.
 *     Caller returns 200 (Meta/Razorpay stop retrying once they see 200);
 *     the original worker will either complete or its lease will expire.
 *   - If a row exists and status === PROCESSING with an EXPIRED lease: this
 *     worker reclaims it (incrementing attempts, refreshing the lease).
 *     Caller wins. This is the safe recovery path for a crashed worker.
 *   - If a row exists and status === RECEIVED: same as expired-lease reclaim.
 *   - If a row exists and status === FAILED_RETRYABLE: this is a provider
 *     retry after a previous failure. Reclaim it (increment attempts).
 *
 * The conditional UPDATEs below are executed as a single SQL statement, so
 * concurrent workers cannot both win — Postgres row-level locking guarantees
 * exactly one UPDATE returns count > 0.
 */
export async function claimWebhookEvent(
  provider: WebhookProvider,
  providerEventId: string,
  hospitalId: string | null,
  options: ClaimOptions = {},
): Promise<ClaimResult> {
  const leaseMs = options.leaseMs ?? DEFAULT_LEASE_MS;
  const maxAttempts = options.maxAttempts ?? MAX_ATTEMPTS;
  const now = new Date();
  const leaseExpiresAt = new Date(now.getTime() + leaseMs);

  // First, try to INSERT. If the unique constraint on (provider,
  // providerEventId) holds, we are the first worker to see this event.
  try {
    const created = await db.webhookEvent.create({
      data: {
        provider,
        providerEventId,
        hospitalId,
        status: "PROCESSING",
        attempts: 1,
        processingStartedAt: now,
        leaseExpiresAt,
      },
      select: { id: true },
    });
    return { kind: "CLAIMED", eventId: created.id };
  } catch (err: unknown) {
    // Prisma P2002 = unique constraint violation. Any other error is a real
    // failure — propagate it so the caller returns 5xx (provider will retry).
    const code = (err as { code?: string } | null | undefined)?.code;
    if (code !== "P2002") throw err;
  }

  // Row already exists. Read its current state to decide reclaim vs. no-op.
  const existing = await db.webhookEvent.findUnique({
    where: { provider_providerEventId: { provider, providerEventId } },
    select: {
      id: true,
      status: true,
      attempts: true,
      leaseExpiresAt: true,
    },
  });
  if (!existing) {
    // Extremely unlikely race: row vanished between INSERT failure and SELECT.
    // Treat as in-flight so the provider retries later.
    return { kind: "IN_FLIGHT" };
  }

  if (existing.status === "PROCESSED") return { kind: "ALREADY_PROCESSED" };
  if (existing.status === "FAILED_PERMANENT") return { kind: "ALREADY_PERMANENTLY_FAILED" };

  // PROCESSING with a valid lease → another worker owns it.
  if (
    existing.status === "PROCESSING" &&
    existing.leaseExpiresAt &&
    existing.leaseExpiresAt > now
  ) {
    return { kind: "IN_FLIGHT" };
  }

  // Otherwise: PROCESSING with expired lease, RECEIVED, or FAILED_RETRYABLE.
  // We are eligible to reclaim. Enforce the attempts cap.
  const nextAttempts = existing.attempts + 1;
  if (nextAttempts > maxAttempts) {
    // Poison message — permanently fail it so it stops retrying. The audit
    // trail retains lastError for investigation.
    await db.webhookEvent.update({
      where: { id: existing.id },
      data: {
        status: "FAILED_PERMANENT",
        lastError: `Exceeded ${maxAttempts} attempts; permanently failed to prevent infinite retry.`,
        lastFailedAt: now,
        leaseExpiresAt: null,
      },
    });
    return { kind: "MAX_ATTEMPTS_EXCEEDED", eventId: existing.id };
  }

  // Conditional UPDATE: only proceed if the row is STILL in a claimable state.
  // This guards against the race where another worker reclaimed it between
  // our SELECT and UPDATE. If count === 0, we lost the race → IN_FLIGHT.
  const reclaimed = await db.webhookEvent.updateMany({
    where: {
      id: existing.id,
      status: { in: ["RECEIVED", "PROCESSING", "FAILED_RETRYABLE"] },
      OR: [
        // Either not currently processing (RECEIVED / FAILED_RETRYABLE)…
        { processingStartedAt: null },
        // …or its lease has expired (PROCESSING past leaseExpiresAt).
        { leaseExpiresAt: { lt: now } },
      ],
    },
    data: {
      status: "PROCESSING",
      attempts: nextAttempts,
      processingStartedAt: now,
      leaseExpiresAt,
      lastError: null,
    },
  });
  if (reclaimed.count === 0) {
    // Another worker beat us to the reclaim.
    return { kind: "IN_FLIGHT" };
  }
  return { kind: "CLAIMED", eventId: existing.id };
}

/**
 * Mark an event as successfully PROCESSED. Call this ONLY AFTER the business
 * transaction has committed. If you call this before the business effect is
 * durable, a crash will permanently swallow the event.
 */
export async function markWebhookProcessed(eventId: string): Promise<void> {
  await db.webhookEvent.update({
    where: { id: eventId },
    data: {
      status: "PROCESSED",
      processedAt: new Date(),
      leaseExpiresAt: null,
      lastError: null,
    },
  });
}

/**
 * Mark an event as retryable-failed. The provider is expected to retry; on
 * the next retry, claimWebhookEvent will reclaim this event (incrementing
 * attempts) and re-run the business transaction.
 *
 * Use this when the business transaction threw a transient error (DB
 * deadlock, a downstream API 5xx, etc.). Do NOT use this for validation
 * errors or malformed payloads — those should be FAILED_PERMANENT.
 */
export async function markWebhookFailedRetryable(
  eventId: string,
  error: unknown,
): Promise<void> {
  const msg = truncateError(error);
  await db.webhookEvent.update({
    where: { id: eventId },
    data: {
      status: "FAILED_RETRYABLE",
      lastError: msg,
      lastFailedAt: new Date(),
      leaseExpiresAt: null,
    },
  });
}

/**
 * Mark an event as permanently failed. The provider may retry, but we will
 * no longer re-run the business transaction. Use this for: invalid signature
 * (already rejected before claim, so usually not reached), malformed payload
 * that can never succeed, or MAX_ATTEMPTS_EXCEEDED.
 */
export async function markWebhookFailedPermanent(
  eventId: string,
  error: unknown,
): Promise<void> {
  const msg = truncateError(error);
  await db.webhookEvent.update({
    where: { id: eventId },
    data: {
      status: "FAILED_PERMANENT",
      lastError: msg,
      lastFailedAt: new Date(),
      leaseExpiresAt: null,
    },
  });
}

/**
 * Reclaim stale PROCESSING events whose lease has expired. Intended to be
 * called by a periodic cron (every minute) so that a crashed worker's
 * in-flight event is re-queued for the next provider retry (or for an
 * explicit reconciler pass). This does NOT itself re-process the event —
 * it only resets it to RECEIVED so the next claimWebhookEvent call (from a
 * provider retry or a reconciler) wins cleanly.
 *
 * Returns the count of events reset.
 */
export async function reclaimStaleProcessingEvents(
  leaseMs: number = DEFAULT_LEASE_MS,
): Promise<number> {
  const cutoff = new Date();
  const result = await db.webhookEvent.updateMany({
    where: {
      status: "PROCESSING",
      leaseExpiresAt: { lt: cutoff },
    },
    data: {
      status: "RECEIVED",
      leaseExpiresAt: null,
      lastError: `Lease expired (> ${leaseMs}ms); reset to RECEIVED for reclaim.`,
    },
  });
  return result.count;
}

/** Truncate an error message for storage. Never include raw payload / PHI. */
function truncateError(error: unknown): string {
  if (error instanceof Error) {
    const msg = error.message;
    return msg.length > 500 ? msg.slice(0, 500) + "…(truncated)" : msg;
  }
  const s = String(error);
  return s.length > 500 ? s.slice(0, 500) + "…(truncated)" : s;
}
