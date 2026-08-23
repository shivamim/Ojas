// Ojas — invites API (invite-only provisioning, structurally constrained roles).
// The invite role enum CANNOT include SUPER_ADMIN (B10 fix).
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole, requireTenantAccess } from "@/lib/auth";
import { audit, getClientIp, jsonError, rateLimit } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import { parseBody, inviteWithHospitalSchema, ValidationError } from "@/lib/validation";

type Ctx = { params: Promise<{}> };

const ALLOWED_INVITE_ROLES = ["HOSPITAL_ADMIN", "COORDINATOR", "DOCTOR"] as const;
type InviteRole = typeof ALLOWED_INVITE_ROLES[number];

async function GETImpl() {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "SUPER_ADMIN"]);
  const where: Record<string, unknown> = {};
  if (user.role !== "SUPER_ADMIN") where.hospitalId = user.hospitalId;
  const invites = await db.invite.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: { inviter: { select: { name: true, email: true } } },
  });
  return Response.json({ invites });
}

async function POSTImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "SUPER_ADMIN"]);
  if (user.role !== "SUPER_ADMIN" && !user.hospitalId) return jsonError("No hospital assigned", 400);
  let body: {
    email: string;
    role: "HOSPITAL_ADMIN" | "COORDINATOR" | "DOCTOR";
    hospitalId?: string;
  };
  try {
    body = await parseBody(req, inviteWithHospitalSchema);
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid body", 400);
  }
  const email = body.email.trim().toLowerCase();
  // Structurally constrained: SUPER_ADMIN can never be assigned via invite
  // (enforced by the schema's role enum — no SUPER_ADMIN value is accepted).

  const rl = await rateLimit(`invite:${user.sub}`, 10, 60);
  if (!rl.allowed) return jsonError("Too many invites", 429);

  const hospitalId = user.role === "SUPER_ADMIN" ? (body.hospitalId || user.hospitalId) : user.hospitalId;
  if (!hospitalId) return jsonError("hospitalId required", 400);
  if (user.role !== "SUPER_ADMIN") await requireTenantAccess(user, hospitalId);

  const token = crypto.randomUUID();
  const invite = await db.invite.create({
    data: {
      email, role: body.role, token, hospitalId,
      invitedBy: user.sub,
      expiresAt: new Date(Date.now() + 7 * 86400000),
    },
  });
  await audit({ hospitalId, actorId: user.sub, action: "invite.create", target: invite.id, detail: `${email} → ${body.role}`, ip: getClientIp(req) });
  // In production the Communications Service would send a real invite email here.
  return Response.json({ invite, inviteUrl: `/?view=accept-invite&token=${token}` }, { status: 201 });
}

// DELETE /api/invites?token=... — revoke a pending invite
async function DELETEImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "SUPER_ADMIN"]);
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");
  if (!id) return jsonError("id required", 400);
  const invite = await db.invite.findUnique({ where: { id } });
  if (!invite) return jsonError("Invite not found", 404);
  if (user.role !== "SUPER_ADMIN") await requireTenantAccess(user, invite.hospitalId);
  await db.invite.delete({ where: { id } });
  await audit({ hospitalId: invite.hospitalId, actorId: user.sub, action: "invite.revoke", target: invite.id, ip: getClientIp(req) });
  return Response.json({ ok: true });
}

// GET /api/invites/accept?token=... is handled by the auth flow — the frontend
// calls POST /api/auth with the invite token to create the user.
export async function acceptInvite(token: string, name: string, password: string) {
  const invite = await db.invite.findUnique({ where: { token } });
  if (!invite || invite.acceptedAt || invite.expiresAt < new Date())
    return { ok: false, error: "Invalid or expired invite" };
  const existing = await db.user.findUnique({ where: { email: invite.email } });
  if (existing) return { ok: false, error: "A user with this email already exists" };
  const { hashPassword } = await import("@/lib/auth");
  const passwordHash = await hashPassword(password);
  const newUser = await db.user.create({
    data: {
      email: invite.email, name, role: invite.role, passwordHash,
      hospitalId: invite.hospitalId, forceReset: false,
    },
  });
  await db.invite.update({ where: { id: invite.id }, data: { acceptedAt: new Date() } });
  return { ok: true, user: newUser };
}

export const GET = withErrors(GETImpl);

export const POST = withErrors(POSTImpl);

export const DELETE = withErrors(DELETEImpl);
