// Ojas — Medication adherence API. Returns adherence stats across all
// answered check-ins for the hospital, and per-patient breakdowns.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { withErrors } from "@/lib/api-handler";

type Ctx = { params: Promise<{}> };
import { jsonError } from "@/lib/server-utils";

async function GETImpl(_req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);

  // Get all answered check-ins with meds data
  const checkins = await db.checkin.findMany({
    where: { hospitalId: user.hospitalId, status: "ANSWERED", medsTaken: { not: null } },
    orderBy: { answeredAt: "desc" },
    take: 500,
    include: { patient: { select: { id: true, fullName: true, surgeryType: true } } },
  });

  const total = checkins.length;
  const taken = checkins.filter((c) => c.medsTaken === true).length;
  const missed = checkins.filter((c) => c.medsTaken === false).length;
  const adherenceRate = total > 0 ? Math.round((taken / total) * 1000) / 10 : null;

  // Per-patient breakdown
  const patientMap: Record<string, { patientId: string; patientName: string; surgeryType: string; total: number; taken: number; missed: number; lastResponse: Date | null }> = {};
  for (const c of checkins) {
    const key = c.patientId;
    if (!patientMap[key]) {
      patientMap[key] = {
        patientId: c.patientId,
        patientName: c.patient.fullName,
        surgeryType: c.patient.surgeryType,
        total: 0, taken: 0, missed: 0, lastResponse: null,
      };
    }
    patientMap[key].total += 1;
    if (c.medsTaken) patientMap[key].taken += 1;
    else patientMap[key].missed += 1;
    if (!patientMap[key].lastResponse || (c.answeredAt && c.answeredAt > patientMap[key].lastResponse)) {
      patientMap[key].lastResponse = c.answeredAt;
    }
  }
  const byPatient = Object.values(patientMap).map((p) => ({
    ...p,
    adherenceRate: p.total > 0 ? Math.round((p.taken / p.total) * 1000) / 10 : null,
  })).sort((a, b) => b.missed - a.missed);

  // Trend: last 14 days of adherence
  const trend: { date: string; taken: number; missed: number; rate: number | null }[] = [];
  for (let d = 13; d >= 0; d--) {
    const dayStart = new Date(Date.now() - d * 86400000);
    dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    const dayCheckins = checkins.filter((c) => c.answeredAt && c.answeredAt >= dayStart && c.answeredAt < dayEnd);
    const dayTaken = dayCheckins.filter((c) => c.medsTaken).length;
    const dayMissed = dayCheckins.filter((c) => !c.medsTaken).length;
    trend.push({
      date: dayStart.toISOString().slice(0, 10),
      taken: dayTaken,
      missed: dayMissed,
      rate: dayCheckins.length > 0 ? Math.round((dayTaken / dayCheckins.length) * 1000) / 10 : null,
    });
  }

  return Response.json({
    summary: { total, taken, missed, adherenceRate },
    byPatient,
    trend,
  });
}

export const GET = withErrors(GETImpl);
