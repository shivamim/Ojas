// Ojas — P1.5 Coordinator Success Metrics API.
// Hospitals buy outcomes (lower workload), not AI. This route surfaces
// per-coordinator weekly impact metrics: how many patients they managed,
// how much time Ojas saved them, how many AI-flagged deteriorations they
// caught, and how their response rate compares to the pre-Ojas baseline.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { withErrors } from "@/lib/api-handler";

type Ctx = { params: Promise<{}> };
import { jsonError } from "@/lib/server-utils";

// 3 min/check-in baseline — what a coordinator would spend on a manual call.
// Ojas automates the scheduling, so this is "time Ojas saved" per answered
// check-in the coordinator only had to review (vs. initiate).
const MIN_PER_ANSWERED_CHECKIN = 3;

// Hardcoded pre-Ojas baseline — hospital admin can edit later (P1.5 v2).
const BEFORE_OJAS_BASELINE = {
  readmissionRate: 0.18,
  responseRate: 0.55,
  missedFollowupRate: 0.3,
};

async function GETImpl(_req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["COORDINATOR", "HOSPITAL_ADMIN", "SUPER_ADMIN"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);

  const now = new Date();
  const weekEnd = now;
  const weekStart = new Date(now.getTime() - 7 * 86400000);

  // Pull all the relevant data scoped to this hospital in parallel.
  // We collect raw rows and aggregate in JS — keeps the queries simple and
  // lets us attribute metrics to coordinators by patient ownership (via
  // escalation.assignedToId OR patient.enrolledById as a fallback).
  const [
    coordinators,
    escalations,
    patients,
    answeredCheckins,
    scheduledCheckins,
    missedFollowups,
    aiTriageRuns,
  ] = await Promise.all([
    db.user.findMany({
      where: {
        hospitalId: user.hospitalId,
        role: { in: ["COORDINATOR", "HOSPITAL_ADMIN", "DOCTOR"] },
      },
      select: { id: true, name: true, email: true, role: true },
    }),
    db.escalation.findMany({
      where: { hospitalId: user.hospitalId, createdAt: { gte: weekStart } },
      select: {
        id: true, assignedToId: true, patientId: true, status: true,
        severity: true, createdAt: true, resolvedAt: true,
      },
    }),
    db.patient.findMany({
      where: { hospitalId: user.hospitalId, deletedAt: null },
      select: { id: true, enrolledById: true, status: true },
    }),
    db.checkin.findMany({
      where: {
        hospitalId: user.hospitalId,
        status: "ANSWERED",
        answeredAt: { gte: weekStart },
      },
      select: { id: true, patientId: true },
    }),
    db.checkin.findMany({
      where: {
        hospitalId: user.hospitalId,
        scheduledFor: { gte: weekStart, lte: weekEnd },
      },
      select: { id: true, patientId: true, status: true },
    }),
    db.followUpPlan.count({
      where: {
        hospitalId: user.hospitalId,
        status: "MISSED",
        updatedAt: { gte: weekStart },
      },
    }),
    db.aiAgentRun.findMany({
      where: {
        hospitalId: user.hospitalId,
        agentType: "TRIAGE",
        outcome: "PENDING_CONFIRMATION",
        createdAt: { gte: weekStart },
      },
      select: { id: true, output: true, checkinId: true },
    }),
  ]);

  // Map patientId -> coordinatorId (assignedTo via escalation OR enrolledById).
  // An escalation assignment in the last 7d takes precedence; otherwise fall
  // back to the patient's enrolledById (whoever originally enrolled them).
  const patientToCoordinator = new Map<string, string>();
  for (const p of patients) {
    if (p.enrolledById) patientToCoordinator.set(p.id, p.enrolledById);
  }
  // Override with active escalation assignments (more recent signal).
  for (const e of escalations) {
    if (e.assignedToId && e.patientId) {
      patientToCoordinator.set(e.patientId, e.assignedToId);
    }
  }

  // Map coordinatorId -> set of patientIds (their managed patients).
  const coordinatorPatients = new Map<string, Set<string>>();
  for (const [patientId, coordId] of patientToCoordinator.entries()) {
    if (!coordinatorPatients.has(coordId)) coordinatorPatients.set(coordId, new Set());
    coordinatorPatients.get(coordId)!.add(patientId);
  }

  // Per-patient answered check-in count (within the 7d window).
  const answeredByPatient = new Map<string, number>();
  for (const c of answeredCheckins) {
    answeredByPatient.set(c.patientId, (answeredByPatient.get(c.patientId) ?? 0) + 1);
  }

  // Per-patient scheduled check-in count + answered count (for response rate).
  const scheduledByPatient = new Map<string, number>();
  const answeredScheduledByPatient = new Map<string, number>();
  for (const c of scheduledCheckins) {
    scheduledByPatient.set(c.patientId, (scheduledByPatient.get(c.patientId) ?? 0) + 1);
    if (c.status === "ANSWERED") {
      answeredScheduledByPatient.set(c.patientId, (answeredScheduledByPatient.get(c.patientId) ?? 0) + 1);
    }
  }

  // Resolve checkinId -> patientId for AI runs that flagged deterioration.
  const checkinIdToPatientId = new Map<string, string>();
  for (const c of [...answeredCheckins, ...scheduledCheckins]) {
    checkinIdToPatientId.set(c.id, c.patientId);
  }

  // Per-coordinator escalationsResolvedWithinSla + escalation totals.
  type CoordAgg = {
    patientsManaged: Set<string>;
    answeredCheckins: number;
    scheduledCheckins: number;
    answeredScheduled: number;
    escalationsResolved: number;
    escalationsResolvedWithinSla: number;
    escalationsTotal: number;
    aiFlaggedDeteriorations: number;
  };
  const agg = new Map<string, CoordAgg>();

  function getAgg(coordId: string): CoordAgg {
    let a = agg.get(coordId);
    if (!a) {
      a = {
        patientsManaged: new Set(),
        answeredCheckins: 0,
        scheduledCheckins: 0,
        answeredScheduled: 0,
        escalationsResolved: 0,
        escalationsResolvedWithinSla: 0,
        escalationsTotal: 0,
        aiFlaggedDeteriorations: 0,
      };
      agg.set(coordId, a);
    }
    return a;
  }

  // Roll up per-coordinator patient-attributed metrics.
  for (const [patientId, coordId] of patientToCoordinator.entries()) {
    const a = getAgg(coordId);
    a.patientsManaged.add(patientId);
    a.answeredCheckins += answeredByPatient.get(patientId) ?? 0;
    a.scheduledCheckins += scheduledByPatient.get(patientId) ?? 0;
    a.answeredScheduled += answeredScheduledByPatient.get(patientId) ?? 0;
  }

  // Escalations: attribute by assignedToId.
  for (const e of escalations) {
    if (!e.assignedToId) continue;
    const a = getAgg(e.assignedToId);
    a.escalationsTotal += 1;
    if (e.status === "RESOLVED" && e.resolvedAt) {
      a.escalationsResolved += 1;
      const durMs = e.resolvedAt.getTime() - e.createdAt.getTime();
      if (durMs > 0 && durMs < 24 * 3600 * 1000) {
        a.escalationsResolvedWithinSla += 1;
      }
    }
  }

  // AI deteriorations: count runs whose output mentions HIGH or CRITICAL,
  // attributed to the coordinator who owns that check-in's patient.
  for (const run of aiTriageRuns) {
    const out = (run.output || "").toUpperCase();
    if (!out.includes("HIGH") && !out.includes("CRITICAL")) continue;
    const patientId = run.checkinId ? checkinIdToPatientId.get(run.checkinId) : undefined;
    if (!patientId) continue;
    const coordId = patientToCoordinator.get(patientId);
    if (!coordId) continue;
    getAgg(coordId).aiFlaggedDeteriorations += 1;
  }

  // Build the response — only include coordinators who actually have any
  // activity in the last 7 days OR all coordinators if none have activity
  // (so the admin sees the full team even on a quiet week).
  const coordinatorsWithActivity = coordinators.filter((c) => agg.has(c.id));
  const coordinatorsToReport = coordinatorsWithActivity.length > 0 ? coordinatorsWithActivity : coordinators;

  const coordinatorMetrics = coordinatorsToReport.map((c) => {
    const a = agg.get(c.id) ?? {
      patientsManaged: new Set<string>(),
      answeredCheckins: 0,
      scheduledCheckins: 0,
      answeredScheduled: 0,
      escalationsResolved: 0,
      escalationsResolvedWithinSla: 0,
      escalationsTotal: 0,
      aiFlaggedDeteriorations: 0,
    };
    const patientsManaged = a.patientsManaged.size;
    const timePerPatientMin = patientsManaged > 0
      ? Math.round((a.answeredCheckins * MIN_PER_ANSWERED_CHECKIN) / patientsManaged)
      : 0;
    const escalationsResolvedWithinSla = a.escalationsResolved > 0
      ? Math.round((a.escalationsResolvedWithinSla / a.escalationsResolved) * 1000) / 10
      : null;
    const patientResponseRate = a.scheduledCheckins > 0
      ? Math.round((a.answeredScheduled / a.scheduledCheckins) * 1000) / 10
      : null;
    return {
      userId: c.id,
      name: c.name,
      email: c.email,
      role: c.role,
      metrics: {
        patientsManaged,
        timePerPatientMin,
        missedFollowups,
        aiFlaggedDeteriorations: a.aiFlaggedDeteriorations,
        escalationsResolvedWithinSla,
        patientResponseRate,
        // Auxiliary counts the UI may want to show.
        answeredCheckins: a.answeredCheckins,
        scheduledCheckins: a.scheduledCheckins,
        escalationsResolved: a.escalationsResolved,
        escalationsTotal: a.escalationsTotal,
      },
    };
  });

  return Response.json({
    coordinators: coordinatorMetrics,
    weekStart: weekStart.toISOString(),
    weekEnd: weekEnd.toISOString(),
    beforeOjasBaseline: BEFORE_OJAS_BASELINE,
  });
}

export const GET = withErrors(GETImpl);
