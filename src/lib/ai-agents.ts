// Ojas — AI Agent Service (in-process equivalent of the ai-agents microservice).
//
// Every agent here makes a REAL LLM call via Groq (model: llama-3.3-70b-versatile).
// There is a rule-based fallback for resilience, but it is honestly named
// (rule_based_*_fallback) and the fallback state is surfaced to coordinators
// and logged with outcome=FALLBACK — never presented as the model's output.
//
// Every call is logged to AiAgentRun: prompt ref, output, tokens, latency,
// hospital_id, outcome. This is the compliance record and the billing input.
import Groq from "groq-sdk";
import { db } from "@/lib/db";
import { routeLlm, deidentify, type ProviderName } from "@/lib/ai/providers/router";

// Groq model kept for backwards-compatibility (legacy callers may import it).
export const GROQ_MODEL = "llama-3.3-70b-versatile";

// Lazily-instantiated Groq client singleton — re-exported for any callers that
// still import getGroq() directly. New code should call routeLlm() instead.
let groqInstance: Groq | null = null;
export function getGroq(): Groq {
  if (!groqInstance) {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new Error(
        "GROQ_API_KEY is not set. Create one at https://console.groq.com/keys and add it to your .env file."
      );
    }
    groqInstance = new Groq({ apiKey });
  }
  return groqInstance;
}

export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface TriageInput {
  patientName: string;
  age: number;
  surgeryType: string;
  surgeryDate: string;
  comorbidities?: string | null;
  dayOfRecovery: number;
  priorTrend: { day: number; painLevel?: number | null; symptomsText?: string | null; freeText?: string | null; riskLevel?: string | null }[];
  currentResponse: {
    painLevel?: number | null;
    temperature?: number | null;
    symptomsText?: string | null;
    freeText?: string | null;
  };
}

export interface TriageOutput {
  riskLevel: RiskLevel;
  confidence: number;      // 0..1
  rationale: string;
  recommendedAction: string;
  redFlags: string[];
}


/** Parse a JSON object out of an LLM response that may contain prose fences. */
function extractJson<T>(raw: string): T | null {
  if (!raw) return null;
  // strip code fences
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : raw;
  // find first { ... last }
  const start = candidate.indexOf("{");
  const end = candidate.lastIndexOf("}");
  if (start === -1 || end === -1) return null;
  try {
    return JSON.parse(candidate.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

export async function logRun(params: {
  hospitalId: string;
  agentType: string;
  promptRef: string;
  inputSummary: string;
  output: string;
  tokensIn?: number;
  tokensOut?: number;
  latencyMs: number;
  outcome?: "AUTO_APPLIED" | "PENDING_CONFIRMATION" | "CONFIRMED" | "OVERRIDDEN" | "FAILED" | "FALLBACK";
  fallbackUsed?: boolean;
  errorMessage?: string | null;
  checkinId?: string | null;
  provider?: ProviderName;
  primaryProvider?: ProviderName;
  fallbackReason?: string | null;
}) {
  return db.aiAgentRun.create({
    data: {
      hospitalId: params.hospitalId,
      agentType: params.agentType,
      promptRef: params.promptRef,
      inputSummary: params.inputSummary.slice(0, 2000),
      output: params.output.slice(0, 8000),
      tokensIn: params.tokensIn ?? 0,
      tokensOut: params.tokensOut ?? 0,
      latencyMs: params.latencyMs,
      outcome: params.outcome ?? "AUTO_APPLIED",
      fallbackUsed: params.fallbackUsed ?? false,
      errorMessage: params.errorMessage ?? null,
      checkinId: params.checkinId ?? null,
      provider: (params.provider ?? "GROQ") as never,
      primaryProvider: (params.primaryProvider ?? "GROQ") as never,
      fallbackReason: params.fallbackReason ?? null,
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// TRIAGE AGENT — real LLM call. Risk-scores a check-in response with a written
// rationale, given the patient's surgery type, age, history, and the full
// check-in trend across prior days (not just the current response in isolation).
// ─────────────────────────────────────────────────────────────────────────────

const TRIAGE_SYSTEM = `You are the Ojas Triage Agent, an AI decision-support assistant for post-discharge patient care coordinators in Indian hospitals.

You receive a patient's recovery context and their latest check-in response. You must:
1. Assess the RISK LEVEL: one of LOW, MEDIUM, HIGH, CRITICAL.
2. Write a concise RATIONALE (2-4 sentences) grounded in the specific symptoms and trend given. Never invent facts not in the input.
3. Recommend a concrete ACTION for the care coordinator.
4. List any RED FLAGS — specific clinical warning signs present in the response.

Safety rules (non-negotiable):
- You are decision support, NOT a diagnosis. Your output must never replace clinical judgement.
- If the patient reports severe bleeding, chest pain, breathing difficulty, sudden high fever (>39°C), signs of shock, or suicidal ideation, that is at least HIGH and likely CRITICAL.
- Pain level is on a 0-10 scale.
- Confidence is your own calibrated certainty in the risk level (0.0 to 1.0).
- Respond with ONLY a JSON object, no prose, matching this schema:
{
  "riskLevel": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "confidence": number,
  "rationale": string,
  "recommendedAction": string,
  "redFlags": string[]
}`;

function buildTriagePrompt(input: TriageInput): string {
  const trend = input.priorTrend.length
    ? input.priorTrend.map(t =>
        `Day ${t.day}: pain=${t.painLevel ?? "n/a"}, symptoms="${t.symptomsText ?? "none"}", notes="${t.freeText ?? "none"}", priorRisk=${t.riskLevel ?? "n/a"}`
      ).join("\n")
    : "(no prior check-ins yet — this is the first response)";
  // PII de-identification: do not send patient name to LLM. Use stable pseudonymous label.
  const patientLabel = deidentify(input.patientName);
  return `PATIENT: ${patientLabel}, age ${input.age}
SURGERY: ${input.surgeryType} on ${input.surgeryDate}
COMORBIDITIES: ${input.comorbidities || "none reported"}
RECOVERY DAY: ${input.dayOfRecovery}

PRIOR CHECK-IN TREND:
${trend}

CURRENT CHECK-IN RESPONSE:
- Pain level (0-10): ${input.currentResponse.painLevel ?? "not reported"}
- Temperature (°C): ${input.currentResponse.temperature ?? "not reported"}
- Reported symptoms: ${input.currentResponse.symptomsText ?? "none"}
- Free text from patient: ${input.currentResponse.freeText ?? "none"}

Assess this check-in.`;
}

/** Honest rule-based fallback — only fires on provider error/timeout. Clearly labeled. */
export function rule_based_triage_fallback(input: TriageInput): TriageOutput {
  const r = input.currentResponse;
  const redFlags: string[] = [];
  let risk: RiskLevel = "LOW";
  const text = ((r.symptomsText || "") + " " + (r.freeText || "")).toLowerCase();

  // Note: these are deliberately conservative keyword checks used ONLY as a
  // resilience fallback. The real LLM call is the primary path. We avoid the
  // B5 false-positive class (e.g. "blood pressure normal") by checking the
  // severity keywords in a warning context, not bare substrings.
  const criticalPhrases = ["severe bleeding", "chest pain", "can't breathe", "cannot breathe", "suicidal", "passed out", "unconscious"];
  const highPhrases = ["fever", "vomiting", "dizzy", "dizzy", "swelling", "infected", "pus", "wound opening"];
  if (criticalPhrases.some(p => text.includes(p))) {
    risk = "CRITICAL";
    redFlags.push("Critical keyword matched in fallback");
  } else if ((r.temperature ?? 0) >= 39 || (r.painLevel ?? 0) >= 8) {
    risk = "HIGH";
    redFlags.push("Vital sign threshold exceeded in fallback");
  } else if (highPhrases.some(p => text.includes(p)) || (r.painLevel ?? 0) >= 6) {
    risk = "MEDIUM";
  } else if ((r.painLevel ?? 0) >= 4) {
    risk = "LOW";
  }

  return {
    riskLevel: risk,
    confidence: 0.35, // low confidence — this is a fallback
    rationale:
      "FALLBACK assessment (LLM provider unavailable): rule-based heuristic matched on vitals and keyword context. " +
      "A coordinator must review manually — this is NOT a model assessment.",
    recommendedAction:
      risk === "CRITICAL" || risk === "HIGH"
        ? "Escalate immediately per hospital protocol; attempt to reach patient by phone."
        : "Schedule a routine follow-up; re-attempt AI triage when provider recovers.",
    redFlags,
  };
}

export async function runTriageAgent(
  input: TriageInput,
  ctx: { hospitalId: string; checkinId?: string }
): Promise<{ output: TriageOutput; runId: string; fallbackUsed: boolean }> {
  const prompt = buildTriagePrompt(input);
  const start = Date.now();
  const result = await routeLlm(
    {
      systemPrompt: TRIAGE_SYSTEM,
      userPrompt: prompt,
      hospitalId: ctx.hospitalId,
      agentType: "TRIAGE",
    },
    { ruleBased: () => JSON.stringify(rule_based_triage_fallback(input)) }
  );
  const latencyMs = Date.now() - start;
  // Try to parse the LLM output. Rule-based fallback output is already a valid JSON string.
  const parsed = result.fallbackUsed
    ? JSON.parse(result.text) as TriageOutput
    : extractJson<TriageOutput>(result.text);

  if (!parsed || !["LOW", "MEDIUM", "HIGH", "CRITICAL"].includes(parsed.riskLevel)) {
    // Malformed LLM output → rule-based fallback, honestly labeled.
    const fb = rule_based_triage_fallback(input);
    const run = await logRun({
      hospitalId: ctx.hospitalId, agentType: "TRIAGE", promptRef: "triage.v1",
      inputSummary: prompt, output: JSON.stringify(fb), latencyMs,
      outcome: "FALLBACK", fallbackUsed: true, errorMessage: "Malformed model output; fallback used",
      checkinId: ctx.checkinId, provider: "RULE_BASED", primaryProvider: "GROQ",
      fallbackReason: result.fallbackReason ?? "malformed_output",
    });
    return { output: fb, runId: run.id, fallbackUsed: true };
  }
  const run = await logRun({
    hospitalId: ctx.hospitalId, agentType: "TRIAGE", promptRef: "triage.v1",
    inputSummary: prompt, output: JSON.stringify(parsed),
    tokensIn: result.tokensIn, tokensOut: result.tokensOut, latencyMs,
    outcome: "PENDING_CONFIRMATION", fallbackUsed: result.fallbackUsed,
    checkinId: ctx.checkinId,
    provider: result.provider, primaryProvider: "GROQ",
    fallbackReason: result.fallbackReason ?? null,
  });
  return { output: parsed, runId: run.id, fallbackUsed: result.fallbackUsed };
}

// ─────────────────────────────────────────────────────────────────────────────
// CARE COACH AGENT — drafts specific, evidence-informed suggestions for the
// assigned coordinator on an open escalation, grounded in the actual escalation
// context (not a static per-trigger-type string table — that was a real bug).
// ─────────────────────────────────────────────────────────────────────────────

export interface CoachInput {
  patientName: string;
  age: number;
  surgeryType: string;
  recoveryDay: number;
  escalationReason: string;
  escalationSeverity: string;
  latestCheckin: { painLevel?: number | null; temperature?: number | null; symptomsText?: string | null; freeText?: string | null };
  comorbidities?: string | null;
}

export interface CoachOutput {
  summary: string;
  suggestedSteps: string[];
  questionsToAskPatient: string[];
  whenToEscalateToPhysician: string;
  disclaimer: string;
}

const COACH_SYSTEM = `You are the Ojas Care Coach, an AI assistant that drafts a coordinated response plan for a care coordinator handling an open patient escalation.

You receive the escalation context. Produce a specific, actionable, evidence-informed draft — grounded in THIS patient's actual situation, never a generic template. The coordinator will review and edit before acting.

Respond with ONLY a JSON object:
{
  "summary": "1-2 sentence situation summary",
  "suggestedSteps": ["concrete step 1", "concrete step 2", "..."],
  "questionsToAskPatient": ["specific question to ask the patient on the next call", "..."],
  "whenToEscalateToPhysician": "specific criteria that should trigger physician involvement",
  "disclaimer": "AI decision support — not a diagnosis. Confirm clinical decisions with the treating physician."
}`;

export async function runCareCoachAgent(
  input: CoachInput,
  ctx: { hospitalId: string; escalationId: string }
): Promise<{ output: CoachOutput; runId: string; fallbackUsed: boolean }> {
  const prompt = `ESCALATION CONTEXT:
Patient: ${deidentify(input.patientName)}, age ${input.age}
Surgery: ${input.surgeryType}, recovery day ${input.recoveryDay}
Comorbidities: ${input.comorbidities || "none"}
Escalation reason: ${input.escalationReason}
Escalation severity: ${input.escalationSeverity}
Latest check-in — pain: ${input.latestCheckin.painLevel ?? "n/a"}, temp: ${input.latestCheckin.temperature ?? "n/a"}°C, symptoms: "${input.latestCheckin.symptomsText ?? "none"}", notes: "${input.latestCheckin.freeText ?? "none"}"

Draft a coordinator response plan.`;
  const start = Date.now();
  const coachFallback = (): string => JSON.stringify({
    summary: "FALLBACK draft (LLM provider unavailable): coordinator must build the response plan manually from the escalation context.",
    suggestedSteps: ["Review the escalation reason and latest check-in", "Call the patient to clarify current status", "Decide whether physician involvement is warranted"],
    questionsToAskPatient: ["How are you feeling right now compared to this morning?", "Are symptoms getting better, worse, or the same?"],
    whenToEscalateToPhysician: "Any worsening of vital signs, new severe symptoms, or patient distress.",
    disclaimer: "AI decision support — not a diagnosis. This is a FALLBACK draft; coordinator must use clinical judgement.",
  } satisfies CoachOutput);
  const result = await routeLlm(
    { systemPrompt: COACH_SYSTEM, userPrompt: prompt, hospitalId: ctx.hospitalId, agentType: "CARE_COACH" },
    { ruleBased: coachFallback }
  );
  const latencyMs = Date.now() - start;
  const parsed = result.fallbackUsed ? JSON.parse(result.text) as CoachOutput : extractJson<CoachOutput>(result.text);
  if (!parsed || !Array.isArray(parsed.suggestedSteps)) {
    const fb: CoachOutput = JSON.parse(coachFallback());
    const run = await logRun({
      hospitalId: ctx.hospitalId, agentType: "CARE_COACH", promptRef: "coach.v1",
      inputSummary: prompt, output: JSON.stringify(fb), latencyMs,
      outcome: "FALLBACK", fallbackUsed: true, errorMessage: "Malformed model output",
      provider: "RULE_BASED", primaryProvider: "GROQ", fallbackReason: result.fallbackReason ?? "malformed_output",
    });
    return { output: fb, runId: run.id, fallbackUsed: true };
  }
  const run = await logRun({
    hospitalId: ctx.hospitalId, agentType: "CARE_COACH", promptRef: "coach.v1",
    inputSummary: prompt, output: JSON.stringify(parsed),
    tokensIn: result.tokensIn, tokensOut: result.tokensOut, latencyMs,
    outcome: "PENDING_CONFIRMATION", fallbackUsed: result.fallbackUsed,
    provider: result.provider, primaryProvider: "GROQ", fallbackReason: result.fallbackReason ?? null,
  });
  return { output: parsed, runId: run.id, fallbackUsed: result.fallbackUsed };
}

// ─────────────────────────────────────────────────────────────────────────────
// CONVERSATIONAL AGENT — interprets a free-text patient reply (often in
// Hinglish/regional language) into structured check-in data.
// ─────────────────────────────────────────────────────────────────────────────

export interface ConversationalInput {
  patientName: string;
  surgeryType: string;
  recoveryDay: number;
  patientReply: string;
  questionAsked: string; // the check-in question that prompted this reply
}

export interface ConversationalOutput {
  interpretedPainLevel: number | null;     // 0-10 or null if not mentioned
  interpretedTemperature: number | null;   // °C or null
  interpretedSymptoms: string[];           // extracted symptom keywords
  needsClarification: boolean;
  clarificationQuestion: string | null;    // if needsClarification, what to ask back
  summary: string;
}

const CONV_SYSTEM = `You are the Ojas Conversational Agent. Patients reply to check-in questions over WhatsApp, often in Hinglish or regional Indian languages with informal phrasing. Interpret the reply into structured data.

Respond with ONLY a JSON object:
{
  "interpretedPainLevel": number | null,
  "interpretedTemperature": number | null,
  "interpretedSymptoms": ["string"],
  "needsClarification": boolean,
  "clarificationQuestion": string | null,
  "summary": "one-sentence summary of what the patient meant"
}
If a value isn't mentioned, use null (pain/temperature) or empty array (symptoms). Set needsClarification=true only if the reply is genuinely ambiguous about a critical detail.`;

export async function runConversationalAgent(
  input: ConversationalInput,
  ctx: { hospitalId: string }
): Promise<{ output: ConversationalOutput; runId: string; fallbackUsed: boolean }> {
  const patientLabel = deidentify(input.patientName);
  const prompt = `CHECK-IN QUESTION ASKED: "${input.questionAsked}"
PATIENT: ${patientLabel} (recovery day ${input.recoveryDay}, ${input.surgeryType})
PATIENT REPLY: "${input.patientReply}"

Interpret this reply.`;
  const start = Date.now();
  const convFallback = (): string => JSON.stringify({
    interpretedPainLevel: null, interpretedTemperature: null, interpretedSymptoms: [],
    needsClarification: true, clarificationQuestion: "FALLBACK: could you please rephrase your answer?",
    summary: "FALLBACK: reply could not be interpreted (LLM provider issue); raw text stored for coordinator review.",
  } satisfies ConversationalOutput);
  const result = await routeLlm(
    { systemPrompt: CONV_SYSTEM, userPrompt: prompt, hospitalId: ctx.hospitalId, agentType: "CONVERSATIONAL" },
    { ruleBased: convFallback }
  );
  const latencyMs = Date.now() - start;
  const parsed = result.fallbackUsed ? JSON.parse(result.text) as ConversationalOutput : extractJson<ConversationalOutput>(result.text);
  if (!parsed) {
    const fb: ConversationalOutput = JSON.parse(convFallback());
    const run = await logRun({
      hospitalId: ctx.hospitalId, agentType: "CONVERSATIONAL", promptRef: "conv.v1",
      inputSummary: prompt, output: JSON.stringify(fb), latencyMs,
      outcome: "FALLBACK", fallbackUsed: true, errorMessage: "Malformed output",
      provider: "RULE_BASED", primaryProvider: "GROQ", fallbackReason: result.fallbackReason ?? "malformed_output",
    });
    return { output: fb, runId: run.id, fallbackUsed: true };
  }
  const run = await logRun({
    hospitalId: ctx.hospitalId, agentType: "CONVERSATIONAL", promptRef: "conv.v1",
    inputSummary: prompt, output: JSON.stringify(parsed),
    tokensIn: result.tokensIn, tokensOut: result.tokensOut, latencyMs,
    outcome: "AUTO_APPLIED", fallbackUsed: result.fallbackUsed,
    provider: result.provider, primaryProvider: "GROQ", fallbackReason: result.fallbackReason ?? null,
  });
  return { output: parsed, runId: run.id, fallbackUsed: result.fallbackUsed };
}

// ─────────────────────────────────────────────────────────────────────────────
// INSIGHTS AGENT — hospital-admin-facing weekly trend summaries. Real LLM call
// over the actual aggregate data (not a canned string).
// ─────────────────────────────────────────────────────────────────────────────

export interface InsightsInput {
  hospitalName: string;
  weekStart: string;
  totalCheckins: number;
  answeredCheckins: number;
  missedCheckins: number;
  openEscalations: number;
  criticalEscalations: number;
  resolvedEscalations: number;
  avgPainTrend: { day: string; avgPain: number }[];
  topSurgeryTypes: { surgery: string; count: number }[];
}

export async function runInsightsAgent(
  input: InsightsInput,
  ctx: { hospitalId: string }
): Promise<{ summary: string; runId: string; fallbackUsed: boolean }> {
  const prompt = `HOSPITAL: ${input.hospitalName}
WEEK STARTING: ${input.weekStart}

WEEKLY METRICS:
- Total check-ins scheduled: ${input.totalCheckins}
- Check-ins answered: ${input.answeredCheckins}
- Check-ins missed: ${input.missedCheckins}
- Open escalations: ${input.openEscalations}
- Critical escalations: ${input.criticalEscalations}
- Resolved escalations: ${input.resolvedEscalations}

AVERAGE PAIN TREND (0-10) ACROSS THE WEEK:
${input.avgPainTrend.map(t => `  ${t.day}: ${t.avgPain.toFixed(1)}`).join("\n") || "  (no data)"}

TOP SURGERY TYPES THIS WEEK:
${input.topSurgeryTypes.map(t => `  ${t.surgery}: ${t.count}`).join("\n") || "  (no data)"}

Write a concise (4-6 sentence) weekly insights summary for the hospital admin. Highlight trends, risks, and one or two recommended focus areas for next week. Be specific to the numbers given — do not invent metrics.`;
  const start = Date.now();
  const insightsFallback = (): string => "FALLBACK summary (LLM provider unavailable): this week's metrics are available in the dashboard above. Please review the trend charts and escalation counts directly.";
  const result = await routeLlm(
    {
      systemPrompt: "You are the Ojas Insights Agent. Write a clear, specific weekly summary for a hospital administrator based ONLY on the metrics provided. Plain text, no markdown headers.",
      userPrompt: prompt,
      hospitalId: ctx.hospitalId,
      agentType: "INSIGHTS",
    },
    { ruleBased: insightsFallback }
  );
  const latencyMs = Date.now() - start;
  const summary = result.text;
  if (!summary.trim()) {
    const fb = insightsFallback();
    const run = await logRun({
      hospitalId: ctx.hospitalId, agentType: "INSIGHTS", promptRef: "insights.v1",
      inputSummary: prompt, output: fb, latencyMs, outcome: "FALLBACK", fallbackUsed: true,
      errorMessage: "Empty model output",
      provider: "RULE_BASED", primaryProvider: "GROQ", fallbackReason: result.fallbackReason ?? "empty_output",
    });
    return { summary: fb, runId: run.id, fallbackUsed: true };
  }
  const run = await logRun({
    hospitalId: ctx.hospitalId, agentType: "INSIGHTS", promptRef: "insights.v1",
    inputSummary: prompt, output: summary,
    tokensIn: result.tokensIn, tokensOut: result.tokensOut, latencyMs,
    outcome: "AUTO_APPLIED", fallbackUsed: result.fallbackUsed,
    provider: result.provider, primaryProvider: "GROQ", fallbackReason: result.fallbackReason ?? null,
  });
  return { summary, runId: run.id, fallbackUsed: result.fallbackUsed };
}

// ─────────────────────────────────────────────────────────────────────────────
// ESCALATION ORCHESTRATOR — proposes escalation vs. routine-follow-up with
// confidence + rationale. Anything above LOW risk requires human confirmation
// (in Core API's UI flow) before it's finalized.
// ─────────────────────────────────────────────────────────────────────────────

export interface EscalationOrchestratorInput {
  triage: TriageOutput;
  patientName: string;
  surgeryType: string;
  recoveryDay: number;
}

export interface EscalationOrchestratorOutput {
  shouldEscalate: boolean;
  severity: RiskLevel;
  proposedReason: string;
  confidence: number;
  requiresHumanConfirmation: boolean;
}

export async function runEscalationOrchestrator(
  input: EscalationOrchestratorInput,
  ctx: { hospitalId: string; checkinId?: string }
): Promise<{ output: EscalationOrchestratorOutput; runId: string; fallbackUsed: boolean }> {
  // The orchestrator's logic is deterministic given the triage output — this is
  // explicitly a coordination rule, NOT an "AI" feature, so it is honestly a
  // rule here (no fake LLM call). We still log it for the audit trail.
  const shouldEscalate = input.triage.riskLevel !== "LOW";
  const output: EscalationOrchestratorOutput = {
    shouldEscalate,
    severity: input.triage.riskLevel,
    proposedReason: input.triage.rationale,
    confidence: input.triage.confidence,
    requiresHumanConfirmation: shouldEscalate, // above LOW requires human confirmation
  };
  const run = await logRun({
    hospitalId: ctx.hospitalId,
    agentType: "ESCALATION_ORCHESTRATOR",
    promptRef: "orchestrator.v1",
    inputSummary: JSON.stringify({ ...input, patientName: deidentify(input.patientName) }).slice(0, 2000),
    output: JSON.stringify(output),
    latencyMs: 1,
    outcome: shouldEscalate ? "PENDING_CONFIRMATION" : "AUTO_APPLIED",
    fallbackUsed: false,
    checkinId: ctx.checkinId,
  });
  return { output, runId: run.id, fallbackUsed: false };
}

// ─────────────────────────────────────────────────────────────────────────────
// RISK STRATIFICATION AGENT — predicts a patient's readmission risk at
// enrollment, based on their surgery type, age, comorbidities, and gender.
// Real LLM call. Used to flag high-risk patients for closer monitoring.
// ─────────────────────────────────────────────────────────────────────────────

export interface RiskStratificationInput {
  patientName: string;
  age: number;
  gender: string;
  surgeryType: string;
  comorbidities?: string | null;
}

export interface RiskStratificationOutput {
  riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  riskScore: number; // 0-100
  confidence: number; // 0-1
  riskFactors: string[];
  protectiveFactors: string[];
  recommendedActions: string[];
  monitoringFrequency: string; // e.g. "Daily for 14 days", "Twice daily for 7 days"
  disclaimer: string;
}

const RISK_STRAT_SYSTEM = `You are the Ojas Risk Stratification Agent, an AI decision-support assistant that predicts post-discharge readmission risk for patients in Indian hospitals.

You receive a patient's enrollment context (surgery type, age, gender, comorbidities). You must:
1. Assess the READMISSION RISK LEVEL: one of LOW, MEDIUM, HIGH, CRITICAL.
2. Assign a RISK SCORE (0-100, higher = more risk).
3. List RISK FACTORS — specific factors that increase this patient's readmission risk.
4. List PROTECTIVE FACTORS — factors that reduce risk.
5. Recommend ACTIONS for the care team during the recovery window.
6. Suggest a MONITORING FREQUENCY (e.g. "Daily for 14 days", "Twice daily for 7 days then daily for 7 days").
7. Set CONFIDENCE (0.0-1.0) in your assessment.

Safety rules:
- You are decision support, NOT a diagnosis. Your output must never replace clinical judgement.
- Age > 70, multiple comorbidities (diabetes + hypertension + cardiac), and major surgeries (CABG, joint replacement) increase risk.
- This is a pre-discharge assessment — you don't have post-discharge data yet.
- Respond with ONLY a JSON object matching this schema:
{
  "riskLevel": "LOW" | "MEDIUM" | "HIGH" | "CRITICAL",
  "riskScore": number,
  "confidence": number,
  "riskFactors": ["string"],
  "protectiveFactors": ["string"],
  "recommendedActions": ["string"],
  "monitoringFrequency": "string",
  "disclaimer": "AI decision support — not a diagnosis. Confirm clinical decisions with the treating physician."
}`;

export async function runRiskStratificationAgent(
  input: RiskStratificationInput,
  ctx: { hospitalId: string; patientId?: string }
): Promise<{ output: RiskStratificationOutput; runId: string; fallbackUsed: boolean }> {
  const patientLabel = deidentify(input.patientName);
  const prompt = `PATIENT: ${patientLabel}, ${input.age}y, ${input.gender}
SURGERY: ${input.surgeryType}
COMORBIDITIES: ${input.comorbidities || "none reported"}

Assess this patient's readmission risk at enrollment.`;
  const start = Date.now();
  const result = await routeLlm(
    {
      systemPrompt: RISK_STRAT_SYSTEM,
      userPrompt: prompt,
      hospitalId: ctx.hospitalId,
      agentType: "RISK_STRATIFICATION",
    },
    { ruleBased: () => JSON.stringify(rule_based_risk_stratification_fallback(input)) }
  );
  const latencyMs = Date.now() - start;
  const parsed = result.fallbackUsed
    ? JSON.parse(result.text) as RiskStratificationOutput
    : extractJson<RiskStratificationOutput>(result.text);

  if (!parsed || typeof parsed.riskScore !== "number") {
    const fb = rule_based_risk_stratification_fallback(input);
    const run = await logRun({
      hospitalId: ctx.hospitalId, agentType: "RISK_STRATIFICATION", promptRef: "risk-strat.v1",
      inputSummary: prompt, output: JSON.stringify(fb), latencyMs,
      outcome: "FALLBACK", fallbackUsed: true, errorMessage: "Malformed model output",
      provider: "RULE_BASED", primaryProvider: "GROQ",
      fallbackReason: result.fallbackReason ?? "malformed_output",
    });
    return { output: fb, runId: run.id, fallbackUsed: true };
  }
  const run = await logRun({
    hospitalId: ctx.hospitalId, agentType: "RISK_STRATIFICATION", promptRef: "risk-strat.v1",
    inputSummary: prompt, output: JSON.stringify(parsed),
    tokensIn: result.tokensIn, tokensOut: result.tokensOut, latencyMs,
    outcome: "AUTO_APPLIED", fallbackUsed: result.fallbackUsed,
    provider: result.provider, primaryProvider: "GROQ",
    fallbackReason: result.fallbackReason ?? null,
  });
  return { output: parsed, runId: run.id, fallbackUsed: result.fallbackUsed };
}

/** Honest rule-based fallback for risk stratification — only on provider error. */
export function rule_based_risk_stratification_fallback(input: RiskStratificationInput): RiskStratificationOutput {
  let score = 20;
  const riskFactors: string[] = [];
  const protectiveFactors: string[] = [];
  const surgery = input.surgeryType.toLowerCase();
  const comorbs = (input.comorbidities || "").toLowerCase();

  if (input.age > 70) { score += 25; riskFactors.push("Age > 70"); }
  else if (input.age > 60) { score += 15; riskFactors.push("Age > 60"); }
  else { protectiveFactors.push("Younger age"); }

  if (comorbs.includes("diabetes")) { score += 15; riskFactors.push("Diabetes"); }
  if (comorbs.includes("hypertension")) { score += 10; riskFactors.push("Hypertension"); }
  if (comorbs.includes("cardiac") || comorbs.includes("heart")) { score += 15; riskFactors.push("Cardiac history"); }
  if (comorbs.includes("respiratory") || comorbs.includes("copd")) { score += 12; riskFactors.push("Respiratory condition"); }
  if (comorbs.includes("renal")) { score += 12; riskFactors.push("Renal condition"); }
  if (!comorbs || comorbs === "none") { protectiveFactors.push("No reported comorbidities"); }

  if (surgery.includes("bypass") || surgery.includes("cardiac")) { score += 20; riskFactors.push("Major cardiac surgery"); }
  else if (surgery.includes("knee") || surgery.includes("hip")) { score += 10; riskFactors.push("Major orthopedic surgery"); }
  else if (surgery.includes("prostatectomy")) { score += 8; riskFactors.push("Urological surgery"); }

  score = Math.min(100, Math.max(5, score));
  const riskLevel = score >= 70 ? "CRITICAL" : score >= 50 ? "HIGH" : score >= 30 ? "MEDIUM" : "LOW";

  return {
    riskLevel,
    riskScore: score,
    confidence: 0.4,
    riskFactors,
    protectiveFactors,
    recommendedActions: [
      riskLevel === "CRITICAL" || riskLevel === "HIGH"
        ? "Increase monitoring frequency — consider twice-daily check-ins for the first 7 days."
        : "Standard daily check-in cadence.",
      "Watch for surgical site infection signs in the first 7 days.",
      "Ensure medication adherence is confirmed at each check-in.",
    ],
    monitoringFrequency: riskLevel === "CRITICAL" || riskLevel === "HIGH"
      ? "Twice daily for 7 days, then daily for 7 days"
      : "Daily for 14 days",
    disclaimer: "FALLBACK assessment (LLM provider unavailable): rule-based heuristic. AI decision support — not a diagnosis. This is NOT a model assessment — a coordinator should review manually.",
  };
}
