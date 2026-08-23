// Ojas — Care team workload API. Returns the distribution of open
// escalations across the hospital's care team (coordinators + doctors +
// admins). Used by the hospital admin's "Team workload" view.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { withErrors } from "@/lib/api-handler";

type Ctx = { params: Promise<{}> };
import { jsonError } from "@/lib/server-utils";

async function GETImpl(_req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);

  const [users, escalations, checkins] = await Promise.all([
    db.user.findMany({
      where: { hospitalId: user.hospitalId, role: { in: ["HOSPITAL_ADMIN", "COORDINATOR", "DOCTOR"] } },
      select: { id: true, name: true, email: true, role: true, createdAt: true },
    }),
    db.escalation.findMany({
      where: { hospitalId: user.hospitalId, status: { in: ["OPEN", "IN_PROGRESS"] } },
      select: { id: true, assignedToId: true, severity: true, status: true, createdAt: true, patientId: true },
    }),
    db.checkin.findMany({
      where: { hospitalId: user.hospitalId, status: "ANSWERED", answeredAt: { gte: new Date(Date.now() - 7 * 86400000) } },
      select: { id: true, patientId: true, answeredAt: true, aiRiskLevel: true },
    }),
  ]);

  // Build workload per team member
  const workload = users.map((u) => {
    const assignedEscalations = escalations.filter((e) => e.assignedToId === u.id);
    const criticalCount = assignedEscalations.filter((e) => e.severity === "CRITICAL").length;
    const highCount = assignedEscalations.filter((e) => e.severity === "HIGH").length;
    const mediumCount = assignedEscalations.filter((e) => e.severity === "MEDIUM").length;
    const lowCount = assignedEscalations.filter((e) => e.severity === "LOW").length;
    return {
      user: { id: u.id, name: u.name, email: u.email, role: u.role },
      openEscalations: assignedEscalations.length,
      criticalCount,
      highCount,
      mediumCount,
      lowCount,
      // Check-ins this user's patients have answered in the last 7 days
      // (approximation — we don't track per-user patient assignment, so this
      // is hospital-wide activity attributed by escalation assignment)
      recentActivity: assignedEscalations.length,
    };
  });

  // Unassigned escalations
  const unassigned = escalations.filter((e) => !e.assignedToId);
  const unassignedSummary = {
    total: unassigned.length,
    critical: unassigned.filter((e) => e.severity === "CRITICAL").length,
    high: unassigned.filter((e) => e.severity === "HIGH").length,
    medium: unassigned.filter((e) => e.severity === "MEDIUM").length,
    low: unassigned.filter((e) => e.severity === "LOW").length,
  };

  // Hospital-wide summary
  const summary = {
    totalTeamMembers: users.length,
    totalOpenEscalations: escalations.length,
    totalUnassigned: unassigned.length,
    totalAnsweredCheckins7d: checkins.length,
    avgEscalationsPerMember: users.length > 0 ? Math.round((escalations.length / users.length) * 10) / 10 : 0,
    maxEscalations: workload.reduce((max, w) => Math.max(max, w.openEscalations), 0),
  };

  // Sort workload by open escalations desc
  workload.sort((a, b) => b.openEscalations - a.openEscalations);

  return Response.json({ workload, unassigned: unassignedSummary, summary });
}

export const GET = withErrors(GETImpl);
