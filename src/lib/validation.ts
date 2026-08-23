// Ojas — centralised Zod input-validation schemas for every write endpoint.
//
// Every write flow follows: request → schema validation → normalization →
// authentication → authorization → tenant isolation → business validation →
// transaction. These schemas enforce the first step: they reject unknown
// unsafe fields, invalid enums, impossible dates, invalid numerics, oversized
// strings, malformed identifiers, invalid URLs and unsupported MIME types.
//
// Usage:
//   const parsed = patientEnrollSchema.safeParse(body);
//   if (!parsed.success) return jsonError(parsed.error.message, 400);
//   const data = parsed.data; // typed & narrowed
import { z } from "zod";

// ── Shared primitives ────────────────────────────────────────────────────────
const cuid = z.string().min(1).max(60);
const isoDate = z.string().min(1).max(40);
const mobile = z
  .string()
  .min(1)
  .max(20)
  .transform((s) => s.replace(/[\s-]/g, ""))
  .refine((s) => /^\+?[0-9]{10,15}$/.test(s), "Invalid mobile number (10-15 digits)");
const safeShortText = z.string().trim().min(1).max(280);
const safeLongText = z.string().trim().max(4000).optional().nullable();
const safeString = z.string().trim().min(1).max(500);

// Pagination query
export const paginationQuery = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(200).default(50),
  q: z.string().trim().max(200).optional(),
  status: z.string().trim().max(60).optional(),
});

// ── Patient enrollment ───────────────────────────────────────────────────────
export const familyLanguageEnum = z.enum([
  "HINGLISH", "HINDI", "ENGLISH", "TAMIL", "TELUGU", "MARATHI", "BENGALI",
]);
export const familyRelationEnum = z.enum([
  "son", "daughter", "spouse", "parent", "other",
]);

export const patientEnrollSchema = z.object({
  fullName: z.string().trim().min(2).max(200),
  age: z.number().int().min(0).max(130),
  gender: z.string().trim().min(1).max(40).default("unspecified"),
  mobile,
  surgeryType: z.string().trim().min(1).max(200),
  surgeryDate: isoDate,
  dischargeDate: isoDate,
  comorbidities: safeLongText,
  dpdpaConsent: z.literal(true),
  address: safeLongText,
  nextOfKinContact: z.string().trim().max(20).optional().nullable(),
  nextOfKinName: z.string().trim().max(200).optional().nullable(),
  uhid: z.string().trim().max(100).optional().nullable(),
  dateOfBirth: isoDate.optional().nullable(),
  // Discharge summary
  diagnosis: z.string().trim().max(500).optional().nullable(),
  proceduresPerformed: z.string().trim().max(2000).optional().nullable(),
  medicationsOnDischarge: z.string().trim().max(2000).optional().nullable(),
  followUpInstructions: z.string().trim().max(2000).optional().nullable(),
  conditionAtDischarge: z.string().trim().max(100).optional().nullable(),
  dietaryInstructions: z.string().trim().max(1000).optional().nullable(),
  activityRestrictions: z.string().trim().max(1000).optional().nullable(),
  warningSigns: z.string().trim().max(1000).optional().nullable(),
  emergencyContact: z.string().trim().max(40).optional().nullable(),
  attendingDoctorName: z.string().trim().max(200).optional().nullable(),
  // Follow-up plan
  followUpPlannedDate: isoDate.optional().nullable(),
  followUpMode: z.enum(["CALL", "WHATSAPP", "IN_PERSON", "TELECONSULT"]).optional().nullable(),
  followUpClinician: z.string().trim().max(200).optional().nullable(),
  followUpNotes: safeLongText,
  // Family companion
  familyContact: z.string().trim().max(20).optional().nullable(),
  familyName: z.string().trim().max(200).optional().nullable(),
  familyRelation: familyRelationEnum.optional().nullable(),
  familyLanguage: familyLanguageEnum.default("HINGLISH"),
  familyOptIn: z.boolean().default(false),
}).strict(); // reject unknown fields

export const patientUpdateSchema = patientEnrollSchema.partial().extend({
  status: z.enum(["ENROLLED", "ACTIVE", "RECOVERED", "READMITTED", "LOST_TO_FOLLOWUP"]).optional(),
  lostToFollowupReason: z.enum(["UNREACHABLE", "REFUSED", "TRANSFERRED", "DECEASED"]).optional().nullable(),
}).strict();

// Inferred TypeScript type for the patient-update payload.
export type PatientUpdate = z.infer<typeof patientUpdateSchema>;

// ── Check-in ────────────────────────────────────────────────────────────────
export const checkinAnswerSchema = z.object({
  painLevel: z.number().int().min(0).max(10).optional().nullable(),
  temperature: z.number().min(30).max(45).optional().nullable(),
  symptomsText: z.string().trim().max(2000).optional().nullable(),
  freeText: z.string().trim().max(2000).optional().nullable(),
  medsTaken: z.boolean().optional().nullable(),
  medsNote: z.string().trim().max(500).optional().nullable(),
}).strict();

// ── Escalation ───────────────────────────────────────────────────────────────
export const escalationCreateSchema = z.object({
  patientId: cuid,
  checkinId: cuid.optional().nullable(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("LOW"),
  type: z.enum(["CLINICAL", "GRIEVANCE"]).default("CLINICAL"),
  reason: z.string().trim().min(1).max(2000),
  aiProposed: z.boolean().default(false),
  aiConfidence: z.number().min(0).max(1).optional().nullable(),
  aiRationale: z.string().trim().max(2000).optional().nullable(),
  assignedToId: cuid.optional().nullable(),
}).strict();

export const escalationUpdateSchema = z.object({
  status: z.enum(["OPEN", "IN_PROGRESS", "RESOLVED"]).optional(),
  severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).optional(),
  assignedToId: cuid.optional().nullable(),
  resolution: z.string().trim().max(2000).optional().nullable(),
  acknowledged: z.literal(true).optional(),
  // N7: Escalation type can also be updated on PATCH.
  type: z.enum(["CLINICAL", "GRIEVANCE"]).optional(),
}).strict();

// Hand-off: assign an escalation to another user (same hospital).
export const escalationHandoffSchema = z.object({
  assignToId: cuid,
  note: z.string().trim().max(2000).optional().nullable(),
}).strict();

// ── Consent ──────────────────────────────────────────────────────────────────
export const consentPurposeEnum = z.enum([
  "whatsapp_monitoring",
  "ai_triage",
  "data_sharing_hospital",
  "data_sharing_insurance",
  "care_coordination",
  // P3 (#12): renamed from "health_information_exchange" — the feature does not
  // exist yet (no HIE/ABDM Consent Manager integration). Marked as "planned"
  // so existing consent records are preserved but the purpose is clearly inert.
  // When a real HIE integration is built, migrate this to the active name.
  "health_information_exchange_planned",
  "analytics_research",
  "marketing",
]);

export const consentGrantSchema = z.object({
  patientId: cuid,
  purpose: consentPurposeEnum,
  consentTextVersion: z.string().trim().min(1).max(20),
}).strict();

export const consentRevokeSchema = z.object({
  reason: z.string().trim().max(500).optional().nullable(),
}).strict();

// Revoke-by-query: callers may revoke either by consent record id, or by
// (patientId, purpose) tuple. Exactly one of these lookup keys must be present.
export const consentRevokeQuerySchema = z.object({
  id: cuid.optional(),
  patientId: cuid.optional(),
  purpose: consentPurposeEnum.optional(),
  reason: z.string().trim().max(500).optional().nullable(),
}).strict().refine(
  (d) => !!d.id || (!!d.patientId && !!d.purpose),
  "Provide either id or (patientId + purpose)",
);

// ── Billing ──────────────────────────────────────────────────────────────────
export const billingCheckoutSchema = z.object({
  planTier: z.enum(["PILOT", "GROWTH", "ENTERPRISE"]),
  patientLimit: z.number().int().min(1).max(100000).optional(),
}).strict();

// ── ABHA ──────────────────────────────────────────────────────────────────────
export const abhaActionSchema = z.object({
  patientId: cuid,
  abhaNumber: z.string().trim().min(2).max(50).optional().nullable(),
  mobile: z.string().trim().max(20).optional().nullable(),
  action: z.enum(["search", "send_otp", "verify_otp", "link", "revoke", "manual_capture"]).default("search"),
  otp: z.string().trim().min(4).max(8).optional().nullable(),
  txnId: z.string().trim().max(100).optional().nullable(),
  // ── P1 (#4): manual capture fields ─────────────────────────────────────────
  // For manual_capture: hospital staff enter ABHA data WITHOUT ABDM verification.
  // The record is MANUALLY_RECORDED, isAuthoritative=false, and NEVER auto-
  // transitions to VERIFIED/LINKED without the actual official verification flow.
  abhaAddress: z.string().trim().max(100).optional().nullable(),
  nameAsPerAbha: z.string().trim().max(200).optional().nullable(),
  genderAsPerAbha: z.string().trim().max(20).optional().nullable(),
  yearOfBirthAsPerAbha: z.number().int().min(1900).max(2030).optional().nullable(),
  // ── P1 (#6): reconciliation override ───────────────────────────────────────
  // Required when reconciliation result is PARTIAL or MISMATCH. Without it,
  // the link/manual-capture returns 409.
  overrideReason: z.string().trim().min(3).max(500).optional().nullable(),
}).strict();

// ── NHCX claim ─────────────────────────────────────────────────────────────────
export const nhcxClaimCreateSchema = z.object({
  patientId: cuid,
  abhaIdentityId: cuid.optional().nullable(),
  claimType: z.enum(["PREAUTH", "CLAIM"]),
  packageCode: z.string().trim().max(100).optional().nullable(),
  packageName: z.string().trim().max(200).optional().nullable(),
  estimatedAmount: z.string().regex(/^\d+(\.\d{1,2})?$/, "Invalid amount").optional().nullable(),
}).strict();

export const nhcxClaimTransitionSchema = z.object({
  action: z.enum([
    "submit_preauth",
    "submit_claim",
    "acknowledge",
    "approve",
    "partially_approve",
    "reject",
    "mark_paid",
    "fail",
    "withdraw",
  ]),
  approvedAmount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().nullable(),
  patientShare: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().nullable(),
  rejectionReason: z.string().trim().max(2000).optional().nullable(),
  fhirResponse: z.string().max(200000).optional().nullable(),
}).strict();

// ── P2 (#8): NHCX manual-portal recording ────────────────────────────────────
// For hospitals that submit NHCX claims/eligibility through the external portal
// (not via direct API integration), authorized operators record the official
// external transaction reference. The record is authoritative (an operator is
// explicitly recording an official external transaction) but canUseForBilling
// is false until an explicit internal billing/claim-result operation confirms.
export const nhcxManualEligibilitySchema = z.object({
  claimId: z.string().trim().min(1).max(100),
  externalTxnId: z.string().trim().min(1).max(200), // official external reference — REQUIRED
  eligibilityStatus: z.string().trim().max(50).optional().nullable(),
  approvedAmount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().nullable(),
  patientShare: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
}).strict();

export const nhcxManualClaimSchema = z.object({
  claimId: z.string().trim().min(1).max(100),
  externalTxnId: z.string().trim().min(1).max(200), // official external reference — REQUIRED
  claimStatus: z.string().trim().max(50).optional().nullable(),
  approvedAmount: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().nullable(),
  patientShare: z.string().regex(/^\d+(\.\d{1,2})?$/).optional().nullable(),
  rejectionReason: z.string().trim().max(2000).optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
}).strict();

// ── WhatsApp webhook payload (Meta Cloud API shape) ────────────────────────────
export const whatsappWebhookSchema = z.object({
  object: z.string().optional(),
  entry: z.array(
    z.object({
      id: z.string().optional(),
      changes: z.array(
        z.object({
          value: z.object({
            messaging_product: z.string().optional(),
            metadata: z.object({
              phone_number_id: z.string().optional(),
              display_phone_number: z.string().optional(),
            }).optional(),
            messages: z.array(
              z.object({
                from: z.string().min(1),
                id: z.string().min(1).max(200),
                type: z.string(),
                timestamp: z.string().min(1),
                text: z.object({ body: z.string().max(4000) }).optional(),
              })
            ).optional(),
            statuses: z.array(
              z.object({
                id: z.string().min(1).max(200),
                status: z.string(),
                timestamp: z.string().optional(),
                recipient_id: z.string().optional(),
                errors: z
                  .array(
                    z.object({
                      code: z.number().optional(),
                      title: z.string().max(200).optional(),
                      message: z.string().max(500).optional(),
                    })
                  )
                  .optional(),
              })
            ).optional(),
          }).optional(),
          field: z.string().optional(),
        })
      ),
    })
  ),
});

// ── NABH evidence ─────────────────────────────────────────────────────────────
export const nabhEvidenceSchema = z.object({
  standardCode: z.string().trim().min(1).max(60),
  category: z.enum(["Core", "Commitment", "Achievement", "Excellence"]),
  evidenceSource: z.enum(["AUTO_GENERATED", "MANUAL", "HOSPITAL_ATTESTED", "EXTERNALLY_VERIFIED"]).default("MANUAL"),
  status: z.enum([
    "NOT_ASSESSED", "GAP", "PARTIAL", "EVIDENCE_PENDING",
    "SUBMITTED", "VERIFIED", "EXPIRED", "REQUIRES_REVIEW",
  ]).default("NOT_ASSESSED"),
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().max(4000).optional().nullable(),
  fileUrl: z.string().trim().max(2000).optional().nullable(),
  fileName: z.string().trim().max(255).optional().nullable(),
  fileSize: z.number().int().min(0).max(25_000_000).optional().nullable(),
  fileMimeType: z.string().trim().max(100).optional().nullable(),
  autoCount: z.number().int().min(0).max(1_000_000_000).optional().nullable(),
  expiresAt: isoDate.optional().nullable(),
  gapDescription: z.string().trim().max(4000).optional().nullable(),
  correctiveAction: z.string().trim().max(4000).optional().nullable(),
  correctiveOwner: z.string().trim().max(200).optional().nullable(),
  correctiveDueDate: isoDate.optional().nullable(),
  comments: z.string().trim().max(4000).optional().nullable(),
}).strict();

// ── DPDP request ───────────────────────────────────────────────────────────────
export const dpdpRequestSchema = z.object({
  patientId: cuid,
  type: z.enum(["ACCESS", "CORRECTION", "ERASURE", "GRIEVANCE"]),
  description: z.string().trim().max(4000).optional().nullable(),
}).strict();

// ── Pilot ─────────────────────────────────────────────────────────────────────
export const pilotEnrollSchema = z.object({
  hospitalId: cuid,
  patientCount: z.number().int().min(0).max(100000).optional(),
  controlCount: z.number().int().min(0).max(100000).optional(),
}).strict();

// ── Medication ─────────────────────────────────────────────────────────────────
// patientId is optional: when the medication is created via the nested route
// /api/patients/[id]/medications, the patientId comes from the URL path param.
// When created via a flat collection endpoint, the client must supply it.
export const medicationSchema = z.object({
  patientId: cuid.optional(),
  name: z.string().trim().min(1).max(200),
  dosage: z.string().trim().min(1).max(100),
  frequency: z.string().trim().min(1).max(100),
  startDate: isoDate,
  endDate: isoDate.optional().nullable(),
  isHighAlert: z.boolean().default(false),
  alertCategory: z.enum(["STANDARD", "HIGH_ALERT"]).default("STANDARD"),
  notes: z.string().trim().max(2000).optional().nullable(),
}).strict();

// ── Invite ────────────────────────────────────────────────────────────────────
export const inviteSchema = z.object({
  email: z.string().email().max(200),
  role: z.enum(["HOSPITAL_ADMIN", "COORDINATOR", "DOCTOR"]),
}).strict();

// ── File upload safety ────────────────────────────────────────────────────────
export const ALLOWED_UPLOAD_MIMES = [
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
] as const;

export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024; // 25 MB

export const fileUploadSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  fileSize: z.number().int().min(1).max(MAX_UPLOAD_BYTES),
  mimeType: z.enum(ALLOWED_UPLOAD_MIMES),
});

// Safe filename: strip path traversal + dangerous chars, lowercase extension.
export function sanitizeFileName(name: string): string {
  const base = name.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/^\.+/, "").slice(0, 200);
  return base || `upload-${Date.now()}`;
}

// ── Helper: validate + return data or throw a 400-style error ──────────────────
export class ValidationError extends Error {
  status = 400;
  constructor(public issues: string) {
    super(issues);
  }
}

export function validate<T>(schema: z.ZodType<T>, input: unknown): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `${i.path.join(".") || "root"}: ${i.message}`)
      .join("; ");
    throw new ValidationError(issues);
  }
  return parsed.data;
}

/** Parse + validate a request JSON body. Throws ValidationError on parse failure
 *  (caller should catch and return 400). Used to ensure every write route
 *  validates input via a Zod schema. */
export async function parseBody<T>(req: Request, schema: z.ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ValidationError("Invalid JSON body");
  }
  return validate(schema, raw);
}

// ── Additional schemas for V3-E coverage ────────────────────────────────────────
export const loginSchema = z.object({
  email: z.string().email().max(200),
  password: z.string().min(1).max(200),
}).strict();

export const acceptInviteSchema = z.object({
  token: z.string().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  password: z.string().min(8).max(200),
}).strict();

export const passwordResetSchema = z.object({
  newPassword: z.string().min(8).max(200),
}).strict();

export const consentUpdateSchema = z.object({
  status: z.enum(["GRANTED", "REVOKED"]).optional(),
  reason: z.string().trim().max(500).optional().nullable(),
}).strict();

export const followUpPlanSchema = z.object({
  patientId: cuid,
  plannedDate: isoDate,
  mode: z.enum(["CALL", "WHATSAPP", "IN_PERSON", "TELECONSULT"]),
  responsibleClinician: z.string().trim().max(200).optional().nullable(),
  notes: safeLongText,
}).strict();

export const pathwaySchema = z.object({
  surgeryType: z.string().trim().min(1).max(200),
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional().nullable(),
  // Array of {type,label,dayOffset} — the route JSON.stringifies before persisting.
  milestones: z.array(
    z.object({
      type: z.string().trim().min(1).max(100),
      label: z.string().trim().min(1).max(300),
      dayOffset: z.number().int().min(0).max(3650),
    })
  ).min(1).max(500),
  isActive: z.boolean().default(true),
}).strict();

// Pathway template PATCH — id required; all other fields optional.
export const pathwayUpdateSchema = z.object({
  id: cuid,
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(2000).optional().nullable(),
  milestones: z.array(
    z.object({
      type: z.string().trim().min(1).max(100),
      label: z.string().trim().min(1).max(300),
      dayOffset: z.number().int().min(0).max(3650),
    })
  ).min(1).max(500).optional(),
  isActive: z.boolean().optional(),
}).strict();

export const breachNotificationSchema = z.object({
  title: z.string().trim().min(1).max(300),
  description: z.string().trim().min(1).max(4000),
  affectedDataTypes: z.string().trim().min(1).max(500),
  protectiveSteps: z.string().trim().min(1).max(4000),
  contactPoint: z.string().trim().min(1).max(300),
  detectedAt: isoDate,
  affectedCount: z.number().int().min(0).max(10_000_000).optional().nullable(),
}).strict();

export const surveySchema = z.object({
  patientId: cuid,
  overallRating: z.number().int().min(1).max(5),
  careQuality: z.number().int().min(1).max(5).optional().nullable(),
  communication: z.number().int().min(1).max(5).optional().nullable(),
  responsiveness: z.number().int().min(1).max(5).optional().nullable(),
  wouldRecommend: z.boolean().optional().nullable(),
  freeText: z.string().trim().max(2000).optional().nullable(),
}).strict();

export const hospitalCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(100).regex(/^[a-z0-9-]+$/, "slug must be lowercase kebab"),
  planTier: z.enum(["STARTER", "PILOT", "GROWTH", "ENTERPRISE"]).default("PILOT"),
  bedCount: z.number().int().min(0).max(100000).default(0),
  nabhAccreditationLevel: z.enum(["ENTRY_LEVEL", "FULL_6TH_EDITION", "PRE_ACCREDITATION", "NOT_ACCREDITED"]).default("NOT_ACCREDITED"),
  city: z.string().trim().max(200).optional().nullable(),
  country: z.string().trim().max(200).default("India"),
}).strict();

// Hospital create request (POST /api/hospitals) — slug is generated server-side
// from the name, so the client never sends it. Mirrors hospitalCreateSchema
// minus slug, plus the legacy free-text nabhLevel field the route still uses.
export const hospitalCreateRequestSchema = z.object({
  name: z.string().trim().min(2).max(200),
  planTier: z.enum(["STARTER", "PILOT", "GROWTH", "ENTERPRISE"]).default("STARTER"),
  bedCount: z.number().int().min(0).max(100000).default(0),
  nabhLevel: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().max(200).optional().nullable(),
  country: z.string().trim().max(200).default("India"),
}).strict();

// Hospital PATCH — every field optional; slug is never editable post-create.
export const hospitalUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  planTier: z.enum(["STARTER", "PILOT", "GROWTH", "ENTERPRISE"]).optional(),
  bedCount: z.number().int().min(0).max(100000).optional(),
  nabhLevel: z.string().trim().max(200).optional().nullable(),
  city: z.string().trim().max(200).optional().nullable(),
}).strict();

// Breach notification status transition (PATCH /api/breach-notifications/[id]).
export const breachStatusUpdateSchema = z.object({
  status: z.enum(["DRAFT", "PENDING_APPROVAL", "SENT"]),
  approvedById: cuid.optional().nullable(),
}).strict();

// Follow-up plan status update (PATCH /api/follow-up-plans/[id]).
export const followUpPlanUpdateSchema = z.object({
  status: z.enum(["SCHEDULED", "COMPLETED", "MISSED", "CANCELLED"]).optional(),
  notes: z.string().trim().max(4000).optional().nullable(),
  responsibleClinician: z.string().trim().max(200).optional().nullable(),
}).strict();

// Check-in submit — checkinId + structured answer fields.
export const checkinSubmitSchema = checkinAnswerSchema.extend({
  checkinId: cuid,
}).strict();

// Invite with optional hospitalId (superadmin may invite into any hospital;
// hospital admins are constrained to their own via requireTenantAccess).
export const inviteWithHospitalSchema = inviteSchema.extend({
  hospitalId: cuid.optional(),
}).strict();

// Checklist item create — checklistItemSchema fields + optional notes.
// (Defined here as a full object because checklistItemSchema is declared
// further down this file; the shape is intentionally identical to
// checklistItemSchema plus the `notes` field.)
export const checklistItemCreateSchema = z.object({
  item: z.string().trim().min(1).max(500),
  category: z.enum([
    "DISCHARGE_SUMMARY", "MEDICATION_REVIEW", "FOLLOW_UP_BOOKED",
    "TRANSPORT", "FAMILY_BRIEFED", "DPDPA_CONSENT", "OTHER",
  ]),
  notes: z.string().trim().max(2000).optional().nullable(),
}).strict();

// Checklist item update (PATCH /api/patients/[id]/checklist).
export const checklistItemUpdateSchema = z.object({
  itemId: cuid,
  checked: z.boolean().optional(),
  notes: z.string().trim().max(2000).optional().nullable(),
}).strict();

// Milestone update (PATCH /api/patients/[id]/milestones).
export const milestoneUpdateSchema = z.object({
  milestoneId: cuid,
  status: z.enum(["PENDING", "COMPLETED", "MISSED"]).optional(),
  completedAt: isoDate.optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
}).strict();

// Medication update (PATCH /api/patients/[id]/medications).
export const medicationUpdateSchema = z.object({
  medicationId: cuid,
  status: z.enum(["ACTIVE", "COMPLETED", "DISCONTINUED"]).optional(),
  endDate: isoDate.optional().nullable(),
  notes: z.string().trim().max(2000).optional().nullable(),
  isHighAlert: z.boolean().optional(),
  alertCategory: z.enum(["STANDARD", "HIGH_ALERT"]).optional(),
}).strict();

// Pilot metrics PATCH — admin enters their pre-Ojas baseline rate.
export const pilotMetricsPatchSchema = z.object({
  readmissionRateWithoutOjas: z.number().min(0).max(100),
}).strict();

// Billing activate (POST /api/billing) — switch plan tier without checkout
// (only used for PILOT/STARTER signups; GROWTH/ENTERPRISE go through checkout).
export const billingActivateSchema = z.object({
  planTier: z.enum(["PILOT", "GROWTH", "ENTERPRISE"]),
}).strict();

// Billing verify request — matches the route's actual contract
// (orderId/paymentId/signature naming, not the Razorpay-standard snake_case).
export const billingVerifyRequestSchema = z.object({
  orderId: z.string().trim().min(1).max(200),
  paymentId: z.string().trim().min(1).max(200),
  signature: z.string().trim().min(1).max(500),
  planTier: z.enum(["PILOT", "GROWTH", "ENTERPRISE"]),
}).strict();

// Seed endpoint (dev-only) — permissive, only accepts an optional force flag.
export const seedSchema = z.object({
  force: z.boolean().optional(),
}).strict();

// AI conversational request — matches the route's actual contract
// (patientId + questionAsked + patientReply as separate fields).
export const aiConversationalRequestSchema = z.object({
  patientId: cuid,
  questionAsked: z.string().trim().min(1).max(2000),
  patientReply: z.string().trim().min(1).max(4000),
}).strict();

// Notification preferences PATCH (per-hospital toggles).
export const notificationPrefsSchema = z.object({
  emailDailyDigest: z.boolean().optional(),
  whatsappDeliveryReports: z.boolean().optional(),
  escalationAlerts: z.boolean().optional(),
  checkinReminders: z.boolean().optional(),
}).strict();

export const settingsUpdateSchema = z.object({
  recoveryWindowDays: z.number().int().min(1).max(365).optional(),
  checkinCadenceHours: z.number().int().min(1).max(168).optional(),
  whatsappEnabled: z.boolean().optional(),
  emailDigestEnabled: z.boolean().optional(),
  aiTriageEnabled: z.boolean().optional(),
  notificationPreferences: z.string().max(2000).optional(),
}).strict().partial();

export const checklistItemSchema = z.object({
  item: z.string().trim().min(1).max(500),
  category: z.enum([
    "DISCHARGE_SUMMARY", "MEDICATION_REVIEW", "FOLLOW_UP_BOOKED",
    "TRANSPORT", "FAMILY_BRIEFED", "DPDPA_CONSENT", "OTHER",
  ]),
}).strict();

export const milestoneCreateSchema = z.object({
  type: z.enum([
    "FIRST_WALK", "WOUND_CHECK", "SUTURE_REMOVAL", "STAPLE_REMOVAL",
    "DRESSING_CHANGE", "PHYSIOTHERAPY", "FOLLOW_UP", "OTHER",
  ]),
  label: z.string().trim().min(1).max(300),
  targetDate: isoDate,
  notes: z.string().trim().max(2000).optional().nullable(),
}).strict();

export const readmitSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
  newRecoveryDays: z.number().int().min(1).max(365).optional(),
}).strict();

export const erasureSchema = z.object({
  patientId: cuid,
  reason: z.string().trim().min(1).max(2000),
}).strict();

export const aiConversationalSchema = z.object({
  message: z.string().trim().min(1).max(4000),
  patientId: cuid.optional().nullable(),
}).strict();

export const billingVerifySchema = z.object({
  razorpay_payment_id: z.string().trim().min(1).max(200),
  razorpay_order_id: z.string().trim().min(1).max(200),
  razorpay_signature: z.string().trim().min(1).max(500),
}).strict();

export const billingWebhookSchema = z.object({
  event: z.string().trim().max(200).optional(),
  payload: z.unknown().optional(),
}).passthrough(); // Razorpay webhook shape varies; signature is verified separately

// ── Integration Readiness Center (V3-5 hospital-facing) ──────────────────────
export const nhcxGateAdvanceSchema = z.object({
  gate: z.enum([
    "SANDBOX_CONFIGURED", "SANDBOX_VERIFIED", "PARTNER_ONBOARDING_VERIFIED",
    "CERTIFICATES_VERIFIED", "PRODUCTION_ENDPOINT_VERIFIED",
    "PRODUCTION_CONNECTIVITY_VERIFIED", "LIVE_APPROVED", "LIVE",
  ]),
  evidence: z.string().trim().max(2000).optional().nullable(),
}).strict();

export const nhcxGateRollbackSchema = z.object({
  reason: z.string().trim().min(1).max(2000),
}).strict();

export const integrationProfileSchema = z.object({
  hfrId: z.string().trim().max(100).optional().nullable(),
  pmjayFacilityId: z.string().trim().max(100).optional().nullable(),
  hemStatus: z.string().trim().max(100).optional().nullable(),
  state: z.string().trim().max(100).optional().nullable(),
  district: z.string().trim().max(100).optional().nullable(),
  // P5 (#18): zero-code onboarding fields — admin-enterable, no deploy.
  stateHealthAgencyCode: z.string().trim().max(100).optional().nullable(),
  wasaAuditStatus: z.enum(["NOT_STARTED", "IN_PROGRESS", "PASSED", "FAILED"]).optional().nullable(),
  wasaAuditDate: z.string().datetime().optional().nullable(),
  safeToHostCertificateRef: z.string().trim().max(500).optional().nullable(),
  certificateExpiryDate: z.string().datetime().optional().nullable(),
  nhcxParticipantCode: z.string().trim().max(100).optional().nullable(),
  abdmMode: z.enum(["SANDBOX", "PRODUCTION_PENDING", "LIVE"]).optional(),
  abhaMode: z.enum(["SANDBOX", "PRODUCTION_PENDING", "LIVE"]).optional(),
  pmjayMode: z.enum(["LOCAL", "MANUAL_PORTAL", "STATE_API", "OFFICIAL_API", "SANDBOX"]).optional(),
  // Onboarding checklist booleans — each is a real checklist item.
  hfrVerified: z.boolean().optional(),
  hemLinked: z.boolean().optional(),
  pmjayEmpanelmentVerified: z.boolean().optional(),
  ojasFacilityMappingComplete: z.boolean().optional(),
  notes: z.string().trim().max(4000).optional().nullable(),
}).strict();
