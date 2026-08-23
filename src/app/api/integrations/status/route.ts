// Ojas — integrations status endpoint. TRUTHFUL matrix.
// Returns which external integrations are configured vs sandbox vs workflow-only.
// Never claims an integration is live when it is only simulated/sandboxed.
//
// P1 (truthfulness): the `database` check ACTUALLY probes PostgreSQL via
// `db.$queryRaw\`SELECT 1\``. The previous implementation hardcoded
// `status: "LIVE"` which contradicted /api/health during a DB outage —
// the status page would show "Database Unavailable" (from /api/health)
// next to "PostgreSQL LIVE" (from this endpoint), which is misleading.
// Now both endpoints agree: if the probe fails, status is "UNREACHABLE".
import { withErrors } from "@/lib/api-handler";
import { db } from "@/lib/db";
import {
  isWhatsAppLive,
  isAbdmLive,
  isNhcxFullyConfigured,
  isNhcxCertConfigured,
  isPmjayLive,
  isRazorpayConfigured,
  isSentryConfigured,
  isRateLimitConfigured,
  AI_PROVIDER,
  GROQ_API_KEY,
  OPENROUTER_API_KEY,
  resolveNhcxEnvironmentState,
  resolvePmjayProviderMode,
} from "@/lib/env";

type Ctx = { params: Promise<{}> };

function isAiConfigured(): boolean {
  if (AI_PROVIDER === "rule_based") return true;
  if (AI_PROVIDER === "groq") return !!GROQ_API_KEY;
  if (AI_PROVIDER === "openrouter") return !!OPENROUTER_API_KEY;
  return false;
}

/** Probe the database with a trivial query. Returns true if reachable. */
async function probeDatabase(): Promise<boolean> {
  try {
    await db.$queryRaw`SELECT 1`;
    return true;
  } catch {
    return false;
  }
}

async function GETImpl(_req: Request, _ctx: Ctx) {
  // P1 FIX: actually probe the database instead of hardcoding "LIVE".
  const dbReachable = await probeDatabase();

  return Response.json({
    whatsapp: {
      configured: isWhatsAppLive,
      status: isWhatsAppLive ? "LIVE" : "NOT_CONFIGURED",
      label: isWhatsAppLive ? "Connected (live)" : "Not configured — set WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID",
    },
    abdm: {
      configured: isAbdmLive,
      status: isAbdmLive ? "LIVE" : "BLOCKED_BY_EXTERNAL_ONBOARDING",
      label: isAbdmLive ? "Production ABDM gateway" : "SANDBOX / blocked by external onboarding (ABDM_CLIENT_ID/SECRET)",
    },
    abha: {
      // ABHA verification depends on ABDM. Discovered != Verified (state machine enforced).
      configured: isAbdmLive,
      status: isAbdmLive ? "LIVE" : "BLOCKED_BY_EXTERNAL_ONBOARDING",
      label: "State-machine verified; live ABDM verification pending official onboarding",
    },
    nhcx: {
      // V3-A/D/36: NHCX mode derived from NHCX config + operator-declared environment.
      configured: isNhcxFullyConfigured,
      environmentState: resolveNhcxEnvironmentState(),
      status: resolveNhcxEnvironmentState() === "LIVE" ? "LIVE" : "BLOCKED_BY_EXTERNAL_ONBOARDING",
      certConfigured: isNhcxCertConfigured,
      label: (() => {
        const state = resolveNhcxEnvironmentState();
        if (state === "LIVE") return "Live NHCX (operator-declared + mTLS)";
        if (state === "PRODUCTION_READY") return "Production-ready (creds + certs present; operator must declare NHCX_ENVIRONMENT=LIVE)";
        if (state === "SANDBOX") return "Sandbox (FHIR adapter built + validated)";
        return "BLOCKED_BY_EXTERNAL_ONBOARDING — set NHCX_BASE_URL/CLIENT_ID/CLIENT_SECRET + (NHCX_CERT_PATH/KEY_PATH for mTLS)";
      })(),
    },
    pmjay: {
      // V3-21/23: PM-JAY is a domain with a provider mode (LIVE_API/STATE_API/MANUAL_PORTAL/SANDBOX/LOCAL).
      providerMode: resolvePmjayProviderMode(),
      configured: isPmjayLive || resolvePmjayProviderMode() === "MANUAL_PORTAL",
      status: resolvePmjayProviderMode() === "LIVE_API" || resolvePmjayProviderMode() === "STATE_API"
        ? "LIVE"
        : resolvePmjayProviderMode() === "MANUAL_PORTAL"
          ? "MANUAL_PORTAL"
          : resolvePmjayProviderMode() === "SANDBOX"
            ? "SANDBOX"
            : "LOCAL",
      label: `Provider mode: ${resolvePmjayProviderMode()}${isPmjayLive ? " (creds present)" : " (creds required for LIVE_API/STATE_API)"}`,
    },
    razorpay: {
      configured: isRazorpayConfigured,
      status: isRazorpayConfigured ? "LIVE" : "NOT_CONFIGURED",
      label: isRazorpayConfigured ? "Connected" : "Not configured (RAZORPAY_KEY_ID/SECRET)",
    },
    sentry: {
      configured: isSentryConfigured,
      status: isSentryConfigured ? "LIVE" : "NOT_CONFIGURED",
      label: isSentryConfigured ? "Error tracking active" : "Not configured (SENTRY_DSN)",
    },
    redis: {
      configured: isRateLimitConfigured,
      status: isRateLimitConfigured ? "LIVE" : "NOT_CONFIGURED",
      label: isRateLimitConfigured ? "Upstash Redis rate limiting (durable)" : "In-memory fallback — high-risk endpoints fail closed in prod",
    },
    ai: {
      configured: isAiConfigured(),
      status: isAiConfigured() ? "LIVE" : "FALLBACK",
      provider: AI_PROVIDER,
      label: isAiConfigured()
        ? `AI provider '${AI_PROVIDER}' configured`
        : "Rule-based fallback (no AI key configured)",
    },
    database: {
      configured: dbReachable,
      status: dbReachable ? "LIVE" : "UNREACHABLE",
      label: dbReachable
        ? "PostgreSQL reachable (managed Supabase/RDS/Neon in production)"
        : "PostgreSQL UNREACHABLE — sandbox has no DB server; production connects to managed Postgres. /api/health agrees.",
    },
  });
}

export const GET = withErrors(GETImpl);
