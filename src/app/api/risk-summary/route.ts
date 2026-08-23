// Ojas — Risk summary API. Returns all patients ranked by AI risk score,
// with distribution stats. Used by the risk-stratification summary view.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { withErrors } from "@/lib/api-handler";

type Ctx = { params: Promise<{}> };
import { jsonError } from "@/lib/server-utils";

async function GETImpl(_req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);

  const patients = await db.patient.findMany({
    where: { hospitalId: user.hospitalId, deletedAt: null },
    select: {
      id: true, fullName: true, age: true, gender: true,
      surgeryType: true, dischargeDate: true, status: true,
      riskLevel: true, riskScore: true, riskAssessedAt: true,
      comorbidities: true,
    },
    orderBy: { createdAt: "desc" },
  });

  // Sort by risk score desc (nulls last)
  const ranked = patients.sort((a, b) => {
    if (a.riskScore === null && b.riskScore === null) return 0;
    if (a.riskScore === null) return 1;
    if (b.riskScore === null) return -1;
    return b.riskScore - a.riskScore;
  });

  // Distribution
  const distribution = {
    CRITICAL: ranked.filter((p) => p.riskLevel === "CRITICAL").length,
    HIGH: ranked.filter((p) => p.riskLevel === "HIGH").length,
    MEDIUM: ranked.filter((p) => p.riskLevel === "MEDIUM").length,
    LOW: ranked.filter((p) => p.riskLevel === "LOW").length,
    UNASSESSED: ranked.filter((p) => p.riskLevel === null).length,
  };

  // Stats
  const assessed = ranked.filter((p) => p.riskScore !== null);
  const avgScore = assessed.length > 0
    ? Math.round(assessed.reduce((s, p) => s + (p.riskScore || 0), 0) / assessed.length)
    : null;
  const maxScore = assessed.length > 0 ? Math.max(...assessed.map((p) => p.riskScore || 0)) : null;

  // By surgery type (avg risk score)
  const surgeryMap: Record<string, { total: number; scores: number[] }> = {};
  for (const p of assessed) {
    if (!surgeryMap[p.surgeryType]) surgeryMap[p.surgeryType] = { total: 0, scores: [] };
    surgeryMap[p.surgeryType].total += 1;
    surgeryMap[p.surgeryType].scores.push(p.riskScore || 0);
  }
  const bySurgeryType = Object.entries(surgeryMap)
    .map(([surgery, data]) => ({
      surgery,
      total: data.total,
      avgScore: Math.round(data.scores.reduce((a, b) => a + b, 0) / data.scores.length),
    }))
    .sort((a, b) => b.avgScore - a.avgScore);

  return Response.json({
    patients: ranked.map((p) => ({
      id: p.id, fullName: p.fullName, age: p.age, gender: p.gender,
      surgeryType: p.surgeryType, dischargeDate: p.dischargeDate, status: p.status,
      riskLevel: p.riskLevel, riskScore: p.riskScore, riskAssessedAt: p.riskAssessedAt,
      comorbidities: p.comorbidities,
      recoveryDay: Math.max(1, Math.ceil((Date.now() - p.dischargeDate.getTime()) / 86400000)),
    })),
    distribution,
    stats: {
      total: ranked.length,
      assessed: assessed.length,
      unassessed: ranked.length - assessed.length,
      avgScore,
      maxScore,
    },
    bySurgeryType,
  });
}

export const GET = withErrors(GETImpl);
