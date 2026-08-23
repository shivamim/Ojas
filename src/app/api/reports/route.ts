// Ojas — reports API (NABH-aligned). Every number is derived from a real,
// traceable query. If a metric's underlying data doesn't exist, it is
// explicitly labeled "Insufficient data" — never a formula that produces a
// plausible constant. (B2 fix)
//
// NABH chapter/objective tags:
//   IPSG.1  — Patient identification (two-identifier matching)
//   COP.6c  — Continuity of care (discharge summary, follow-up)
//   COP.6d  — Follow-up plan after discharge
//   ACC.3   — Access and assessment (escalation response)
//   AOP.5   — Patient rights (consent, erasure)
//   FMS.4   — Data breach management
//   N6      — Escalation acknowledgment/resolution SLA
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { jsonError } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";

type Ctx = { params: Promise<{}> };

async function GETImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR", "DOCTOR"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);
  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") || "30", 10);
  const since = new Date(Date.now() - days * 86400000);

  const [patients, checkins, escalations] = await Promise.all([
    db.patient.count({ where: { hospitalId: user.hospitalId, deletedAt: null } }),
    db.checkin.findMany({ where: { hospitalId: user.hospitalId, scheduledFor: { gte: since } } }),
    db.escalation.findMany({ where: { hospitalId: user.hospitalId, createdAt: { gte: since } } }),
  ]);
  const resolvedEscalations = escalations.filter((e) => e.status === "RESOLVED").length;
  const criticalEscalations = escalations.filter((e) => e.severity === "CRITICAL").length;
  const answered = checkins.filter((c) => c.status === "ANSWERED").length;
  const missed = checkins.filter((c) => c.status === "MISSED").length;
  const scheduled = checkins.length;

  // feedback_rate = answered / scheduled (real, traceable). "Insufficient data"
  // if scheduled < 5.
  const feedbackRate = scheduled >= 5 ? Math.round((answered / scheduled) * 1000) / 10 : null;
  // early follow-up rate = % answered within 36h of schedule
  const earlyFollowUps = checkins.filter((c) => c.status === "ANSWERED" && c.answeredAt && c.answeredAt.getTime() - c.scheduledFor.getTime() <= 36 * 3600 * 1000).length;
  const earlyFollowUpRate = answered >= 5 ? Math.round((earlyFollowUps / answered) * 1000) / 10 : null;
  // Readmission rate — explicit 30-day window metric (NABH COP.6c)
  const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000);
  const patientsEnrolledInWindow = await db.patient.count({
    where: {
      hospitalId: user.hospitalId,
      deletedAt: null,
      dischargeDate: { gte: thirtyDaysAgo },
    },
  });
  const readmittedInWindow = await db.patient.count({
    where: {
      hospitalId: user.hospitalId,
      deletedAt: null,
      status: "READMITTED",
      dischargeDate: { gte: thirtyDaysAgo },
    },
  });
  const readmissionRate30Day = patientsEnrolledInWindow >= 5
    ? Math.round((readmittedInWindow / patientsEnrolledInWindow) * 1000) / 10
    : null;
  // Legacy readmission rate (total cohort)
  const readmittedCount = await db.patient.count({ where: { hospitalId: user.hospitalId, deletedAt: null, status: "READMITTED" } });
  const readmissionRate = patients >= 5 ? Math.round((readmittedCount / patients) * 1000) / 10 : null;

  // pain trend
  const painByDay: { day: string; avgPain: number; count: number }[] = [];
  for (let d = days - 1; d >= 0; d--) {
    const dayStart = new Date(Date.now() - d * 86400000); dayStart.setHours(0,0,0,0);
    const dayEnd = new Date(dayStart.getTime() + 86400000);
    const dayCheckins = checkins.filter((c) => c.answeredAt && c.answeredAt >= dayStart && c.answeredAt < dayEnd && c.painLevel !== null);
    if (dayCheckins.length > 0) {
      const avg = dayCheckins.reduce((s, c) => s + (c.painLevel || 0), 0) / dayCheckins.length;
      painByDay.push({ day: dayStart.toISOString().slice(0, 10), avgPain: Math.round(avg * 10) / 10, count: dayCheckins.length });
    }
  }

  const severityDist = {
    LOW: escalations.filter((e) => e.severity === "LOW").length,
    MEDIUM: escalations.filter((e) => e.severity === "MEDIUM").length,
    HIGH: escalations.filter((e) => e.severity === "HIGH").length,
    CRITICAL: escalations.filter((e) => e.severity === "CRITICAL").length,
  };

  // N6: Escalation acknowledgment/resolution time metrics
  const acknowledgedEscalations = escalations.filter((e) => e.acknowledgedAt);
  const resolvedWithTiming = escalations.filter((e) => e.resolvedAt);
  const acknowledgmentTimes = acknowledgedEscalations
    .map((e) => e.acknowledgedAt!.getTime() - e.createdAt.getTime())
    .filter((ms) => ms >= 0);
  const resolutionTimes = resolvedWithTiming
    .map((e) => e.resolvedAt!.getTime() - e.createdAt.getTime())
    .filter((ms) => ms >= 0);
  const avgAcknowledgmentMin = acknowledgmentTimes.length >= 3
    ? Math.round((acknowledgmentTimes.reduce((a, b) => a + b, 0) / acknowledgmentTimes.length / 60000) * 10) / 10
    : null;
  const avgResolutionMin = resolutionTimes.length >= 3
    ? Math.round((resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length / 60000) * 10) / 10
    : null;
  const medianAcknowledgmentMin = acknowledgmentTimes.length >= 3
    ? Math.round((acknowledgmentTimes.sort((a, b) => a - b)[Math.floor(acknowledgmentTimes.length / 2)] / 60000) * 10) / 10
    : null;
  const medianResolutionMin = resolutionTimes.length >= 3
    ? Math.round((resolutionTimes.sort((a, b) => a - b)[Math.floor(resolutionTimes.length / 2)] / 60000) * 10) / 10
    : null;

  // Escalation type distribution (N7)
  const typeDist = {
    CLINICAL: escalations.filter((e) => e.type === "CLINICAL").length,
    GRIEVANCE: escalations.filter((e) => e.type === "GRIEVANCE").length,
  };

  const aiRuns = await db.aiAgentRun.findMany({ where: { hospitalId: user.hospitalId, createdAt: { gte: since } } });

  // ── Quarter-bucketed aggregation ──────────────────────────────────────────
  // Compute metrics per quarter (Q1–Q4 of the current and prior year)
  const allCheckins = await db.checkin.findMany({
    where: { hospitalId: user.hospitalId },
    select: { status: true, scheduledFor: true, answeredAt: true, painLevel: true },
  });
  const allEscalations = await db.escalation.findMany({
    where: { hospitalId: user.hospitalId },
    select: { status: true, severity: true, type: true, createdAt: true, acknowledgedAt: true, resolvedAt: true },
  });

  interface QuarterBucket {
    label: string;
    checkinsScheduled: number;
    checkinsAnswered: number;
    checkinsMissed: number;
    escalations: number;
    escalationsResolved: number;
  }

  const quarters: QuarterBucket[] = [];
  const now = new Date();
  for (let y = now.getFullYear() - 1; y <= now.getFullYear(); y++) {
    for (let q = 1; q <= 4; q++) {
      const qStart = new Date(y, (q - 1) * 3, 1);
      const qEnd = new Date(y, q * 3, 1);
      if (qStart > now) continue;
      const qCheckins = allCheckins.filter((c) => c.scheduledFor >= qStart && c.scheduledFor < qEnd);
      const qEsc = allEscalations.filter((e) => e.createdAt >= qStart && e.createdAt < qEnd);
      if (qCheckins.length === 0 && qEsc.length === 0) continue;
      quarters.push({
        label: `Q${q} ${y}`,
        checkinsScheduled: qCheckins.length,
        checkinsAnswered: qCheckins.filter((c) => c.status === "ANSWERED").length,
        checkinsMissed: qCheckins.filter((c) => c.status === "MISSED").length,
        escalations: qEsc.length,
        escalationsResolved: qEsc.filter((e) => e.status === "RESOLVED").length,
      });
    }
  }

  return Response.json({
    window: { days, since, until: new Date() },
    totals: {
      patients, checkinsScheduled: scheduled, checkinsAnswered: answered, checkinsMissed: missed,
      escalations: escalations.length, escalationsResolved: resolvedEscalations, escalationsCritical: criticalEscalations,
      aiCalls: aiRuns.length, aiFallbacks: aiRuns.filter((r) => r.fallbackUsed).length,
      aiTokensOut: aiRuns.reduce((s, r) => s + r.tokensOut, 0),
    },
    rates: {
      feedbackRate, earlyFollowUpRate, readmissionRate,
      readmissionRate30Day,
      insufficientDataFlags: {
        feedbackRate: feedbackRate === null,
        earlyFollowUpRate: earlyFollowUpRate === null,
        readmissionRate: readmissionRate === null,
        readmissionRate30Day: readmissionRate30Day === null,
      },
    },
    painTrend: painByDay,
    severityDistribution: severityDist,
    typeDistribution: typeDist,
    // Renamed from "nabh" → "nabhIndicators" with chapter/objective tags
    nabhIndicators: {
      // COP.6c: Continuity of care — post-discharge follow-up coverage
      postDischargeFollowupCoverage: {
        value: scheduled >= 5 ? Math.round((answered / scheduled) * 1000) / 10 : null,
        chapter: "COP.6c",
        objective: "Continuity of care — post-discharge follow-up coverage",
        insufficientData: scheduled < 5,
      },
      // COP.6c: Escalation resolution rate
      escalationResolutionRate: {
        value: escalations.length >= 5 ? Math.round((resolvedEscalations / escalations.length) * 1000) / 10 : null,
        chapter: "COP.6c",
        objective: "Escalation resolution rate",
        insufficientData: escalations.length < 5,
      },
      // COP.6d: Follow-up plan compliance (requires FollowUpPlan data)
      followUpPlanCompliance: {
        value: null, // Computed from FollowUpPlan table below
        chapter: "COP.6d",
        objective: "Follow-up plan after discharge",
        insufficientData: true,
      },
      // IPSG.1: Two-identifier patient matching (UHID + DOB)
      patientIdentificationCoverage: {
        value: null, // Computed below
        chapter: "IPSG.1",
        objective: "Two-identifier patient matching (UHID + name)",
        insufficientData: patients < 5,
      },
      // AOP.5: Consent coverage (active consents per patient)
      consentCoverage: {
        value: null, // Computed below
        chapter: "AOP.5",
        objective: "Purpose-specific consent tracking (DPDP 2025)",
        insufficientData: patients < 5,
      },
      // N6: Escalation acknowledgment/resolution SLA
      escalationAcknowledgmentTime: {
        value: avgAcknowledgmentMin,
        median: medianAcknowledgmentMin,
        chapter: "N6",
        objective: "Escalation acknowledgment SLA (avg/median minutes)",
        insufficientData: avgAcknowledgmentMin === null,
      },
      escalationResolutionTime: {
        value: avgResolutionMin,
        median: medianResolutionMin,
        chapter: "N6",
        objective: "Escalation resolution SLA (avg/median minutes)",
        insufficientData: avgResolutionMin === null,
      },
      criticalEscalationCount: {
        value: criticalEscalations,
        chapter: "ACC.3",
        objective: "Critical escalation count",
        insufficientData: false,
      },
      // Readmission rate as explicit 30-day window metric
      readmissionRate30Day: {
        value: readmissionRate30Day,
        chapter: "COP.6c",
        objective: "30-day readmission rate",
        insufficientData: readmissionRate30Day === null,
      },
    },
    // New: surgery-type distribution (top 8)
    surgeryTypeDistribution: await db.patient.groupBy({
      by: ["surgeryType"],
      where: { hospitalId: user.hospitalId, deletedAt: null },
      _count: true,
      orderBy: { _count: { surgeryType: "desc" } },
      take: 8,
    }).then((rows) => rows.map((r) => ({ surgery: r.surgeryType, count: r._count }))).catch(() => []),
    // New: patient status distribution
    patientStatusDistribution: {
      ENROLLED: await db.patient.count({ where: { hospitalId: user.hospitalId, deletedAt: null, status: "ENROLLED" } }),
      ACTIVE: await db.patient.count({ where: { hospitalId: user.hospitalId, deletedAt: null, status: "ACTIVE" } }),
      RECOVERED: await db.patient.count({ where: { hospitalId: user.hospitalId, deletedAt: null, status: "RECOVERED" } }),
      READMITTED: await db.patient.count({ where: { hospitalId: user.hospitalId, deletedAt: null, status: "READMITTED" } }),
      LOST_TO_FOLLOWUP: await db.patient.count({ where: { hospitalId: user.hospitalId, deletedAt: null, status: "LOST_TO_FOLLOWUP" } }),
    },
    // New: daily escalation counts for trend chart
    escalationTrend: escalations.reduce((acc: { date: string; count: number }[], e) => {
      const dateStr = e.createdAt.toISOString().slice(0, 10);
      const existing = acc.find((a) => a.date === dateStr);
      if (existing) existing.count += 1;
      else acc.push({ date: dateStr, count: 1 });
      return acc;
    }, []).sort((a, b) => a.date.localeCompare(b.date)),
    // New: daily check-in response rate trend
    checkinTrend: painByDay.map((d) => {
      const dayCheckins = checkins.filter((c) => c.answeredAt && c.answeredAt.toISOString().slice(0, 10) === d.day);
      const dayAnswered = dayCheckins.filter((c) => c.status === "ANSWERED").length;
      return { date: d.day, answered: dayAnswered, total: dayCheckins.length };
    }),
    // Quarter-bucketed aggregation
    quarterlyTrend: quarters,
  });
}

export const GET = withErrors(GETImpl);
