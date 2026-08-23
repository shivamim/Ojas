// Ojas — Family Recovery Companion (P0.2).
//
// In India, family members (son/daughter/spouse) typically manage post-discharge
// patient care — not the patient themselves. This module generates daily recovery
// updates in Hinglish/Hindi/etc and routes them via WhatsApp to the family contact.
//
// Updates are assembled from real patient state (latest check-in, medications,
// milestones, next appointment). HIGH/CRITICAL triage in the last 24h triggers
// an immediate ESCALATION_NOTICE rather than waiting for the 6 PM cron.
//
// All outbound family messages are persisted to FamilyUpdate for audit + delivery
// tracking (QUEUED → SENT → DELIVERED → READ).
import { db } from "@/lib/db";
import { decryptPII } from "@/lib/crypto";

export type FamilyLanguage = "HINGLISH" | "HINDI" | "ENGLISH" | "TAMIL" | "TELUGU" | "MARATHI" | "BENGALI";
export type FamilyUpdateType = "DAILY_RECOVERY" | "MEDICATION_REMINDER" | "APPOINTMENT_ALERT" | "ESCALATION_NOTICE" | "MILESTONE_ACHIEVED";

export interface FamilyUpdateInput {
  patientId: string;
  hospitalId: string;
  type: FamilyUpdateType;
  language?: FamilyLanguage;
  /** Override the auto-generated content (used for ad-hoc updates). */
  content?: string;
}

/** Compute days since discharge for a patient. */
function dayOfRecovery(dischargeDate: Date): number {
  const ms = Date.now() - dischargeDate.getTime();
  return Math.max(1, Math.floor(ms / (24 * 60 * 60 * 1000)) + 1);
}

/** Pain-level label in Hinglish. */
function painLabel(pain: number | null | undefined, lang: FamilyLanguage): string {
  if (pain == null) return lang === "ENGLISH" ? "not reported" : "pata nahi";
  if (pain <= 3) return lang === "ENGLISH" ? "Low" : "Kam";
  if (pain <= 6) return lang === "ENGLISH" ? "Moderate" : "Madhyam";
  return lang === "ENGLISH" ? "High" : "Zyada";
}

/** Compose a daily recovery update message from real patient state. */
export async function composeDailyRecoveryUpdate(
  patientId: string,
  hospitalId: string
): Promise<{ content: string; language: FamilyLanguage } | null> {
  const patient = await db.patient.findFirst({
    where: { id: patientId, hospitalId, deletedAt: null },
    include: {
      checkins: { orderBy: { scheduledFor: "desc" }, take: 1 },
      medications: { where: { status: "ACTIVE" }, take: 5 },
      milestones: { where: { status: "PENDING" }, orderBy: { targetDate: "asc" }, take: 1 },
      followUpPlans: { where: { status: "SCHEDULED" }, orderBy: { plannedDate: "asc" }, take: 1 },
    },
  });
  if (!patient || !patient.familyOptIn) return null;

  const lang = (patient.familyLanguage as FamilyLanguage) || "HINGLISH";
  const day = dayOfRecovery(patient.dischargeDate);
  const latest = patient.checkins[0];
  const medsList = patient.medications.map((m) => `${m.name} (${m.dosage})`).join(", ") || "—";
  const temp = latest?.temperature != null ? `${latest.temperature}°C` : "—";
  const pain = painLabel(latest?.painLevel, lang);
  const woundStatus = latest?.symptomsText?.toLowerCase().includes("wound") ||
    latest?.symptomsText?.toLowerCase().includes("dressing")
    ? (lang === "ENGLISH" ? "needs review" : "check karna")
    : (lang === "ENGLISH" ? "healing" : "theek");
  const nextPlan = patient.followUpPlans[0];
  const nextCheck = nextPlan
    ? new Date(nextPlan.plannedDate).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
    : "—";

  let content: string;
  switch (lang) {
    case "HINDI":
      content =
        `नमस्ते ${patient.familyName || ""} जी,\n` +
        `आज ${day}वां दिन है।\n` +
        `✅ दवा: ${medsList}\n` +
        `⚡ तापमान: ${temp}\n` +
        `🩹 दर्द: ${pain}\n` +
        `📅 अगला चेक: ${nextCheck}\n` +
        `कोई समस्या हो तो रिप्लाई करें।`;
      break;
    case "ENGLISH":
      content =
        `Namaste ${patient.familyName || ""},\n` +
        `Day ${day} of recovery.\n` +
        `✅ Meds: ${medsList}\n` +
        `⚡ Temp: ${temp}\n` +
        `🩹 Pain: ${pain}\n` +
        `🩺 Wound: ${woundStatus}\n` +
        `📅 Next check: ${nextCheck}\n` +
        `Reply if any concern.`;
      break;
    case "TAMIL":
      content =
        `வணக்கம் ${patient.familyName || ""},\n` +
        `மீட்பு நாள் ${day}.\n` +
        `✅ மருந்து: ${medsList}\n` +
        `⚡ உஷ்ணம்: ${temp}\n` +
        `🩹 வலி: ${pain}\n` +
        `📅 அடுத்த சோதனை: ${nextCheck}\n` +
        `ஏதேனும் பிரச்சினை இருந்தால் பதிலளிக்கவும்.`;
      break;
    // HINGLISH (default) — most common in Indian metros
    default:
      content =
        `Namaste ${patient.familyName || ""} ji,\n` +
        `Aaj ${day} ka din hai recovery mein.\n` +
        `✅ Dawa: ${medsList}\n` +
        `⚡ Taapman: ${temp}\n` +
        `🩹 Dard: ${pain}\n` +
        `🩺 Wound: ${woundStatus}\n` +
        `📅 Agla check: ${nextCheck}\n` +
        `Koi problem ho toh reply karein.`;
      break;
  }
  return { content, language: lang };
}

/** Compose an immediate escalation notice to the family (HIGH/CRITICAL triage). */
export function composeEscalationNotice(opts: {
  familyName?: string | null;
  coordinatorName?: string | null;
  coordinatorPhone?: string | null;
  language?: FamilyLanguage;
  reason: string;
}): string {
  const lang = opts.language || "HINGLISH";
  const fname = opts.familyName || "";
  const coord = opts.coordinatorName || "Coordinator";
  const phone = opts.coordinatorPhone || "hospital desk";
  if (lang === "ENGLISH") {
    return (
      `Alert ${fname}: a change in patient condition has been detected.\n` +
      `Reason: ${opts.reason}\n` +
      `Please contact hospital coordinator ${coord} immediately.\n` +
      `Call: ${phone}`
    );
  }
  // Hinglish default
  return (
    `Alert: ${fname} ki tabiyat mein kuch change dikha hai.\n` +
    `Karan: ${opts.reason}\n` +
    `Hospital coordinator ${coord} se turant baat karein.\n` +
    `Call: ${phone}`
  );
}

/** Compose a medication reminder (per dose). */
export function composeMedicationReminder(opts: {
  familyName?: string | null;
  medicationName: string;
  dosage?: string;
  language?: FamilyLanguage;
}): string {
  const lang = opts.language || "HINGLISH";
  const fname = opts.familyName || "";
  const doseStr = opts.dosage ? ` (${opts.dosage})` : "";
  if (lang === "ENGLISH") {
    return `${fname}, ${opts.medicationName}${doseStr} is due now.\nReply "YES" once taken.`;
  }
  return `${fname} ji, ${opts.medicationName}${doseStr} ki dawa ab leni hai.\n"YES" reply karein leene ke baad.`;
}

/** Persist a FamilyUpdate record (status=QUEUED). */
export async function createFamilyUpdate(input: FamilyUpdateInput): Promise<string> {
  let content = input.content;
  let language = input.language;
  if (!content) {
    if (input.type === "DAILY_RECOVERY") {
      const composed = await composeDailyRecoveryUpdate(input.patientId, input.hospitalId);
      if (!composed) throw new Error("Patient not found or family not opted in");
      content = composed.content;
      language = composed.language;
    } else if (input.type === "ESCALATION_NOTICE") {
      // Caller must supply content for escalation notices.
      throw new Error("ESCALATION_NOTICE requires explicit content");
    } else {
      throw new Error(`Cannot auto-compose update of type ${input.type}`);
    }
  }
  const update = await db.familyUpdate.create({
    data: {
      patientId: input.patientId,
      hospitalId: input.hospitalId,
      content,
      type: input.type,
      language: language || "HINGLISH",
      status: "QUEUED",
    },
  });
  // Log to timeline.
  await db.timelineEvent.create({
    data: {
      patientId: input.patientId,
      hospitalId: input.hospitalId,
      eventType: "FAMILY_UPDATE_QUEUED",
      title: `Family update queued (${input.type})`,
      detail: content.slice(0, 280),
      actorId: null,
    },
  });
  return update.id;
}

/** Mark a family update as sent (called by the WhatsApp send cron).
 *  P0 (#11): persists the providerMessageId on the FamilyUpdate itself (the
 *  authoritative outbox record), NOT on a secondary Message row that can be
 *  silently lost via .catch(() => {}). If this update fails, the caller must
 *  transition the record to RECONCILIATION_REQUIRED — do NOT swallow the error. */
export async function markFamilyUpdateSent(id: string, providerMessageId?: string): Promise<void> {
  await db.familyUpdate.update({
    where: { id },
    data: {
      status: "SENT",
      sentAt: new Date(),
      // Persist the provider message ID so inbound status callbacks
      // (delivered/read) can match this record. This is the durable owner.
      ...(providerMessageId ? { providerMessageId } : {}),
    },
  });
}

/** Mark a family update as failed with an optional reason. */
export async function markFamilyUpdateFailed(id: string, reason?: string): Promise<void> {
  await db.familyUpdate.update({
    where: { id },
    data: { status: "FAILED", failedAt: new Date(), failureReason: reason ?? null },
  });
}

/** Atomically claim a QUEUED update for sending (QUEUED → SENDING).
 *  Only one worker wins the race. Returns true if this worker won. */
async function atomicClaimForSending(id: string, workerId: string): Promise<boolean> {
  const result = await db.familyUpdate.updateMany({
    where: { id, status: "QUEUED" },
    data: { status: "SENDING", claimedAt: new Date(), claimedBy: workerId },
  });
  return result.count > 0;
}

/**
 * Park FamilyUpdate records stuck in SENDING past the lease timeout as
 * RECONCILIATION_REQUIRED — do NOT blindly reset them to QUEUED.
 *
 * Rationale (P0 reliability): a slow Meta API response can leave a record in
 * SENDING after the provider has ALREADY accepted the message. Resetting it
 * to QUEUED would cause a second send → the family receives the same message
 * twice. That is unacceptable in a healthcare context.
 *
 * RECONCILIATION_REQUIRED parks the record for an operator (or an automated
 * reconciler that queries the Meta message-status API) to confirm whether the
 * original send succeeded:
 *   - If Meta confirms delivery → mark SENT (idempotently record the
 *     providerMessageId so receipt callbacks dedup).
 *   - If Meta confirms failure  → mark FAILED.
 *   - If Meta has no record      → safe to manually reset to QUEUED.
 *
 * Returns the count of records parked for reconciliation.
 */
export async function recoverStuckSendingUpdates(timeoutMs = 5 * 60 * 1000): Promise<number> {
  const cutoff = new Date(Date.now() - timeoutMs);
  const result = await db.familyUpdate.updateMany({
    where: { status: "SENDING", claimedAt: { lt: cutoff } },
    data: {
      status: "RECONCILIATION_REQUIRED",
      // Preserve claimedAt/claimedBy for audit — do NOT clear them, the
      // reconciler needs to know which worker last touched the record.
      failureReason: `Lease expired (>${Math.round(timeoutMs / 1000)}s); parked for provider reconciliation to avoid duplicate send.`,
    },
  });
  return result.count;
}

/**
 * After an operator / automated reconciler has confirmed the provider's
 * state for a RECONCILIATION_REQUIRED record, this transitions it back to
 * QUEUED so the normal send loop can retry. This is the ONLY safe path back
 * to QUEUED — it requires explicit confirmation that the provider did NOT
 * accept the original send.
 */
export async function reconcileToSendingQueue(id: string, confirmedNotAcceptedByProvider: boolean): Promise<boolean> {
  if (!confirmedNotAcceptedByProvider) {
    throw new Error(
      "reconcileToSendingQueue requires confirmedNotAcceptedByProvider=true. " +
        "If the provider accepted the message, mark the record SENT (or FAILED) directly.",
    );
  }
  const result = await db.familyUpdate.updateMany({
    where: { id, status: "RECONCILIATION_REQUIRED" },
    data: { status: "QUEUED", claimedAt: null, claimedBy: null, failureReason: null },
  });
  return result.count > 0;
}

/** Look up a patient by family contact number (SHA-256 hash). Used for inbound WhatsApp replies. */
export async function findPatientByFamilyContact(mobilePlain: string, hospitalId?: string) {
  const { lookupHash } = await import("@/lib/crypto");
  const hash = lookupHash(mobilePlain);
  return db.patient.findFirst({
    where: { familyContactHash: hash, deletedAt: null, ...(hospitalId ? { hospitalId } : {}) },
    include: { hospital: true },
  });
}

/** Get the family contact mobile (decrypted) for outbound WhatsApp. */
export async function getFamilyContactMobile(patientId: string, hospitalId: string): Promise<string | null> {
  const p = await db.patient.findFirst({
    where: { id: patientId, hospitalId, deletedAt: null },
    select: { familyContactEncrypted: true, familyOptIn: true },
  });
  if (!p || !p.familyOptIn || !p.familyContactEncrypted) return null;
  try {
    return decryptPII(p.familyContactEncrypted);
  } catch {
    return null;
  }
}

/**
 * Send pending family updates via the real WhatsApp Business Cloud API.
 * Sends free-form text (works inside the open 24-hour customer-service window
 * after the family member last replied). If WhatsApp is not configured, or Meta
 * rejects the send (e.g. window closed), the update is marked FAILED — no
 * silent simulation. The provider message id is recorded for receipt matching.
 *
 * P0 FIX: Uses atomic QUEUED → SENDING claim to prevent concurrent cron workers
 * from sending duplicate WhatsApp messages. Only the worker that wins the
 * atomic claim proceeds to send.
 *
 * P0 FIX (this pass): records stuck in SENDING for > 5 minutes are NO LONGER
 * reset to QUEUED. They are parked as RECONCILIATION_REQUIRED to avoid the
 * scenario where a slow Meta API response left the record SENDING AFTER the
 * provider had already accepted the message (which would cause a duplicate
 * delivery on naive retry). RECONCILIATION_REQUIRED records are excluded from
 * this send loop; an operator or reconciler must explicitly clear them.
 */
export async function sendPendingFamilyUpdates(): Promise<{ sent: number; failed: number; skipped: number; reconciled: number }> {
  const workerId = `worker-${process.pid}-${Date.now()}`;

  // Park any records stuck in SENDING for too long (crashed worker / slow API).
  // These are NOT retried automatically — see recoverStuckSendingUpdates().
  const reconciled = await recoverStuckSendingUpdates();
  if (reconciled > 0) {
    console.error(JSON.stringify({
      ts: new Date().toISOString(),
      level: 'warn',
      event: 'family_update.reconciled',
      count: reconciled,
      message: 'Parked stuck SENDING records as RECONCILIATION_REQUIRED — manual/reconciler review required.',
    }));
  }

  // Only QUEUED records are eligible. RECONCILIATION_REQUIRED is deliberately
  // excluded — those need explicit reconciliation, not a blind retry.
  const pending = await db.familyUpdate.findMany({
    where: { status: "QUEUED" },
    take: 100,
    orderBy: { createdAt: "asc" },
  });
  let sent = 0;
  let failed = 0;
  let skipped = 0;
  // Lazy import to avoid a circular module-load dependency at boot.
  const { sendTextMessage, WhatsAppNotConfiguredError } = await import("@/lib/whatsapp");
  for (const u of pending) {
    // P0 FIX: Atomically claim QUEUED → SENDING. Only the winner proceeds.
    const claimed = await atomicClaimForSending(u.id, workerId);
    if (!claimed) {
      skipped++;
      continue;
    }
    try {
      const mobile = await getFamilyContactMobile(u.patientId, u.hospitalId);
      if (!mobile) {
        await markFamilyUpdateFailed(u.id, "family contact not found or not opted in");
        failed++;
        continue;
      }
      const { whatsappMessageId } = await sendTextMessage({ toMobileE164: mobile, body: u.content });
      // P0 (#11): Meta accepted the send + returned a provider message ID.
      // We MUST durably persist this ID on the FamilyUpdate itself (the
      // authoritative outbox record) so inbound status callbacks can match
      // it. The Message row is also created in the SAME transaction for
      // audit/timeline — if either write fails, the FamilyUpdate transitions
      // to RECONCILIATION_REQUIRED (NOT SENT), so the reconciler can confirm
      // provider state before retrying. Do NOT swallow the DB error.
      try {
        await db.$transaction(async (tx) => {
          // 1. Mark the FamilyUpdate SENT + persist providerMessageId (durable owner).
          await tx.familyUpdate.update({
            where: { id: u.id },
            data: {
              status: "SENT",
              sentAt: new Date(),
              providerMessageId: whatsappMessageId,
            },
          });
          // 2. Create the Message row (audit/timeline) in the same transaction.
          await tx.message.create({
            data: {
              hospitalId: u.hospitalId,
              patientId: u.patientId,
              channel: "WHATSAPP",
              direction: "OUTBOUND",
              toAddress: "family",
              body: u.content,
              status: "SENT",
              providerMessageId: whatsappMessageId,
            },
          });
        });
        sent++;
      } catch (persistErr) {
        // P0 (#11): the provider accepted the message (we have a
        // providerMessageId), but local persistence failed. We CANNOT mark
        // this SENT — that would lose the providerMessageId and break status
        // matching. Transition to RECONCILIATION_REQUIRED so an operator or
        // reconciler can confirm provider state + manually record the ID.
        // Do NOT swallow this error — log it loudly.
        await db.familyUpdate.update({
          where: { id: u.id },
          data: {
            status: "RECONCILIATION_REQUIRED",
            failureReason: `Provider accepted send (id=${whatsappMessageId}) but local persistence failed: ${persistErr instanceof Error ? persistErr.message : String(persistErr)}`,
          },
        }).catch(() => {
          // If even the RECONCILIATION_REQUIRED transition fails, the record
          // stays in SENDING and will be caught by the next
          // recoverStuckSendingUpdates run (which also parks to
          // RECONCILIATION_REQUIRED). Log loudly either way.
          console.error(JSON.stringify({
            ts: new Date().toISOString(),
            level: 'error',
            event: 'family_update.persist_failed',
            familyUpdateId: u.id,
            providerMessageId: whatsappMessageId,
            error: persistErr instanceof Error ? persistErr.message : String(persistErr),
          }));
        });
        console.error(JSON.stringify({
          ts: new Date().toISOString(),
          level: 'error',
          event: 'family_update.persist_failed',
          familyUpdateId: u.id,
          providerMessageId: whatsappMessageId,
          error: persistErr instanceof Error ? persistErr.message : String(persistErr),
        }));
        failed++;
      }
    } catch (err) {
      // If WhatsApp isn't configured, leave the record in SENDING (the next
      // run's recoverStuckSendingUpdates will park it for reconciliation). Do
      // NOT keep hammering the API on every cron tick. Stop processing further
      // records this run.
      if (err instanceof WhatsAppNotConfiguredError) {
        break;
      }
      await markFamilyUpdateFailed(u.id, err instanceof Error ? err.message : String(err));
      failed++;
    }
  }
  return { sent, failed, skipped, reconciled };
}
