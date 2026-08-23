// Ojas — HMS CSV import endpoint.
// POST   /api/hms/import         — Upload CSV (multipart/form-data) or raw CSV text.
// GET    /api/hms/import         — Download the CSV template.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { audit, getClientIp, jsonError } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import { CsvHmsAdapter, importHmsRecords, getCsvTemplate } from "@/lib/hms-adapter";

type Ctx = { params: Promise<{}> };

async function POSTImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);

  const contentType = req.headers.get("content-type") || "";
  let csvText: string;
  if (contentType.includes("multipart/form-data")) {
    const formData = await req.formData();
    const file = formData.get("file");
    if (!file || !(file instanceof File)) return jsonError("No file uploaded", 400);
    if (file.size > 5 * 1024 * 1024) return jsonError("File too large (max 5MB)", 400);
    csvText = await file.text();
  } else {
    csvText = await req.text();
  }
  if (!csvText.trim()) return jsonError("Empty CSV", 400);

  const records = CsvHmsAdapter.parse(csvText);
  if (records.length === 0) return jsonError("No records found in CSV", 400);
  if (records.length > 500) return jsonError("Too many records (max 500 per import)", 400);

  const result = await importHmsRecords(records, user.hospitalId, user.sub);
  await audit({
    hospitalId: user.hospitalId, actorId: user.sub, action: "HMS_CSV_IMPORT",
    target: user.hospitalId,
    detail: `imported=${result.imported} skipped=${result.skipped} errors=${result.errors.length}`,
    ip: getClientIp(req),
  });
  // Log a timeline event for the hospital.
  await db.timelineEvent.create({
    data: {
      hospitalId: user.hospitalId,
      patientId: records[0]?.uhid || "batch",
      eventType: "HMS_IMPORT",
      title: `HMS CSV import: ${result.imported} patients`,
      detail: `Imported ${result.imported}, skipped ${result.skipped} duplicates, ${result.errors.length} errors`,
      actorId: user.sub,
    },
  }).catch(() => null); // timeline needs a valid patientId — best-effort log
  return Response.json({ result }, { status: 201 });
}

async function GETImpl(_req: NextRequest, _ctx: Ctx) {
  const _user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN"]);
  const template = getCsvTemplate();
  return new Response(template, {
    headers: {
      "content-type": "text/csv",
      "content-disposition": 'attachment; filename="ojas-hms-template.csv"',
    },
  });
}

export const POST = withErrors(POSTImpl);
export const GET = withErrors(GETImpl);
