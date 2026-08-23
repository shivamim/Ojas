// Ojas — Today's Tasks API. Returns a unified worklist for the coordinator
// combining: (1) follow-up plans scheduled today, (2) check-ins due in next 24h,
// (3) escalations needing acknowledgment, (4) milestones due today/overdue,
// (5) high-alert medication patients needing adherence check.
// All scoped by hospitalId.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { jsonError } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";

type Ctx = { params: Promise<{}> };

async function GETImpl(_req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR", "DOCTOR"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);

  const now = new Date();
  const startOfToday = new Date(now);
  startOfToday.setHours(0, 0, 0, 0);
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);
  const next24h = new Date(now.getTime() + 24 * 3600 * 1000);

  // Run all queries in parallel for speed
  const [
    followUpsToday,
    checkinsDue24h,
    escalationsNeedingAck,
    milestonesDueToday,
    highAlertMedPatients,
  ] = await Promise.all([
    // (1) Follow-up plans scheduled today, not yet completed
    db.followUpPlan.findMany({
      where: {
        hospitalId: user.hospitalId,
        status: "SCHEDULED",
        plannedDate: { gte: startOfToday, lte: endOfToday },
      },
      orderBy: { plannedDate: "asc" },
      take: 20,
      include: { patient: { select: { id: true, fullName: true, surgeryType: true, riskLevel: true } } },
    }),
    // (2) Check-ins scheduled in next 24h, not yet sent/answered
    db.checkin.findMany({
      where: {
        hospitalId: user.hospitalId,
        status: "SCHEDULED",
        scheduledFor: { gte: now, lte: next24h },
      },
      orderBy: { scheduledFor: "asc" },
      take: 20,
      include: { patient: { select: { id: true, fullName: true, surgeryType: true, riskLevel: true } } },
    }),
    // (3) Open escalations not yet acknowledged (acknowledgedAt = null)
    db.escalation.findMany({
      where: {
        hospitalId: user.hospitalId,
        status: { in: ["OPEN", "IN_PROGRESS"] },
        acknowledgedAt: null,
      },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      take: 20,
      include: { patient: { select: { id: true, fullName: true, surgeryType: true, riskLevel: true } } },
    }),
    // (4) Milestones due today or overdue (targetDate <= endOfToday, status=PENDING)
    db.milestone.findMany({
      where: {
        hospitalId: user.hospitalId,
        status: "PENDING",
        targetDate: { lte: endOfToday },
      },
      orderBy: { targetDate: "asc" },
      take: 20,
      include: { patient: { select: { id: true, fullName: true, surgeryType: true, riskLevel: true } } },
    }),
    // (5) Patients with active high-alert medications (separate adherence check)
    db.medication.findMany({
      where: {
        hospitalId: user.hospitalId,
        isHighAlert: true,
        status: "ACTIVE",
      },
      orderBy: { createdAt: "desc" },
      take: 20,
      distinct: ["patientId"],
      include: { patient: { select: { id: true, fullName: true, surgeryType: true, riskLevel: true } } },
    }),
  ]);

  // Compute overdue counts for badges
  const overdueMilestones = milestonesDueToday.filter((m) => new Date(m.targetDate) < startOfToday).length;
  const criticalEscalations = escalationsNeedingAck.filter((e) => e.severity === "CRITICAL").length;

  return Response.json({
    generatedAt: now.toISOString(),
    tasks: {
      followUps: followUpsToday.map((f) => ({
        id: f.id,
        type: "FOLLOW_UP" as const,
        patientId: f.patientId,
        patientName: f.patient.fullName,
        surgeryType: f.patient.surgeryType,
        riskLevel: f.patient.riskLevel,
        title: `${f.mode.replace("_", " ").toLowerCase()} follow-up`,
        subtitle: f.responsibleClinician ? `with ${f.responsibleClinician}` : "No clinician assigned",
        dueAt: f.plannedDate.toISOString(),
        priority: "MEDIUM" as const,
        metadata: { mode: f.mode, notes: f.notes },
      })),
      checkins: checkinsDue24h.map((c) => ({
        id: c.id,
        type: "CHECKIN" as const,
        patientId: c.patientId,
        patientName: c.patient.fullName,
        surgeryType: c.patient.surgeryType,
        riskLevel: c.patient.riskLevel,
        title: "Scheduled WhatsApp check-in",
        subtitle: "Due in next 24h",
        dueAt: c.scheduledFor.toISOString(),
        priority: (c.patient.riskLevel === "HIGH" || c.patient.riskLevel === "CRITICAL" ? "HIGH" : "MEDIUM") as "HIGH" | "MEDIUM",
        metadata: { status: c.status },
      })),
      escalations: escalationsNeedingAck.map((e) => ({
        id: e.id,
        type: "ESCALATION" as const,
        patientId: e.patientId,
        patientName: e.patient.fullName,
        surgeryType: e.patient.surgeryType,
        riskLevel: e.patient.riskLevel,
        title: e.reason || `${e.severity.toLowerCase()} escalation needs acknowledgment`,
        subtitle: `${e.severity} · opened ${e.createdAt.toISOString()}`,
        dueAt: e.createdAt.toISOString(),
        priority: (e.severity === "CRITICAL" ? "CRITICAL" : e.severity === "HIGH" ? "HIGH" : "MEDIUM") as "CRITICAL" | "HIGH" | "MEDIUM",
        metadata: { severity: e.severity, type: e.type },
      })),
      milestones: milestonesDueToday.map((m) => {
        const isOverdue = new Date(m.targetDate) < startOfToday;
        return {
          id: m.id,
          type: "MILESTONE" as const,
          patientId: m.patientId,
          patientName: m.patient.fullName,
          surgeryType: m.patient.surgeryType,
          riskLevel: m.patient.riskLevel,
          title: m.label,
          subtitle: `${m.type.replace("_", " ").toLowerCase()}${isOverdue ? " · overdue" : ""}`,
          dueAt: m.targetDate.toISOString(),
          priority: (isOverdue ? "HIGH" : "MEDIUM") as "HIGH" | "MEDIUM",
          metadata: { milestoneType: m.type, isOverdue },
        };
      }),
      highAlertMeds: highAlertMedPatients.map((med) => ({
        id: med.id,
        type: "HIGH_ALERT_MED" as const,
        patientId: med.patientId,
        patientName: med.patient.fullName,
        surgeryType: med.patient.surgeryType,
        riskLevel: med.patient.riskLevel,
        title: `Verify ${med.name} adherence`,
        subtitle: `${med.dosage} · ${med.frequency} · high-alert`,
        dueAt: null,
        priority: "HIGH" as const,
        metadata: { medicationName: med.name, alertCategory: med.alertCategory },
      })),
    },
    summary: {
      total: followUpsToday.length + checkinsDue24h.length + escalationsNeedingAck.length
        + milestonesDueToday.length + highAlertMedPatients.length,
      followUps: followUpsToday.length,
      checkins: checkinsDue24h.length,
      escalations: escalationsNeedingAck.length,
      criticalEscalations,
      milestones: milestonesDueToday.length,
      overdueMilestones,
      highAlertMeds: highAlertMedPatients.length,
    },
  });
}

export const GET = withErrors(GETImpl);
