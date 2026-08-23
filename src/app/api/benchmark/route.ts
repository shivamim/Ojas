// Ojas — Hospital benchmarking API. Compares the current hospital's metrics
// against anonymized aggregate stats across ALL hospitals on the platform.
// Real data — no fabricated benchmarks. Uses real aggregate queries.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { withErrors } from "@/lib/api-handler";

type Ctx = { params: Promise<{}> };
import { jsonError } from "@/lib/server-utils";

async function GETImpl(_req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);

  // My hospital's stats
  const [
    myPatientCount, myReadmittedCount, myCheckinCount, myAnsweredCount,
    myEscalationCount, myResolvedEscalations, myCriticalEscalations, myAiRuns,
  ] = await Promise.all([
    db.patient.count({ where: { hospitalId: user.hospitalId } }),
    db.patient.count({ where: { hospitalId: user.hospitalId, status: "READMITTED" } }),
    db.checkin.count({ where: { hospitalId: user.hospitalId } }),
    db.checkin.count({ where: { hospitalId: user.hospitalId, status: "ANSWERED" } }),
    db.escalation.count({ where: { hospitalId: user.hospitalId } }),
    db.escalation.count({ where: { hospitalId: user.hospitalId, status: "RESOLVED" } }),
    db.escalation.count({ where: { hospitalId: user.hospitalId, severity: "CRITICAL" } }),
    db.aiAgentRun.count({ where: { hospitalId: user.hospitalId } }),
  ]);

  // All hospitals (for benchmarking — anonymized, counts only)
  const allHospitals = await db.hospital.findMany({
    where: { deletedAt: null },
    select: {
      id: true, planTier: true,
      _count: { select: { patients: true, checkins: true, escalations: true, aiRuns: true } },
    },
  });

  // Compute aggregate stats across all hospitals
  const totalHospitals = allHospitals.length;
  const totalPatients = allHospitals.reduce((s, h) => s + h._count.patients, 0);
  const totalCheckins = allHospitals.reduce((s, h) => s + h._count.checkins, 0);
  const totalEscalations = allHospitals.reduce((s, h) => s + h._count.escalations, 0);
  const totalAiRuns = allHospitals.reduce((s, h) => s + h._count.aiRuns, 0);

  // Per-hospital arrays for percentile calculation
  const patientCounts = allHospitals.map((h) => h._count.patients).sort((a, b) => a - b);
  const checkinCounts = allHospitals.map((h) => h._count.checkins).sort((a, b) => a - b);
  const escalationCounts = allHospitals.map((h) => h._count.escalations).sort((a, b) => a - b);
  const aiRunCounts = allHospitals.map((h) => h._count.aiRuns).sort((a, b) => a - b);

  function percentile(sortedArr: number[], value: number): number {
    if (sortedArr.length === 0) return 50;
    let below = 0;
    for (const v of sortedArr) if (v < value) below++;
    return Math.round((below / sortedArr.length) * 100);
  }

  // My hospital's response rate
  const myResponseRate = myCheckinCount > 0 ? Math.round((myAnsweredCount / myCheckinCount) * 1000) / 10 : null;
  const myReadmissionRate = myPatientCount > 0 ? Math.round((myReadmittedCount / myPatientCount) * 1000) / 10 : null;
  const myResolutionRate = myEscalationCount > 0 ? Math.round((myResolvedEscalations / myEscalationCount) * 1000) / 10 : null;

  // Compute peer averages
  const avgPatients = totalHospitals > 0 ? Math.round(totalPatients / totalHospitals) : 0;
  const avgCheckins = totalHospitals > 0 ? Math.round(totalCheckins / totalHospitals) : 0;
  const avgEscalations = totalHospitals > 0 ? Math.round(totalEscalations / totalHospitals) : 0;
  const avgAiRuns = totalHospitals > 0 ? Math.round(totalAiRuns / totalHospitals) : 0;

  // Plan tier distribution
  const planDistribution = {
    STARTER: allHospitals.filter((h) => h.planTier === "STARTER").length,
    GROWTH: allHospitals.filter((h) => h.planTier === "GROWTH").length,
    ENTERPRISE: allHospitals.filter((h) => h.planTier === "ENTERPRISE").length,
  };

  return Response.json({
    myHospital: {
      patientCount: myPatientCount,
      checkinCount: myCheckinCount,
      answeredCount: myAnsweredCount,
      escalationCount: myEscalationCount,
      resolvedEscalations: myResolvedEscalations,
      criticalEscalations: myCriticalEscalations,
      aiRuns: myAiRuns,
      responseRate: myResponseRate,
      readmissionRate: myReadmissionRate,
      resolutionRate: myResolutionRate,
    },
    benchmark: {
      totalHospitals,
      avgPatients,
      avgCheckins,
      avgEscalations,
      avgAiRuns,
      percentiles: {
        patients: percentile(patientCounts, myPatientCount),
        checkins: percentile(checkinCounts, myCheckinCount),
        escalations: percentile(escalationCounts, myEscalationCount),
        aiRuns: percentile(aiRunCounts, myAiRuns),
      },
      planDistribution,
    },
    note: "Benchmarking is computed from real aggregate data across all hospitals on this platform. In a multi-tenant production deployment, this compares you against real peers. In this demo, there's only one hospital so percentiles are 0 — but the infrastructure is real.",
  });
}

export const GET = withErrors(GETImpl);
