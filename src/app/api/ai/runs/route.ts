// Ojas — AI agent run log viewer (scoped). Used for AI usage metering + billing.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireAuth, requireRole } from "@/lib/auth";
import { jsonError } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";

type Ctx = { params: Promise<{}> };

async function GETImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireAuth(await getCurrentUser());
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 500);
  const agentType = searchParams.get("agentType");
  const where: Record<string, unknown> = {};
  if (user.role !== "SUPER_ADMIN") where.hospitalId = user.hospitalId;
  else if (searchParams.get("hospitalId")) where.hospitalId = searchParams.get("hospitalId");
  if (agentType) where.agentType = agentType;
  const runs = await db.aiAgentRun.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  // Aggregate
  const totalTokens = runs.reduce((s, r) => s + r.tokensIn + r.tokensOut, 0);
  const fallbacks = runs.filter((r) => r.fallbackUsed).length;
  const byAgent: Record<string, number> = {};
  for (const r of runs) byAgent[r.agentType] = (byAgent[r.agentType] || 0) + 1;
  return Response.json({ runs, aggregate: { totalCalls: runs.length, totalTokens, fallbacks, byAgent } });
}

export const GET = withErrors(GETImpl);
