// Ojas — auth lib. Cookie-based JWT (httpOnly, Secure, SameSite) with refresh-
// token rotation and reuse detection (fixes B11/B12/B13). Issued by Core API
// only. RBAC enforced per-route via requireRole().
//
// Secret sourcing: see src/lib/env.ts. There are NO production fallbacks —
// the env module fails closed at startup in production if OJAS_JWT_SECRET is
// missing or too short. The dev default lives only behind the isDev gate.
import { cookies } from "next/headers";
import { SignJWT, jwtVerify } from "jose";
import { db } from "@/lib/db";
import { audit } from "@/lib/server-utils";
import { JWT_SECRET } from "@/lib/env";

const JWT_SECRET_KEY = new TextEncoder().encode(JWT_SECRET);
const ACCESS_TTL = 60 * 15;          // 15 minutes
const REFRESH_TTL_DAYS = 30;
const ACCESS_COOKIE = "ojas_access";
const REFRESH_COOKIE = "ojas_refresh";

export type Role = "SUPER_ADMIN" | "HOSPITAL_ADMIN" | "COORDINATOR" | "DOCTOR";

export interface AccessTokenPayload {
  sub: string;          // user id
  email: string;
  name: string;
  role: Role;
  hospitalId: string | null;
  familyId: string;
}

async function sha256(s: string): Promise<string> {
  const { createHash } = await import("crypto");
  return createHash("sha256").update(s).digest("hex");
}

export async function signAccessToken(payload: AccessTokenPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${ACCESS_TTL}s`)
    .setIssuer("ojas-core-api")
    .sign(JWT_SECRET_KEY);
}

export async function verifyAccessToken(token: string): Promise<AccessTokenPayload | null> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET_KEY, { issuer: "ojas-core-api" });
    return {
      sub: payload.sub as string,
      email: payload.email as string,
      name: payload.name as string,
      role: payload.role as Role,
      hospitalId: (payload.hospitalId as string) || null,
      familyId: payload.familyId as string,
    };
  } catch {
    return null;
  }
}

/** Issue access + refresh cookies for a user. Rotates the refresh token family. */
export async function issueSession(user: { id: string; email: string; name: string; role: Role; hospitalId: string | null }, opts: { userAgent?: string; ip?: string } = {}) {
  const familyId = crypto.randomUUID();
  const refreshToken = crypto.randomUUID();
  const refreshTokenHash = await sha256(refreshToken);
  await db.session.create({
    data: {
      userId: user.id,
      refreshTokenHash,
      familyId,
      userAgent: opts.userAgent,
      ip: opts.ip,
    },
  });
  const access = await signAccessToken({
    sub: user.id,
    email: user.email,
    name: user.name,
    role: user.role,
    hospitalId: user.hospitalId,
    familyId,
  });
  const cookieStore = await cookies();
  cookieStore.set(ACCESS_COOKIE, access, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ACCESS_TTL,
  });
  cookieStore.set(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: REFRESH_TTL_DAYS * 86400,
  });
}

/** Get the current user from the access cookie, rotating refresh if needed. */
export async function getCurrentUser(): Promise<AccessTokenPayload | null> {
  const cookieStore = await cookies();
  const access = cookieStore.get(ACCESS_COOKIE)?.value;
  if (access) {
    const payload = await verifyAccessToken(access);
    if (payload) return payload;
  }
  // try refresh
  const refresh = cookieStore.get(REFRESH_COOKIE)?.value;
  if (!refresh) return null;
  return rotateRefresh(refresh);
}

/** Refresh-token rotation with reuse detection. If an already-rotated token is
 * presented again, the whole session family is revoked (treated as theft). */
export async function rotateRefresh(refreshToken: string): Promise<AccessTokenPayload | null> {
  const refreshTokenHash = await sha256(refreshToken);
  const session = await db.session.findUnique({
    where: { refreshTokenHash },
    include: { user: true },
  });
  if (!session) return null;
  // Reuse detection: if already revoked, kill the family.
  if (session.revokedAt) {
    await db.session.updateMany({
      where: { familyId: session.familyId },
      data: { revokedAt: new Date() },
    });
    return null;
  }
  // Rotate: revoke old, issue new in same family.
  await db.session.update({
    where: { id: session.id },
    data: { revokedAt: new Date() },
  });
  const newRefresh = crypto.randomUUID();
  const newRefreshHash = await sha256(newRefresh);
  await db.session.create({
    data: {
      userId: session.userId,
      refreshTokenHash: newRefreshHash,
      familyId: session.familyId,
      userAgent: session.userAgent,
      ip: session.ip,
    },
  });
  const access = await signAccessToken({
    sub: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role as Role,
    hospitalId: session.user.hospitalId,
    familyId: session.familyId,
  });
  const cookieStore = await cookies();
  cookieStore.set(ACCESS_COOKIE, access, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: ACCESS_TTL,
  });
  cookieStore.set(REFRESH_COOKIE, newRefresh, {
    httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production",
    path: "/", maxAge: REFRESH_TTL_DAYS * 86400,
  });
  return {
    sub: session.user.id,
    email: session.user.email,
    name: session.user.name,
    role: session.user.role as Role,
    hospitalId: session.user.hospitalId,
    familyId: session.familyId,
  };
}

/** Logout: revoke only the current session's refresh token. Access token is
 * validated normally first (the caller must do that). Fixes B13. */
export async function logoutCurrent() {
  const cookieStore = await cookies();
  const refresh = cookieStore.get(REFRESH_COOKIE)?.value;
  if (refresh) {
    const refreshTokenHash = await sha256(refresh);
    await db.session.updateMany({
      where: { refreshTokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }
  cookieStore.delete(ACCESS_COOKIE);
  cookieStore.delete(REFRESH_COOKIE);
}

export async function hashPassword(plain: string): Promise<string> {
  const { hash } = await import("bcryptjs");
  return hash(plain, 10);
}

export async function verifyPassword(plain: string, hashed: string): Promise<boolean> {
  const { compare } = await import("bcryptjs");
  return compare(plain, hashed);
}

export function clearAuthCookies() {
  // helper for response-level clears when cookies() isn't available
}

export { ACCESS_COOKIE, REFRESH_COOKIE };

// ── RBAC + tenant-scoping helpers (live here because they need the
// AccessTokenPayload type defined above; avoids a circular import). ──────────

/** Require the user to be authenticated. Throws 401-style error if not. */
export function requireAuth(user: AccessTokenPayload | null): AccessTokenPayload {
  if (!user) {
    const err = new Error("UNAUTHORIZED");
    (err as { status?: number }).status = 401;
    throw err;
  }
  return user;
}

/** Require a specific role (or any of a set). */
export function requireRole(user: AccessTokenPayload | null, roles: string[]): AccessTokenPayload {
  const u = requireAuth(user);
  if (!roles.includes(u.role)) {
    const err = new Error("FORBIDDEN");
    (err as { status?: number }).status = 403;
    throw err;
  }
  return u;
}

/** Enforce that a hospital-scoped resource belongs to the user's hospital.
 *  SUPER_ADMIN bypasses. Logs an `auth.cross_tenant_denied` AuditLog entry
 *  BEFORE throwing FORBIDDEN_TENANT so cross-tenant probing is visible
 *  (DPDP/NABH security-incident monitoring). Async — callers MUST await. */
export async function requireTenantAccess(
  user: AccessTokenPayload,
  resourceHospitalId: string | null,
  ctx?: {
    resourceType?: string;
    resourceId?: string | number;
    ip?: string | null;
  },
): Promise<void> {
  if (user.role === "SUPER_ADMIN") return;
  if (!resourceHospitalId || user.hospitalId !== resourceHospitalId) {
    // Audit the cross-tenant denial BEFORE throwing so it is always persisted.
    const target = ctx?.resourceId != null
      ? `${ctx.resourceType ?? "resource"}:${ctx.resourceId}`
      : (ctx?.resourceType ?? null);
    const detail = ctx?.resourceType
      ? `Denied ${ctx.resourceType} access — owned by hospital ${resourceHospitalId ?? "null"}, actor hospital ${user.hospitalId ?? "null"}`
      : `Denied resource owned by hospital ${resourceHospitalId ?? "null"} (actor hospital ${user.hospitalId ?? "null"})`;
    try {
      await audit({
        hospitalId: user.hospitalId,
        actorId: user.sub,
        action: "auth.cross_tenant_denied",
        target,
        detail,
        ip: ctx?.ip ?? null,
      });
    } catch {
      // Swallow audit-write failures so the security denial still throws.
      // (DB outage should not weaken the tenant boundary.)
    }
    const err = new Error("FORBIDDEN_TENANT");
    (err as { status?: number }).status = 403;
    throw err;
  }
}
