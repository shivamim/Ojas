import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";

/**
 * Health check endpoint for Ojas.
 * Returns system status, timestamp, version, response-time metrics, and
 * runtime system info. Also verifies database connectivity.
 *
 * P1 (observability): reports `responseTimeMs` for both the overall health
 * check and the database probe, plus a `runtime` block with Node/Bun version,
 * process memory, and uptime — so the status page can surface slow-but-working
 * states and operators can diagnose performance without SSH access.
 */

// Process start time captured once at module load for uptime calculation.
const PROCESS_STARTED_AT = Date.now();

async function GET() {
  const version = "0.2.0";
  const startedAt = Date.now();
  const timestamp = new Date().toISOString();

  let dbStatus: "ok" | "error" = "ok";
  let dbResponseTimeMs = 0;

  try {
    const dbStart = Date.now();
    await db.$queryRaw`SELECT 1`;
    dbResponseTimeMs = Date.now() - dbStart;
  } catch {
    dbStatus = "error";
  }

  const status = dbStatus === "ok" ? "ok" : "degraded";
  const responseTimeMs = Date.now() - startedAt;

  // ── Runtime info (P1 observability) ──────────────────────────────────────
  // Bun exposes `process.version` (Node compat) + `process.versions.bun`.
  // We guard each field so a missing runtime doesn't crash the health check.
  const mem = typeof process !== "undefined" ? process.memoryUsage() : null;
  const runtime = {
    node: typeof process !== "undefined" ? process.version : "unknown",
    bun: typeof process !== "undefined" && process.versions
      ? (process.versions as { bun?: string }).bun ?? "n/a"
      : "n/a",
    platform: typeof process !== "undefined" ? process.platform : "unknown",
    arch: typeof process !== "undefined" ? process.arch : "unknown",
    uptimeSeconds: Math.round((Date.now() - PROCESS_STARTED_AT) / 1000),
    memory: mem
      ? {
          rssMb: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
          heapUsedMb: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
          heapTotalMb: Math.round((mem.heapTotal / 1024 / 1024) * 10) / 10,
          externalMb: Math.round((mem.external / 1024 / 1024) * 10) / 10,
        }
      : null,
  };

  return NextResponse.json(
    {
      status,
      timestamp,
      version,
      responseTimeMs,
      runtime,
      checks: {
        database: dbStatus,
        databaseResponseTimeMs: dbResponseTimeMs,
      },
    },
    { status: dbStatus === "ok" ? 200 : 503 }
  );
}

export { GET };
