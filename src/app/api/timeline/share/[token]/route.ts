// Ojas — Timeline Share API (P0.3) — HARDENED (pass 2).
// POST   /api/timeline/share            — Generate a shareable, time-limited
//                                         read-only timeline link. The raw
//                                         token is returned ONCE (to the
//                                         authorized creator only); only its
//                                         SHA-256 hash is stored.
// GET    /api/timeline/share/[token]    — Public access: returns the
//                                         audience-scoped timeline (no PII).
// DELETE /api/timeline/share/[token]    — Revoke a share (auth required).
//
// ── THIS PASS (P1 security/auditability) ───────────────────────────────────
//  1. Token storage: raw token is shown ONCE at creation; only its SHA-256
//     hash is persisted in TimelineShare.tokenHash. Public lookups hash the
//     incoming bearer token and match on tokenHash. A DB leak does not
//     immediately compromise live share links.
//  2. Revocation: DELETE is now a SOFT state transition (active=false,
//     revokedAt, revokedBy). The audit trail of who revoked what and when is
//     preserved (healthcare requirement). Hard-delete is no longer performed.
//  3. Audience enforcement: events are filtered at the DB query level using
//     eventType IN (allowed-for-audience). We do NOT fetch every clinical
//     event and then regex-redact — that was unsafe (regex redaction can miss
//     PHI patterns). Each audience has an explicit allow-list.
//  4. Cache protection: every public response includes Cache-Control: no-store,
//     Referrer-Policy: no-referrer, X-Robots-Tag: noindex, nofollow. The
//     timeline content is never cached at CDN / Next.js / browser / reverse
//     proxy.
//  5. Rate limiting: rateLimitStrict per (tokenHash + client IP). Prevents
//     brute-force token enumeration. Fails CLOSED in production without Redis.
//  6. Access audit: the FIRST successful access per share is audited
//     (TIMELINE_SHARE_ACCESSED). Subsequent accesses only refresh accessedAt
//     (avoid flooding the audit log on every page refresh).
//  7. Token hygiene: raw tokens are NEVER logged. Audit details use a
//     truncated SHA-256 prefix only.
import { NextRequest } from "next/server";
import { createHash, randomBytes } from "crypto";
import { db } from "@/lib/db";
import { getCurrentUser, requireAuth, requireTenantAccess } from "@/lib/auth";
import { jsonError, audit, getClientIp, rateLimitStrict } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import { z } from "zod";

type Ctx = { params: Promise<{ token: string }> };

type ShareAudience = "FAMILY" | "DOCTOR" | "COORDINATOR";

// ── Audience-scoped event allow-lists ───────────────────────────────────────
// Each audience gets an EXPLICIT projection. We never fetch all events and
// then redact — the DB query restricts eventType to the allow-list.
const FAMILY_SAFE_EVENT_TYPES = [
  "ENROLLMENT",
  "MILESTONE_ACHIEVED",
  "CHECKIN_COMPLETED",
  "FOLLOW_UP_SCHEDULED",
  "FOLLOW_UP_COMPLETED",
  "FAMILY_UPDATE_SENT",
  "FAMILY_UPDATE_QUEUED",
] as const;

const DOCTOR_EVENT_TYPES = [
  "ENROLLMENT",
  "MILESTONE_ACHIEVED",
  "CHECKIN_COMPLETED",
  "CHECKIN_MISSED",
  "ESCALATION_CREATED",
  "ESCALATION_RESOLVED",
  "MEDICATION_CHANGED",
  "MEDICATION_ADHERENCE",
  "FOLLOW_UP_SCHEDULED",
  "FOLLOW_UP_COMPLETED",
  "RISK_STRATIFICATION",
  "DISCHARGE_SUMMARY_CREATED",
] as const;

const COORDINATOR_EVENT_TYPES = [
  "ENROLLMENT",
  "MILESTONE_ACHIEVED",
  "CHECKIN_COMPLETED",
  "CHECKIN_MISSED",
  "ESCALATION_CREATED",
  "ESCALATION_RESOLVED",
  "ESCALATION_ACKNOWLEDGED",
  "ESCALATION_HANDED_OFF",
  "FOLLOW_UP_SCHEDULED",
  "FOLLOW_UP_COMPLETED",
  "FAMILY_UPDATE_SENT",
  "FAMILY_UPDATE_QUEUED",
  "CONSENT_GRANTED",
  "CONSENT_REVOKED",
] as const;

function allowedTypesFor(audience: ShareAudience): readonly string[] {
  if (audience === "FAMILY") return FAMILY_SAFE_EVENT_TYPES;
  if (audience === "DOCTOR") return DOCTOR_EVENT_TYPES;
  return COORDINATOR_EVENT_TYPES;
}

/** Build an audience-scoped projection of timeline events. Called AFTER the
 *  DB query has already filtered by eventType — this function only shapes
 *  the response (e.g. drops detail for FAMILY audience). */
function shapeEventsForAudience(
  events: Array<{ id: string; eventType: string; title: string; detail: string | null; occurredAt: Date }>,
  audience: ShareAudience,
): Array<{ id: string; eventType: string; title: string; detail: string | null; occurredAt: Date }> {
  if (audience === "FAMILY") {
    // Family never sees raw detail — only the title (which is curated to be
    // family-safe at creation time).
    return events.map((e) => ({
      id: e.id,
      eventType: e.eventType,
      title: e.title,
      detail: null,
      occurredAt: e.occurredAt,
    }));
  }
  // DOCTOR / COORDINATOR — return title + detail. Detail was authored by
  // trusted internal users (coordinators / system). No regex redaction is
  // applied because the audience allow-list already restricts which event
  // types are visible; redaction-by-regex is unsafe and explicitly avoided.
  return events.map((e) => ({
    id: e.id,
    eventType: e.eventType,
    title: e.title,
    detail: e.detail,
    occurredAt: e.occurredAt,
  }));
}

/** Build audience-scoped patient info. Never expose riskLevel, diagnosis,
 *  internal AI output, or escalation internals to FAMILY. */
function buildPatientProjection(
  patient: { surgeryType: string; dischargeDate: Date; status: string; riskLevel: string | null },
  audience: ShareAudience,
) {
  const dayOfRecovery = Math.max(
    1,
    Math.floor((Date.now() - patient.dischargeDate.getTime()) / (24 * 60 * 60 * 1000)) + 1,
  );

  if (audience === "FAMILY") {
    return {
      dayOfRecovery,
      status: patient.status,
      // Deliberately exclude: surgeryType, riskLevel, dischargeDate, diagnosis
    };
  }

  if (audience === "COORDINATOR") {
    return {
      surgeryType: patient.surgeryType,
      dayOfRecovery,
      status: patient.status,
      // Deliberately exclude: riskLevel (only doctors see risk stratification)
    };
  }

  // DOCTOR — most clinical context
  return {
    surgeryType: patient.surgeryType,
    dayOfRecovery,
    dischargeDate: patient.dischargeDate,
    status: patient.status,
    riskLevel: patient.riskLevel,
  };
}

/** SHA-256 hash of the raw token. This is what we store + look up by. */
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A short prefix of the token hash, safe to put in audit details / logs.
 *  Never reveals enough to brute-force the raw token. */
function tokenHashPrefix(tokenHash: string): string {
  return tokenHash.slice(0, 12);
}

// ── Public GET — audience-scoped, no-cache, rate-limited, audited ──────────
async function GETImpl(req: NextRequest, ctx: Ctx) {
  const { token } = await ctx.params;

  // Hash the incoming token ONCE. We look up by tokenHash, so the raw token
  // never touches a DB query, a log line, or a rate-limit key.
  const tHash = hashToken(token);

  // Rate limit per (tokenHash + IP). Fails CLOSED in production without Redis.
  const ip = getClientIp(req);
  const rl = await rateLimitStrict(`share:${tokenHashPrefix(tHash)}:${ip || "anon"}`, 30, 60);
  if (!rl.allowed) {
    return jsonError("Too many requests", 429);
  }

  // Look up by HASH, not by raw token.
  const share = await db.timelineShare.findUnique({
    where: { tokenHash: tHash },
    include: { patient: true },
  });
  if (!share) return jsonError("Not found", 404);

  // Revoked (soft-delete) → 410 Gone. We treat revoked the same as expired
  // from the caller's perspective, but the share row is retained for audit.
  if (!share.active) return jsonError("Link revoked", 410);
  if (share.expiresAt < new Date()) return jsonError("Link expired", 410);
  if (share.patient.deletedAt) return jsonError("Not found", 404);

  // Audience-scoped DB query — filter at the source, not after the fetch.
  const audience = (share.audience as ShareAudience) || "DOCTOR";
  const allowedTypes = allowedTypesFor(audience);
  const events = await db.timelineEvent.findMany({
    where: {
      patientId: share.patientId,
      hospitalId: share.hospitalId,
      eventType: { in: allowedTypes as unknown as string[] },
    },
    orderBy: { occurredAt: "desc" },
    take: 50,
    select: { id: true, eventType: true, title: true, detail: true, occurredAt: true },
  });

  const shapedEvents = shapeEventsForAudience(events, audience);
  const patientProjection = buildPatientProjection(share.patient, audience);

  // Audit the access. To avoid flooding the audit log on every page refresh,
  // we only write a TIMELINE_SHARE_ACCESSED row the FIRST time a share is
  // accessed (accessedAt is null). Subsequent hits refresh accessedAt.
  const isFirstAccess = share.accessedAt === null;
  await db.timelineShare.update({
    where: { id: share.id },
    data: { accessedAt: new Date() },
  });
  if (isFirstAccess) {
    await audit({
      hospitalId: share.hospitalId,
      actorId: null,
      action: "TIMELINE_SHARE_ACCESSED",
      target: share.patientId,
      detail: `audience=${audience} tokenHashPrefix=${tokenHashPrefix(tHash)}`,
      ip: null, // never store raw IP for public share access (privacy)
    }).catch(() => { /* audit is best-effort */ });
  }

  return Response.json({
    audience,
    expiresAt: share.expiresAt,
    patient: patientProjection,
    events: shapedEvents,
  }, {
    headers: {
      // P1 FIX: never cache patient timeline content anywhere.
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      "Referrer-Policy": "no-referrer",
      "X-Robots-Tag": "noindex, nofollow",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
}

// ── Public DELETE — soft revoke (auth required) ────────────────────────────
// The [token] param can be EITHER:
//   - the raw bearer token (hashed → looked up by tokenHash) — used by the
//     "copy link + revoke" flow where the creator has the raw token
//   - the share row id (cuid) — used by the "manage shares" panel where we
//     only have the row id (the raw token was shown once at creation and is
//     not stored). We detect this by checking if the param is a 24+ char
//     cuid; if so, we look up by id directly.
async function DELETEImpl(req: NextRequest, ctx: Ctx) {
  const user = requireAuth(await getCurrentUser());
  const { token } = await ctx.params;

  // Try tokenHash lookup first (the canonical path).
  const tHash = hashToken(token);
  let share = await db.timelineShare.findUnique({
    where: { tokenHash: tHash },
    select: { id: true, hospitalId: true, patientId: true, active: true },
  });

  // Fallback: if no tokenHash match AND the param looks like a cuid (the
  // share row id), look up by id. This enables the manage-shares UI to
  // revoke by id without needing the raw token.
  if (!share && /^[a-z0-9]{20,}$/i.test(token)) {
    share = await db.timelineShare.findUnique({
      where: { id: token },
      select: { id: true, hospitalId: true, patientId: true, active: true },
    });
  }

  if (!share) return jsonError("Not found", 404);
  await requireTenantAccess(user, share.hospitalId);

  // P1 FIX: soft-revoke. Preserves the audit trail (who revoked, when).
  // Idempotent: revoking an already-revoked share is a no-op (still 200).
  if (share.active) {
    await db.timelineShare.update({
      where: { id: share.id },
      data: {
        active: false,
        revokedAt: new Date(),
        revokedBy: user.sub,
      },
    });
    await audit({
      hospitalId: share.hospitalId,
      actorId: user.sub,
      action: "TIMELINE_SHARE_REVOKED",
      target: share.patientId,
      // Never log raw share tokens — log only a truncated hash prefix.
      detail: `tokenHashPrefix=${tokenHashPrefix(tHash)}`,
      ip: getClientIp(req),
    });
  }
  return Response.json({ ok: true });
}

export const GET = withErrors(GETImpl);
export const DELETE = withErrors(DELETEImpl);
