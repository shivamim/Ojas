// Ojas — Conversational Agent endpoint (real LLM). Interprets a free-text
// patient reply into structured check-in data. Used by the simulator UI.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole, requireTenantAccess } from "@/lib/auth";
import { runConversationalAgent } from "@/lib/ai-agents";
import { jsonError, rateLimitStrict } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import { parseBody, aiConversationalRequestSchema, ValidationError } from "@/lib/validation";

type Ctx = { params: Promise<{}> };

async function POSTImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR", "DOCTOR"]);
  let body: { patientId: string; questionAsked: string; patientReply: string };
  try {
    body = await parseBody(req, aiConversationalRequestSchema);
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid body", 400);
  }
  const rl = await rateLimitStrict(`conv:${user.sub}`, 15, 60);
  if (!rl.allowed) return jsonError("Too many requests", 429);
  const patient = await db.patient.findUnique({ where: { id: body.patientId } });
  if (!patient) return jsonError("Patient not found", 404);
  await requireTenantAccess(user, patient.hospitalId);
  const dayOfRecovery = Math.max(1, Math.ceil((Date.now() - patient.dischargeDate.getTime()) / 86400000));
  const result = await runConversationalAgent(
    { patientName: patient.fullName, surgeryType: patient.surgeryType, recoveryDay: dayOfRecovery, patientReply: body.patientReply, questionAsked: body.questionAsked },
    { hospitalId: patient.hospitalId }
  );
  return Response.json({ interpretation: result.output, fallbackUsed: result.fallbackUsed, runId: result.runId });
}

export const POST = withErrors(POSTImpl);
