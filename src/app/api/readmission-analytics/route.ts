// Ojas — Readmission analytics API. Real readmission rate trends over time
// and by surgery type. All numbers computed from actual patient records.
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
  const days = parseInt(searchParams.get("days") || "90", 10);
  const since = new Date(Date.now() - days * 86400000);

  const [totalPatients, readmittedPatients, recentPatients] = await Promise.all([
    db.patient.count({ where: { hospitalId: user.hospitalId, deletedAt: null } }),
    db.patient.count({ where: { hospitalId: user.hospitalId, deletedAt: null, status: "READMITTED" } }),
    db.patient.findMany({
      where: { hospitalId: user.hospitalId, deletedAt: null, createdAt: { gte: since } },
      select: { id: true, surgeryType: true, status: true, dischargeDate: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
  ]);
  // Overall readmission rate
  const readmissionRate = totalPatients >= 5
    ? Math.round((readmittedPatients / totalPatients) * 1000) / 10
    : null;

  // Readmission by surgery type
  const surgeryTypes = await db.patient.groupBy({
    by: ["surgeryType"],
    where: { hospitalId: user.hospitalId, deletedAt: null },
    _count: true,
  });
  const readmittedBySurgery = await db.patient.groupBy({
    by: ["surgeryType"],
    where: { hospitalId: user.hospitalId, deletedAt: null, status: "READMITTED" },
    _count: true,
  });
  const bySurgeryType = surgeryTypes.map((s) => {
    const readmitted = readmittedBySurgery.find((r) => r.surgeryType === s.surgeryType)?._count ?? 0;
    const total = s._count;
    return {
      surgery: s.surgeryType,
      total,
      readmitted,
      rate: total >= 3 ? Math.round((readmitted / total) * 1000) / 10 : null,
    };
  }).sort((a, b) => b.readmitted - a.readmitted);

  // Readmission trend by week (last N weeks)
  const weeks: { weekStart: string; total: number; readmitted: number }[] = [];
  const now = new Date();
  for (let w = 11; w >= 0; w--) {
    const weekStart = new Date(now.getTime() - w * 7 * 86400000);
    weekStart.setHours(0, 0, 0, 0);
    const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
    const weekPatients = recentPatients.filter((p) => p.createdAt >= weekStart && p.createdAt < weekEnd);
    const weekReadmitted = weekPatients.filter((p) => p.status === "READMITTED").length;
    weeks.push({
      weekStart: weekStart.toISOString().slice(0, 10),
      total: weekPatients.length,
      readmitted: weekReadmitted,
    });
  }

  // Timeline events for readmissions
  const readmissionEvents = await db.timelineEvent.findMany({
    where: { hospitalId: user.hospitalId, eventType: "READMISSION" },
    orderBy: { occurredAt: "desc" },
    take: 20,
    include: { patient: { select: { fullName: true, surgeryType: true } } },
  });

  return Response.json({
    summary: {
      totalPatients,
      readmittedPatients,
      readmissionRate,
      insufficientData: totalPatients < 5,
    },
    bySurgeryType,
    weeklyTrend: weeks,
    recentReadmissions: readmissionEvents.map((e) => ({
      id: e.id,
      patientName: e.patient?.fullName,
      surgeryType: e.patient?.surgeryType,
      detail: e.detail,
      occurredAt: e.occurredAt,
    })),
  });
}

export const GET = withErrors(GETImpl);
