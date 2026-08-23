// Ojas — P1.7 Clinical Validation Tracker API.
// Before selling to hospital #2, prove the workflow works. This route computes
// on-the-fly pilot study metrics from real patient/check-in/escalation data,
// and exposes a PATCH for the hospital admin to enter their pre-Ojas baseline.
//
// GET  /api/pilot/metrics        → { pilot: PilotStudy, metrics: {...} }
// PATCH /api/pilot/metrics       → update readmissionRateWithoutOjas
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { withErrors } from "@/lib/api-handler";
import { audit, getClientIp, jsonError } from "@/lib/server-utils";
import { parseBody, pilotMetricsPatchSchema, ValidationError } from "@/lib/validation";

type Ctx = { params: Promise<{}> };

/** Find or create the PilotStudy for a hospital (one per hospital — hospitalId @unique).
 *  On creation, backdate startDate to the hospital's earliest patient enrollment
 *  so existing Ojas-managed patients are included in the pilot cohort. */
async function ensurePilotStudy(hospitalId: string) {
  const existing = await db.pilotStudy.findUnique({ where: { hospitalId } });
  if (existing) return existing;
  // Use the earliest patient createdAt as the pilot start date if any patients exist;
  // otherwise default to now() (Prisma schema default).
  const earliestPatient = await db.patient.findFirst({
    where: { hospitalId, deletedAt: null },
    orderBy: { createdAt: "asc" },
    select: { createdAt: true },
  });
  return db.pilotStudy.create({
    data: {
      hospitalId,
      startDate: earliestPatient?.createdAt ?? new Date(),
      status: "ACTIVE",
    },
  });
}

async function GETImpl(_req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);

  const pilot = await ensurePilotStudy(user.hospitalId);

  // Compute metrics on the fly, scoped to this hospital and since pilot.startDate.
  const since = pilot.startDate;
  const [
    enrolledPatients,
    readmittedPatients,
    activeMedications,
    checkinsAnswered,
    checkinsScheduled,
    escalations,
    escalationsWithAck,
  ] = await Promise.all([
    db.patient.count({
      where: { hospitalId: user.hospitalId, deletedAt: null, createdAt: { gte: since } },
    }),
    db.patient.count({
      where: {
        hospitalId: user.hospitalId, deletedAt: null,
        status: "READMITTED", createdAt: { gte: since },
      },
    }),
    db.medication.findMany({
      where: { hospitalId: user.hospitalId, status: "ACTIVE" },
      select: { id: true, patientId: true },
    }),
    db.checkin.count({
      where: { hospitalId: user.hospitalId, status: "ANSWERED", scheduledFor: { gte: since } },
    }),
    db.checkin.count({
      where: { hospitalId: user.hospitalId, scheduledFor: { gte: since } },
    }),
    db.escalation.findMany({
      where: { hospitalId: user.hospitalId, createdAt: { gte: since } },
      select: { id: true, severity: true, createdAt: true, acknowledgedAt: true },
    }),
    db.escalation.findMany({
      where: {
        hospitalId: user.hospitalId,
        acknowledgedAt: { not: null },
        createdAt: { gte: since },
      },
      select: { acknowledgedAt: true, createdAt: true },
    }),
  ]);

  // Readmission rate (with Ojas): readmitted / total enrolled × 100
  const readmissionRate = enrolledPatients > 0
    ? Math.round((readmittedPatients / enrolledPatients) * 1000) / 10
    : null;

  // Medication adherence rate: of active medications, the share whose patient
  // has at least one Checkin with medsTaken=true / total active medications × 100.
  const activeMedPatientIds = new Set(activeMedications.map((m) => m.patientId));
  const adherentMedPatients = activeMedPatientIds.size > 0
    ? await db.checkin.findMany({
        where: {
          hospitalId: user.hospitalId,
          medsTaken: true,
          patientId: { in: Array.from(activeMedPatientIds) },
        },
        select: { patientId: true },
        distinct: ["patientId"],
      })
    : [];
  const medicationAdherenceRate = activeMedications.length > 0
    ? Math.round((adherentMedPatients.length / activeMedications.length) * 1000) / 10
    : null;

  // Response rate: ANSWERED / total scheduled × 100
  const responseRate = checkinsScheduled > 0
    ? Math.round((checkinsAnswered / checkinsScheduled) * 1000) / 10
    : null;

  // Escalation count by severity
  const escalationCountBySeverity = {
    LOW: escalations.filter((e) => e.severity === "LOW").length,
    MEDIUM: escalations.filter((e) => e.severity === "MEDIUM").length,
    HIGH: escalations.filter((e) => e.severity === "HIGH").length,
    CRITICAL: escalations.filter((e) => e.severity === "CRITICAL").length,
  };

  // Average time-to-coordinator-response: avg(acknowledgedAt - createdAt)
  const ackTimes = escalationsWithAck
    .filter((e) => e.acknowledgedAt && e.createdAt)
    .map((e) => e.acknowledgedAt!.getTime() - e.createdAt.getTime())
    .filter((ms) => ms > 0);
  const timeToCoordinatorResponseMs = ackTimes.length > 0
    ? Math.round(ackTimes.reduce((a, b) => a + b, 0) / ackTimes.length)
    : null;

  // Days elapsed since pilot start
  const daysElapsed = Math.floor(
    (Date.now() - pilot.startDate.getTime()) / 86400000,
  );

  return Response.json({
    pilot: {
      id: pilot.id,
      hospitalId: pilot.hospitalId,
      startDate: pilot.startDate.toISOString(),
      endDate: pilot.endDate?.toISOString() ?? null,
      patientCount: pilot.patientCount,
      controlCount: pilot.controlCount,
      status: pilot.status,
      readmissionRateWithOjas: pilot.readmissionRateWithOjas,
      readmissionRateWithoutOjas: pilot.readmissionRateWithoutOjas,
      medicationAdherenceRate: pilot.medicationAdherenceRate,
      patientSatisfactionScore: pilot.patientSatisfactionScore,
      responseRate: pilot.responseRate,
      escalationCount: pilot.escalationCount,
      notes: pilot.notes,
      createdAt: pilot.createdAt.toISOString(),
      updatedAt: pilot.updatedAt.toISOString(),
    },
    metrics: {
      enrolledPatients,
      readmissionRate,                  // computed live
      medicationAdherenceRate,
      responseRate,
      escalationCountBySeverity,
      timeToCoordinatorResponseMs,
      daysElapsed,
      totalEscalations: escalations.length,
      activeMedications: activeMedications.length,
      checkinsAnswered,
      checkinsScheduled,
    },
  });
}

async function PATCHImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);

  let body: { readmissionRateWithoutOjas: number };
  try {
    body = await parseBody(req, pilotMetricsPatchSchema);
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid body", 400);
  }
  const rate = body.readmissionRateWithoutOjas;

  const pilot = await ensurePilotStudy(user.hospitalId);
  const updated = await db.pilotStudy.update({
    where: { id: pilot.id },
    data: { readmissionRateWithoutOjas: rate },
  });

  await audit({
    hospitalId: user.hospitalId,
    actorId: user.sub,
    action: "PILOT_BASELINE_UPDATED",
    target: `pilot:${pilot.id}`,
    detail: `readmissionRateWithoutOjas=${rate}%`,
    ip: getClientIp(req),
  });

  return Response.json({
    pilot: {
      id: updated.id,
      hospitalId: updated.hospitalId,
      startDate: updated.startDate.toISOString(),
      endDate: updated.endDate?.toISOString() ?? null,
      patientCount: updated.patientCount,
      controlCount: updated.controlCount,
      status: updated.status,
      readmissionRateWithOjas: updated.readmissionRateWithOjas,
      readmissionRateWithoutOjas: updated.readmissionRateWithoutOjas,
      medicationAdherenceRate: updated.medicationAdherenceRate,
      patientSatisfactionScore: updated.patientSatisfactionScore,
      responseRate: updated.responseRate,
      escalationCount: updated.escalationCount,
      notes: updated.notes,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    },
  });
}

export const GET = withErrors(GETImpl);
export const PATCH = withErrors(PATCHImpl);
