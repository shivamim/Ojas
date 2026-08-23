// Ojas — check-ins API. List (scoped), record a patient response, and trigger
// the Triage Agent (real LLM call) + Escalation Orchestrator on response.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireAuth, requireRole, requireTenantAccess } from "@/lib/auth";
import { runTriageAgent, runEscalationOrchestrator } from "@/lib/ai-agents";
import { audit, getClientIp, jsonError, rateLimit } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import { parseBody, checkinSubmitSchema, ValidationError } from "@/lib/validation";
import type { Escalation } from "@prisma/client";

type Ctx = { params: Promise<{}> };

async function GETImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireAuth(await getCurrentUser());
  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get("patientId");
  const status = searchParams.get("status");
  if (user.role !== "SUPER_ADMIN" && !user.hospitalId) return jsonError("No hospital", 400);
  const where: Record<string, unknown> = {};
  if (user.role !== "SUPER_ADMIN") where.hospitalId = user.hospitalId;
  if (patientId) where.patientId = patientId;
  if (status) where.status = status;
  const checkins = await db.checkin.findMany({
    where,
    orderBy: { scheduledFor: "desc" },
    take: 200,
    include: { patient: { select: { id: true, fullName: true, surgeryType: true, age: true } } },
  });
  return Response.json({ checkins });
}

// POST /api/checkins — record a patient's response to a check-in (simulating
// an inbound WhatsApp reply arriving via the Communications Service). This
// then triggers the real Triage Agent and Escalation Orchestrator.
async function POSTImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR", "DOCTOR"]);
  let body: {
    checkinId: string;
    painLevel?: number | null;
    temperature?: number | null;
    symptomsText?: string | null;
    freeText?: string | null;
    medsTaken?: boolean | null;
    medsNote?: string | null;
  };
  try {
    body = await parseBody(req, checkinSubmitSchema);
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid body", 400);
  }
  const rl = await rateLimit(`checkin:${user.sub}`, 30, 60);
  if (!rl.allowed) return jsonError("Too many requests. Slow down.", 429);

  const checkin = await db.checkin.findUnique({
    where: { id: body.checkinId },
    include: { patient: true },
  });
  if (!checkin) return jsonError("Check-in not found", 404);
  await requireTenantAccess(user, checkin.hospitalId);

  // Update check-in with the patient's response
  const updated = await db.checkin.update({
    where: { id: checkin.id },
    data: {
      status: "ANSWERED",
      answeredAt: new Date(),
      painLevel: body.painLevel ?? null,
      temperature: body.temperature ?? null,
      symptomsText: body.symptomsText ?? null,
      freeText: body.freeText ?? null,
      medsTaken: body.medsTaken ?? null,
      medsNote: body.medsNote ?? null,
    },
  });

  // Record inbound message (comms schema)
  await db.message.create({
    data: {
      hospitalId: checkin.hospitalId, patientId: checkin.patientId,
      channel: "WHATSAPP", direction: "INBOUND",
      toAddress: "patient", body: body.freeText || body.symptomsText || "(structured response)",
      status: "DELIVERED", checkinId: checkin.id,
    },
  });

  // Fetch prior trend (not just this response in isolation)
  const priorCheckins = await db.checkin.findMany({
    where: { patientId: checkin.patientId, status: "ANSWERED", id: { not: checkin.id } },
    orderBy: { scheduledFor: "asc" },
  });
  const dischargeDate = new Date(checkin.patient.dischargeDate);
  const dayOfRecovery = Math.max(1, Math.ceil((checkin.scheduledFor.getTime() - dischargeDate.getTime()) / 86400000));

  // Run the Triage Agent — REAL LLM call
  const triageResult = await runTriageAgent(
    {
      patientName: checkin.patient.fullName,
      age: checkin.patient.age,
      surgeryType: checkin.patient.surgeryType,
      surgeryDate: checkin.patient.surgeryDate.toISOString(),
      comorbidities: checkin.patient.comorbidities,
      dayOfRecovery,
      priorTrend: priorCheckins.map((c, i) => ({
        day: i + 1,
        painLevel: c.painLevel,
        symptomsText: c.symptomsText,
        freeText: c.freeText,
        riskLevel: c.aiRiskLevel,
      })),
      currentResponse: {
        painLevel: updated.painLevel,
        temperature: updated.temperature,
        symptomsText: updated.symptomsText,
        freeText: updated.freeText,
      },
    },
    { hospitalId: checkin.hospitalId, checkinId: checkin.id }
  );

  // Persist triage result on the check-in
  await db.checkin.update({
    where: { id: checkin.id },
    data: {
      aiRiskScore: triageResult.output.confidence,
      aiRiskLevel: triageResult.output.riskLevel,
      aiRationale: triageResult.output.rationale,
      aiRunId: triageResult.runId,
    },
  });

  // Escalation Orchestrator — proposes escalation; above LOW requires human confirmation
  const orch = await runEscalationOrchestrator(
    {
      triage: triageResult.output,
      patientName: checkin.patient.fullName,
      surgeryType: checkin.patient.surgeryType,
      recoveryDay: dayOfRecovery,
    },
    { hospitalId: checkin.hospitalId, checkinId: checkin.id }
  );

  let escalation: Escalation | null = null;
  if (orch.output.shouldEscalate) {
    // Create a PENDING escalation (human must confirm MEDIUM/HIGH/CRITICAL)
    escalation = await db.escalation.create({
      data: {
        hospitalId: checkin.hospitalId,
        patientId: checkin.patientId,
        checkinId: checkin.id,
        severity: orch.output.severity,
        status: "OPEN",
        reason: orch.output.proposedReason,
        aiProposed: true,
        aiConfidence: orch.output.confidence,
        aiRationale: orch.output.proposedReason,
      },
    });
    await db.timelineEvent.create({
      data: {
        hospitalId: checkin.hospitalId, patientId: checkin.patientId,
        eventType: "AI_TRIAGE", title: `AI triage: ${triageResult.output.riskLevel} risk`,
        detail: `${triageResult.output.rationale}${triageResult.fallbackUsed ? " (FALLBACK used — provider unavailable)" : ""}. ${orch.output.shouldEscalate ? "Escalation proposed, awaiting coordinator confirmation." : "No escalation."}`,
        actorId: user.sub, occurredAt: new Date(),
      },
    });
  } else {
    await db.timelineEvent.create({
      data: {
        hospitalId: checkin.hospitalId, patientId: checkin.patientId,
        eventType: "AI_TRIAGE", title: `AI triage: LOW risk`,
        detail: `${triageResult.output.rationale}${triageResult.fallbackUsed ? " (FALLBACK used)" : ""}. No escalation.`,
        actorId: user.sub, occurredAt: new Date(),
      },
    });
  }

  await audit({
    hospitalId: checkin.hospitalId, actorId: user.sub, action: "checkin.answer",
    target: checkin.id, detail: `Triage: ${triageResult.output.riskLevel}${triageResult.fallbackUsed ? " (fallback)" : ""}`,
    ip: getClientIp(req),
  });

  // Auto-complete milestones based on check-in response.
  // "First walk" → completed if pain ≤ 4 and freeText mentions walking
  // "Wound check" → completed if no wound-related symptoms reported
  const pendingMilestones = await db.milestone.findMany({
    where: { patientId: checkin.patientId, status: "PENDING" },
  });
  const autoCompleted: { id: string; label: string; reason: string }[] = [];
  const freeText = ((body.freeText || "") + " " + (body.symptomsText || "")).toLowerCase();
  const painOk = (body.painLevel ?? 10) <= 4;

  for (const m of pendingMilestones) {
    let shouldComplete = false;
    let reason = "";
    if (m.type === "FIRST_WALK" && painOk && (freeText.includes("walk") || freeText.includes("moving") || freeText.includes("ambulat"))) {
      shouldComplete = true;
      reason = "Patient reported walking/moving with manageable pain";
    }
    if (m.type === "WOUND_CHECK" && triageResult.output.riskLevel === "LOW" && !freeText.includes("wound") && !freeText.includes("incision") && !freeText.includes("stitch")) {
      shouldComplete = true;
      reason = "No wound-related symptoms reported, low-risk triage";
    }
    if (shouldComplete) {
      await db.milestone.update({
        where: { id: m.id },
        data: { status: "COMPLETED", completedAt: new Date(), notes: `Auto-completed: ${reason}` },
      });
      await db.timelineEvent.create({
        data: {
          hospitalId: checkin.hospitalId, patientId: checkin.patientId,
          eventType: "MILESTONE_COMPLETED", title: `Milestone auto-completed: ${m.label}`,
          detail: reason,
          actorId: user.sub, occurredAt: new Date(),
        },
      });
      autoCompleted.push({ id: m.id, label: m.label, reason });
    }
  }

  return Response.json({
    checkin: updated,
    triage: triageResult.output,
    fallbackUsed: triageResult.fallbackUsed,
    escalation,
    autoCompletedMilestones: autoCompleted,
  });
}

export const GET = withErrors(GETImpl);

export const POST = withErrors(POSTImpl);
