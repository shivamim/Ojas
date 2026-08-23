// Ojas — Coordinator productivity API. Returns per-coordinator stats on
// escalations resolved, average resolution time, and check-ins processed.
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
  const days = parseInt(searchParams.get("days") || "30", 10);
  const since = new Date(Date.now() - days * 86400000);

  const [users, escalations, checkins] = await Promise.all([
    db.user.findMany({
      where: { hospitalId: user.hospitalId, role: { in: ["HOSPITAL_ADMIN", "COORDINATOR", "DOCTOR"] } },
      select: { id: true, name: true, email: true, role: true },
    }),
    db.escalation.findMany({
      where: { hospitalId: user.hospitalId, createdAt: { gte: since } },
      select: {
        id: true, assignedToId: true, severity: true, status: true,
        createdAt: true, updatedAt: true, resolution: true,
      },
    }),
    db.checkin.findMany({
      where: { hospitalId: user.hospitalId, answeredAt: { gte: since } },
      select: { id: true, patientId: true, answeredAt: true, aiRiskLevel: true },
    }),
  ]);

  const productivity = users.map((u) => {
    const userEscalations = escalations.filter((e) => e.assignedToId === u.id);
    const resolved = userEscalations.filter((e) => e.status === "RESOLVED");
    const open = userEscalations.filter((e) => e.status === "OPEN" || e.status === "IN_PROGRESS");
    // Resolution time in hours for resolved escalations
    const resolutionTimes = resolved
      .filter((e) => e.updatedAt && e.createdAt)
      .map((e) => (e.updatedAt.getTime() - e.createdAt.getTime()) / 3600000);
    const avgResolutionHours = resolutionTimes.length > 0
      ? Math.round((resolutionTimes.reduce((a, b) => a + b, 0) / resolutionTimes.length) * 10) / 10
      : null;
    return {
      user: { id: u.id, name: u.name, email: u.email, role: u.role },
      totalAssigned: userEscalations.length,
      resolved: resolved.length,
      open: open.length,
      criticalResolved: resolved.filter((e) => e.severity === "CRITICAL").length,
      highResolved: resolved.filter((e) => e.severity === "HIGH").length,
      avgResolutionHours,
      resolutionRate: userEscalations.length > 0
        ? Math.round((resolved.length / userEscalations.length) * 1000) / 10
        : null,
    };
  });

  // Sort by resolved count desc
  productivity.sort((a, b) => b.resolved - a.resolved);

  // Summary
  const totalResolved = escalations.filter((e) => e.status === "RESOLVED").length;
  const totalAssigned = escalations.filter((e) => e.assignedToId).length;
  const summary = {
    windowDays: days,
    totalEscalations: escalations.length,
    totalResolved,
    totalAssigned,
    totalUnassigned: escalations.length - totalAssigned,
    teamMembers: users.length,
    avgResolutionHoursAll: (() => {
      const times = escalations
        .filter((e) => e.status === "RESOLVED" && e.updatedAt && e.createdAt)
        .map((e) => (e.updatedAt.getTime() - e.createdAt.getTime()) / 3600000);
      return times.length > 0 ? Math.round((times.reduce((a, b) => a + b, 0) / times.length) * 10) / 10 : null;
    })(),
  };

  return Response.json({ productivity, summary });
}

export const GET = withErrors(GETImpl);
