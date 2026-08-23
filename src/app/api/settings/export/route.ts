// Ojas — data export API. Generates CSV downloads for patients, check-ins,
// and reports (escalations + satisfaction surveys). Requires HOSPITAL_ADMIN role.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { audit, getClientIp, jsonError } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";

type Ctx = { params: Promise<{}> };

function csvEscape(val: string | number | null | undefined): string {
  const s = val == null ? "" : String(val);
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

function csvRow(...cols: (string | number | null | undefined)[]): string {
  return cols.map(csvEscape).join(",");
}

function parseDate(val: string | null): Date | null {
  if (!val) return null;
  const d = new Date(val);
  return isNaN(d.getTime()) ? null : d;
}

async function GETImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);

  const { searchParams } = new URL(req.url);
  const type = searchParams.get("type");
  if (!type || !["patients", "checkins", "reports"].includes(type)) {
    return jsonError("Invalid type. Must be patients, checkins, or reports.", 400);
  }

  const from = parseDate(searchParams.get("from"));
  const to = parseDate(searchParams.get("to"));

  let csv: string;

  switch (type) {
    case "patients": {
      csv = await exportPatients(user.hospitalId, from, to);
      break;
    }
    case "checkins": {
      csv = await exportCheckins(user.hospitalId, from, to);
      break;
    }
    case "reports": {
      csv = await exportReports(user.hospitalId, from, to);
      break;
    }
    default:
      return jsonError("Invalid type", 400);
  }

  await audit({
    hospitalId: user.hospitalId,
    actorId: user.sub,
    action: "settings.export",
    detail: `Exported ${type} data`,
    ip: getClientIp(req),
  });

  const filename = `ojas-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}

async function exportPatients(hospitalId: string, from: Date | null, to: Date | null): Promise<string> {
  const where: Record<string, unknown> = { hospitalId, deletedAt: null };
  if (from || to) {
    const created: Record<string, unknown> = {};
    if (from) created.gte = from;
    if (to) created.lte = to;
    where.createdAt = created;
  }
  const patients = await db.patient.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });
  const rows = [
    csvRow("ID", "Full Name", "Age", "Gender", "Surgery Type", "Surgery Date", "Discharge Date", "Comorbidities", "Status", "Risk Level", "Risk Score", "DPDPA Consent", "Enrolled At"),
    ...patients.map((p) =>
      csvRow(
        p.id,
        p.fullName,
        p.age,
        p.gender,
        p.surgeryType,
        p.surgeryDate?.toISOString().slice(0, 10),
        p.dischargeDate?.toISOString().slice(0, 10),
        p.comorbidities,
        p.status,
        p.riskLevel ?? "",
        p.riskScore ?? "",
        p.dpdpaConsent ? "Yes" : "No",
        p.createdAt.toISOString().slice(0, 10),
      )
    ),
  ];
  return rows.join("\n");
}

async function exportCheckins(hospitalId: string, from: Date | null, to: Date | null): Promise<string> {
  const where: Record<string, unknown> = { hospitalId };
  if (from || to) {
    const scheduled: Record<string, unknown> = {};
    if (from) scheduled.gte = from;
    if (to) scheduled.lte = to;
    where.scheduledFor = scheduled;
  }
  const checkins = await db.checkin.findMany({
    where,
    include: { patient: { select: { fullName: true } } },
    orderBy: { scheduledFor: "desc" },
  });
  const rows = [
    csvRow("ID", "Patient Name", "Scheduled For", "Sent At", "Answered At", "Status", "Pain Level", "Temperature", "Symptoms", "Free Text", "Meds Taken", "AI Risk Level", "AI Risk Score"),
    ...checkins.map((c) =>
      csvRow(
        c.id,
        c.patient.fullName,
        c.scheduledFor?.toISOString().slice(0, 10),
        c.sentAt?.toISOString().slice(0, 10),
        c.answeredAt?.toISOString().slice(0, 10),
        c.status,
        c.painLevel ?? "",
        c.temperature ?? "",
        c.symptomsText ?? "",
        c.freeText ?? "",
        c.medsTaken == null ? "" : c.medsTaken ? "Yes" : "No",
        c.aiRiskLevel ?? "",
        c.aiRiskScore ?? "",
      )
    ),
  ];
  return rows.join("\n");
}

async function exportReports(hospitalId: string, from: Date | null, to: Date | null): Promise<string> {
  // Combine escalations and satisfaction surveys into one export
  const escWhere: Record<string, unknown> = { hospitalId };
  const survWhere: Record<string, unknown> = { hospitalId };
  if (from || to) {
    const created: Record<string, unknown> = {};
    if (from) created.gte = from;
    if (to) created.lte = to;
    escWhere.createdAt = created;
    survWhere.collectedAt = created;
  }

  const [escalations, surveys] = await Promise.all([
    db.escalation.findMany({
      where: escWhere,
      include: { patient: { select: { fullName: true } } },
      orderBy: { createdAt: "desc" },
    }),
    db.satisfactionSurvey.findMany({
      where: survWhere,
      include: { patient: { select: { fullName: true } } },
      orderBy: { collectedAt: "desc" },
    }),
  ]);

  const rows = [
    csvRow("Report Type", "ID", "Patient Name", "Severity / Rating", "Status / Would Recommend", "Reason / Free Text", "AI Proposed", "AI Confidence", "Created At"),
    ...escalations.map((e) =>
      csvRow(
        "Escalation",
        e.id,
        e.patient.fullName,
        e.severity,
        e.status,
        e.reason,
        e.aiProposed ? "Yes" : "No",
        e.aiConfidence ?? "",
        e.createdAt.toISOString().slice(0, 10),
      )
    ),
    ...surveys.map((s) =>
      csvRow(
        "Satisfaction Survey",
        s.id,
        s.patient.fullName,
        `${s.overallRating}/5`,
        s.wouldRecommend == null ? "" : s.wouldRecommend ? "Yes" : "No",
        s.freeText ?? "",
        "",
        "",
        s.collectedAt.toISOString().slice(0, 10),
      )
    ),
  ];
  return rows.join("\n");
}

export const GET = withErrors(GETImpl);
