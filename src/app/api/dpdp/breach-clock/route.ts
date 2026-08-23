// Ojas — 72-hour breach clock status.
// GET /api/dpdp/breach-clock — list breaches with their SLA status.
// POST /api/dpdp/breach-clock/[id]/notify-dpb — mark a breach as notified to the DPB.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireAuth, requireRole } from "@/lib/auth";
import { jsonError } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import { findBreachesAtRisk, findOverdueBreaches, buildDpbNotification } from "@/lib/dpdp";

type Ctx = { params: Promise<{}> };

async function GETImpl(_req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "SUPER_ADMIN"]);
  const hospitalId = user.role === "SUPER_ADMIN" ? undefined : user.hospitalId;
  const [breaches, atRisk, overdue] = await Promise.all([
    db.breachNotification.findMany({
      where: hospitalId ? { hospitalId } : {},
      orderBy: { detectedAt: "desc" },
      take: 100,
      include: { hospital: { select: { name: true } } },
    }),
    findBreachesAtRisk(hospitalId ?? undefined),
    findOverdueBreaches(hospitalId ?? undefined),
  ]);
  // Compute SLA status for each breach.
  const now = Date.now();
  const enriched = breaches.map((b) => {
    const deadline = b.slaDeadline ?? new Date(b.detectedAt.getTime() + 72 * 60 * 60 * 1000);
    const msRemaining = deadline.getTime() - now;
    const hoursRemaining = Math.max(0, msRemaining / (60 * 60 * 1000));
    let slaStatus: "OK" | "AT_RISK" | "OVERDUE" | "NOTIFIED" = "OK";
    if (b.notifiedAt) slaStatus = "NOTIFIED";
    else if (msRemaining < 0) slaStatus = "OVERDUE";
    else if (hoursRemaining < 12) slaStatus = "AT_RISK";
    return { ...b, slaDeadline: deadline, hoursRemaining, slaStatus };
  });
  return Response.json({
    breaches: enriched,
    summary: {
      total: breaches.length,
      atRisk: atRisk.length,
      overdue: overdue.length,
      notified: breaches.filter((b) => b.notifiedAt).length,
    },
  });
}

export const GET = withErrors(GETImpl);
