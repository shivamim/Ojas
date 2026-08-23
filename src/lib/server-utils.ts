// Ojas — shared server utilities that don't depend on auth types: audit
// logging, rate limiting (durable via Upstash when configured, real in-memory
// fallback otherwise), JSON helpers. The requireAuth/requireRole/
// requireTenantAccess helpers live in auth.ts because they need the
// AccessTokenPayload type defined there (avoids a circular import).
import { db } from "@/lib/db";
import { Redis } from "@upstash/redis";

/** Write an audit log entry. Transactionally consistent with the action it records. */
export async function audit(params: {
  hospitalId?: string | null;
  actorId?: string | null;
  action: string;
  target?: string | null;
  detail?: string | null;
  ip?: string | null;
}) {
  return db.auditLog.create({
    data: {
      hospitalId: params.hospitalId ?? null,
      actorId: params.actorId ?? null,
      action: params.action,
      target: params.target ?? null,
      detail: params.detail ?? null,
      ip: params.ip ?? null,
    },
  });
}

// ── Durable rate limiter ────────────────────────────────────────────────────
// Uses Upstash Redis (REST) when UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN
// are set, giving a durable, multi-instance fixed-window limiter. When those
// env vars are absent, falls back to the real in-memory limiter and warns once
// on startup that rate limiting is NOT durable across instances/restarts.
//
// NOTE: this function is async (real Upstash REST calls are async). Call sites
// `await rateLimit(...)`. The signature (key, limit, windowSec) and the return
// shape { allowed, remaining, resetAt } are unchanged — only the return is now
// a Promise, which is unavoidable for a genuine durable backend.
interface RateResult { allowed: boolean; remaining: number; resetAt: number; }
interface RateBucket { count: number; resetAt: number; }

let upstashClient: Redis | null | undefined = undefined; // undefined = not yet resolved
let inMemoryBuckets = new Map<string, RateBucket>();
let durabilityWarned = false;

function resolveUpstash(): Redis | null {
  if (upstashClient !== undefined) return upstashClient;
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;
  if (url && token) {
    try {
      upstashClient = new Redis({ url, token });
      return upstashClient;
    } catch (err) {
      console.error("[rate-limit] Upstash client init failed; falling back to in-memory:", err);
      upstashClient = null;
      return null;
    }
  }
  upstashClient = null;
  return null;
}

/** Returns true if allowed, false if rate-limited. Window in seconds, limit N requests.
 *  Durable (Upstash) when configured; real in-memory fallback otherwise. */
export async function rateLimit(key: string, limit: number, windowSec: number): Promise<RateResult> {
  const redis = resolveUpstash();
  if (redis) {
    // Fixed-window counter in Upstash Redis. The window key embeds the bucket
    // start time so counters reset cleanly at each window boundary.
    const now = Date.now();
    const windowStart = Math.floor(now / (windowSec * 1000));
    const redisKey = `ojas:rl:${key}:${windowStart}`;
    try {
      const count = await redis.incr(redisKey);
      // Set expiry on the first increment so the key expires after the window.
      if (count === 1) {
        await redis.expire(redisKey, windowSec + 1);
      }
      const allowed = count <= limit;
      const remaining = Math.max(0, limit - count);
      const resetAt = (windowStart + 1) * windowSec * 1000;
      return { allowed, remaining, resetAt };
    } catch (err) {
      // If Upstash is unreachable, fail OPEN (allow the request) but log loudly.
      // Failing closed would lock out every user during a Redis outage, which
      // for a patient-care app is worse than a temporarily-weak rate limit.
      console.error("[rate-limit] Upstash call failed; failing open (in-memory not used to avoid double counting):", err);
      return { allowed: true, remaining: limit - 1, resetAt: Date.now() + windowSec * 1000 };
    }
  }
  // ── In-memory fallback ───────────────────────────────────────────────────
  if (!durabilityWarned) {
    durabilityWarned = true;
    console.warn(
      "[rate-limit] UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN not set — " +
      "rate limiting is in-memory only and NOT durable across instances/restarts. " +
      "Set both env vars for production-grade durable rate limiting."
    );
  }
  const now = Date.now();
  const bucket = inMemoryBuckets.get(key);
  if (!bucket || bucket.resetAt < now) {
    inMemoryBuckets.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return { allowed: true, remaining: limit - 1, resetAt: now + windowSec * 1000 };
  }
  if (bucket.count >= limit) {
    return { allowed: false, remaining: 0, resetAt: bucket.resetAt };
  }
  bucket.count += 1;
  return { allowed: true, remaining: limit - bucket.count, resetAt: bucket.resetAt };
}

// ── V3-G: STRICT rate limiter for high-risk PUBLIC endpoints ─────────────────
// For endpoints like login, OTP, password reset, public API — where weak
// protection is worse than no service — production MUST use the distributed
// (Upstash) limiter. If Redis is unreachable in production, this variant FAILS
// CLOSED (returns allowed=false) rather than silently allowing unlimited
// traffic. In development it uses the in-memory fallback.
//
// Use this for: /api/auth (login), /api/auth/accept-invite, password reset,
// public patient-lookup, OTP send, webhook-abuse surfaces.
export async function rateLimitStrict(key: string, limit: number, windowSec: number): Promise<RateResult> {
  const redis = resolveUpstash();
  const isProd = process.env.NODE_ENV === "production";

  if (redis) {
    const now = Date.now();
    const windowStart = Math.floor(now / (windowSec * 1000));
    const redisKey = `ojas:rls:${key}:${windowStart}`;
    try {
      const count = await redis.incr(redisKey);
      if (count === 1) await redis.expire(redisKey, windowSec + 1);
      const allowed = count <= limit;
      const remaining = Math.max(0, limit - count);
      const resetAt = (windowStart + 1) * windowSec * 1000;
      return { allowed, remaining, resetAt };
    } catch (err) {
      // V3-G: in production, a Redis outage on a high-risk public endpoint
      // FAILS CLOSED. (Dev fails open so local testing isn't blocked.)
      if (isProd) {
        console.error("[rate-limit-strict] Upstash failed in PRODUCTION — failing CLOSED for high-risk endpoint:", err);
        return { allowed: false, remaining: 0, resetAt: Date.now() + windowSec * 1000 };
      }
      console.error("[rate-limit-strict] Upstash failed in dev — failing open:", err);
      return { allowed: true, remaining: limit - 1, resetAt: Date.now() + windowSec * 1000 };
    }
  }

  // No Redis configured at all.
  if (isProd) {
    // V3-G: production with no distributed limiter = FAIL CLOSED for high-risk
    // public endpoints. Silently degrading to in-memory would give a false
    // sense of protection across multiple serverless instances.
    if (!durabilityWarned) {
      durabilityWarned = true;
      console.error(
        "[rate-limit-strict] PRODUCTION has no UPSTASH_REDIS_REST_URL/TOKEN. " +
        "High-risk public endpoints will FAIL CLOSED (deny) until Redis is configured."
      );
    }
    return { allowed: false, remaining: 0, resetAt: Date.now() + windowSec * 1000 };
  }

  // Dev: in-memory fallback (warned once).
  if (!durabilityWarned) {
    durabilityWarned = true;
    console.warn("[rate-limit-strict] Dev mode: in-memory limiter only.");
  }
  return rateLimit(key, limit, windowSec);
}

/** Standard JSON error response. */
export function jsonError(message: string, status = 400, extra?: Record<string, unknown>) {
  return Response.json({ error: message, ...extra }, { status });
}

/** Read the real client IP from common proxy headers. */
export function getClientIp(req: Request): string | null {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) return xff.split(",")[0].trim();
  const real = req.headers.get("x-real-ip");
  return real || null;
}
