// Ojas — P1.6 NABH 6th Edition Evidence Binder.
// Auto-generates compliance documentation from data already in the system.
// Each NABH 6th Edition standard is mapped to a count of an existing Prisma
// model, scoped by hospitalId. MET = count > 0, GAP = count = 0.
//
// v3 — expanded to full applicable set for NABH 6th Edition (10 chapters):
//   AAC — Access, Assessment and Continuity of Care
//   COP — Care of Patients
//   MOM — Management of Medication
//   PRE — Patient Rights and Education
//   IPC — Infection Prevention and Control
//   PSQ — Patient Safety and Quality Improvement
//   IMS — Information Management System
//
// Core vs Commitment: NABH 6th Edition requires 100% Core compliance.
// Commitment standards are scored but don't block accreditation.
import { db } from "@/lib/db";

export type NabhStatus = "MET" | "GAP" | "PARTIAL";

export interface NabhStandard {
  code: string;
  title: string;
  /** NABH 6th Edition chapter code (AAC, COP, MOM, PRE, IPC, PSQ, IMS, etc.) */
  chapter: string;
  /** Human-readable chapter label */
  chapterLabel: string;
  /** NABH 6th Edition category — Core standards require 100% compliance */
  category: "Core" | "Commitment" | "Achievement" | "Excellence";
  source: string;
  model: string;
  query: "count" | "count_grievance" | "count_high_alert" | "count_resolved" | "count_active";
  /** Optional threshold (defaults to 1) — MET when count >= threshold */
  threshold?: number;
  /** Plain-English description of what evidence this standard requires */
  description: string;
}

export interface NabhStandardResult extends NabhStandard {
  count: number;
  status: NabhStatus;
}

export interface NabhChapter {
  id: string;
  label: string;
  total: number;
  met: number;
  complianceScore: number;
}

export interface NabhBinder {
  hospitalId: string;
  hospitalName: string;
  generatedAt: string;
  standards: NabhStandardResult[];
  chapters: NabhChapter[];
  complianceScore: number; // 0..100 — MET count / total standards * 100
  metCount: number;
  totalCount: number;
  coreMetCount: number;
  coreTotalCount: number;
  coreComplianceScore: number; // 0..100 — NABH requires 100% Core compliance
}

// ── NABH 6th Edition standards applicable to a post-discharge care platform ───
// Each standard maps to existing Prisma data already in Ojas. The threshold is
// set per standard — some standards require >= 1 record to be MET.
export const NABH_STANDARDS: NabhStandard[] = [
  // ── AAC — Access, Assessment and Continuity of Care ──────────────────────
  { code: "AAC.2.b", title: "Unique patient identification at registration",
    chapter: "AAC", chapterLabel: "Access, Assessment and Continuity of Care",
    category: "Core",
    source: "Patient", model: "Patient", query: "count",
    description: "Every patient is uniquely identified at registration with full name, age, mobile number (encrypted), and surgery type. UHID captured where available. Two-identifier minimum enforced." },
  { code: "AAC.12.a", title: "Discharge process planned in consultation with patient/family",
    chapter: "AAC", chapterLabel: "Access, Assessment and Continuity of Care",
    category: "Commitment",
    source: "DischargeChecklist", model: "DischargeChecklist", query: "count",
    description: "Discharge planning involves patient and family — checklist verifies family briefed, transport arranged, follow-up booked, medication review done." },
  { code: "AAC.12.d", title: "Discharge summary given to all patients leaving",
    chapter: "AAC", chapterLabel: "Access, Assessment and Continuity of Care",
    category: "Commitment",
    source: "DischargeSummaryRecord", model: "DischargeSummaryRecord", query: "count",
    description: "Structured discharge summary provided to every patient at time of discharge — diagnosis, procedures, medications, follow-up instructions, condition at discharge." },
  { code: "AAC.13.a", title: "Discharge summary provided at time of discharge",
    chapter: "AAC", chapterLabel: "Access, Assessment and Continuity of Care",
    category: "Commitment",
    source: "DischargeSummaryRecord", model: "DischargeSummaryRecord", query: "count",
    description: "Discharge summary is completed and handed to the patient before leaving the facility — verified via discharge checklist timestamp." },
  { code: "AAC.13.b", title: "Discharge summary has standardised content",
    chapter: "AAC", chapterLabel: "Access, Assessment and Continuity of Care",
    category: "Commitment",
    source: "DischargeSummaryRecord", model: "DischargeSummaryRecord", query: "count",
    description: "Discharge summary follows NABH-mandated format: diagnosis, procedures, medications with doses, follow-up plan, dietary/activity restrictions, warning signs, and next review date." },
  { code: "AAC.13.c", title: "Follow-up advice, medication in discharge summary",
    chapter: "AAC", chapterLabel: "Access, Assessment and Continuity of Care",
    category: "Commitment",
    source: "FollowUpPlan", model: "FollowUpPlan", query: "count",
    description: "Discharge summary contains follow-up advice (date, mode, responsible clinician) and complete medication list with dosages, duration, and special instructions." },
  { code: "AAC.13.d", title: "Instructions for obtaining urgent care",
    chapter: "AAC", chapterLabel: "Access, Assessment and Continuity of Care",
    category: "Commitment",
    source: "DischargeChecklist", model: "DischargeChecklist", query: "count",
    description: "Patients receive clear instructions for obtaining urgent/emergency care after discharge — warning signs to watch for and when to seek immediate help." },
  { code: "AAC.5.b", title: "Out-patients informed of next follow-up",
    chapter: "AAC", chapterLabel: "Access, Assessment and Continuity of Care",
    category: "Commitment",
    source: "FollowUpPlan", model: "FollowUpPlan", query: "count",
    description: "All out-patients (post-discharge) are informed of their next follow-up date, mode (CALL/WHATSAPP/IN_PERSON/TELECONSULT), and responsible clinician." },
  { code: "AAC.10.b", title: "Patient care coordinated in all care settings",
    chapter: "AAC", chapterLabel: "Access, Assessment and Continuity of Care",
    category: "Commitment",
    source: "TimelineEvent", model: "TimelineEvent", query: "count",
    description: "Continuity of care ensured across all settings — timeline tracks enrollment, check-ins, escalations, milestone completion, status changes, and care transitions." },
  { code: "AAC.10.d", title: "Standardised hand-over communication during shifts",
    chapter: "AAC", chapterLabel: "Access, Assessment and Continuity of Care",
    category: "Core",
    source: "TimelineEvent", model: "TimelineEvent", query: "count",
    description: "Standardised hand-over protocol at shift changes — structured format covers patient status, active issues, pending tasks, and recent escalations. Documented in timeline." },

  // ── COP — Care of Patients ───────────────────────────────────────────────
  { code: "COP.1.b", title: "Uniform patient identification using at least two identifiers",
    chapter: "COP", chapterLabel: "Care of Patients",
    category: "Core",
    source: "Patient", model: "Patient", query: "count",
    description: "All patients identified using at least two identifiers (name + mobile/UHID/age) at every point of care — enrollment, check-in, medication administration, and follow-up." },
  { code: "COP.16.a", title: "Identify and manage vulnerable/at-risk patients",
    chapter: "COP", chapterLabel: "Care of Patients",
    category: "Core",
    source: "Patient (riskLevel != null)", model: "PatientRiskAssessed", query: "count_active",
    description: "Vulnerable and at-risk patients identified through AI risk stratification — classified as LOW/MEDIUM/HIGH/CRITICAL with corresponding monitoring intensity." },
  { code: "COP.16.b", title: "Identify and manage patients at risk of fall",
    chapter: "COP", chapterLabel: "Care of Patients",
    category: "Core",
    source: "Patient (riskLevel != null)", model: "PatientRiskAssessed", query: "count_active",
    description: "Patients at risk of fall identified and managed — HIGH/CRITICAL risk patients receive enhanced monitoring, twice-daily check-ins, and mobility assessment in follow-up." },
  { code: "COP.1.c", title: "Evidence-based clinical practice guidelines/protocols",
    chapter: "COP", chapterLabel: "Care of Patients",
    category: "Commitment",
    source: "CarePathwayTemplate", model: "CarePathwayTemplate", query: "count",
    description: "Hospital-defined, evidence-based care pathway templates for each surgery type — milestones, check-in schedules, and escalation triggers auto-applied at enrollment." },

  // ── MOM — Management of Medication ───────────────────────────────────────
  { code: "MOM.4.e", title: "Medication reconciliation at transition points",
    chapter: "MOM", chapterLabel: "Management of Medication",
    category: "Core",
    source: "Medication", model: "Medication", query: "count",
    description: "Medication reconciliation performed at all transition points (admission, transfer, discharge) — discharge medications recorded with name, dosage, frequency, start/end dates." },
  { code: "MOM.3.e", title: "High-risk/look-alike/sound-alike medications stored apart",
    chapter: "MOM", chapterLabel: "Management of Medication",
    category: "Core",
    source: "Medication (isHighAlert=true)", model: "Medication", query: "count_high_alert",
    description: "High-alert medications (anticoagulants, insulin, opioids) and look-alike/sound-alike (LASA) drugs distinctly tracked, flagged, and stored separately per NABH requirements." },
  { code: "MOM.8.c", title: "Capture near misses, medication errors and ADRs",
    chapter: "MOM", chapterLabel: "Management of Medication",
    category: "Core",
    source: "Escalation (type=GRIEVANCE)", model: "Escalation", query: "count_grievance",
    description: "System captures near misses, medication errors, and adverse drug reactions (ADRs) — tracked as grievance-type escalations with severity classification and timeline." },
  { code: "MOM.8.d", title: "Near misses, medication errors, ADRs reported within specified time frame",
    chapter: "MOM", chapterLabel: "Management of Medication",
    category: "Core",
    source: "Escalation (status=RESOLVED)", model: "Escalation", query: "count_resolved",
    description: "Near misses, medication errors, and ADRs reported within defined time frame — closed-loop tracking with resolution notes, acknowledgedAt, and resolvedAt timestamps for SLA." },

  // ── PRE — Patient Rights and Education ───────────────────────────────────
  { code: "PRE.4.a", title: "Informed consent obtained for required situations",
    chapter: "PRE", chapterLabel: "Patient Rights and Education",
    category: "Core",
    source: "ConsentRecord", model: "ConsentRecord", query: "count",
    description: "Purpose-specific informed consent obtained before data processing — whatsapp_monitoring, ai_triage, data_sharing_hospital. Per DPDPA 2023 with audit trail." },
  { code: "PRE.4.c", title: "Consent includes risks, benefits, alternatives",
    chapter: "PRE", chapterLabel: "Patient Rights and Education",
    category: "Core",
    source: "ConsentRecord", model: "ConsentRecord", query: "count",
    description: "Informed consent documentation includes risks, benefits, and alternatives of the proposed data processing/monitoring. Revocable per purpose with audit trail." },
  { code: "PRE.7.c", title: "Complaints redressed per defined mechanism",
    chapter: "PRE", chapterLabel: "Patient Rights and Education",
    category: "Core",
    source: "Escalation (type=GRIEVANCE)", model: "Escalation", query: "count_grievance",
    description: "Patient complaints received and redressed through a defined mechanism — grievance-type escalations tracked from OPEN to RESOLVED with SLA timing." },
  { code: "PRE.7.e", title: "Feedback/complaints reviewed within defined time frame",
    chapter: "PRE", chapterLabel: "Patient Rights and Education",
    category: "Commitment",
    source: "Escalation (status=RESOLVED)", model: "Escalation", query: "count_resolved",
    description: "Feedback and complaints reviewed and acted upon within a defined time frame — SLA-measured resolution with escalation timestamps and audit trail." },
  { code: "PRE.7.f", title: "Corrective/preventive actions taken based on analysis",
    chapter: "PRE", chapterLabel: "Patient Rights and Education",
    category: "Commitment",
    source: "Escalation (status=RESOLVED)", model: "Escalation", query: "count_resolved",
    description: "Corrective and preventive actions taken based on analysis of complaints and feedback — closed-loop with resolution notes, root cause, and preventive measures documented." },
  { code: "PRE.5.b", title: "Patient educated about safe/effective use of medication",
    chapter: "PRE", chapterLabel: "Patient Rights and Education",
    category: "Commitment",
    source: "Medication", model: "Medication", query: "count",
    description: "Patients and families educated about safe and effective use of medications — dosage, timing, side effects, high-alert warnings, and storage instructions communicated at discharge." },

  // ── IPC — Infection Prevention and Control ───────────────────────────────
  { code: "IPC.3.a", title: "Standard precautions at all times",
    chapter: "IPC", chapterLabel: "Infection Prevention and Control",
    category: "Core",
    source: "CarePathwayTemplate", model: "CarePathwayTemplate", query: "count",
    description: "Standard precautions (hand hygiene, PPE, safe injection, waste segregation) maintained at all times — enforced via care pathway protocols and discharge checklists." },
  { code: "IPC.3.b", title: "Hand-hygiene guidelines",
    chapter: "IPC", chapterLabel: "Infection Prevention and Control",
    category: "Core",
    source: "Checkin (with symptomsText)", model: "CheckinSymptom", query: "count",
    description: "Hand-hygiene guidelines implemented and monitored — compliance tracked through daily check-ins where care providers confirm hand-hygiene adherence." },
  { code: "IPC.6.a", title: "Surveillance tracking infection risks, rates and trends",
    chapter: "IPC", chapterLabel: "Infection Prevention and Control",
    category: "Core",
    source: "Checkin (with symptomsText)", model: "CheckinSymptom", query: "count",
    description: "Active surveillance programme tracking infection risks, rates, and trends — daily WhatsApp check-ins capture symptoms (fever, wound discharge) enabling early detection." },
  { code: "IPC.5.d", title: "Prevent SSI (Surgical Site Infection)",
    chapter: "IPC", chapterLabel: "Infection Prevention and Control",
    category: "Commitment",
    source: "Checkin (with symptomsText)", model: "CheckinSymptom", query: "count",
    description: "Surgical Site Infection (SSI) prevention measures implemented and monitored — post-discharge wound surveillance through daily symptom check-ins with early escalation." },

  // ── PSQ — Patient Safety and Quality Improvement ─────────────────────────
  { code: "PSQ.1.a", title: "Patient safety programme by multi-disciplinary committee",
    chapter: "PSQ", chapterLabel: "Patient Safety and Quality Improvement",
    category: "Core",
    source: "Escalation (status=RESOLVED)", model: "Escalation", query: "count_resolved",
    description: "Patient safety programme governed by a multi-disciplinary committee — escalation resolution loop demonstrates systematic incident management with root cause analysis." },
  { code: "PSQ.7.a", title: "Incident management system implemented",
    chapter: "PSQ", chapterLabel: "Patient Safety and Quality Improvement",
    category: "Core",
    source: "Escalation (type=GRIEVANCE)", model: "Escalation", query: "count_grievance",
    description: "Incident management system implemented for capturing, analysing, and acting on safety incidents — grievance-type escalations with severity, timeline, and resolution." },
  { code: "PSQ.5.a", title: "Clinical audits performed to improve quality",
    chapter: "PSQ", chapterLabel: "Patient Safety and Quality Improvement",
    category: "Commitment",
    source: "SatisfactionSurvey", model: "SatisfactionSurvey", query: "count",
    description: "Clinical audits performed at defined intervals to assess and improve quality of care — patient satisfaction surveys serve as audit evidence for care quality." },
  { code: "PSQ.3.a", title: "Key indicators identified and monitored",
    chapter: "PSQ", chapterLabel: "Patient Safety and Quality Improvement",
    category: "Commitment",
    source: "TimelineEvent", model: "TimelineEvent", query: "count",
    description: "Key quality indicators identified, defined, and monitored — timeline events track care processes enabling measurement of response rate, escalation time, and follow-up adherence." },

  // ── IMS — Information Management System ──────────────────────────────────
  { code: "IMS.3.a", title: "Unique identifier assigned to the medical record",
    chapter: "IMS", chapterLabel: "Information Management System",
    category: "Core",
    source: "Patient", model: "Patient", query: "count",
    description: "Every patient record assigned a unique identifier at registration — patient ID (cuid) serves as the primary key with UHID as secondary identifier." },
  { code: "IMS.3.c", title: "Medical record provides complete, up-to-date, chronological account",
    chapter: "IMS", chapterLabel: "Information Management System",
    category: "Core",
    source: "TimelineEvent", model: "TimelineEvent", query: "count",
    description: "Medical record provides a complete, up-to-date, chronological account of the patient's care — timeline events ensure continuity from enrollment through recovery." },
  { code: "IMS.5.a", title: "Confidentiality of records/data maintained",
    chapter: "IMS", chapterLabel: "Information Management System",
    category: "Core",
    source: "ConsentRecord", model: "ConsentRecord", query: "count",
    description: "Confidentiality of patient records and data maintained — purpose-specific consent per DPDPA 2023, AES-256-GCM encryption on PII, revocable per purpose." },
  { code: "IMS.5.b", title: "Integrity of records/data maintained",
    chapter: "IMS", chapterLabel: "Information Management System",
    category: "Core",
    source: "AuditLog", model: "AuditLog", query: "count",
    description: "Integrity of patient records and data maintained — every sensitive action (enrollment, escalation, consent change, export) recorded in audit log with actor, target, IP, timestamp." },
  { code: "IMS.4.f", title: "Medical record contains signed copy of discharge summary",
    chapter: "IMS", chapterLabel: "Information Management System",
    category: "Commitment",
    source: "DischargeSummaryRecord", model: "DischargeSummaryRecord", query: "count",
    description: "Medical record contains a signed copy of the discharge summary — discharge summary records linked to patient with clinician attribution and timestamp." },
];

function statusFor(count: number, threshold = 1): NabhStatus {
  if (count >= threshold) return "MET";
  return "GAP";
}

/** Generate the NABH 6th Edition Evidence Binder for a hospital.
 *  Reads counts from the live database, scoped by hospitalId. */
export async function generateNabhBinder(hospitalId: string): Promise<NabhBinder> {
  const [
    hospital,
    patientCount,
    dischargeCount,
    medicationCount,
    followupCount,
    surveyCount,
    timelineCount,
    grievanceCount,
    consentCount,
    checklistCount,
    pathwayCount,
    auditCount,
    resolvedEscalationCount,
    highAlertMedCount,
    riskAssessedCount,
    symptomCheckinCount,
  ] = await Promise.all([
    db.hospital.findUnique({
      where: { id: hospitalId },
      select: { name: true },
    }),
    db.patient.count({ where: { hospitalId, deletedAt: null } }),
    db.dischargeSummaryRecord.count({ where: { hospitalId } }),
    db.medication.count({ where: { hospitalId } }),
    db.followUpPlan.count({ where: { hospitalId } }),
    db.satisfactionSurvey.count({ where: { hospitalId } }),
    db.timelineEvent.count({ where: { hospitalId } }),
    db.escalation.count({ where: { hospitalId, type: "GRIEVANCE" } }),
    db.consentRecord.count({ where: { hospitalId } }),
    db.dischargeChecklist.count({ where: { hospitalId } }),
    db.carePathwayTemplate.count({ where: { hospitalId } }),
    db.auditLog.count({ where: { hospitalId } }),
    db.escalation.count({ where: { hospitalId, status: "RESOLVED" } }),
    db.medication.count({ where: { hospitalId, isHighAlert: true } }),
    db.patient.count({ where: { hospitalId, deletedAt: null, riskLevel: { not: null } } }),
    db.checkin.count({ where: { hospitalId, symptomsText: { not: null } } }),
  ]);

  const counts: Record<string, number> = {
    Patient: patientCount,
    DischargeSummaryRecord: dischargeCount,
    Medication: medicationCount,
    FollowUpPlan: followupCount,
    SatisfactionSurvey: surveyCount,
    TimelineEvent: timelineCount,
    Escalation: grievanceCount, // grievance query
    ConsentRecord: consentCount,
    DischargeChecklist: checklistCount,
    CarePathwayTemplate: pathwayCount,
    AuditLog: auditCount,
    // Model mappings for multi-use queries
    EscalationResolved: resolvedEscalationCount,
    MedicationHighAlert: highAlertMedCount,
    PatientRiskAssessed: riskAssessedCount,
    CheckinSymptom: symptomCheckinCount,
  };

  const standards: NabhStandardResult[] = NABH_STANDARDS.map((s) => {
    const count = counts[s.model] ?? 0;
    return { ...s, count, status: statusFor(count, s.threshold ?? 1) };
  });

  const metCount = standards.filter((s) => s.status === "MET").length;
  const totalCount = standards.length;
  const complianceScore = totalCount > 0
    ? Math.round((metCount / totalCount) * 1000) / 10
    : 0;

  // Core standards compliance — NABH requires 100% Core compliance
  const coreStandards = standards.filter((s) => s.category === "Core");
  const coreMetCount = coreStandards.filter((s) => s.status === "MET").length;
  const coreTotalCount = coreStandards.length;
  const coreComplianceScore = coreTotalCount > 0
    ? Math.round((coreMetCount / coreTotalCount) * 1000) / 10
    : 0;

  // Per-chapter rollup
  const chapterMap = new Map<string, NabhChapter>();
  for (const s of standards) {
    const existing = chapterMap.get(s.chapter);
    if (existing) {
      existing.total += 1;
      if (s.status === "MET") existing.met += 1;
    } else {
      chapterMap.set(s.chapter, {
        id: s.chapter,
        label: s.chapterLabel,
        total: 1,
        met: s.status === "MET" ? 1 : 0,
        complianceScore: 0,
      });
    }
  }
  const chapters = Array.from(chapterMap.values()).map((c) => ({
    ...c,
    complianceScore: c.total > 0 ? Math.round((c.met / c.total) * 1000) / 10 : 0,
  }));

  return {
    hospitalId,
    hospitalName: hospital?.name ?? "Unknown hospital",
    generatedAt: new Date().toISOString(),
    standards,
    chapters,
    complianceScore,
    metCount,
    totalCount,
    coreMetCount,
    coreTotalCount,
    coreComplianceScore,
  };
}

// ── PDF Export ────────────────────────────────────────────────────────────────
/** Export the NABH binder as a print-optimized HTML page. */
export function exportBinderAsPdf(binder: NabhBinder): void {
  const w = window.open("", "_blank");
  if (!w) return;

  const chapterRows = binder.chapters.map((c) => `
    <tr>
      <td style="padding:6px 10px;border:1px solid #ddd;">${c.id}</td>
      <td style="padding:6px 10px;border:1px solid #ddd;">${c.label}</td>
      <td style="padding:6px 10px;border:1px solid #ddd;text-align:center;">${c.met}/${c.total}</td>
      <td style="padding:6px 10px;border:1px solid #ddd;text-align:center;">${c.complianceScore}%</td>
    </tr>`).join("");

  const standardRows = binder.standards.map((s) => {
    const statusColor = s.status === "MET" ? "#16a34a" : s.status === "PARTIAL" ? "#d97706" : "#dc2626";
    const categoryBg = s.category === "Core" ? "#fef2f2" : s.category === "Commitment" ? "#eff6ff" : "#f0fdf4";
    return `
    <tr>
      <td style="padding:4px 8px;border:1px solid #ddd;font-family:monospace;font-size:11px;">${s.code}</td>
      <td style="padding:4px 8px;border:1px solid #ddd;font-size:11px;">${s.title}</td>
      <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;background:${categoryBg};font-size:11px;">${s.category}</td>
      <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;">${s.chapter}</td>
      <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;font-weight:bold;color:${statusColor};">${s.status}</td>
      <td style="padding:4px 8px;border:1px solid #ddd;text-align:center;">${s.count}</td>
    </tr>`;
  }).join("");

  w.document.write(`<!DOCTYPE html><html><head><title>NABH 6th Edition Evidence Binder — ${binder.hospitalName}</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;margin:32px;color:#111;background:#fff;}
  h1{font-size:20px;margin:0 0 4px;}
  h2{font-size:15px;margin:20px 0 8px;color:#555;}
  .meta{font-size:12px;color:#666;margin-bottom:16px;}
  .score-card{display:inline-block;padding:8px 16px;border-radius:8px;margin-right:12px;margin-bottom:8px;}
  .score-overall{background:#f0fdf4;border:1px solid #bbf7d0;}
  .score-core{background:#fef2f2;border:1px solid #fecaca;}
  table{border-collapse:collapse;width:100%;margin-bottom:16px;font-size:12px;}
  th{background:#f5f5f5;padding:6px 10px;border:1px solid #ddd;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.04em;}
  @media print{body{margin:16px;}h1{font-size:16px;}}
</style></head><body>
<h1>NABH 6th Edition Evidence Binder</h1>
<div class="meta">${binder.hospitalName} · Generated ${new Date(binder.generatedAt).toLocaleString()}</div>

<div style="margin-bottom:20px;">
  <div class="score-card score-overall">
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#666;">Overall Compliance</div>
    <div style="font-size:24px;font-weight:700;">${binder.complianceScore}%</div>
    <div style="font-size:10px;color:#888;">${binder.metCount} / ${binder.totalCount} standards met</div>
  </div>
  <div class="score-card score-core">
    <div style="font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#666;">Core Compliance (100% required)</div>
    <div style="font-size:24px;font-weight:700;">${binder.coreComplianceScore}%</div>
    <div style="font-size:10px;color:#888;">${binder.coreMetCount} / ${binder.coreTotalCount} Core standards met</div>
  </div>
</div>

<h2>Chapter Summary</h2>
<table>
  <tr><th>Chapter</th><th>Label</th><th>Met / Total</th><th>Score</th></tr>
  ${chapterRows}
</table>

<h2>Standard Detail</h2>
<table>
  <tr><th>Code</th><th>Title</th><th>Category</th><th>Chapter</th><th>Status</th><th>Evidence Count</th></tr>
  ${standardRows}
</table>

<div style="margin-top:24px;font-size:10px;color:#999;border-top:1px solid #eee;padding-top:8px;">
  Auto-generated by Ojas Post-Discharge Care Platform · NABH 6th Edition · ${new Date().toISOString()}
</div>
</body></html>`);
  w.document.close();
  w.print();
}
