// ── Types matching /api/patients/[id] GET ────────────────────────────────────
export type PatientStatus =
  | "ENROLLED" | "ACTIVE" | "RECOVERED" | "READMITTED" | "LOST_TO_FOLLOWUP";

export interface Checkin {
  id: string;
  scheduledFor: string;
  sentAt: string | null;
  answeredAt: string | null;
  status: "SCHEDULED" | "SENT" | "ANSWERED" | "MISSED";
  painLevel: number | null;
  temperature: number | null;
  symptomsText: string | null;
  freeText: string | null;
  aiRiskScore: number | null;
  aiRiskLevel: string | null;
  aiRationale: string | null;
  aiRunId: string | null;
}

export interface Escalation {
  id: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED";
  reason: string;
  aiProposed: boolean;
  aiConfidence: number | null;
  aiRationale: string | null;
  resolution: string | null;
  createdAt: string;
}

export interface TimelineEvent {
  id: string;
  eventType: string;
  title: string;
  detail: string | null;
  occurredAt: string;
}

// ── Types matching /api/patients/[id]/medications ──────────────────────────
export interface Medication {
  id: string;
  name: string;
  dosage: string;
  frequency: string;
  startDate: string;
  endDate: string | null;
  status: "ACTIVE" | "COMPLETED" | "DISCONTINUED";
  notes: string | null;
  isHighAlert: boolean;
  alertCategory: string | null;
}
export interface MedicationsResponse { medications: Medication[] }

// ── Types matching /api/patients/[id]/milestones ───────────────────────────
export type MilestoneType =
  | "FIRST_WALK" | "WOUND_CHECK" | "SUTURE_REMOVAL" | "STAPLE_REMOVAL"
  | "DRESSING_CHANGE" | "PHYSIOTHERAPY" | "FOLLOW_UP" | "OTHER";

export interface Milestone {
  id: string;
  type: MilestoneType;
  label: string;
  targetDate: string;
  completedAt: string | null;
  status: "PENDING" | "COMPLETED" | "MISSED";
  notes: string | null;
}
export interface MilestonesResponse { milestones: Milestone[] }

// ── Types matching /api/patients/[id]/checklist ─────────────────────────────
export type ChecklistCategory =
  | "DISCHARGE_SUMMARY" | "MEDICATION_REVIEW" | "FOLLOW_UP_BOOKED"
  | "TRANSPORT" | "FAMILY_BRIEFED" | "DPDPA_CONSENT" | "OTHER";

export interface ChecklistItem {
  id: string;
  item: string;
  category: ChecklistCategory;
  checked: boolean;
  checkedAt: string | null;
  checkedById: string | null;
  notes: string | null;
}

export interface ChecklistSummary {
  total: number;
  checked: number;
  remaining: number;
  completionRate: number;
}

export interface ChecklistResponse {
  items: ChecklistItem[];
  summary: ChecklistSummary;
}

export interface PatientDetail {
  id: string;
  fullName: string;
  age: number;
  gender: string;
  mobileMasked: string;
  surgeryType: string;
  surgeryDate: string;
  dischargeDate: string;
  comorbidities: string | null;
  status: PatientStatus;
  dpdpaConsent: boolean;
  consentAt: string | null;
  createdAt: string;
  riskLevel: string | null;
  riskScore: number | null;
  riskAssessedAt: string | null;
  checkins: Checkin[];
  escalations: Escalation[];
  timelineEvents: TimelineEvent[];
}

export interface PatientDetailResponse { patient: PatientDetail }

export interface TriageResponse {
  checkin: Checkin;
  triage: {
    riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
    confidence: number;
    rationale: string;
    recommendedAction?: string;
    redFlags?: string[];
  };
  fallbackUsed: boolean;
  escalation: Escalation | null;
}

// ── Types matching /api/patients/[id]/risk-stratification ───────────────────
export interface RiskAssessment {
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  riskScore: number; // 0-100
  confidence: number; // 0-1
  riskFactors: string[];
  protectiveFactors: string[];
  recommendedActions: string[];
  monitoringFrequency: string;
  disclaimer: string;
}

export interface RiskAssessmentResponse {
  assessment: RiskAssessment;
  fallbackUsed: boolean;
  runId: string;
}

// ── Vitals types (matches /api/patients/[id]/vitals) ───────────────────────
export interface VitalsPoint {
  day: number;
  date: string;
  pain: number | null;
  temp: number | null;
  symptoms: string | null;
  riskLevel: string | null;
}

export interface VitalsSummary {
  totalAnswered: number;
  avgPain: number | null;
  maxPain: number | null;
  latestPain: number | null;
  previousPain: number | null;
  painTrend: "increasing" | "decreasing" | "stable" | "unknown";
  latestTemp: number | null;
  maxTemp: number | null;
  feverEpisodes: number;
}

export interface VitalsResponse {
  vitals: VitalsPoint[];
  summary: VitalsSummary;
}

// ── Status options ─────────────────────────────────────────────────────────
export const STATUS_OPTIONS = [
  { value: "ENROLLED", label: "Enrolled" },
  { value: "ACTIVE", label: "Active" },
  { value: "RECOVERED", label: "Recovered" },
  { value: "READMITTED", label: "Readmitted" },
  { value: "LOST_TO_FOLLOWUP", label: "Lost to follow-up" },
];
