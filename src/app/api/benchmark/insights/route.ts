// Ojas — LLM-powered benchmark insights API. Runs the real Insights Agent
// over the benchmark data to generate a plain-English summary of where the
// hospital stands relative to peers.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { withErrors } from "@/lib/api-handler";

type Ctx = { params: Promise<{}> };
import { jsonError, rateLimit } from "@/lib/server-utils";

async function POSTImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);
  const rl = await rateLimit(`bench-insights:${user.sub}`, 5, 60);
  if (!rl.allowed) return jsonError("Too many requests. Slow down.", 429);

  // Reuse the benchmark computation logic inline (simpler than refactoring)
  const [
    myPatientCount, myReadmittedCount, myCheckinCount, myAnsweredCount,
    myEscalationCount, myResolvedEscalations, myCriticalEscalations, myAiRuns,
  ] = await Promise.all([
    db.patient.count({ where: { hospitalId: user.hospitalId, deletedAt: null } }),
    db.patient.count({ where: { hospitalId: user.hospitalId, status: "READMITTED", deletedAt: null } }),
    db.checkin.count({ where: { hospitalId: user.hospitalId } }),
    db.checkin.count({ where: { hospitalId: user.hospitalId, status: "ANSWERED" } }),
    db.escalation.count({ where: { hospitalId: user.hospitalId } }),
    db.escalation.count({ where: { hospitalId: user.hospitalId, status: "RESOLVED" } }),
    db.escalation.count({ where: { hospitalId: user.hospitalId, severity: "CRITICAL" } }),
    db.aiAgentRun.count({ where: { hospitalId: user.hospitalId } }),
  ]);

  const allHospitals = await db.hospital.findMany({
    where: { deletedAt: null },
    select: { _count: { select: { patients: true, checkins: true, escalations: true, aiRuns: true } } },
  });
  const totalHospitals = allHospitals.length;
  const avgPatients = totalHospitals > 0 ? Math.round(allHospitals.reduce((s, h) => s + h._count.patients, 0) / totalHospitals) : 0;
  const avgCheckins = totalHospitals > 0 ? Math.round(allHospitals.reduce((s, h) => s + h._count.checkins, 0) / totalHospitals) : 0;
  const avgAiRuns = totalHospitals > 0 ? Math.round(allHospitals.reduce((s, h) => s + h._count.aiRuns, 0) / totalHospitals) : 0;
  const myResponseRate = myCheckinCount > 0 ? Math.round((myAnsweredCount / myCheckinCount) * 1000) / 10 : null;
  const myReadmissionRate = myPatientCount > 0 ? Math.round((myReadmittedCount / myPatientCount) * 1000) / 10 : null;
  const myResolutionRate = myEscalationCount > 0 ? Math.round((myResolvedEscalations / myEscalationCount) * 1000) / 10 : null;

  // Use the Insights Agent (real LLM)
  const { runInsightsAgent } = await import("@/lib/ai-agents");
  const result = await runInsightsAgent(
    {
      hospitalName: "Your hospital",
      weekStart: new Date().toISOString().slice(0, 10),
      totalCheckins: myCheckinCount,
      answeredCheckins: myAnsweredCount,
      missedCheckins: myCheckinCount - myAnsweredCount,
      openEscalations: myEscalationCount - myResolvedEscalations,
      criticalEscalations: myCriticalEscalations,
      resolvedEscalations: myResolvedEscalations,
      avgPainTrend: [],
      topSurgeryTypes: [],
    },
    { hospitalId: user.hospitalId }
  );

  // Build a benchmark-specific insight prompt
  const benchmarkContext = `BENCHMARK DATA:
Your hospital:
- Patients: ${myPatientCount} (platform avg: ${avgPatients})
- Check-ins: ${myCheckinCount} (platform avg: ${avgCheckins})
- Answered check-ins: ${myAnsweredCount} (${myResponseRate ?? "n/a"}% response rate)
- Escalations: ${myEscalationCount} (${myResolvedEscalations} resolved, ${myCriticalEscalations} critical)
- AI calls: ${myAiRuns} (platform avg: ${avgAiRuns})
- Readmission rate: ${myReadmissionRate ?? "n/a"}%
- Resolution rate: ${myResolutionRate ?? "n/a"}%

Platform: ${totalHospitals} hospital(s) total.

Based on this data, write a 3-4 sentence benchmark insight for the hospital admin. Highlight where the hospital is strong, where it could improve, and one specific recommendation. If there's only 1 hospital on the platform (demo), say so honestly and focus on the hospital's absolute metrics instead.`;

  // We already called runInsightsAgent for the logged run; now generate the actual benchmark insight
  // by calling the LLM directly (Groq · llama-3.3-70b-versatile) with the benchmark context.
  // This second call is ALSO logged to AiAgentRun (promptRef "benchmark-insights.v1") so the
  // "every LLM call is logged" invariant holds — previously only the first runInsightsAgent
  // call was logged while this raw call bypassed the audit trail (audit gap N15).
  const { getGroq, GROQ_MODEL, logRun } = await import("@/lib/ai-agents");
  const benchStartedAt = Date.now();
  const benchSystemPrompt = "You are the Ojas Benchmark Insights Agent. Write a clear, specific, 3-4 sentence benchmark insight for a hospital administrator based ONLY on the data provided. Plain text, no markdown headers. Be honest — if the platform only has 1 hospital, say so.";
  let insight = "";
  let fallbackUsed = false;
  let benchErr: string | null = null;
  let tokensIn = 0;
  let tokensOut = 0;
  try {
    const groq = getGroq();
    const completion = await groq.chat.completions.create({
      model: GROQ_MODEL,
      messages: [
        { role: "system", content: benchSystemPrompt },
        { role: "user", content: benchmarkContext },
      ],
    });
    insight = completion.choices[0]?.message?.content || "";
    tokensIn = completion.usage?.prompt_tokens ?? 0;
    tokensOut = completion.usage?.completion_tokens ?? 0;
    if (!insight.trim()) {
      fallbackUsed = true;
      insight = `Your hospital has ${myPatientCount} patients with a ${myResponseRate ?? "n/a"}% check-in response rate and ${myEscalationCount} escalations (${myResolutionRate ?? "n/a"}% resolved). ${totalHospitals === 1 ? "This is a demo platform with only 1 hospital — benchmarking percentiles are not yet meaningful. Focus on improving your absolute metrics: aim for >80% response rate and <10% readmission rate." : "Compare your metrics against the platform averages above to identify strengths and gaps."}`;
    }
  } catch (err) {
    fallbackUsed = true;
    benchErr = err instanceof Error ? err.message : String(err);
    insight = `Your hospital has ${myPatientCount} patients with a ${myResponseRate ?? "n/a"}% check-in response rate and ${myEscalationCount} escalations (${myResolutionRate ?? "n/a"}% resolved). ${totalHospitals === 1 ? "This is a demo platform with only 1 hospital — benchmarking percentiles are not yet meaningful. Focus on improving your absolute metrics: aim for >80% response rate and <10% readmission rate." : "Compare your metrics against the platform averages above to identify strengths and gaps."}`;
  }
  // Log this second/raw benchmark-insight LLM call to AiAgentRun.
  await logRun({
    hospitalId: user.hospitalId,
    agentType: "benchmark-insights",
    promptRef: "benchmark-insights.v1",
    inputSummary: `system: ${benchSystemPrompt}\nuser: ${benchmarkContext}`,
    output: insight,
    tokensIn,
    tokensOut,
    latencyMs: Date.now() - benchStartedAt,
    outcome: fallbackUsed ? "FALLBACK" : "AUTO_APPLIED",
    fallbackUsed,
    errorMessage: benchErr,
    provider: "GROQ",
    primaryProvider: "GROQ",
  });

  return Response.json({ insight, fallbackUsed });
}

export const POST = withErrors(POSTImpl);
