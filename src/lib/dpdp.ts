// Ojas — DPDP Lite: Versioned Consent + 72-hour Breach Clock + DSR Tracker (P2.8).
//
// DPDP 2023 requires:
//  1. Versioned consent text — when text changes, re-consent is required. Hash
//     proves what text was displayed at consent time.
//  2. 72-hour breach notification SLA — affected data principals must be
//     notified within 72 hours of breach detection.
//  3. Data Subject Rights (DSR) — access/correction/erasure/grievance requests
//     with documented SLAs (30 days for access/correction).
import { db } from "@/lib/db";
import { createHash } from "crypto";

// ── Consent Versioning ────────────────────────────────────────────────────
export interface ConsentText {
  purpose: string;
  version: string;
  content: string;
}

/** Hash the consent text — proves what was displayed to the patient at consent time. */
export function hashConsentText(content: string): string {
  return createHash("sha256").update(content).digest("hex");
}

/** Default consent text templates. Used to seed ConsentVersion on first run. */
export const DEFAULT_CONSENT_TEXTS: ConsentText[] = [
  {
    purpose: "whatsapp_monitoring",
    version: "1.0",
    content:
      "I consent to Ojas sending me post-discharge check-in messages via WhatsApp. " +
      "I understand I can reply with my symptoms and an AI assistant will help the care team triage my recovery. " +
      "I can opt out at any time by replying STOP.",
  },
  {
    purpose: "ai_triage",
    version: "1.0",
    content:
      "I consent to my check-in responses being processed by Ojas's AI triage system. " +
      "The AI provides decision support to the care team — it does not replace clinical judgement. " +
      "No diagnosis is generated; only risk-level labels (LOW/MEDIUM/HIGH/CRITICAL).",
  },
  {
    purpose: "data_sharing_hospital",
    version: "1.0",
    content:
      "I consent to my recovery data being shared with my treating hospital for continuity of care. " +
      "This includes check-in responses, escalations, and AI triage outcomes.",
  },
  {
    purpose: "data_sharing_insurance",
    version: "1.0",
    content:
      "I consent to aggregated, de-identified recovery data being shared with my insurer for claims processing. " +
      "No personally identifiable information will be shared.",
  },
];

/** Seed default consent versions if they don't exist. Idempotent. */
export async function seedConsentVersions(): Promise<void> {
  for (const text of DEFAULT_CONSENT_TEXTS) {
    const existing = await db.consentVersion.findUnique({
      where: { purpose_version: { purpose: text.purpose, version: text.version } },
    }).catch(() => null);
    if (!existing) {
      await db.consentVersion.create({
        data: {
          purpose: text.purpose,
          version: text.version,
          content: text.content,
          hash: hashConsentText(text.content),
        },
      }).catch(() => {
        // unique constraint race — ignore
      });
    }
  }
}

/** Get the current (latest) consent version for a purpose. */
export async function getCurrentConsentVersion(purpose: string) {
  return db.consentVersion.findFirst({
    where: { purpose },
    orderBy: { effectiveAt: "desc" },
  });
}

/** Check if any patient's consent needs re-collection after a version change. */
export async function findPatientsNeedingReconsent(hospitalId: string, purpose: string) {
  const current = await getCurrentConsentVersion(purpose);
  if (!current) return [];
  // Patients with an active consent for this purpose but at an older version.
  return db.consentRecord.findMany({
    where: {
      hospitalId,
      purpose,
      revokedAt: null,
      consentTextVersion: { not: current.version },
    },
    include: { patient: { select: { fullName: true } } },
    take: 100,
  });
}

// ── 72-Hour Breach Clock ──────────────────────────────────────────────────
const SEVENTY_TWO_HOURS_MS = 72 * 60 * 60 * 1000;

/** Initialize the SLA clock for a breach — set slaDeadline = detectedAt + 72h. */
export async function startBreachSlaClock(breachId: string): Promise<void> {
  const breach = await db.breachNotification.findUnique({ where: { id: breachId } });
  if (!breach) return;
  if (!breach.slaDeadline) {
    await db.breachNotification.update({
      where: { id: breachId },
      data: { slaDeadline: new Date(breach.detectedAt.getTime() + SEVENTY_TWO_HOURS_MS) },
    });
  }
}

/** Find breaches where the 72h SLA is at risk (within 12h of deadline, not yet notified). */
export async function findBreachesAtRisk(hospitalId?: string) {
  const now = new Date();
  const twelveHoursFromNow = new Date(now.getTime() + 12 * 60 * 60 * 1000);
  return db.breachNotification.findMany({
    where: {
      notifiedAt: null,
      slaDeadline: { lte: twelveHoursFromNow, gte: now },
      ...(hospitalId ? { hospitalId } : {}),
    },
    include: { hospital: { select: { name: true } } },
  });
}

/** Find breaches where the SLA has already been breached (deadline passed, not notified). */
export async function findOverdueBreaches(hospitalId?: string) {
  return db.breachNotification.findMany({
    where: {
      notifiedAt: null,
      slaDeadline: { lt: new Date() },
      ...(hospitalId ? { hospitalId } : {}),
    },
    include: { hospital: { select: { name: true } } },
  });
}

/** Pre-built DPB notification template — sent to the Data Protection Board. */
export function buildDpbNotification(opts: {
  hospitalName: string;
  breachTitle: string;
  affectedCount: number;
  detectedAt: Date;
  slaDeadline: Date;
}): string {
  return [
    "DATA PROTECTION BOARD NOTIFICATION",
    "====================================",
    "",
    `Hospital: ${opts.hospitalName}`,
    `Breach: ${opts.breachTitle}`,
    `Affected individuals: ${opts.affectedCount}`,
    `Detected at: ${opts.detectedAt.toISOString()}`,
    `SLA deadline (72h): ${opts.slaDeadline.toISOString()}`,
    `Time remaining: ${Math.max(0, opts.slaDeadline.getTime() - Date.now())} ms`,
    "",
    "Per DPDP Rules 2025, this notification is being submitted within 72 hours of breach detection.",
    "A detailed incident report and remediation plan will follow within 7 business days.",
  ].join("\n");
}

// ── DSR Tracker ────────────────────────────────────────────────────────────
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

/** Create a DSR — auto-sets SLA deadline for ACCESS/CORRECTION (30 days). */
export async function createDpdpRequest(opts: {
  hospitalId: string;
  patientId: string;
  type: "ACCESS" | "CORRECTION" | "ERASURE" | "GRIEVANCE";
  description?: string;
}): Promise<string> {
  const slaDeadline =
    opts.type === "ACCESS" || opts.type === "CORRECTION"
      ? new Date(Date.now() + THIRTY_DAYS_MS)
      : null;
  const req = await db.dpdpRequest.create({
    data: {
      hospitalId: opts.hospitalId,
      patientId: opts.patientId,
      type: opts.type,
      description: opts.description || null,
      slaDeadline,
      status: "PENDING",
    },
  });
  await db.timelineEvent.create({
    data: {
      hospitalId: opts.hospitalId,
      patientId: opts.patientId,
      eventType: "DPDP_REQUEST_CREATED",
      title: `DPDP ${opts.type} request submitted`,
      detail: `Request ID: ${req.id}. SLA: ${slaDeadline ? slaDeadline.toISOString() : "no SLA"}`,
    },
  });
  return req.id;
}

/** Find DSRs where the SLA is at risk (within 5 days of deadline, not resolved). */
export async function findDsrAtRisk(hospitalId?: string) {
  const now = new Date();
  const fiveDaysFromNow = new Date(now.getTime() + 5 * 24 * 60 * 60 * 1000);
  return db.dpdpRequest.findMany({
    where: {
      resolvedAt: null,
      slaDeadline: { lte: fiveDaysFromNow, gte: now },
      ...(hospitalId ? { hospitalId } : {}),
    },
    include: { patient: { select: { fullName: true } } },
  });
}
