// Ojas — Recovery Trends API.
// Cross-patient vitals visualization for hospital-wide recovery monitoring.
// Returns aggregated pain/temperature trends, fever episodes, response rates,
// and per-patient recovery trajectory summaries.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireAuth } from "@/lib/auth";
import { jsonError } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";

type Ctx = { params: Promise<{}> };

async function GETImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireAuth(await getCurrentUser());
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);
  const { searchParams } = new URL(req.url);
  const days = Math.min(parseInt(searchParams.get("days") || "14", 10), 90);

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  // Fetch all answered check-ins in the window with patient context.
  const checkins = await db.checkin.findMany({
    where: {
      hospitalId: user.hospitalId,
      status: "ANSWERED",
      answeredAt: { gte: since },
    },
    select: {
      id: true,
      patientId: true,
      scheduledFor: true,
      answeredAt: true,
      painLevel: true,
      temperature: true,
      symptomsText: true,
      medsTaken: true,
      aiRiskLevel: true,
      patient: { select: { id: true, fullName: true, surgeryType: true, dischargeDate: true, riskLevel: true } },
    },
    orderBy: { scheduledFor: "asc" },
  });

  // Group by day for trend chart
  const byDay: Record<string, {
    date: string;
    avgPain: number[];
    avgTemp: number[];
    feverCount: number;
    answeredCount: number;
    highRiskCount: number;
  }> = {};
  for (const c of checkins) {
    const dateKey = c.scheduledFor.toISOString().slice(0, 10);
    if (!byDay[dateKey]) {
      byDay[dateKey] = { date: dateKey, avgPain: [], avgTemp: [], feverCount: 0, answeredCount: 0, highRiskCount: 0 };
    }
    if (c.painLevel != null) byDay[dateKey].avgPain.push(c.painLevel);
    if (c.temperature != null) {
      byDay[dateKey].avgTemp.push(c.temperature);
      if (c.temperature >= 38) byDay[dateKey].feverCount++;
    }
    byDay[dateKey].answeredCount++;
    if (c.aiRiskLevel === "HIGH" || c.aiRiskLevel === "CRITICAL") byDay[dateKey].highRiskCount++;
  }

  const dailyTrend = Object.values(byDay).map((d) => ({
    date: d.date,
    avgPain: d.avgPain.length > 0 ? Math.round((d.avgPain.reduce((a, b) => a + b, 0) / d.avgPain.length) * 10) / 10 : null,
    avgTemp: d.avgTemp.length > 0 ? Math.round((d.avgTemp.reduce((a, b) => a + b, 0) / d.avgTemp.length) * 10) / 10 : null,
    feverCount: d.feverCount,
    answeredCount: d.answeredCount,
    highRiskCount: d.highRiskCount,
  })).sort((a, b) => a.date.localeCompare(b.date));

  // Per-patient trajectory summary
  const byPatient: Record<string, typeof checkins> = {};
  for (const c of checkins) {
    if (!byPatient[c.patientId]) byPatient[c.patientId] = [];
    byPatient[c.patientId].push(c);
  }

  const patientTrajectories = Object.entries(byPatient).map(([patientId, cs]) => {
    const pains = cs.map((c) => c.painLevel).filter((p): p is number => p !== null);
    const temps = cs.map((c) => c.temperature).filter((t): t is number => t !== null);
    const feverEpisodes = temps.filter((t) => t >= 38).length;
    const firstPain = pains[0] ?? null;
    const lastPain = pains[pains.length - 1] ?? null;
    const painDelta = firstPain !== null && lastPain !== null ? Math.round((lastPain - firstPain) * 10) / 10 : null;
    return {
      patientId,
      patientName: cs[0].patient.fullName,
      surgeryType: cs[0].patient.surgeryType,
      riskLevel: cs[0].patient.riskLevel,
      checkinCount: cs.length,
      avgPain: pains.length > 0 ? Math.round((pains.reduce((a, b) => a + b, 0) / pains.length) * 10) / 10 : null,
      maxPain: pains.length > 0 ? Math.max(...pains) : null,
      latestPain: lastPain,
      painDelta, // negative = improving
      feverEpisodes,
      maxTemp: temps.length > 0 ? Math.max(...temps) : null,
      adherenceRate: cs.length > 0 ? Math.round((cs.filter((c) => c.medsTaken).length / cs.length) * 100) : null,
    };
  }).sort((a, b) => (b.maxPain ?? 0) - (a.maxPain ?? 0));

  // Aggregate stats
  const allPains = checkins.map((c) => c.painLevel).filter((p): p is number => p !== null);
  const allTemps = checkins.map((c) => c.temperature).filter((t): t is number => t !== null);
  const totalAnswered = checkins.length;
  const totalScheduled = await db.checkin.count({
    where: { hospitalId: user.hospitalId, scheduledFor: { gte: since } },
  });

  return Response.json({
    windowDays: days,
    summary: {
      totalPatients: Object.keys(byPatient).length,
      totalAnswered,
      totalScheduled,
      responseRate: totalScheduled > 0 ? Math.round((totalAnswered / totalScheduled) * 100) : 0,
      avgPain: allPains.length > 0 ? Math.round((allPains.reduce((a, b) => a + b, 0) / allPains.length) * 10) / 10 : null,
      maxPain: allPains.length > 0 ? Math.max(...allPains) : null,
      feverEpisodes: allTemps.filter((t) => t >= 38).length,
      adherenceRate: totalAnswered > 0
        ? Math.round((checkins.filter((c) => c.medsTaken).length / totalAnswered) * 100)
        : 0,
      highRiskCount: checkins.filter((c) => c.aiRiskLevel === "HIGH" || c.aiRiskLevel === "CRITICAL").length,
    },
    dailyTrend,
    patientTrajectories: patientTrajectories.slice(0, 20), // top 20 by max pain
  });
}

export const GET = withErrors(GETImpl);
