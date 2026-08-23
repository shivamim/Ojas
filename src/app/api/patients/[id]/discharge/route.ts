// Ojas — Patient discharge summary API. Returns a structured discharge
// summary suitable for printing/PDF export. Real data only — no fabrication.
// N1: Includes DischargeSummaryRecord data.
// N2: Includes FollowUpPlan data.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireAuth, requireTenantAccess } from "@/lib/auth";
import { decryptPII, maskMobile } from "@/lib/crypto";
import { withErrors } from "@/lib/api-handler";
import { jsonError } from "@/lib/server-utils";

type Ctx = { params: Promise<{ id: string }> };

async function GETImpl(_req: NextRequest, ctx: Ctx) {
  const user = requireAuth(await getCurrentUser());
  const { id } = await ctx.params;
  const patient = await db.patient.findUnique({
    where: { id },
    include: {
      checkins: { orderBy: { scheduledFor: "asc" } },
      escalations: { orderBy: { createdAt: "desc" } },
      timelineEvents: { orderBy: { occurredAt: "desc" }, take: 20 },
      hospital: { select: { name: true, city: true, nabhLevel: true, nabhAccreditationLevel: true } },
      dischargeSummary: true,
      followUpPlans: { orderBy: { plannedDate: "asc" } },
      consentRecords: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!patient) return jsonError("Patient not found", 404);
  await requireTenantAccess(user, patient.hospitalId);

  const answered = patient.checkins.filter((c) => c.status === "ANSWERED");
  const missed = patient.checkins.filter((c) => c.status === "MISSED");
  const scheduled = patient.checkins.length;
  const painValues = answered.map((c) => c.painLevel).filter((p): p is number => p !== null);
  const tempValues = answered.map((c) => c.temperature).filter((t): t is number => t !== null);
  const recoveryDay = Math.max(1, Math.ceil((Date.now() - patient.dischargeDate.getTime()) / 86400000));
  const openEscalations = patient.escalations.filter((e) => e.status !== "RESOLVED");

  // N1: DischargeSummaryRecord data
  const dischargeSummary = patient.dischargeSummary ? {
    diagnosis: patient.dischargeSummary.diagnosis,
    proceduresPerformed: patient.dischargeSummary.proceduresPerformed,
    medicationsOnDischarge: patient.dischargeSummary.medicationsOnDischarge,
    followUpInstructions: patient.dischargeSummary.followUpInstructions,
    conditionAtDischarge: patient.dischargeSummary.conditionAtDischarge,
    dietaryInstructions: patient.dischargeSummary.dietaryInstructions,
    activityRestrictions: patient.dischargeSummary.activityRestrictions,
    warningSigns: patient.dischargeSummary.warningSigns,
    emergencyContact: patient.dischargeSummary.emergencyContact,
    attendingDoctorName: patient.dischargeSummary.attendingDoctorName,
  } : null;

  // N2: FollowUpPlan data
  const followUpPlans = patient.followUpPlans.map((fup) => ({
    id: fup.id,
    plannedDate: fup.plannedDate,
    mode: fup.mode,
    responsibleClinician: fup.responsibleClinician,
    notes: fup.notes,
    status: fup.status,
    completedAt: fup.completedAt,
  }));

  // D1: Active consent records
  const activeConsents = patient.consentRecords
    .filter((cr) => cr.revokedAt === null)
    .map((cr) => ({
      purpose: cr.purpose,
      consentTextVersion: cr.consentTextVersion,
      grantedAt: cr.grantedAt,
    }));

  const summary = {
    hospital: {
      name: patient.hospital.name,
      city: patient.hospital.city,
      nabhLevel: patient.hospital.nabhLevel,
      nabhAccreditationLevel: patient.hospital.nabhAccreditationLevel,
    },
    patient: {
      fullName: patient.fullName,
      age: patient.age,
      gender: patient.gender,
      mobileMasked: maskMobile(decryptPII(patient.mobileEncrypted)),
      surgeryType: patient.surgeryType,
      surgeryDate: patient.surgeryDate,
      dischargeDate: patient.dischargeDate,
      comorbidities: patient.comorbidities,
      status: patient.status,
      lostToFollowupReason: patient.lostToFollowupReason,
      dpdpaConsent: patient.dpdpaConsent,
      consentAt: patient.consentAt,
      uhid: patient.uhid,
      dateOfBirth: patient.dateOfBirth,
      recoveryDay,
    },
    // N1: Structured discharge summary record
    dischargeSummary,
    // N2: Follow-up plan records
    followUpPlans,
    // D1: Consent records
    activeConsents,
    recovery: {
      totalCheckinsScheduled: scheduled,
      checkinsAnswered: answered.length,
      checkinsMissed: missed.length,
      responseRate: scheduled > 0 ? Math.round((answered.length / scheduled) * 1000) / 10 : null,
      avgPain: painValues.length > 0 ? Math.round((painValues.reduce((a, b) => a + b, 0) / painValues.length) * 10) / 10 : null,
      maxPain: painValues.length > 0 ? Math.max(...painValues) : null,
      latestPain: painValues.length > 0 ? painValues[painValues.length - 1] : null,
      maxTemp: tempValues.length > 0 ? Math.max(...tempValues) : null,
      feverEpisodes: tempValues.filter((t) => t >= 38).length,
    },
    escalations: {
      total: patient.escalations.length,
      open: openEscalations.length,
      resolved: patient.escalations.filter((e) => e.status === "RESOLVED").length,
      critical: patient.escalations.filter((e) => e.severity === "CRITICAL").length,
      items: patient.escalations.slice(0, 10).map((e) => ({
        severity: e.severity,
        status: e.status,
        type: e.type,
        reason: e.reason.slice(0, 200),
        createdAt: e.createdAt,
        acknowledgedAt: e.acknowledgedAt,
        resolvedAt: e.resolvedAt,
        resolution: e.resolution,
      })),
    },
    timeline: patient.timelineEvents.map((t) => ({
      eventType: t.eventType,
      title: t.title,
      detail: t.detail,
      occurredAt: t.occurredAt,
    })),
    generatedAt: new Date().toISOString(),
    disclaimer: "This discharge summary is generated from real check-in and escalation records in the Ojas post-discharge care system. AI triage outputs are decision support, not clinical diagnoses.",
  };

  return Response.json({ summary });
}

export const GET = withErrors(GETImpl);
