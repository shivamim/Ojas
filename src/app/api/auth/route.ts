// Ojas — auth API routes: login, logout, me, refresh.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import {
  getCurrentUser, issueSession, logoutCurrent, verifyPassword, hashPassword, requireAuth,
} from "@/lib/auth";
import { audit, getClientIp, jsonError, rateLimitStrict } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import { parseBody, loginSchema, passwordResetSchema, ValidationError } from "@/lib/validation";

type Ctx = { params: Promise<{}> };

async function POSTImpl(req: NextRequest, _ctx: Ctx) {
  const ip = getClientIp(req);
  // V3-G: login is a high-risk PUBLIC endpoint — use the strict limiter that
  // fails closed in production when no distributed (Upstash) limiter is present.
  const rl = await rateLimitStrict(`login:${ip || "anon"}`, 10, 60); // 10/min per IP
  if (!rl.allowed) return jsonError("Too many login attempts. Try again later.", 429);

  // V3-E: validate the login payload with a strict Zod schema.
  let body: { email: string; password: string };
  try {
    body = await parseBody(req, loginSchema);
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid request body", 400);
  }
  const email = body.email.trim().toLowerCase();
  const password = body.password;
  if (!email || !password) return jsonError("Email and password are required", 400);

  const user = await db.user.findUnique({ where: { email } });
  if (!user) return jsonError("Invalid email or password", 401);
  const ok = await verifyPassword(password, user.passwordHash);
  if (!ok) return jsonError("Invalid email or password", 401);

  await issueSession(
    { id: user.id, email: user.email, name: user.name, role: user.role as never, hospitalId: user.hospitalId },
    { userAgent: req.headers.get("user-agent") || undefined, ip: ip || undefined }
  );
  await audit({ hospitalId: user.hospitalId, actorId: user.id, action: "auth.login", ip });
  return Response.json({
    user: { id: user.id, email: user.email, name: user.name, role: user.role, hospitalId: user.hospitalId, forceReset: user.forceReset },
  });
}

async function GETImpl(_req: NextRequest, _ctx: Ctx) {
  const user = requireAuth(await getCurrentUser());
  const dbUser = await db.user.findUnique({ where: { id: user.sub } });
  if (!dbUser) return jsonError("Not found", 404);
  return Response.json({
    user: {
      id: dbUser.id, email: dbUser.email, name: dbUser.name, role: dbUser.role,
      hospitalId: dbUser.hospitalId, forceReset: dbUser.forceReset,
    },
  });
}

async function DELETEImpl(_req: NextRequest, _ctx: Ctx) {
  const user = await getCurrentUser();
  if (user) {
    await audit({ hospitalId: user.hospitalId, actorId: user.sub, action: "auth.logout" });
  }
  await logoutCurrent();
  return Response.json({ ok: true });
}

async function PATCHImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireAuth(await getCurrentUser());
  // V3-E: validate password-reset payload.
  let body: { newPassword: string };
  try {
    body = await parseBody(req, passwordResetSchema);
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid request body", 400);
  }
  const hash = await hashPassword(body.newPassword);
  await db.user.update({ where: { id: user.sub }, data: { passwordHash: hash, forceReset: false } });
  await audit({ hospitalId: user.hospitalId, actorId: user.sub, action: "auth.password_change" });
  return Response.json({ ok: true });
}

export const GET = withErrors(GETImpl);

export const POST = withErrors(POSTImpl);

export const PATCH = withErrors(PATCHImpl);

export const DELETE = withErrors(DELETEImpl);
