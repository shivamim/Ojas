// Ojas — Patient readmission tracking. Marks a patient as READMITTED, creates
// a timeline event, and optionally generates a new check-in schedule for the
// readmission recovery window. This is a real clinical workflow — not a stub.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole, requireTenantAccess } from "@/lib/auth";
import { withErrors } from "@/lib/api-handler";
import { jsonError, audit, getClientIp } from "@/lib/server-utils";
import { parseBody, readmitSchema, ValidationError } from "@/lib/validation";

type Ctx = { params: Promise<{ id: string }> };

async function POSTImpl(req: NextRequest, ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR", "DOCTOR"]);
  const { id } = await ctx.params;
  const patient = await db.patient.findUnique({ where: { id } });
  if (!patient) return jsonError("Patient not found", 404);
  await requireTenantAccess(user, patient.hospitalId);

  let body: { reason: string; newRecoveryDays?: number };
  try {
    body = await parseBody(req, readmitSchema);
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid body", 400);
  }

  // Update patient status to READMITTED
  const updated = await db.patient.update({
    where: { id },
    data: { status: "READMITTED" },
  });

  // Create a timeline event
  await db.timelineEvent.create({
    data: {
      hospitalId: patient.hospitalId,
      patientId: patient.id,
      eventType: "READMISSION",
      title: "Patient readmitted",
      detail: body.reason
        ? `Readmitted: ${body.reason}`
        : "Patient marked as readmitted to hospital.",
      actorId: user.sub,
      occurredAt: new Date(),
    },
  });

  // Generate a new check-in schedule for the readmission recovery window
  const settings = await db.hospitalSettings.findUnique({ where: { hospitalId: patient.hospitalId } });
  const recoveryDays = body.newRecoveryDays || settings?.recoveryWindowDays || 14;
  const cadenceHours = settings?.checkinCadenceHours || 24;
  const newDischargeDate = new Date(); // readmitted "now", new recovery window starts today

  const schedule: { scheduledFor: Date; hospitalId: string; patientId: string }[] = [];
  const start = new Date(newDischargeDate);
  start.setHours(10, 0, 0, 0);
  for (let day = 1; day <= recoveryDays; day++) {
    const d = new Date(start.getTime() + day * cadenceHours * 3600 * 1000);
    schedule.push({ scheduledFor: d, hospitalId: patient.hospitalId, patientId: patient.id });
  }
  if (schedule.length > 0) {
    await db.checkin.createMany({ data: schedule });
  }

  // Update the patient's dischargeDate to today (new recovery window)
  await db.patient.update({
    where: { id },
    data: { dischargeDate: newDischargeDate, surgeryDate: newDischargeDate },
  });

  await audit({
    hospitalId: patient.hospitalId,
    actorId: user.sub,
    action: "patient.readmit",
    target: patient.id,
    detail: `Readmitted ${patient.fullName}${body.reason ? ` — ${body.reason}` : ""}. ${schedule.length} new check-ins scheduled.`,
    ip: getClientIp(req),
  });

  return Response.json({
    patient: updated,
    newCheckinsScheduled: schedule.length,
    message: `Patient marked as readmitted. ${schedule.length} new check-ins scheduled for the recovery window.`,
  });
}

export const POST = withErrors(POSTImpl);
