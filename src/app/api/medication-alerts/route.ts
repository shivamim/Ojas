// Ojas — Medication adherence alerts API. Returns patients who are missing
// medications (medsTaken = false in recent check-ins) for proactive follow-up.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { withErrors } from "@/lib/api-handler";

type Ctx = { params: Promise<{}> };
import { jsonError } from "@/lib/server-utils";

async function GETImpl(_req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);

  const since7d = new Date(Date.now() - 7 * 86400000);
  const checkins = await db.checkin.findMany({
    where: { hospitalId: user.hospitalId, status: "ANSWERED", medsTaken: { not: null }, answeredAt: { gte: since7d } },
    orderBy: { answeredAt: "desc" },
    take: 500,
    include: { patient: { select: { id: true, fullName: true, surgeryType: true, age: true, riskLevel: true } } },
  });

  // Group by patient
  const patientMap: Record<string, {
    patient: { id: string; fullName: string; surgeryType: string; age: number; riskLevel: string | null };
    total: number; taken: number; missed: number; missedNotes: string[]; lastMissed: Date | null; lastResponse: Date | null;
  }> = {};
  for (const c of checkins) {
    if (!patientMap[c.patientId]) {
      patientMap[c.patientId] = {
        patient: c.patient,
        total: 0, taken: 0, missed: 0, missedNotes: [], lastMissed: null, lastResponse: null,
      };
    }
    const entry = patientMap[c.patientId];
    entry.total += 1;
    if (c.medsTaken) entry.taken += 1;
    else {
      entry.missed += 1;
      if (c.medsNote) entry.missedNotes.push(c.medsNote);
      if (!entry.lastMissed || (c.answeredAt && c.answeredAt > entry.lastMissed)) entry.lastMissed = c.answeredAt;
    }
    if (!entry.lastResponse || (c.answeredAt && c.answeredAt > entry.lastResponse)) entry.lastResponse = c.answeredAt;
  }

  // Only include patients with at least 1 missed dose, sort by missed desc
  const alerts = Object.values(patientMap)
    .filter((p) => p.missed > 0)
    .map((p) => ({
      ...p,
      adherenceRate: p.total > 0 ? Math.round((p.taken / p.total) * 1000) / 10 : null,
      severity: p.missed >= 3 ? "HIGH" : p.missed >= 2 ? "MEDIUM" : "LOW",
    }))
    .sort((a, b) => b.missed - a.missed);

  return Response.json({
    alerts,
    summary: {
      totalPatientsWithAlerts: alerts.length,
      totalMissedDoses: alerts.reduce((s, a) => s + a.missed, 0),
      highSeverity: alerts.filter((a) => a.severity === "HIGH").length,
    },
  });
}

export const GET = withErrors(GETImpl);
