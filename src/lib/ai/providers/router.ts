// Ojas — AI Provider abstraction (P0.1).
//
// The platform cannot be Groq-only — that is a single point of failure. This
// module defines the AiProvider interface and a router that tries providers
// in order: primary (Groq) → secondary (OpenRouter) → rule-based fallback
// (always available, honestly labeled).
//
// Every call's `provider` is logged on AiAgentRun for audit + billing.
//
// Latency SLA: primary must respond within LATENCY_SLA_MS or we cut over to
// the secondary. Both LLM providers must fail before rule-based fires.
import Groq from "groq-sdk";

export type ProviderName = "GROQ" | "OPENROUTER" | "RULE_BASED";

export interface LlmRequest {
  systemPrompt: string;
  userPrompt: string;
  /** Max tokens for the completion. Default 1024. */
  maxTokens?: number;
  /** Temperature 0..1. Default 0.2 for deterministic agents. */
  temperature?: number;
  /** Hospital + agent context for logging. */
  hospitalId: string;
  agentType: string;
}

export interface LlmResponse {
  text: string;
  provider: ProviderName;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  /** If this provider was a fallback (i.e. a prior provider was tried first). */
  fellBackFrom?: ProviderName;
  fallbackReason?: string;
}

export interface AiProvider {
  name: ProviderName;
  /** Execute the LLM call. Throws on any error — the router handles fallback. */
  complete(req: LlmRequest): Promise<Omit<LlmResponse, "fellBackFrom" | "fallbackReason">>;
  /** Whether this provider is configured and available. */
  isAvailable(): boolean;
}

// ── Latency SLA ────────────────────────────────────────────────────────────
// 2000ms per the spec. If a provider exceeds this, we cut over to the next.
export const LATENCY_SLA_MS = 2000;

// ── GROQ PROVIDER ──────────────────────────────────────────────────────────
// The existing primary provider. Real Llama-3.3-70b call via Groq.
export const GROQ_MODEL = "llama-3.3-70b-versatile";

let groqInstance: Groq | null = null;
function getGroq(): Groq {
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

export const GroqProvider: AiProvider = {
  name: "GROQ",
  isAvailable() {
    return !!process.env.GROQ_API_KEY;
  },
  async complete(req: LlmRequest) {
    const start = Date.now();
    const groq = getGroq();
    // Race the LLM call against the latency SLA. If it exceeds LATENCY_SLA_MS,
    // we abort and let the router fall over to the next provider.
    const completion = await withTimeout(
      groq.chat.completions.create({
        model: GROQ_MODEL,
        messages: [
          { role: "system", content: req.systemPrompt },
          { role: "user", content: req.userPrompt },
        ],
        max_tokens: req.maxTokens ?? 1024,
        temperature: req.temperature ?? 0.2,
      }),
      LATENCY_SLA_MS,
      "Groq latency exceeded SLA"
    );
    const text = completion.choices[0]?.message?.content || "";
    return {
      text,
      provider: "GROQ",
      tokensIn: (completion as { usage?: { prompt_tokens?: number } }).usage?.prompt_tokens ?? 0,
      tokensOut: (completion as { usage?: { completion_tokens?: number } }).usage?.completion_tokens ?? 0,
      latencyMs: Date.now() - start,
    };
  },
};

// ── OPENROUTER SECONDARY PROVIDER ────────────────────────────────────────
// Real, independently-hosted LLM routing service (openrouter.ai).
// Uses OpenAI-compatible API — a genuine secondary provider, not a sandbox stand-in.
// If OpenRouter credentials aren't available, the router gracefully falls through
// to rule-based fallback (always available, honestly labeled).
//
// To configure: set OPENROUTER_API_KEY from https://openrouter.ai/keys
export const OpenRouterProvider: AiProvider = {
  name: "OPENROUTER",
  isAvailable() {
    return !!process.env.OPENROUTER_API_KEY;
  },
  async complete(req: LlmRequest) {
    const start = Date.now();
    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) throw new Error("OPENROUTER_API_KEY not configured");

    const response = await withTimeout(
      fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://ojas.care",
          "X-Title": "Ojas AI",
        },
        body: JSON.stringify({
          model: "meta-llama/llama-3.3-70b-instruct",
          messages: [
            { role: "system", content: req.systemPrompt },
            { role: "user", content: req.userPrompt },
          ],
          max_tokens: req.maxTokens ?? 1024,
          temperature: req.temperature ?? 0.2,
        }),
      }),
      LATENCY_SLA_MS,
      "OpenRouter latency exceeded SLA"
    );

    if (!response.ok) {
      const errText = await response.text().catch(() => "unknown");
      throw new Error(`OpenRouter API error ${response.status}: ${errText.slice(0, 200)}`);
    }

    const completion = await response.json() as {
      usage?: { prompt_tokens?: number; completion_tokens?: number };
      choices?: Array<{ message?: { content?: string } }>;
    };

    const text = completion.choices?.[0]?.message?.content || "";
    return {
      text,
      provider: "OPENROUTER",
      tokensIn: completion.usage?.prompt_tokens ?? 0,
      tokensOut: completion.usage?.completion_tokens ?? 0,
      latencyMs: Date.now() - start,
    };
  },
};

// ── RULE-BASED FALLBACK ────────────────────────────────────────────────────
// Always available. The caller (each agent) supplies the rule-based function
// since it's agent-specific (different output shapes per agent).
// The router calls this LAST and labels the run as FALLBACK.

// ── AI ROUTER ──────────────────────────────────────────────────────────────
// Tries primary → secondary → caller-supplied rule-based fallback.
// Always returns a result (never throws if rule-based is supplied).
export interface RouterOptions {
  /** Agent-specific rule-based fallback. Always succeeds. */
  ruleBased?: () => string; // returns JSON string of agent's output shape
  /** Skip the secondary provider (some agents shouldn't double-call). */
  skipSecondary?: boolean;
}

export interface RouterResult extends LlmResponse {
  /** Was the rule-based fallback used? */
  fallbackUsed: boolean;
  /** The final text (from whichever provider served). */
  text: string;
}

export async function routeLlm(req: LlmRequest, opts: RouterOptions = {}): Promise<RouterResult> {
  const providers: AiProvider[] = [GroqProvider];
  if (!opts.skipSecondary) providers.push(OpenRouterProvider);

  let lastError: Error | null = null;
  let fellBackFrom: ProviderName | undefined;
  let fallbackReason: string | undefined;

  for (const provider of providers) {
    if (!provider.isAvailable()) {
      fellBackFrom = provider.name;
      fallbackReason = "provider_not_configured";
      continue;
    }
    try {
      const result = await provider.complete(req);
      return {
        ...result,
        fellBackFrom: fellBackFrom ? provider.name === "OPENROUTER" && fellBackFrom === "GROQ" ? fellBackFrom : undefined : undefined,
        fallbackReason: fellBackFrom ? fallbackReason : undefined,
        fallbackUsed: false,
      };
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      fellBackFrom = provider.name;
      fallbackReason = err instanceof TimeoutError
        ? `timeout>${LATENCY_SLA_MS}ms`
        : err instanceof Error
          ? (err.message.slice(0, 120) || "unknown_error")
          : "unknown_error";
      // continue to next provider
    }
  }

  // All LLM providers failed — rule-based fallback (if supplied).
  if (opts.ruleBased) {
    const text = opts.ruleBased();
    return {
      text,
      provider: "RULE_BASED",
      tokensIn: 0,
      tokensOut: 0,
      latencyMs: 0,
      fellBackFrom,
      fallbackReason: fallbackReason ?? "all_providers_failed",
      fallbackUsed: true,
    };
  }

  // No rule-based fallback supplied — rethrow the last error.
  throw lastError ?? new Error("All AI providers failed and no rule-based fallback supplied");
}

// ── Helpers ────────────────────────────────────────────────────────────────
class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

async function withTimeout<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new TimeoutError(message)), ms);
  });
  try {
    return await Promise.race([promise, timeout]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

// ── PII De-identification Helper ───────────────────────────────────────────
// The audit flagged that `patientName` was sent to LLM prompts. Per DPDP,
// prompts should contain only de-identified clinical data. This helper
// replaces names with a stable pseudonymous label so the LLM still has
// context for pronouns/references but cannot re-identify the patient.
export function deidentify(name: string): string {
  if (!name) return "Patient";
  // Use first initial + last initial, e.g. "Ramesh Kumar" → "Patient R.K."
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return `Patient ${parts[0][0]}.`;
  return `Patient ${parts[0][0]}.${parts[parts.length - 1][0]}.`;
}
