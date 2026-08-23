// Ojas — breach notifications API (D3: DPDP Rules require notifying affected
// data principals within 72 hours of a breach). Stores ready-to-fire
// notification templates and a documented trigger process.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole, requireTenantAccess } from "@/lib/auth";
import { audit, getClientIp, jsonError, rateLimit } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import { parseBody, breachNotificationSchema, ValidationError } from "@/lib/validation";

type Ctx = { params: Promise<{}> };

// GET /api/breach-notifications — list breach notifications for the hospital
async function GETImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["SUPER_ADMIN", "HOSPITAL_ADMIN"]);
  const { searchParams } = new URL(req.url);
  const where: Record<string, unknown> = {};
  if (user.role !== "SUPER_ADMIN") {
    if (!user.hospitalId) return jsonError("No hospital assigned", 400);
    where.hospitalId = user.hospitalId;
  }
  const status = searchParams.get("status");
  if (status) where.status = status;

  const breachNotifications = await db.breachNotification.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });
  return Response.json({ breachNotifications });
}

// POST /api/breach-notifications — create a new breach notification (HOSPITAL_ADMIN only)
async function POSTImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);
  const rl = await rateLimit(`breach:${user.sub}`, 10, 60);
  if (!rl.allowed) return jsonError("Too many requests. Slow down.", 429);

  let body: {
    title: string;
    description: string;
    affectedDataTypes: string;
    protectiveSteps: string;
    contactPoint: string;
    detectedAt: string;
    affectedCount?: number | null;
  };
  try {
    body = await parseBody(req, breachNotificationSchema);
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid request body", 400);
  }

  const breachNotification = await db.breachNotification.create({
    data: {
      hospitalId: user.hospitalId,
      title: body.title,
      description: body.description,
      affectedDataTypes: body.affectedDataTypes,
      protectiveSteps: body.protectiveSteps,
      contactPoint: body.contactPoint,
      detectedAt: new Date(body.detectedAt),
      status: "DRAFT",
    },
  });

  await audit({
    hospitalId: user.hospitalId,
    actorId: user.sub,
    action: "breach_notification.create",
    target: breachNotification.id,
    detail: `Title: ${body.title}`,
    ip: getClientIp(req),
  });

  return Response.json({ breachNotification }, { status: 201 });
}

export const GET = withErrors(GETImpl);
export const POST = withErrors(POSTImpl);
