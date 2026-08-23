// Ojas — Cron: Check NHCX claims for IRDAI SLA breaches.
// Triggered every 15 min via Vercel Cron. Marks breached claims and creates
// audit entries ONLY when a breach flag actually flips (idempotent).
//
// HARDENING (P0):
//   • Bearer token from env (fail closed, constant-time compare).
//   • IDEMPOTENT: atomic conditional updateMany (where includes preAuthBreached=false).
//     Audit created only when count > 0, so replays don't duplicate audit entries.
//   • Uses the migrated NHCX claim state machine statuses.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { jsonError } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
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

  const now = new Date();
  let preAuthBreaches = 0;
  let finalAuthBreaches = 0;

  // Pre-auth SLA breach: claims awaiting pre-auth past their deadline.
  const preAuthPending = await db.nhcxClaim.findMany({
    where: {
      status: "PREAUTH_PENDING",
      preAuthDeadlineAt: { lt: now },
      preAuthBreached: false,
    },
  });
  for (const c of preAuthPending) {
    // Atomic conditional flip — only sets breached=true if still un-breached.
    const upd = await db.nhcxClaim.updateMany({
      where: { id: c.id, preAuthBreached: false },
      data: { preAuthBreached: true },
    });
    if (upd.count > 0) {
      await db.auditLog.create({
        data: {
          hospitalId: c.hospitalId,
          action: "NHCX_PRE_AUTH_SLA_BREACH",
          target: `claim:${c.claimId}`,
          detail: `Pre-auth SLA breached. Deadline: ${c.preAuthDeadlineAt?.toISOString()}. IRDAI requires 1hr.`,
        },
      });
      preAuthBreaches++;
    }
  }

  // Final-auth SLA breach: submitted/acknowledged/under-review claims past deadline.
  const finalPending = await db.nhcxClaim.findMany({
    where: {
      status: { in: ["CLAIM_SUBMITTED", "ACKNOWLEDGED", "UNDER_REVIEW"] },
      finalAuthDeadlineAt: { lt: now },
      finalAuthBreached: false,
    },
  });
  for (const c of finalPending) {
    const upd = await db.nhcxClaim.updateMany({
      where: { id: c.id, finalAuthBreached: false },
      data: { finalAuthBreached: true },
    });
    if (upd.count > 0) {
      await db.auditLog.create({
        data: {
          hospitalId: c.hospitalId,
          action: "NHCX_FINAL_AUTH_SLA_BREACH",
          target: `claim:${c.claimId}`,
          detail: `Final auth SLA breached. Deadline: ${c.finalAuthDeadlineAt?.toISOString()}. IRDAI requires 3hr.`,
        },
      });
      finalAuthBreaches++;
    }
  }

  return Response.json({
    ok: true,
    checkedAt: now.toISOString(),
    preAuthBreaches,
    finalAuthBreaches,
  });
}

export const POST = withErrors(POSTImpl);
