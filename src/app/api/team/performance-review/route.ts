// Ojas — Care coordinator performance review API. Returns a monthly summary
// per coordinator: escalations resolved, avg resolution time, check-ins
// processed, AI calls triggered, and a qualitative performance label.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { withErrors } from "@/lib/api-handler";

type Ctx = { params: Promise<{}> };
import { jsonError } from "@/lib/server-utils";

async function GETImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);
  const { searchParams } = new URL(req.url);
  const months = parseInt(searchParams.get("months") || "1", 10);
  const since = new Date(Date.now() - months * 30 * 86400000);

  const [users, escalations, auditLogs] = await Promise.all([
    db.user.findMany({
      where: { hospitalId: user.hospitalId, role: { in: ["HOSPITAL_ADMIN", "COORDINATOR", "DOCTOR"] } },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    }),
    db.escalation.findMany({
      where: { hospitalId: user.hospitalId, createdAt: { gte: since } },
      select: {
        id: true, assignedToId: true, severity: true, status: true,
        createdAt: true, updatedAt: true, resolution: true,
      },
    }),
    db.auditLog.findMany({
      where: { hospitalId: user.hospitalId, createdAt: { gte: since } },
      select: { id: true, actorId: true, action: true, createdAt: true },
    }),
  ]);

  const reviews = users.map((u) => {
    const userEscalations = escalations.filter((e) => e.assignedToId === u.id);
    const resolved = userEscalations.filter((e) => e.status === "RESOLVED");
    const open = userEscalations.filter((e) => e.status === "OPEN" || e.status === "IN_PROGRESS");
    const criticalResolved = resolved.filter((e) => e.severity === "CRITICAL").length;
    const resolutionTimes = resolved
      .filter((e) => e.updatedAt && e.createdAt)
      .map((e) => (e.updatedAt.getTime() - e.createdAt.getTime()) / 3600000);
    const avgResolutionHours = resolutionTimes.length > 0
      ? Math.round((resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length) * 10) / 10
      : null;

    // Count actions by this user (check-ins logged, escalations updated, etc.)
    const userActions = auditLogs.filter((a) => a.actorId === u.id);
    const checkinsLogged = userActions.filter((a) => a.action === "checkin.answer").length;
    const escalationsHandled = userActions.filter((a) => a.action.startsWith("escalation.")).length;
    const aiCalls = userActions.filter((a) => a.action.startsWith("ai.")).length;

    // Qualitative performance label
    let performance: "excellent" | "good" | "developing" | "new" = "new";
    if (userEscalations.length === 0 && userActions.length < 5) {
      performance = "new";
    } else if (resolved.length >= 5 && (avgResolutionHours === null || avgResolutionHours < 24)) {
      performance = "excellent";
    } else if (resolved.length >= 2) {
      performance = "good";
    } else {
      performance = "developing";
    }

    return {
      user: { id: u.id, name: u.name, email: u.email, role: u.role },
      stats: {
        totalAssigned: userEscalations.length,
        resolved: resolved.length,
        open: open.length,
        criticalResolved,
        avgResolutionHours,
        resolutionRate: userEscalations.length > 0
          ? Math.round((resolved.length / userEscalations.length) * 1000) / 10
          : null,
        checkinsLogged,
        escalationsHandled,
        aiCalls,
        totalActions: userActions.length,
      },
      performance,
    };
  });

  // Sort by total actions desc
  reviews.sort((a, b) => b.stats.totalActions - a.stats.totalActions);

  return Response.json({
    reviews,
    period: { months, since },
    summary: {
      teamMembers: users.length,
      totalResolved: escalations.filter((e) => e.status === "RESOLVED").length,
      totalActions: auditLogs.length,
    },
  });
}

export const GET = withErrors(GETImpl);
