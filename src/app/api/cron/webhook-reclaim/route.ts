// Ojas — Cron endpoint: reclaim stale PROCESSING webhook events.
//
// A crashed worker can leave a WebhookEvent row in PROCESSING with an expired
// lease. This cron (run every minute) resets such rows to RECEIVED so the next
// provider retry (or an explicit reconciler pass) can cleanly re-claim them.
//
// This endpoint is unauthenticated (called by Vercel Cron / scheduler) and is
// secured by a bearer-token check against CRON_SECRET. Fail closed if unset.
//
// Idempotent: the conditional updateMany only touches rows whose lease has
// already expired, so concurrent cron runs are safe.
import { NextRequest } from "next/server";
import { jsonError, audit } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import { CRON_SECRET } from "@/lib/env";
import { timingSafeEqual } from "crypto";
import { reclaimStaleProcessingEvents, DEFAULT_LEASE_MS } from "@/lib/webhook-claim";

type Ctx = { params: Promise<{}> };

function cronAuthorized(header: string | null): boolean {
  if (!header) return false;
  const expected = `Bearer ${CRON_SECRET}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  if (a.length !== b.length) return false;
  try {
    return timingSafeEqual(a, b);
  } catch {
    return false;
  }
}

async function POSTImpl(req: NextRequest, _ctx: Ctx) {
  if (!cronAuthorized(req.headers.get("authorization"))) {
    return jsonError("Unauthorized", 401);
  }
  const reclaimed = await reclaimStaleProcessingEvents(DEFAULT_LEASE_MS);
  if (reclaimed > 0) {
    await audit({
      hospitalId: null,
      actorId: null,
      action: "cron.webhook_reclaim",
      target: null,
      detail: `Reclaimed ${reclaimed} stale PROCESSING webhook events (lease > ${DEFAULT_LEASE_MS}ms).`,
      ip: null,
    }).catch(() => { /* best-effort */ });
  }
  return Response.json({ ok: true, reclaimed });
}

export const POST = withErrors(POSTImpl);
