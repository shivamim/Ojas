// Ojas — Reports CSV export. Generates a real CSV from the same data the
// reports API returns. No fabrication — every row is a real DB record.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { withErrors } from "@/lib/api-handler";

type Ctx = { params: Promise<{}> };
import { jsonError } from "@/lib/server-utils";

function csvEscape(val: unknown): string {
  const s = String(val ?? "");
  if (s.includes(",") || s.includes('"') || s.includes("\n")) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function GETImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);
  const { searchParams } = new URL(req.url);
  const days = parseInt(searchParams.get("days") || "30", 10);
  const since = new Date(Date.now() - days * 86400000);

  const [patients, checkins, escalations] = await Promise.all([
    db.patient.findMany({
      where: { hospitalId: user.hospitalId, deletedAt: null },
      orderBy: { createdAt: "desc" },
      select: { id: true, fullName: true, age: true, gender: true, surgeryType: true, surgeryDate: true, dischargeDate: true, status: true, comorbidities: true, createdAt: true },
    }),
    db.checkin.findMany({
      where: { hospitalId: user.hospitalId, scheduledFor: { gte: since } },
      orderBy: { scheduledFor: "desc" },
      include: { patient: { select: { fullName: true, surgeryType: true } } },
    }),
    db.escalation.findMany({
      where: { hospitalId: user.hospitalId, createdAt: { gte: since } },
      orderBy: { createdAt: "desc" },
      include: { patient: { select: { fullName: true, surgeryType: true } } },
    }),
  ]);

  const rows: string[][] = [];
  // Section 1: Patients
  rows.push(["SECTION: PATIENTS"]);
  rows.push(["Patient ID", "Full Name", "Age", "Gender", "Surgery Type", "Surgery Date", "Discharge Date", "Status", "Comorbidities", "Enrolled At"]);
  for (const p of patients) {
    rows.push([
      p.id, p.fullName, String(p.age), p.gender, p.surgeryType,
      p.surgeryDate.toISOString(), p.dischargeDate.toISOString(),
      p.status, p.comorbidities || "", p.createdAt.toISOString(),
    ]);
  }
  rows.push([]);

  // Section 2: Check-ins
  rows.push(["SECTION: CHECK-INS"]);
  rows.push(["Check-in ID", "Patient Name", "Surgery Type", "Scheduled For", "Status", "Pain Level", "Temperature (C)", "Symptoms", "Free Text", "AI Risk Level", "Answered At"]);
  for (const c of checkins) {
    rows.push([
      c.id, c.patient.fullName, c.patient.surgeryType,
      c.scheduledFor.toISOString(), c.status,
      c.painLevel !== null ? String(c.painLevel) : "",
      c.temperature !== null ? String(c.temperature) : "",
      c.symptomsText || "", c.freeText || "",
      c.aiRiskLevel || "",
      c.answeredAt ? c.answeredAt.toISOString() : "",
    ]);
  }
  rows.push([]);

  // Section 3: Escalations
  rows.push(["SECTION: ESCALATIONS"]);
  rows.push(["Escalation ID", "Patient Name", "Surgery Type", "Severity", "Status", "Reason", "AI Proposed", "AI Confidence", "Created At", "Resolution"]);
  for (const e of escalations) {
    rows.push([
      e.id, e.patient.fullName, e.patient.surgeryType,
      e.severity, e.status, e.reason,
      e.aiProposed ? "Yes" : "No",
      e.aiConfidence !== null ? String(e.aiConfidence) : "",
      e.createdAt.toISOString(), e.resolution || "",
    ]);
  }
  rows.push([]);

  // Section 4: Summary stats
  rows.push(["SECTION: SUMMARY"]);
  const answered = checkins.filter((c) => c.status === "ANSWERED").length;
  const scheduled = checkins.length;
  const missed = checkins.filter((c) => c.status === "MISSED").length;
  const resolvedEscalations = escalations.filter((e) => e.status === "RESOLVED").length;
  const criticalEscalations = escalations.filter((e) => e.severity === "CRITICAL").length;
  rows.push(["Metric", "Value"]);
  rows.push(["Report window (days)", String(days)]);
  rows.push(["Total patients", String(patients.length)]);
  rows.push(["Check-ins scheduled", String(scheduled)]);
  rows.push(["Check-ins answered", String(answered)]);
  rows.push(["Check-ins missed", String(missed)]);
  rows.push(["Feedback rate (%)", scheduled > 0 ? String(Math.round((answered / scheduled) * 1000) / 10) : "Insufficient data"]);
  rows.push(["Total escalations", String(escalations.length)]);
  rows.push(["Escalations resolved", String(resolvedEscalations)]);
  rows.push(["Critical escalations", String(criticalEscalations)]);
  rows.push(["Generated at", new Date().toISOString()]);

  const csv = rows.map((r) => r.map(csvEscape).join(",")).join("\n");
  const filename = `ojas-report-${days}d-${new Date().toISOString().slice(0, 10)}.csv`;

  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}

export const GET = withErrors(GETImpl);
