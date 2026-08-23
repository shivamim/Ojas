"use client";

import * as React from "react";
import { MarketingHeader } from "@/components/marketing-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Terminal, KeyRound, Globe, Lock, FileJson, Webhook, Clock,
  CheckCircle2, AlertTriangle, ArrowRight, Code,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AppFooter } from "@/components/app-shell";

// ── Endpoint definitions ─────────────────────────────────────────────────────
type Method = "GET" | "POST" | "PUT" | "DELETE" | "PATCH";
type AuthType = "public" | "auth" | "cron" | "webhook";

interface Endpoint {
  method: Method;
  path: string;
  auth: AuthType;
  description: string;
  responseShape?: string;
  notes?: string;
}

const METHOD_TONE: Record<Method, string> = {
  GET: "bg-blue-500/10 text-blue-700 dark:text-blue-400 border-blue-500/30",
  POST: "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30",
  PUT: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  PATCH: "bg-amber-500/10 text-amber-700 dark:text-amber-400 border-amber-500/30",
  DELETE: "bg-red-500/10 text-red-700 dark:text-red-400 border-red-500/30",
};

const AUTH_META: Record<AuthType, { label: string; tone: string; icon: React.ComponentType<{ className?: string }> }> = {
  public: { label: "Public", tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", icon: Globe },
  auth: { label: "Auth required", tone: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400", icon: KeyRound },
  cron: { label: "Cron (bearer)", tone: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-400", icon: Clock },
  webhook: { label: "Webhook (HMAC)", tone: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400", icon: Webhook },
};

const PUBLIC_ENDPOINTS: Endpoint[] = [
  {
    method: "GET", path: "/api/docs", auth: "public",
    description: "Returns a categorized, described index of all docs/*.md files with file sizes + reading-time estimates.",
    responseShape: '{ docs: [{ filename, title, description, category, sizeBytes, approxReadingTimeMin }], total }',
    notes: "Curated metadata map — unknown docs are not exposed.",
  },
  {
    method: "GET", path: "/api/changelog", auth: "public",
    description: "Parses worklog.md into a structured list of production-hardening phases.",
    responseShape: '{ phases: [{ phase, title, taskId, agent, task, stageSummary, keyPoints, category }], total }',
    notes: "Parsed live from worklog.md — reflects the current engineering state.",
  },
  {
    method: "GET", path: "/api/integrations/status", auth: "public",
    description: "Returns the truthful integration-status matrix (ABHA/ABDM/NHCX/PM-JAY/WhatsApp/AI/PostgreSQL/Redis/Razorpay/Sentry).",
    responseShape: '{ whatsapp, abdm, abha, nhcx, pmjay, razorpay, sentry, redis, ai, database } — each { configured, status, label }',
    notes: "Never claims an integration is live when it is only sandbox/blocked. NHCX includes environmentState + certConfigured; PM-JAY includes providerMode.",
  },
  {
    method: "GET", path: "/api/health", auth: "public",
    description: "Health check — liveness + readiness. Reports database status (degraded when PostgreSQL unavailable).",
    responseShape: '{ status: "ok"|"degraded", timestamp, version, checks: { database } }',
    notes: "Does not expose secrets. A readiness failure occurs when PostgreSQL is unavailable.",
  },
  {
    method: "GET", path: "/api/demo-credentials", auth: "public",
    description: "Returns demo credentials for the sandbox pilot (clearly labelled — never available in production).",
    responseShape: '{ credentials: [{ role, email, password }] }',
    notes: "Disabled in production via env gating.",
  },
];

const PROTECTED_ENDPOINTS: Endpoint[] = [
  {
    method: "POST", path: "/api/auth", auth: "auth",
    description: "Login — validates email + password, issues httpOnly JWT cookies (access 15min + refresh 30d rotating).",
    responseShape: '{ user: { id, email, name, role, hospitalId, forceReset } }',
    notes: "Rate-limited via rateLimitStrict (fail-closed in prod without Redis). Constant-time password compare.",
  },
  {
    method: "GET", path: "/api/auth", auth: "auth",
    description: "Get current session user (from the access cookie, rotating refresh if needed).",
    responseShape: '{ user: { id, email, name, role, hospitalId } }',
    notes: "Refresh-token rotation with reuse detection — presenting an already-rotated token revokes the entire family.",
  },
  {
    method: "GET", path: "/api/integrations/readiness", auth: "auth",
    description: "Hospital-facing Integration Readiness Center — real checklist items per integration (never arbitrary percentages).",
    responseShape: '{ hospitalId, integrationProfile, readiness: [{ integration, status, label, items, passedCount, totalCount }], overallReady }',
    notes: "HOSPITAL_ADMIN/COORDINATOR. NHCX items include the 8 live-gating gates as real checklist items.",
  },
  {
    method: "POST", path: "/api/integrations/readiness/gate", auth: "auth",
    description: "Advance an NHCX live-gating gate (audited). LIVE is double-gated (DB gates + env override).",
    responseShape: '{ ok, gate, currentGate }',
    notes: "HOSPITAL_ADMIN. Verified + timestamped + audited as NHCX_GATE_ADVANCED.",
  },
  {
    method: "GET", path: "/api/nabh/dashboard", auth: "auth",
    description: "NABH readiness dashboard — chapter scores, gaps, corrective actions, evidence counts, upcoming deadlines.",
    responseShape: '{ readinessScore, coreReadinessScore, chapters, evidence: { total, byStatus, gaps, upcomingDeadlines }, positioning }',
    notes: "HOSPITAL_ADMIN/COORDINATOR/DOCTOR. Positioned as readiness, NOT accreditation. Audited as NABH_DASHBOARD_VIEWED.",
  },
  {
    method: "GET", path: "/api/pilot/metrics", auth: "auth",
    description: "Pilot metrics computed live from PostgreSQL — readmission, adherence, response rate, satisfaction, escalations.",
    responseShape: '{ pilot: PilotStudy, metrics: { enrolledPatients, readmissionRate, medicationAdherenceRate, responseRate, ... } }',
    notes: "HOSPITAL_ADMIN. Never from a cached report. AI-derived risk logged in AiAgentRun.",
  },
  {
    method: "GET", path: "/api/patients", auth: "auth",
    description: "List patients (hospital-scoped). Supports ?status= & ?q=. Tenant-isolated.",
    responseShape: '{ patients: [{ id, fullName, age, gender, mobileMasked, status, ... }] }',
    notes: "Every query is hospital-scoped via requireTenantAccess. PII (mobile) masked in list responses.",
  },
  {
    method: "POST", path: "/api/whatsapp/inbound", auth: "webhook",
    description: "WhatsApp Cloud API inbound webhook — HMAC-verified, idempotent, phone-number-ID validated.",
    responseShape: '{ ok: true } or { ok: true, ignored: "duplicate_event" }',
    notes: "X-Hub-Signature-256 verified constant-time. WebhookEvent UNIQUE on (provider, providerEventId) — duplicate retries skip processing.",
  },
  {
    method: "POST", path: "/api/cron/pilot-expiry", auth: "cron",
    description: "Cron — auto-suspend/convert PILOT subscriptions past their 30-day window. Idempotent.",
    responseShape: '{ ok, processedAt, expiredPilotsFound, converted, suspended, noOps }',
    notes: "Bearer OJAS_CRON_SECRET (fail-closed). Atomic conditional updateMany — concurrent runs cannot double-process.",
  },
  {
    method: "POST", path: "/api/cron/nhcx-sla-check", auth: "cron",
    description: "Cron — check NHCX claims for IRDAI SLA breaches (1h pre-auth, 3h final auth). Idempotent.",
    responseShape: '{ ok, checkedAt, preAuthBreaches, finalAuthBreaches }',
    notes: "Bearer OJAS_CRON_SECRET. Audits only when the breached flag actually flips (no duplicate audit on replay).",
  },
];

function EndpointCard({ ep }: { ep: Endpoint }) {
  const authMeta = AUTH_META[ep.auth];
  return (
    <Card className="elevate-2 hover:-translate-y-0.5 transition-transform">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <Badge variant="outline" className={cn("text-[10px] font-mono font-bold flex-shrink-0", METHOD_TONE[ep.method])}>
              {ep.method}
            </Badge>
            <code className="text-xs font-mono font-semibold truncate">{ep.path}</code>
          </div>
          <Badge variant="outline" className={cn("text-[9px] uppercase tracking-wider gap-1 flex-shrink-0", authMeta.tone)}>
            <authMeta.icon className="h-2.5 w-2.5" /> {authMeta.label}
          </Badge>
        </div>
        <CardDescription className="text-xs mt-2 leading-relaxed">{ep.description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-2.5">
        {ep.responseShape && (
          <div>
            <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
              <FileJson className="h-2.5 w-2.5" /> Response shape
            </div>
            <pre className="text-[10px] font-mono bg-muted/50 border rounded-md p-2 overflow-x-auto leading-relaxed">{ep.responseShape}</pre>
          </div>
        )}
        {ep.notes && (
          <div className="flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <AlertTriangle className="h-3 w-3 flex-shrink-0 mt-0.5" />
            <span className="leading-relaxed">{ep.notes}</span>
          </div>
        )}
        {/* curl example */}
        <div>
          <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1">
            <Terminal className="h-2.5 w-2.5" /> Example
          </div>
          <pre className="text-[10px] font-mono bg-muted/50 border rounded-md p-2 overflow-x-auto leading-relaxed">
{`curl ${ep.path.includes("/api/whatsapp") || ep.path.includes("/api/cron") ? "-X POST " : ""}${ep.auth === "auth" ? "-b cookies.txt " : ep.auth === "cron" ? '-H "Authorization: Bearer $OJAS_CRON_SECRET" ' : ""}https://your-ojas-domain${ep.path}`}
          </pre>
        </div>
      </CardContent>
    </Card>
  );
}

export function ApiReferencePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5">
      <MarketingHeader />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        {/* Hero */}
        <div className="text-center mb-10 sm:mb-12">
          <div className="inline-flex items-center gap-1.5 text-eyebrow text-primary mb-3">
            <Code className="h-3.5 w-3.5" />
            API REFERENCE
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
            Public + protected endpoints.
          </h1>
          <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Every endpoint with its method, auth pattern, response shape, and a curl example. Public endpoints need no auth. Protected endpoints require a cookie-based JWT session. Cron endpoints use a bearer token. Webhooks are HMAC-verified.
          </p>
        </div>

        {/* Auth pattern cards */}
        <div className="mb-10 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {Object.entries(AUTH_META).map(([key, meta]) => (
            <div key={key} className={cn("rounded-lg border p-3", meta.tone)}>
              <meta.icon className="h-4 w-4 mb-1.5" />
              <div className="text-xs font-semibold">{meta.label}</div>
            </div>
          ))}
        </div>

        {/* Auth flow explainer */}
        <Card className="mb-10 border-primary/20 bg-primary/5">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <Lock className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold mb-1">Auth flow (cookie-based JWT)</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  POST /api/auth with email + password → issues httpOnly + Secure + SameSite cookies (access 15min, refresh 30d rotating).
                  Every protected request follows: <code className="bg-muted px-1 py-0.5 rounded text-[10px]">auth → role → tenant → ownership → business rules → DB</code>.
                  Refresh-token rotation with reuse detection — presenting an already-rotated token revokes the entire family (theft signal).
                  Rate-limited via <code className="bg-muted px-1 py-0.5 rounded text-[10px]">rateLimitStrict</code> (fail-closed in prod without Redis).
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Public endpoints */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <Globe className="h-4 w-4 text-emerald-500" />
            <h2 className="text-base font-semibold">Public endpoints</h2>
            <Badge variant="outline" className="text-[10px]">{PUBLIC_ENDPOINTS.length}</Badge>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {PUBLIC_ENDPOINTS.map((ep) => <EndpointCard key={ep.path} ep={ep} />)}
          </div>
        </div>

        {/* Protected endpoints */}
        <div className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <Lock className="h-4 w-4 text-blue-500" />
            <h2 className="text-base font-semibold">Protected + cron + webhook endpoints</h2>
            <Badge variant="outline" className="text-[10px]">{PROTECTED_ENDPOINTS.length}</Badge>
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {PROTECTED_ENDPOINTS.map((ep) => <EndpointCard key={ep.path} ep={ep} />)}
          </div>
        </div>

        {/* Tenant isolation note */}
        <Card className="border-emerald-500/20 bg-emerald-500/5">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="h-5 w-5 text-emerald-500 flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold mb-1">Tenant isolation guarantee</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Every hospital-scoped query is filtered by <code className="bg-muted px-1 py-0.5 rounded text-[10px]">hospitalId</code> from the authenticated session — never from a client-supplied field. <code className="bg-muted px-1 py-0.5 rounded text-[10px]">requireTenantAccess()</code> audits cross-tenant denials as <code className="bg-muted px-1 py-0.5 rounded text-[10px]">auth.cross_tenant_denied</code> BEFORE throwing. SUPER_ADMIN bypasses. 825 tests confirm the isolation invariants.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="mt-10 text-center">
          <p className="text-xs text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Full API details in <code className="bg-muted px-1 py-0.5 rounded">docs/DATA_FLOW.md</code> and <code className="bg-muted px-1 py-0.5 rounded">docs/INTEGRATIONS.md</code>. See the <a href="/?view=changelog" className="text-primary underline">changelog</a> for the hardening timeline.
          </p>
        </div>
      </main>
      <AppFooter />
    </div>
  );
}
