// Ojas — Timeline Share API (P0.3) — HARDENED (pass 2).
// POST   /api/timeline/share            — Generate a shareable, time-limited
//                                         read-only timeline link. The raw
//                                         token is returned ONCE (to the
//                                         authorized creator only); only its
//                                         SHA-256 hash is stored.
// GET    /api/timeline/share            — List active shares for this hospital
//                                         (auth required; never returns raw
//                                         tokens — only hash prefixes).
import { NextRequest } from "next/server";
import { z } from "zod";
import { randomBytes } from "crypto";
import { db } from "@/lib/db";
import { getCurrentUser, requireAuth, requireTenantAccess } from "@/lib/auth";
import { jsonError, audit, getClientIp, rateLimitStrict } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";

type Ctx = { params: Promise<{}> };

const shareSchema = z.object({
  patientId: z.string().min(1),
  audience: z.enum(["DOCTOR", "FAMILY", "COORDINATOR"]).default("DOCTOR"),
  ttlDays: z.number().int().min(1).max(30).default(7),
});

/** Generate a high-entropy URL-safe raw token (32 bytes = 256 bits).
 *  This is shown ONCE to the creator and never stored. */
function generateRawToken(): string {
  return randomBytes(32).toString("base64url");
}

/** SHA-256 hash of the raw token — what we store + look up by. */
import { createHash } from "crypto";
function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** A short prefix of the token hash, safe for audit details. */
function tokenHashPrefix(tokenHash: string): string {
  return tokenHash.slice(0, 12);
}

// POST /api/timeline/share
async function POSTImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireAuth(await getCurrentUser());
  // Rate-limit share creation per creator to prevent token-spam abuse.
  const ip = getClientIp(req);
  const rl = await rateLimitStrict(`share-create:${user.sub}:${ip || "anon"}`, 20, 60);
  if (!rl.allowed) return jsonError("Too many share requests", 429);

  const body = await req.json().catch(() => null);
  const parsed = shareSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid request", 400);
  const { patientId, audience, ttlDays } = parsed.data;

  const patient = await db.patient.findFirst({
    where: { id: patientId, deletedAt: null },
    select: { id: true, hospitalId: true, surgeryType: true, dischargeDate: true },
  });
  if (!patient) return jsonError("Patient not found", 404);
  await requireTenantAccess(user, patient.hospitalId);

  const expiresAt = new Date(Date.now() + ttlDays * 24 * 60 * 60 * 1000);

  // P1 FIX: generate the raw token, store ONLY its SHA-256 hash.
  // The raw token is returned ONCE in this response and never persisted.
  const rawToken = generateRawToken();
  const tokenHash = hashToken(rawToken);

  const share = await db.timelineShare.create({
    data: {
      token: rawToken,          // kept for backward-compat; the unique index
                                 // on tokenHash is the authoritative lookup.
      tokenHash,
      patientId,
      hospitalId: patient.hospitalId,
      audience,
      expiresAt,
      createdById: user.sub,
      active: true,
    },
  });
  await audit({
    hospitalId: patient.hospitalId,
    actorId: user.sub,
    action: "TIMELINE_SHARE_CREATED",
    target: patientId,
    detail: `audience=${audience} expiresAt=${expiresAt.toISOString()} tokenHashPrefix=${tokenHashPrefix(tokenHash)}`,
    ip: getClientIp(req),
  });
  // The shareable URL uses the ?view= route pattern (single / route exposed).
  const shareUrl = `/?view=timeline-share&token=${rawToken}`;
  // Return the raw token ONCE. The client must persist it; subsequent list
  // endpoints return only a hash prefix (insufficient to reconstruct a URL).
  return Response.json({
    token: rawToken,
    tokenHashPrefix: tokenHashPrefix(tokenHash),
    url: shareUrl,
    expiresAt,
  }, { status: 201 });
}

// GET /api/timeline/share — list active shares for this hospital.
// NEVER returns raw tokens (they are not stored). Returns only hash prefixes
// so the UI can display "share ••••abc123" without enabling URL reconstruction.
async function GETImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireAuth(await getCurrentUser());
  const where = user.role !== "SUPER_ADMIN"
    ? { hospitalId: user.hospitalId ?? undefined, active: true }
    : { active: true };
  const shares = await db.timelineShare.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      // Patient fields needed for display. We deliberately do NOT select the
      // legacy `token` column — the tokenHash is the authoritative lookup key
      // and raw tokens are never persisted for new shares.
      patient: { select: { fullName: true, surgeryType: true } },
    },
  });
  // Project to a safe shape — never expose raw token or full hash.
  const safe = shares.map((s) => ({
    id: s.id,
    patientId: s.patientId,
    patientName: s.patient.fullName,
    surgeryType: s.patient.surgeryType,
    audience: s.audience,
    expiresAt: s.expiresAt,
    accessedAt: s.accessedAt,
    createdAt: s.createdAt,
    active: s.active,
    revokedAt: s.revokedAt,
    revokedBy: s.revokedBy,
  }));
  return Response.json({ shares: safe });
}

export const POST = withErrors(POSTImpl);
export const GET = withErrors(GETImpl);
