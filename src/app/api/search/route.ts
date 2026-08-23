// Ojas — Global search API. Searches across patients, escalations, and
// check-ins within the user's hospital (tenant-scoped).
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireAuth } from "@/lib/auth";
import { withErrors } from "@/lib/api-handler";

type Ctx = { params: Promise<{}> };
import { jsonError } from "@/lib/server-utils";

async function GETImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireAuth(await getCurrentUser());
  const { searchParams } = new URL(req.url);
  const q = (searchParams.get("q") || "").trim();
  if (q.length < 2) return Response.json({ results: { patients: [], escalations: [], checkins: [] } });
  if (user.role !== "SUPER_ADMIN" && !user.hospitalId) return jsonError("No hospital", 400);

  const hospitalId = user.hospitalId;
  const results = { patients: [] as unknown[], escalations: [] as unknown[], checkins: [] as unknown[] };

  if (user.role === "SUPER_ADMIN") {
    // Superadmin can search across all hospitals
    const [patients, escalations] = await Promise.all([
      db.patient.findMany({
        where: { deletedAt: null, OR: [{ fullName: { contains: q } }, { surgeryType: { contains: q } }] },
        take: 10,
        orderBy: { createdAt: "desc" },
        include: { hospital: { select: { name: true } } },
      }),
      db.escalation.findMany({
        where: { OR: [{ reason: { contains: q } }, { patient: { fullName: { contains: q } } }] },
        take: 10,
        orderBy: { createdAt: "desc" },
        include: { patient: { select: { fullName: true, surgeryType: true } }, hospital: { select: { name: true } } },
      }),
    ]);
    results.patients = patients.map((p) => ({
      id: p.id, fullName: p.fullName, surgeryType: p.surgeryType, status: p.status,
      hospitalName: p.hospital.name, hospitalId: p.hospitalId,
    }));
    results.escalations = escalations.map((e) => ({
      id: e.id, severity: e.severity, status: e.status, reason: e.reason.slice(0, 120),
      patientName: e.patient.fullName, hospitalName: e.hospital.name, createdAt: e.createdAt,
    }));
  } else {
    const [patients, escalations] = await Promise.all([
      db.patient.findMany({
        where: { hospitalId: hospitalId!, deletedAt: null, OR: [{ fullName: { contains: q } }, { surgeryType: { contains: q } }] },
        take: 10,
        orderBy: { createdAt: "desc" },
      }),
      db.escalation.findMany({
        where: { hospitalId: hospitalId!, OR: [{ reason: { contains: q } }, { patient: { fullName: { contains: q } } }] },
        take: 10,
        orderBy: { createdAt: "desc" },
        include: { patient: { select: { fullName: true, surgeryType: true } } },
      }),
    ]);
    results.patients = patients.map((p) => ({
      id: p.id, fullName: p.fullName, surgeryType: p.surgeryType, status: p.status,
    }));
    results.escalations = escalations.map((e) => ({
      id: e.id, severity: e.severity, status: e.status, reason: e.reason.slice(0, 120),
      patientName: e.patient.fullName, createdAt: e.createdAt,
    }));
  }

  return Response.json({ results, query: q });
}

export const GET = withErrors(GETImpl);
