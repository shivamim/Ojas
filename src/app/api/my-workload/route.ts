// Ojas — My workload API. Returns a personalized worklist for the logged-in
// coordinator/doctor: their assigned escalations, their patients' upcoming
// check-ins, and their recent activity. Distinct from the hospital-wide
// dashboard — this is "what do I need to do today?"
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { withErrors } from "@/lib/api-handler";

type Ctx = { params: Promise<{}> };
import { jsonError } from "@/lib/server-utils";

async function GETImpl(_req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR", "DOCTOR"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);

  const since24h = new Date(Date.now() - 24 * 3600 * 1000);
  const next24h = new Date(Date.now() + 24 * 3600 * 1000);

  // Escalations assigned to me (or unassigned, for coordinators to pick up)
  const [myEscalations, unassignedEscalations, upcomingCheckins, myRecentActivity, myStats] = await Promise.all([
    db.escalation.findMany({
      where: { hospitalId: user.hospitalId, assignedToId: user.sub, status: { in: ["OPEN", "IN_PROGRESS"] } },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      take: 20,
      include: { patient: { select: { id: true, fullName: true, surgeryType: true, age: true } } },
    }),
    db.escalation.findMany({
      where: { hospitalId: user.hospitalId, assignedToId: null, status: { in: ["OPEN", "IN_PROGRESS"] } },
      orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
      take: 10,
      include: { patient: { select: { id: true, fullName: true, surgeryType: true } } },
    }),
    db.checkin.findMany({
      where: {
        hospitalId: user.hospitalId,
        status: "SCHEDULED",
        scheduledFor: { gte: new Date(), lte: next24h },
      },
      orderBy: { scheduledFor: "asc" },
      take: 10,
      include: { patient: { select: { id: true, fullName: true, surgeryType: true } } },
    }),
    db.timelineEvent.findMany({
      where: { hospitalId: user.hospitalId, actorId: user.sub },
      orderBy: { occurredAt: "desc" },
      take: 10,
      include: { patient: { select: { fullName: true } } },
    }),
    (async () => {
      const hid = user.hospitalId!;
      const uid = user.sub;
      const [assigned, resolved7d, checkinsAnswered7d] = await Promise.all([
        db.escalation.count({ where: { hospitalId: hid, assignedToId: uid, status: { in: ["OPEN", "IN_PROGRESS"] } } }),
        db.escalation.count({ where: { hospitalId: hid, assignedToId: uid, status: "RESOLVED", updatedAt: { gte: new Date(Date.now() - 7 * 86400000) } } }),
        db.checkin.count({ where: { hospitalId: hid, status: "ANSWERED", answeredAt: { gte: since24h } } }),
      ]);
      return { assigned, resolved7d, checkinsAnswered7d };
    })(),
  ]);

  return Response.json({
    user: { id: user.sub, name: user.name, role: user.role },
    stats: myStats,
    myEscalations: myEscalations.map((e) => ({
      id: e.id, severity: e.severity, status: e.status, reason: e.reason,
      aiProposed: e.aiProposed, aiConfidence: e.aiConfidence,
      patient: e.patient, createdAt: e.createdAt,
    })),
    unassignedEscalations: unassignedEscalations.map((e) => ({
      id: e.id, severity: e.severity, reason: e.reason,
      aiProposed: e.aiProposed,
      patient: e.patient, createdAt: e.createdAt,
    })),
    upcomingCheckins: upcomingCheckins.map((c) => ({
      id: c.id, scheduledFor: c.scheduledFor,
      patient: c.patient,
    })),
    recentActivity: myRecentActivity.map((t) => ({
      id: t.id, eventType: t.eventType, title: t.title, detail: t.detail,
      occurredAt: t.occurredAt, patientName: t.patient?.fullName,
    })),
  });
}

export const GET = withErrors(GETImpl);
