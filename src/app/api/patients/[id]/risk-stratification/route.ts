// Ojas — AI risk stratification API. Runs the real LLM Risk Stratification
// Agent on a patient at enrollment (or on demand). Returns the predicted
// readmission risk level, score, factors, and monitoring recommendation.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole, requireTenantAccess } from "@/lib/auth";
import { runRiskStratificationAgent } from "@/lib/ai-agents";
import { withErrors } from "@/lib/api-handler";
import { jsonError, audit, getClientIp, rateLimitStrict } from "@/lib/server-utils";

type Ctx = { params: Promise<{ id: string }> };

async function POSTImpl(req: NextRequest, ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR", "DOCTOR"]);
  const { id } = await ctx.params;
  const patient = await db.patient.findUnique({ where: { id } });
  if (!patient) return jsonError("Patient not found", 404);
  await requireTenantAccess(user, patient.hospitalId);

  // P1 (rate-limit audit): risk stratification is an EXPENSIVE AI operation
  // (LLM call per request). Use rateLimitStrict so production fails CLOSED
  // without Redis (an attacker cannot exhaust the AI budget by flooding a
  // weak in-memory limiter across serverless instances).
  const rl = await rateLimitStrict(`risk-strat:${user.sub}`, 10, 60);
  if (!rl.allowed) return jsonError("Too many risk assessments. Slow down.", 429);

  const result = await runRiskStratificationAgent(
    {
      patientName: patient.fullName,
      age: patient.age,
      gender: patient.gender,
      surgeryType: patient.surgeryType,
      comorbidities: patient.comorbidities,
    },
    { hospitalId: patient.hospitalId, patientId: patient.id }
  );

  // Create a timeline event for the risk assessment
  await db.timelineEvent.create({
    data: {
      hospitalId: patient.hospitalId,
      patientId: patient.id,
      eventType: "RISK_ASSESSMENT",
      title: `Readmission risk assessed: ${result.output.riskLevel} (${result.output.riskScore}/100)`,
      detail: `${result.output.riskFactors.length} risk factors, ${result.output.protectiveFactors.length} protective factors. Monitoring: ${result.output.monitoringFrequency}.${result.fallbackUsed ? " (FALLBACK used — provider unavailable)" : ""}`,
      actorId: user.sub,
      occurredAt: new Date(),
    },
  });

  // Persist the risk assessment on the patient record
  await db.patient.update({
    where: { id: patient.id },
    data: {
      riskLevel: result.output.riskLevel,
      riskScore: result.output.riskScore,
      riskAssessedAt: new Date(),
    },
  });

  await audit({
    hospitalId: patient.hospitalId,
    actorId: user.sub,
    action: "ai.risk_stratification",
    target: patient.id,
    detail: `${result.output.riskLevel} (${result.output.riskScore}/100)${result.fallbackUsed ? " [fallback]" : ""}`,
    ip: getClientIp(req),
  });

  return Response.json({
    assessment: result.output,
    fallbackUsed: result.fallbackUsed,
    runId: result.runId,
  });
}

export const POST = withErrors(POSTImpl);
