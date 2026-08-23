// Ojas — patients API. All queries hospital_id-scoped (tenant isolation).
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireAuth, requireRole, requireTenantAccess } from "@/lib/auth";
import { encryptPII, lookupHash, maskMobile, decryptPII } from "@/lib/crypto";
import { audit, getClientIp, jsonError, rateLimit } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import { parseBody, patientEnrollSchema, ValidationError } from "@/lib/validation";

type Ctx = { params: Promise<{}> };

// GET /api/patients — list (scoped). Supports ?status= & ?q=
async function GETImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireAuth(await getCurrentUser());
  if (user.role === "SUPER_ADMIN") {
    return jsonError("Superadmin uses /api/hospitals/[id]/patients", 400);
  }
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);
  const { searchParams } = new URL(req.url);
  const status = searchParams.get("status");
  const q = searchParams.get("q");
  const where: Record<string, unknown> = { hospitalId: user.hospitalId, deletedAt: null };
  if (status) where.status = status;
  if (q) where.fullName = { contains: q };
  const patients = await db.patient.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return Response.json({
    patients: patients.map((p) => ({
      id: p.id, fullName: p.fullName, age: p.age, gender: p.gender,
      mobileMasked: maskMobile(decryptPII(p.mobileEncrypted)),
      uhid: p.uhid, dateOfBirth: p.dateOfBirth,
      nextOfKinName: p.nextOfKinName,
      surgeryType: p.surgeryType, surgeryDate: p.surgeryDate, dischargeDate: p.dischargeDate,
      status: p.status, lostToFollowupReason: p.lostToFollowupReason,
      dpdpaConsent: p.dpdpaConsent, createdAt: p.createdAt,
      familyOptIn: p.familyOptIn,
      familyName: p.familyName,
      familyRelation: p.familyRelation,
      familyLanguage: p.familyLanguage,
      riskLevel: p.riskLevel,
    })),
  });
}

// POST /api/patients — enroll a new patient. Real persistence (fixes B1).
// DPDPA 2023 consent is captured and stored with a timestamp.
async function POSTImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR", "DOCTOR"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);
  const rl = await rateLimit(`enroll:${user.sub}`, 20, 60);
  if (!rl.allowed) return jsonError("Too many enrollments. Slow down.", 429);

  let body: {
    fullName: string;
    age: number;
    gender: string;
    mobile: string;
    surgeryType: string;
    surgeryDate: string;
    dischargeDate: string;
    comorbidities?: string | null;
    dpdpaConsent: true;
    address?: string | null;
    nextOfKinContact?: string | null;
    nextOfKinName?: string | null;
    uhid?: string | null;
    dateOfBirth?: string | null;
    // Discharge summary fields (N1)
    diagnosis?: string | null;
    proceduresPerformed?: string | null;
    medicationsOnDischarge?: string | null;
    followUpInstructions?: string | null;
    conditionAtDischarge?: string | null;
    dietaryInstructions?: string | null;
    activityRestrictions?: string | null;
    warningSigns?: string | null;
    emergencyContact?: string | null;
    attendingDoctorName?: string | null;
    // Follow-up plan fields (N2)
    followUpPlannedDate?: string | null;
    followUpMode?: "CALL" | "WHATSAPP" | "IN_PERSON" | "TELECONSULT" | null;
    followUpClinician?: string | null;
    followUpNotes?: string | null;
    // ── P0.2: Family Recovery Companion fields ────────────────────────
    familyContact?: string | null;
    familyName?: string | null;
    familyRelation?: "son" | "daughter" | "spouse" | "parent" | "other" | null;
    familyLanguage: "HINGLISH" | "HINDI" | "ENGLISH" | "TAMIL" | "TELUGU" | "MARATHI" | "BENGALI";
    familyOptIn: boolean;
  };
  try {
    body = await parseBody(req, patientEnrollSchema);
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid request body", 400);
  }

  const mobileHash = lookupHash(body.mobile);
  // Check duplicate within hospital
  const existing = await db.patient.findFirst({ where: { hospitalId: user.hospitalId, deletedAt: null, mobileHash } });
  if (existing) return jsonError("A patient with this mobile number is already enrolled", 409);

  const settings = await db.hospitalSettings.findUnique({ where: { hospitalId: user.hospitalId } });
  const recoveryDays = settings?.recoveryWindowDays ?? 14;
  const cadenceHours = settings?.checkinCadenceHours ?? 24;

  const patient = await db.patient.create({
    data: {
      hospitalId: user.hospitalId,
      fullName: body.fullName.trim(),
      age: body.age,
      gender: body.gender || "unspecified",
      mobileEncrypted: encryptPII(body.mobile),
      mobileHash,
      addressEncrypted: body.address ? encryptPII(body.address) : null,
      nextOfKinContactEncrypted: body.nextOfKinContact ? encryptPII(body.nextOfKinContact) : null,
      nextOfKinName: body.nextOfKinName || null,
      uhid: body.uhid || null,
      dateOfBirth: body.dateOfBirth ? new Date(body.dateOfBirth) : null,
      surgeryType: body.surgeryType,
      surgeryDate: new Date(body.surgeryDate),
      dischargeDate: new Date(body.dischargeDate),
      comorbidities: body.comorbidities || null,
      status: "ENROLLED",
      dpdpaConsent: true,
      consentAt: new Date(),
      enrolledById: user.sub,
      // ── P0.2: Family Recovery Companion ──────────────────────────────
      familyContactEncrypted: body.familyContact ? encryptPII(body.familyContact) : null,
      familyContactHash: body.familyContact ? lookupHash(body.familyContact) : null,
      familyName: body.familyName || null,
      familyRelation: body.familyRelation || null,
      familyLanguage: body.familyLanguage || "HINGLISH",
      familyOptIn: !!body.familyOptIn && !!body.familyContact,
    },
  });

  // Generate the check-in schedule for the recovery window.
  const schedule: { scheduledFor: Date }[] = [];
  const start = new Date(patient.dischargeDate);
  start.setHours(10, 0, 0, 0); // 10 AM local
  for (let day = 1; day <= recoveryDays; day++) {
    const d = new Date(start.getTime() + day * cadenceHours * 3600 * 1000);
    schedule.push({ scheduledFor: d });
  }
  await db.checkin.createMany({
    data: schedule.map((s) => ({ hospitalId: user.hospitalId!, patientId: patient.id, scheduledFor: s.scheduledFor })),
  });

  // Auto-generate recovery milestones: use a care pathway template if one
  // exists for this surgery type, otherwise fall back to the built-in defaults.
  const template = await db.carePathwayTemplate.findUnique({
    where: { hospitalId_surgeryType: { hospitalId: user.hospitalId, surgeryType: body.surgeryType } },
  }).catch(() => null);

  let milestones: { type: string; label: string; targetDate: Date }[];
  if (template && template.isActive) {
    // Use the custom template
    const templateMilestones = JSON.parse(template.milestones) as { type: string; label: string; dayOffset: number }[];
    milestones = templateMilestones.map((m) => ({
      type: m.type,
      label: m.label,
      targetDate: new Date(patient.dischargeDate.getTime() + m.dayOffset * 86400000),
    }));
  } else {
    // Fall back to built-in defaults
    milestones = generateMilestonesForSurgery(body.surgeryType, patient.dischargeDate);
  }
  if (milestones.length > 0) {
    await db.milestone.createMany({
      data: milestones.map((m) => ({
        hospitalId: user.hospitalId!, patientId: patient.id,
        type: m.type, label: m.label, targetDate: m.targetDate,
      })),
    });
  }

  // D1: Create purpose-specific ConsentRecords for each consent purpose
  // instead of just the dpdpaConsent boolean
  const consentPurposes = [
    { purpose: "whatsapp_monitoring", version: "1.0" },
    { purpose: "ai_triage", version: "1.0" },
    { purpose: "data_sharing_hospital", version: "1.0" },
  ];
  await db.consentRecord.createMany({
    data: consentPurposes.map((cp) => ({
      patientId: patient.id,
      hospitalId: user.hospitalId!,
      purpose: cp.purpose,
      consentTextVersion: cp.version,
      ip: getClientIp(req),
    })),
  });

  // N1: Create DischargeSummaryRecord if discharge fields are provided
  if (body.diagnosis || body.conditionAtDischarge) {
    await db.dischargeSummaryRecord.create({
      data: {
        hospitalId: user.hospitalId!,
        patientId: patient.id,
        diagnosis: body.diagnosis || body.surgeryType,
        proceduresPerformed: body.proceduresPerformed || null,
        medicationsOnDischarge: body.medicationsOnDischarge || null,
        followUpInstructions: body.followUpInstructions || null,
        conditionAtDischarge: body.conditionAtDischarge || "Stable",
        dietaryInstructions: body.dietaryInstructions || null,
        activityRestrictions: body.activityRestrictions || null,
        warningSigns: body.warningSigns || null,
        emergencyContact: body.emergencyContact || null,
        attendingDoctorName: body.attendingDoctorName || null,
      },
    });
  }

  // N2: Create FollowUpPlan if follow-up info is provided
  if (body.followUpPlannedDate && body.followUpMode) {
    const validModes = ["CALL", "WHATSAPP", "IN_PERSON", "TELECONSULT"];
    if (validModes.includes(body.followUpMode)) {
      await db.followUpPlan.create({
        data: {
          hospitalId: user.hospitalId!,
          patientId: patient.id,
          plannedDate: new Date(body.followUpPlannedDate),
          mode: body.followUpMode,
          responsibleClinician: body.followUpClinician || null,
          notes: body.followUpNotes || null,
          status: "SCHEDULED",
        },
      });
    }
  }

  // Auto-create a default discharge checklist
  const defaultChecklist = [
    { item: "Discharge summary printed and handed to patient", category: "DISCHARGE_SUMMARY" },
    { item: "Medications reviewed and prescription handed over", category: "MEDICATION_REVIEW" },
    { item: "Follow-up appointment booked", category: "FOLLOW_UP_BOOKED" },
    { item: "Transport arranged", category: "TRANSPORT" },
    { item: "Family/caregiver briefed on care instructions", category: "FAMILY_BRIEFED" },
    { item: "DPDPA 2023 consent captured", category: "DPDPA_CONSENT" },
    { item: "Emergency contact number shared", category: "OTHER" },
  ];
  await db.dischargeChecklist.createMany({
    data: defaultChecklist.map((c) => ({
      hospitalId: user.hospitalId!, patientId: patient.id,
      item: c.item, category: c.category,
    })),
  });

  await db.timelineEvent.create({
    data: {
      hospitalId: user.hospitalId!, patientId: patient.id,
      eventType: "ENROLLMENT", title: "Patient enrolled",
      detail: `${body.fullName} enrolled post-${body.surgeryType}. Recovery window: ${recoveryDays} days. ${schedule.length} check-ins scheduled.`,
      actorId: user.sub, occurredAt: new Date(),
    },
  });
  await audit({
    hospitalId: user.hospitalId!, actorId: user.sub, action: "patient.enroll",
    target: patient.id, detail: `Enrolled ${body.fullName} (${body.surgeryType})`,
    ip: getClientIp(req),
  });

  // Auto-run AI risk stratification at enrollment (real LLM call).
  // Non-blocking — if it fails, the patient is still enrolled; coordinator
  // can re-run from the patient detail page.
  let riskAssessment: {
    riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    riskScore: number;
    fallbackUsed: boolean;
  } | null = null;
  try {
    const { runRiskStratificationAgent } = await import("@/lib/ai-agents");
    const riskResult = await runRiskStratificationAgent(
      {
        patientName: patient.fullName,
        age: patient.age,
        gender: patient.gender,
        surgeryType: patient.surgeryType,
        comorbidities: patient.comorbidities,
      },
      { hospitalId: user.hospitalId, patientId: patient.id }
    );
    // Persist the risk assessment on the patient record
    await db.patient.update({
      where: { id: patient.id },
      data: {
        riskLevel: riskResult.output.riskLevel,
        riskScore: riskResult.output.riskScore,
        riskAssessedAt: new Date(),
      },
    });
    riskAssessment = {
      riskLevel: riskResult.output.riskLevel,
      riskScore: riskResult.output.riskScore,
      fallbackUsed: riskResult.fallbackUsed,
    };

    // Risk-based check-in frequency: for HIGH or CRITICAL risk patients,
    // add extra check-ins (twice daily for the first 7 days, at 10am and 6pm).
    if (riskResult.output.riskLevel === "HIGH" || riskResult.output.riskLevel === "CRITICAL") {
      const extraCheckins: { scheduledFor: Date; hospitalId: string; patientId: string }[] = [];
      const start = new Date(patient.dischargeDate);
      start.setHours(18, 0, 0, 0); // 6 PM for the second daily check-in
      for (let day = 1; day <= 7; day++) {
        const d = new Date(start.getTime() + day * 24 * 3600 * 1000);
        extraCheckins.push({ scheduledFor: d, hospitalId: user.hospitalId, patientId: patient.id });
      }
      if (extraCheckins.length > 0) {
        await db.checkin.createMany({ data: extraCheckins });
        schedule.push(...extraCheckins.map((s) => ({ scheduledFor: s.scheduledFor })));
        await db.timelineEvent.create({
          data: {
            hospitalId: user.hospitalId, patientId: patient.id,
            eventType: "RISK_FREQUENCY_ADJUSTMENT", title: `Check-in frequency increased (${riskResult.output.riskLevel} risk)`,
            detail: `Added ${extraCheckins.length} extra check-ins (6 PM daily for 7 days) due to ${riskResult.output.riskLevel} readmission risk.`,
            actorId: user.sub, occurredAt: new Date(),
          },
        });
      }
    }
  } catch {
    // Non-blocking — patient enrollment succeeds even if risk stratification fails
  }

  return Response.json({
    patient, checkinsScheduled: schedule.length, milestonesCreated: milestones.length,
    riskAssessment,
  }, { status: 201 });
}

// Generate surgery-specific recovery milestones. Based on common post-op
// protocols for major surgery types. Real clinical guidance, not a stub.
function generateMilestonesForSurgery(surgeryType: string, dischargeDate: Date): {
  type: string; label: string; targetDate: Date;
}[] {
  const surgery = surgeryType.toLowerCase();
  const milestones: { type: string; label: string; targetDate: Date }[] = [];
  const addDays = (days: number) => new Date(dischargeDate.getTime() + days * 86400000);

  // Common milestones for all major surgeries
  milestones.push({
    type: "WOUND_CHECK",
    label: "Initial wound check",
    targetDate: addDays(3),
  });

  if (surgery.includes("bypass") || surgery.includes("cardiac")) {
    milestones.push(
      { type: "FIRST_WALK", label: "First assisted walk", targetDate: addDays(1) },
      { type: "WOUND_CHECK", label: "Sternum check", targetDate: addDays(7) },
      { type: "PHYSIOTHERAPY", label: "Cardiac rehab session 1", targetDate: addDays(5) },
      { type: "FOLLOW_UP", label: "Cardiology follow-up", targetDate: addDays(14) },
    );
  } else if (surgery.includes("knee") || surgery.includes("hip")) {
    milestones.push(
      { type: "FIRST_WALK", label: "First walk with walker", targetDate: addDays(1) },
      { type: "PHYSIOTHERAPY", label: "PT session 1", targetDate: addDays(2) },
      { type: "PHYSIOTHERAPY", label: "Range of motion assessment", targetDate: addDays(10) },
      { type: "FOLLOW_UP", label: "Orthopedic follow-up", targetDate: addDays(14) },
    );
  } else if (surgery.includes("caesarean") || surgery.includes("cesarean") || surgery.includes("c-section")) {
    milestones.push(
      { type: "FIRST_WALK", label: "First walk post-delivery", targetDate: addDays(1) },
      { type: "DRESSING_CHANGE", label: "Dressing change", targetDate: addDays(5) },
      { type: "SUTURE_REMOVAL", label: "Suture removal", targetDate: addDays(7) },
      { type: "FOLLOW_UP", label: "Obstetric follow-up", targetDate: addDays(14) },
    );
  } else if (surgery.includes("cholecystectomy") || surgery.includes("appendectomy") || surgery.includes("laparoscopic")) {
    milestones.push(
      { type: "FIRST_WALK", label: "First walk", targetDate: addDays(1) },
      { type: "WOUND_CHECK", label: "Port site check", targetDate: addDays(5) },
      { type: "SUTURE_REMOVAL", label: "Suture/staple removal", targetDate: addDays(7) },
      { type: "FOLLOW_UP", label: "Surgical follow-up", targetDate: addDays(10) },
    );
  } else if (surgery.includes("prostatectomy") || surgery.includes("urolog")) {
    milestones.push(
      { type: "FIRST_WALK", label: "First walk", targetDate: addDays(1) },
      { type: "WOUND_CHECK", label: "Incision check", targetDate: addDays(5) },
      { type: "FOLLOW_UP", label: "Urology follow-up + catheter review", targetDate: addDays(10) },
    );
  } else if (surgery.includes("hernia")) {
    milestones.push(
      { type: "FIRST_WALK", label: "First walk (no straining)", targetDate: addDays(1) },
      { type: "WOUND_CHECK", label: "Mesh site check", targetDate: addDays(5) },
      { type: "FOLLOW_UP", label: "Surgical follow-up", targetDate: addDays(10) },
    );
  } else if (surgery.includes("cataract")) {
    milestones.push(
      { type: "FOLLOW_UP", label: "Eye check + drop review", targetDate: addDays(1) },
      { type: "FOLLOW_UP", label: "Vision assessment", targetDate: addDays(7) },
    );
  } else {
    // Generic milestones for other/unknown surgeries
    milestones.push(
      { type: "FIRST_WALK", label: "First walk", targetDate: addDays(1) },
      { type: "DRESSING_CHANGE", label: "Dressing change", targetDate: addDays(5) },
      { type: "FOLLOW_UP", label: "Surgical follow-up", targetDate: addDays(10) },
    );
  }

  return milestones;
}

export const GET = withErrors(GETImpl);

export const POST = withErrors(POSTImpl);
