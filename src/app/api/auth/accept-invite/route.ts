// Ojas — accept-invite endpoint. Creates the user from a valid invite token.
import { NextRequest } from "next/server";
import { acceptInvite } from "@/app/api/invites/route";
import { issueSession } from "@/lib/auth";
import { audit, getClientIp, jsonError, rateLimitStrict } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import { parseBody, acceptInviteSchema, ValidationError } from "@/lib/validation";

type Ctx = { params: Promise<{}> };

async function POSTImpl(req: NextRequest, _ctx: Ctx) {
  const ip = getClientIp(req);
  // P0 FIX: Use rateLimitStrict for this public account-creation endpoint.
  // In production: Redis required, fail closed if unavailable.
  const rl = await rateLimitStrict(`accept:${ip || "anon"}`, 5, 60);
  if (!rl.allowed) return jsonError("Too many attempts", 429);
  let body: { token: string; name: string; password: string };
  try {
    body = await parseBody(req, acceptInviteSchema);
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid body", 400);
  }
  const result = await acceptInvite(body.token, body.name.trim(), body.password);
  if (!result.ok || !result.user) return jsonError(result.error || "Could not accept invite", 400);
  await issueSession(
    { id: result.user.id, email: result.user.email, name: result.user.name, role: result.user.role as never, hospitalId: result.user.hospitalId },
    { userAgent: req.headers.get("user-agent") || undefined, ip: ip || undefined }
  );
  await audit({ hospitalId: result.user.hospitalId, actorId: result.user.id, action: "auth.accept_invite", ip });
  return Response.json({ user: { id: result.user.id, email: result.user.email, name: result.user.name, role: result.user.role, hospitalId: result.user.hospitalId } });
}

export const POST = withErrors(POSTImpl);
