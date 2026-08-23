// Ojas — AI provider/router status (P0.1).
// Returns which providers are configured and the recent routing decisions
// (Groq vs OpenRouter vs rule-based) so admins can see fallback activity.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { jsonError } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import { GroqProvider, OpenRouterProvider, LATENCY_SLA_MS } from "@/lib/ai/providers/router";

type Ctx = { params: Promise<{}> };

async function GETImpl(_req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "SUPER_ADMIN"]);

  // Provider config status (no secrets leaked — just booleans + model names).
  const providers = [
    {
      name: "GROQ" as const,
      configured: GroqProvider.isAvailable(),
      role: "primary",
      latencySlaMs: LATENCY_SLA_MS,
      model: "llama-3.3-70b-versatile",
    },
    {
      name: "OPENROUTER" as const,
      configured: OpenRouterProvider.isAvailable(),
      role: "secondary (fallback)",
      latencySlaMs: LATENCY_SLA_MS,
      model: "meta-llama/llama-3.3-70b-instruct",
    },
    {
      name: "RULE_BASED" as const,
      configured: true,
      role: "last-resort (always available)",
      latencySlaMs: 0,
      model: "in-process heuristic",
    },
  ];

  // Routing activity in the last 24h for this hospital.
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const where = {
    createdAt: { gte: since },
    ...(user.role !== "SUPER_ADMIN" ? { hospitalId: user.hospitalId! } : {}),
  };
  const recent = await db.aiAgentRun.findMany({
    where,
    select: {
      provider: true,
      primaryProvider: true,
      fallbackUsed: true,
      fallbackReason: true,
      latencyMs: true,
      agentType: true,
      outcome: true,
    },
    take: 500,
    orderBy: { createdAt: "desc" },
  });

  const byProvider: Record<string, number> = {};
  const byFallbackReason: Record<string, number> = {};
  let p95Latency = 0;
  for (const r of recent) {
    byProvider[r.provider] = (byProvider[r.provider] || 0) + 1;
    if (r.fallbackReason) {
      byFallbackReason[r.fallbackReason] = (byFallbackReason[r.fallbackReason] || 0) + 1;
    }
  }
  if (recent.length > 0) {
    const sorted = [...recent].sort((a, b) => a.latencyMs - b.latencyMs);
    p95Latency = sorted[Math.floor(sorted.length * 0.95)]?.latencyMs ?? 0;
  }

  return Response.json({
    providers,
    routing: {
      totalRunsLast24h: recent.length,
      byProvider,
      byFallbackReason,
      p95LatencyMs: p95Latency,
      slaMs: LATENCY_SLA_MS,
      slaBreaches: recent.filter((r) => r.latencyMs > LATENCY_SLA_MS).length,
    },
  });
}

export const GET = withErrors(GETImpl);
