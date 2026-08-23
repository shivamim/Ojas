// Ojas — Mark a breach as notified to the Data Protection Board.
// POST /api/dpdp/breach-clock/[id]/notify-dpb
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole, requireTenantAccess } from "@/lib/auth";
import { audit, getClientIp, jsonError } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import { buildDpbNotification } from "@/lib/dpdp";

type Ctx = { params: Promise<{ id: string }> };

async function POSTImpl(req: NextRequest, ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN"]);
  const { id } = await ctx.params;
  const breach = await db.breachNotification.findUnique({
    where: { id },
    include: { hospital: { select: { name: true } } },
  });
  if (!breach) return jsonError("Not found", 404);
  await requireTenantAccess(user, breach.hospitalId);

  if (breach.dpbNotifiedAt) {
    return jsonError("DPB already notified for this breach", 409);
  }

  const slaDeadline = breach.slaDeadline ?? new Date(breach.detectedAt.getTime() + 72 * 60 * 60 * 1000);
  const notification = buildDpbNotification({
    hospitalName: breach.hospital.name,
    breachTitle: breach.title,
    affectedCount: breach.affectedCount ?? 0,
    detectedAt: breach.detectedAt,
    slaDeadline,
  });

  await db.breachNotification.update({
    where: { id },
    data: { dpbNotifiedAt: new Date(), status: "SENT" },
  });
  await audit({
    hospitalId: breach.hospitalId, actorId: user.sub, action: "DPB_NOTIFIED",
    target: id, detail: `Breach "${breach.title}" — DPB notification sent at ${new Date().toISOString()}`,
    ip: getClientIp(req),
  });
  return Response.json({ ok: true, notification });
}

export const POST = withErrors(POSTImpl);
