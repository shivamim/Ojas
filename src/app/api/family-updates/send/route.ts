// Ojas — Cron endpoint: send all QUEUED FamilyUpdates via WhatsApp.
// Triggered daily at 6:15 PM IST. Bearer-token protected (fail closed).
//
// Idempotency note: sendPendingFamilyUpdates() advances QUEUED → SENT/FAILED
// per row; a duplicate cron run finds no QUEUED rows for already-sent updates,
// so no duplicate WhatsApp messages are sent.
import { NextRequest } from "next/server";
import { jsonError } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import { sendPendingFamilyUpdates } from "@/lib/family-companion";
import { CRON_SECRET } from "@/lib/env";
import { timingSafeEqual } from "crypto";

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
  const result = await sendPendingFamilyUpdates();
  return Response.json({ ok: true, ...result });
}

export const POST = withErrors(POSTImpl);
