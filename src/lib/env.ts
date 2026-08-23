// Ojas — centralised environment configuration & validation.
//
// PRODUCTION RULE (P0): there are NO production secret fallbacks anywhere in
// this codebase. Every secret required for production MUST be present in the
// environment when NODE_ENV === "production". If a required secret is missing
// in production, the process fails closed at startup (throws).
//
// Development defaults exist ONLY behind an explicit `isDev` gate and are NEVER
// reachable when NODE_ENV === "production". This module is the single source of
// truth for secret access — do NOT read process.env.SECRET directly elsewhere.
//
// Required production secrets:
//   • OJAS_JWT_SECRET          — JWT signing key (>= 32 chars)
//   • OJAS_PII_KEY             — AES-256-GCM PII encryption key (>= 32 chars)
//   • OJAS_CRON_SECRET          — bearer token protecting cron endpoints
//   • WHATSAPP_APP_SECRET       — Meta webhook HMAC secret
//   • WHATSAPP_VERIFY_TOKEN     — Meta webhook subscription verify token
//   • WHATSAPP_PHONE_NUMBER_ID  — Meta WhatsApp phone-number-id (inbound validation)
//   • WHATSAPP_TOKEN             — Meta Cloud API send token
//
// Optional (integration-specific). When absent, the integration runs in a
// truthfully-labelled sandbox/offline mode — it never fakes success:
//   • DATABASE_URL              — PostgreSQL connection (required for the app to function)
//   • ABDM_CLIENT_ID / ABDM_CLIENT_SECRET
//   • NHCX_BASE_URL / NHCX_CLIENT_ID / NHCX_CLIENT_SECRET
//   • PMJAY_BASE_URL / PMJAY_CLIENT_ID / PMJAY_CLIENT_SECRET
//   • RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET
//   • SENTRY_DSN / SENTRY_AUTH_TOKEN / SENTRY_ORG / SENTRY_PROJECT
//   • AI_PROVIDER (groq|openrouter|rule_based), GROQ_API_KEY, OPENROUTER_API_KEY
//   • UPSTASH_REDIS_REST_URL / UPSTASH_REDIS_REST_TOKEN (rate limiting)

const isProd = process.env.NODE_ENV === "production";
const isDev = !isProd;
// `next build` evaluates route modules to collect page data, which imports this
// module. The build phase has no real secrets, so the eager fail-closed throw
// must NOT fire during build — only at actual runtime startup. NEXT_PHASE is
// set by Next.js during build ("phase-production-build" / "phase-development-server").
const isBuildPhase = !!process.env.NEXT_PHASE;
const isProdRuntime = isProd && !isBuildPhase;

function required(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    if (isProdRuntime) {
      // FAIL CLOSED at runtime in production.
      throw new Error(
        `FATAL: Required environment variable ${name} is not set. ` +
          "Production refuses to start without it. See .env.example."
      );
    }
    // Dev or build phase: return a clearly-labelled dev-only placeholder.
    return "";
  }
  return v;
}

function requiredSecret(name: string, minLength: number, devDefault: string): string {
  const v = process.env[name];
  if (!v || v.trim() === "") {
    if (isProdRuntime) {
      throw new Error(
        `FATAL: Required secret ${name} is missing in production. Refusing to start.`
      );
    }
    return devDefault;
  }
  if (isProdRuntime && v.length < minLength) {
    throw new Error(
      `FATAL: ${name} must be at least ${minLength} characters in production. Refusing to start.`
    );
  }
  return v;
}

function optional(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== "" ? v : undefined;
}

// ── Required secrets ────────────────────────────────────────────────────────
export const JWT_SECRET = requiredSecret(
  "OJAS_JWT_SECRET",
  32,
  "ojas-dev-jwt-secret-please-rotate-in-prod-32chars!"
);

export const PII_KEY = requiredSecret(
  "OJAS_PII_KEY",
  32,
  "ojas-dev-pii-key-please-rotate-in-prod-32bytes!"
);

export const CRON_SECRET = requiredSecret(
  "OJAS_CRON_SECRET",
  24,
  "ojas-dev-cron-secret-please-rotate"
);

// ── WhatsApp ────────────────────────────────────────────────────────────────
// In production these are ALL required (webhook is the entry point for family
// replies). In dev they default so the webhook route can still boot for tests.
export const WHATSAPP_APP_SECRET = requiredSecret(
  "WHATSAPP_APP_SECRET",
  8,
  "ojas-dev-whatsapp-app-secret"
);
export const WHATSAPP_VERIFY_TOKEN = requiredSecret(
  "WHATSAPP_VERIFY_TOKEN",
  6,
  "ojas-dev-verify"
);
export const WHATSAPP_PHONE_NUMBER_ID = optional("WHATSAPP_PHONE_NUMBER_ID");
export const WHATSAPP_ACCESS_TOKEN = optional("WHATSAPP_ACCESS_TOKEN");
// Back-compat alias: some docs/configs use WHATSAPP_TOKEN. Prefer WHATSAPP_ACCESS_TOKEN.
export const WHATSAPP_TOKEN = optional("WHATSAPP_TOKEN") ?? WHATSAPP_ACCESS_TOKEN;
export const WHATSAPP_BUSINESS_ID = optional("WHATSAPP_BUSINESS_ID");
export const isWhatsAppLive = !!(WHATSAPP_PHONE_NUMBER_ID && WHATSAPP_ACCESS_TOKEN);

// V3-H: coherent production WhatsApp configuration. If WhatsApp is "enabled"
// (e.g. via HospitalSettings.whatsappEnabled) in production, ALL required pieces
// must be present: phone-number-id, access-token, app-secret, verify-token. A
// half-configured state is rejected at startup. If WhatsApp is not enabled,
// missing send-credentials is fine (the inbound webhook still works for replies).
export interface WhatsAppConfigState {
  live: boolean;
  consistent: boolean;
  missing: string[];
}
export function validateWhatsAppConfig(opts: { enabled: boolean }): WhatsAppConfigState {
  const missing: string[] = [];
  // Webhook-side secrets are ALWAYS required (inbound replies are core to the product).
  if (!WHATSAPP_APP_SECRET) missing.push("WHATSAPP_APP_SECRET");
  if (!WHATSAPP_VERIFY_TOKEN) missing.push("WHATSAPP_VERIFY_TOKEN");
  // Send-side credentials are required only when WhatsApp is enabled.
  if (opts.enabled) {
    if (!WHATSAPP_PHONE_NUMBER_ID) missing.push("WHATSAPP_PHONE_NUMBER_ID");
    if (!WHATSAPP_ACCESS_TOKEN) missing.push("WHATSAPP_ACCESS_TOKEN");
  }
  return {
    live: isWhatsAppLive,
    consistent: missing.length === 0,
    missing,
  };
}

/** Assert WhatsApp config is coherent; throw at runtime in production if not. */
export function assertWhatsAppConfigCoherent(opts: { enabled: boolean }): void {
  const state = validateWhatsAppConfig(opts);
  if (!state.consistent && isProdRuntime && opts.enabled) {
    throw new Error(
      `FATAL: WhatsApp is enabled but configuration is incomplete. Missing: ${state.missing.join(", ")}. ` +
      "Either provide all required WhatsApp env vars or disable WhatsApp in HospitalSettings."
    );
  }
}

// ── Database ────────────────────────────────────────────────────────────────
export const DATABASE_URL = required("DATABASE_URL");

// ── ABDM / ABHA ───────────────────────────────────────────────────────────────
export const ABDM_GATEWAY_URL =
  optional("ABDM_GATEWAY_URL") ?? "https://abdm-uat.abdm.gov.in";
export const ABDM_CLIENT_ID = optional("ABDM_CLIENT_ID");
export const ABDM_CLIENT_SECRET = optional("ABDM_CLIENT_SECRET");
// P6 (#6): isAbdmLive now means "credentials are present" (CONFIGURED), NOT
// "production LIVE". The live-state model is resolved by resolveAbdmEnvironmentState()
// which distinguishes CONFIGURED → SANDBOX → PRODUCTION_PENDING → LIVE.
// For backward compatibility, isAbdmLive is kept as a "creds present" boolean;
// new code should use resolveAbdmEnvironmentState() for the truthful state.
export const isAbdmConfigured = !!(ABDM_CLIENT_ID && ABDM_CLIENT_SECRET);
/** @deprecated Use resolveAbdmEnvironmentState() for truthful live-state. */
export const isAbdmLive = isAbdmConfigured;

/** P6 (#6/#22): ABDM environment state model.
 *  Credentials exist → CONFIGURED (NOT LIVE).
 *  LIVE is a final gated operational state requiring external onboarding.
 *  This is the INTERNAL state model — it does NOT invent external verification. */
export type AbdmEnvironmentState =
  | "DISABLED"
  | "CONFIGURED"
  | "SANDBOX"
  | "SANDBOX_VERIFIED"
  | "PRODUCTION_PENDING"
  | "PRODUCTION_READY"
  | "LIVE"
  | "FAILED";

/** P6 (#6): Resolve the ABDM environment state. NEVER "credentials → LIVE".
 *  Credentials present → CONFIGURED. LIVE requires explicit operator declaration
 *  AFTER external onboarding. This is hospital-agnostic (ABDM is a global
 *  integration — the credentials are env-level, not per-hospital). */
export function resolveAbdmEnvironmentState(): AbdmEnvironmentState {
  if (!isAbdmConfigured) return "DISABLED";
  // An operator who has completed official ABDM production onboarding sets
  // ABDM_ENVIRONMENT=LIVE to flip the switch. Ojas never auto-promotes.
  const declared = (optional("ABDM_ENVIRONMENT") ?? "").toUpperCase();
  if (declared === "LIVE") return "LIVE";
  if (declared === "SANDBOX") return "SANDBOX";
  if (declared === "SANDBOX_VERIFIED") return "SANDBOX_VERIFIED";
  if (declared === "PRODUCTION_READY") return "PRODUCTION_READY";
  // Credentials present but no operator-declared environment → CONFIGURED.
  return "CONFIGURED";
}

// ── NHCX ────────────────────────────────────────────────────────────────────
// NHCX environment state is INDEPENDENT of ABDM. It is controlled entirely by
// the NHCX configuration. NHCX may require mTLS/certificates — those are
// referenced by path, never committed. See docs/NHA_NHCX_PMJAY_GO_LIVE.md.
export const NHCX_BASE_URL = optional("NHCX_BASE_URL");
export const NHCX_CLIENT_ID = optional("NHCX_CLIENT_ID");
export const NHCX_CLIENT_SECRET = optional("NHCX_CLIENT_SECRET");
// mTLS / certificate references (filesystem paths; the key files themselves are
// NEVER read into the repo or exposed to the client). Required for production
// NHCX if the partner environment mandates mTLS.
export const NHCX_CERT_PATH = optional("NHCX_CERT_PATH");
export const NHCX_KEY_PATH = optional("NHCX_KEY_PATH");
export const NHCX_CA_PATH = optional("NHCX_CA_PATH");
export const NHCX_PARTNER_ID = optional("NHCX_PARTNER_ID");
export const isNhcxFullyConfigured = !!(
  NHCX_BASE_URL &&
  NHCX_CLIENT_ID &&
  NHCX_CLIENT_SECRET
);
// True only when mTLS material is present. NHCX production typically requires
// certificates in addition to client ID/secret.
export const isNhcxCertConfigured = !!(NHCX_CERT_PATH && NHCX_KEY_PATH);

/** Resolve the NHCX environment state. NEVER "credentials exist → LIVE".
 *  Returns one of DISABLED | SANDBOX | PRODUCTION_PENDING_ONBOARDING |
 *  PRODUCTION_READY | LIVE. LIVE requires a verified sandbox + production
 *  credentials + certificates — which is an external onboarding step Ojas
 *  cannot self-certify. So Ojas only ever returns up to PRODUCTION_READY
 *  unless an explicit NHCX_ENVIRONMENT=LIVE override is set by an operator
 *  AFTER completing official onboarding. */
export function resolveNhcxEnvironmentState(): "DISABLED" | "SANDBOX" | "PRODUCTION_PENDING_ONBOARDING" | "PRODUCTION_READY" | "LIVE" {
  if (!isNhcxFullyConfigured) return "DISABLED";
  // An operator who has completed official NHCX onboarding + sandbox certification
  // sets NHCX_ENVIRONMENT=LIVE to flip the switch. Ojas never auto-promotes.
  const declared = (optional("NHCX_ENVIRONMENT") ?? "").toUpperCase();
  if (declared === "LIVE") {
    // Even with the override, require mTLS material — LIVE without certs is unsafe.
    return isNhcxCertConfigured ? "LIVE" : "PRODUCTION_PENDING_ONBOARDING";
  }
  if (declared === "SANDBOX") return "SANDBOX";
  // Credentials present but no operator-declared environment → sandbox by default,
  // with production onboarding still pending.
  if (isNhcxCertConfigured) return "PRODUCTION_READY";
  return "PRODUCTION_PENDING_ONBOARDING";
}

// ── PM-JAY ───────────────────────────────────────────────────────────────────
// PM-JAY provider mode is INDEPENDENT of NHCX and ABDM. The mode reflects how
// this hospital actually integrates with PM-JAY: direct API, state API, or the
// manual portal workflow (operator submits through the official portal and
// records the official reference in Ojas).
export const PMJAY_BASE_URL = optional("PMJAY_BASE_URL");
export const PMJAY_CLIENT_ID = optional("PMJAY_CLIENT_ID");
export const PMJAY_CLIENT_SECRET = optional("PMJAY_CLIENT_SECRET");
export const isPmjayLive = !!(PMJAY_BASE_URL && PMJAY_CLIENT_ID && PMJAY_CLIENT_SECRET);

/** Resolve the PM-JAY provider mode. Defaults to LOCAL. The operator declares
 *  the mode via PMJAY_PROVIDER_MODE; LIVE_API/STATE_API require creds, while
 *  MANUAL_PORTAL is valid even without creds (operator-driven).
 *
 *  P6 (#4): this is the GLOBAL fallback. For hospital-specific resolution,
 *  use resolvePmjayProviderModeForHospital() which reads
 *  HospitalIntegrationProfile.pmjayMode first, falling back to this. */
export function resolvePmjayProviderMode(): "LIVE_API" | "STATE_API" | "MANUAL_PORTAL" | "SANDBOX" | "LOCAL" {
  const declared = (optional("PMJAY_PROVIDER_MODE") ?? "LOCAL").toUpperCase();
  switch (declared) {
    case "LIVE_API":
      return isPmjayLive ? "LIVE_API" : "LOCAL"; // can't be LIVE without creds
    case "STATE_API":
      return isPmjayLive ? "STATE_API" : "LOCAL";
    case "MANUAL_PORTAL":
      return "MANUAL_PORTAL"; // valid without creds — portal-driven
    case "SANDBOX":
      return "SANDBOX";
    default:
      return "LOCAL";
  }
}

/** P6 (#4): Hospital-specific PM-JAY provider mode.
 *
 *  Resolution order:
 *    1. HospitalIntegrationProfile.pmjayMode (hospital-specific runtime mode)
 *    2. Global env fallback (PMJAY_PROVIDER_MODE) only if explicitly allowed
 *    3. Safe default (LOCAL)
 *
 *  This allows Hospital A → MANUAL_PORTAL, Hospital B → STATE_API,
 *  Hospital C → SANDBOX — without a code deploy.
 *
 *  LIVE_API / STATE_API still require global creds (isPmjayLive); if creds
 *  are absent, the mode degrades to LOCAL even if the profile says LIVE_API. */
export function resolvePmjayProviderModeForHospital(
  profilePmjayMode: string | null | undefined,
): "LIVE_API" | "STATE_API" | "MANUAL_PORTAL" | "SANDBOX" | "LOCAL" {
  // 1. Hospital-specific mode from the integration profile.
  if (profilePmjayMode) {
    const mode = profilePmjayMode.toUpperCase();
    switch (mode) {
      case "LIVE_API":
        return isPmjayLive ? "LIVE_API" : "LOCAL";
      case "STATE_API":
        return isPmjayLive ? "STATE_API" : "LOCAL";
      case "MANUAL_PORTAL":
        return "MANUAL_PORTAL";
      case "SANDBOX":
        return "SANDBOX";
      case "OFFICIAL_API":
        return isPmjayLive ? "LIVE_API" : "LOCAL"; // OFFICIAL_API is an alias
      case "LOCAL":
        return "LOCAL";
    }
  }
  // 2. Global env fallback.
  return resolvePmjayProviderMode();
}

/** P6 (#5): Hospital-specific NHCX environment state.
 *
 *  Resolution order:
 *    1. HospitalIntegrationProfile gate booleans + nhcxParticipantCode
 *    2. Global env (NHCX_ENVIRONMENT, NHCX creds, mTLS certs)
 *
 *  A single global NHCX_ENVIRONMENT=LIVE does NOT make every hospital LIVE.
 *  Each hospital must have its own gate sequence satisfied. */
export function resolveNhcxEnvironmentStateForHospital(
  profile: {
    gateSandboxConfigured?: boolean;
    gateSandboxVerified?: boolean;
    gatePartnerOnboardingVerified?: boolean;
    gateCertificatesVerified?: boolean;
    gateProductionEndpointVerified?: boolean;
    gateProductionConnectivityVerified?: boolean;
    gateLiveApproved?: boolean;
    nhcxParticipantCode?: string | null;
  } | null,
): "DISABLED" | "SANDBOX" | "SANDBOX_VERIFIED" | "PRODUCTION_PENDING_ONBOARDING" | "PRODUCTION_READY" | "LIVE" {
  // If global NHCX is not configured at all, every hospital is DISABLED.
  if (!isNhcxFullyConfigured) return "DISABLED";

  // If the hospital has no profile, use the global state as a fallback.
  if (!profile) return resolveNhcxEnvironmentState();

  // Hospital-specific gate sequencing (the existing correct logic, now per-hospital).
  if (profile.gateLiveApproved) {
    // LIVE requires ALL prior gates to be satisfied.
    if (
      profile.gateSandboxConfigured &&
      profile.gateSandboxVerified &&
      profile.gatePartnerOnboardingVerified &&
      profile.gateCertificatesVerified &&
      profile.gateProductionEndpointVerified &&
      profile.gateProductionConnectivityVerified
    ) {
      return "LIVE";
    }
    // gateLiveApproved was set but prerequisites are missing — this should
    // have been rejected by the gate API. Report PRODUCTION_PENDING as a
    // safety fallback (do NOT honor the premature approval).
    return "PRODUCTION_PENDING_ONBOARDING";
  }

  if (profile.gateProductionConnectivityVerified && profile.gateProductionEndpointVerified) {
    return "PRODUCTION_READY";
  }
  if (profile.gateCertificatesVerified) {
    return "PRODUCTION_PENDING_ONBOARDING";
  }
  if (profile.gateSandboxVerified) {
    return "SANDBOX_VERIFIED";
  }
  if (profile.gateSandboxConfigured) {
    return "SANDBOX";
  }
  // Global fallback if hospital gates are not yet set.
  return resolveNhcxEnvironmentState();
}

// ── Payments (Razorpay) ──────────────────────────────────────────────────────
export const RAZORPAY_KEY_ID = optional("RAZORPAY_KEY_ID");
export const RAZORPAY_KEY_SECRET = optional("RAZORPAY_KEY_SECRET");
export const isRazorpayConfigured = !!(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);

// ── Observability ─────────────────────────────────────────────────────────────
export const SENTRY_DSN = optional("SENTRY_DSN");
export const SENTRY_AUTH_TOKEN = optional("SENTRY_AUTH_TOKEN");
export const SENTRY_ORG = optional("SENTRY_ORG");
export const SENTRY_PROJECT = optional("SENTRY_PROJECT");
export const isSentryConfigured = !!SENTRY_DSN;

// ── AI providers ─────────────────────────────────────────────────────────────
export const AI_PROVIDER = (optional("AI_PROVIDER") ?? "groq") as
  | "groq"
  | "openrouter"
  | "rule_based";
export const GROQ_API_KEY = optional("GROQ_API_KEY");
export const OPENROUTER_API_KEY = optional("OPENROUTER_API_KEY");

// ── Rate limiting (Upstash) — optional; in-memory fallback when absent ────────
export const UPSTASH_REDIS_REST_URL = optional("UPSTASH_REDIS_REST_URL");
export const UPSTASH_REDIS_REST_TOKEN = optional("UPSTASH_REDIS_REST_TOKEN");
export const isRateLimitConfigured = !!(UPSTASH_REDIS_REST_URL && UPSTASH_REDIS_REST_TOKEN);

// ── App metadata ──────────────────────────────────────────────────────────────
export const NODE_ENV = process.env.NODE_ENV ?? "development";
export const isProduction = isProd;
export const isDevelopment = isDev;
export const APP_BASE_URL = optional("APP_BASE_URL") ?? "http://localhost:3000";

// Eagerly validate required-prod secrets at import time. In production this
// throws before any route handler runs. In dev it is a no-op.
// (Importing this module is the validation gate.)
void [
  JWT_SECRET,
  PII_KEY,
  CRON_SECRET,
  WHATSAPP_APP_SECRET,
  WHATSAPP_VERIFY_TOKEN,
  DATABASE_URL,
];
