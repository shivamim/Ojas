// Ojas — Cron endpoint: auto-suspend or convert PILOT subscriptions past their
// 30-day window. Triggered daily at 1 AM IST via Vercel Cron or equivalent.
//
// HARDENING (P0):
//   • Bearer token read from env (NO fallback — fail closed). Constant-time compare.
//   • IDEMPOTENT: each subscription transition uses an atomic conditional update
//     (where clause includes planTier=PILOT + status=active + currentPeriodEnd<now).
//     Concurrent cron runs cannot double-process the same subscription.
//   • Audit log entries created ONLY when a transition actually happened
//     (updateMany count > 0), so replays don't pollute the audit trail.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { jsonError } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import { CRON_SECRET } from "@/lib/env";
import { timingSafeEqual } from "crypto";

type Ctx = { params: Promise<{}> };

/** Constant-time bearer comparison to avoid timing oracles on the cron secret. */
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
  // FAIL CLOSED: env.ts throws at startup in production if OJAS_CRON_SECRET is
  // missing; here CRON_SECRET is "" in dev-without-env, so any real bearer token
  // cannot match "Bearer " (length mismatch → denied).
  if (!cronAuthorized(req.headers.get("authorization"))) {
    return jsonError("Unauthorized", 401);
  }

  const now = new Date();
  // Read expired pilots (this read is non-locking; idempotency is enforced by
  // the conditional updateMany below).
  const expiredPilots = await db.subscription.findMany({
    where: {
      planTier: "PILOT",
      status: "active",
      currentPeriodEnd: { lt: now },
    },
    include: { hospital: { select: { name: true } } },
  });

  const results: Array<{
    subscriptionId: string;
    hospitalId: string;
    hospitalName: string;
    action: "CONVERTED_TO_GROWTH" | "SUSPENDED" | "NO_OP";
    patientCount: number;
  }> = [];

  for (const sub of expiredPilots) {
    const patientCount = await db.patient.count({
      where: {
        hospitalId: sub.hospitalId,
        deletedAt: null,
        status: { in: ["ENROLLED", "ACTIVE"] },
      },
    });

    // Atomic conditional transition: only applies if the row is STILL an active
    // expired PILOT (guards against concurrent cron runs).
    if (patientCount > 0) {
      const upd = await db.subscription.updateMany({
        where: {
          id: sub.id,
          planTier: "PILOT",
          status: "active",
          currentPeriodEnd: { lt: now },
        },
        data: {
          planTier: "GROWTH",
          patientLimit: 500,
          currentPeriodEnd: new Date(now.getTime() + 30 * 86400000),
        },
      });
      if (upd.count === 0) {
        // Already processed by a concurrent run — skip audit (idempotent).
        results.push({
          subscriptionId: sub.id, hospitalId: sub.hospitalId,
          hospitalName: sub.hospital.name, action: "NO_OP", patientCount,
        });
        continue;
      }
      results.push({
        subscriptionId: sub.id, hospitalId: sub.hospitalId,
        hospitalName: sub.hospital.name, action: "CONVERTED_TO_GROWTH", patientCount,
      });
    } else {
      const upd = await db.subscription.updateMany({
        where: {
          id: sub.id,
          planTier: "PILOT",
          status: "active",
          currentPeriodEnd: { lt: now },
        },
        data: { status: "suspended" },
      });
      if (upd.count === 0) {
        results.push({
          subscriptionId: sub.id, hospitalId: sub.hospitalId,
          hospitalName: sub.hospital.name, action: "NO_OP", patientCount: 0,
        });
        continue;
      }
      results.push({
        subscriptionId: sub.id, hospitalId: sub.hospitalId,
        hospitalName: sub.hospital.name, action: "SUSPENDED", patientCount: 0,
      });
    }

    // Mark PilotStudy COMPLETED only for still-ACTIVE pilot studies (idempotent).
    await db.pilotStudy.updateMany({
      where: { hospitalId: sub.hospitalId, status: "ACTIVE" },
      data: { status: "COMPLETED", endDate: now },
    });

    // Audit ONLY when a transition happened (we got here = upd.count > 0).
    await db.auditLog.create({
      data: {
        hospitalId: sub.hospitalId,
        action: "PILOT_EXPIRY_CRON",
        target: `subscription:${sub.id}`,
        detail: `Pilot expired (currentPeriodEnd=${sub.currentPeriodEnd?.toISOString()}). Action: ${patientCount > 0 ? "CONVERTED_TO_GROWTH" : "SUSPENDED"}. Patient count: ${patientCount}.`,
      },
    });
  }

  return Response.json({
    ok: true,
    processedAt: now.toISOString(),
    expiredPilotsFound: expiredPilots.length,
    converted: results.filter((r) => r.action === "CONVERTED_TO_GROWTH").length,
    suspended: results.filter((r) => r.action === "SUSPENDED").length,
    noOps: results.filter((r) => r.action === "NO_OP").length,
    results,
  });
}

export const POST = withErrors(POSTImpl);
