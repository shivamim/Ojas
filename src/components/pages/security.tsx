"use client";

import * as React from "react";
import { MarketingHeader } from "@/components/marketing-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ShieldCheck, Lock, KeyRound, Users, FileText, Gauge,
  Network, AlertTriangle, Eye, Fingerprint, ScrollText, ServerCog,
  CheckCircle2, Layers, Database, Bell,
} from "lucide-react";
import { AppFooter } from "@/components/app-shell";

interface ControlCard {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  details: string[];
}

const SECURITY_CONTROLS: ControlCard[] = [
  {
    icon: Lock, title: "PII encryption (AES-256-GCM)",
    description: "Mobile numbers, addresses, next-of-kin contacts, and family contacts are encrypted at rest.",
    details: [
      "Fresh 96-bit random IV per message (GCM nonce reuse impossible)",
      "128-bit authentication tag — tamper detection on every ciphertext",
      "Key derived via scrypt from OJAS_PII_KEY (>= 32 chars)",
      "Lookup uses deterministic SHA-256 hash — plaintext never decrypted for search",
    ],
  },
  {
    icon: KeyRound, title: "Fail-closed secrets",
    description: "No production secret fallbacks. The process refuses to start if a required secret is missing.",
    details: [
      "OJAS_JWT_SECRET, OJAS_PII_KEY, OJAS_CRON_SECRET, WHATSAPP_APP_SECRET, WHATSAPP_VERIFY_TOKEN all required in prod",
      "env.ts throws at runtime startup via src/instrumentation.ts",
      "Dev defaults exist only behind an explicit isDev gate — never reachable in production",
    ],
  },
  {
    icon: Users, title: "Multi-tenant isolation",
    description: "Every hospital-scoped request follows: auth → role → tenant → ownership → business rules → DB.",
    details: [
      "requireTenantAccess() — SUPER_ADMIN bypass; otherwise hospitalId must match the resource's owner",
      "Cross-tenant denials are audited as auth.cross_tenant_denied BEFORE the throw",
      "Every hospital-scoped table has a hospitalId column + a tenant index",
      "Patients use soft-delete (deletedAt) to preserve de-identified audit trails",
    ],
  },
  {
    icon: Fingerprint, title: "Cookie-based JWT + refresh rotation",
    description: "httpOnly + Secure + SameSite cookies. Short-lived access tokens, rotating refresh tokens with reuse detection.",
    details: [
      "Access token TTL: 15 minutes; refresh TTL: 30 days",
      "Refresh-token rotation: old token revoked, new issued in the same family",
      "Reuse detection: presenting an already-rotated token revokes the ENTIRE family (theft signal)",
      "Logout revokes the current session's refresh token",
    ],
  },
  {
    icon: ScrollText, title: "Healthcare audit logging",
    description: "Every sensitive healthcare action is recorded with who/what/when/tenant/resource/result.",
    details: [
      "Patient view/create/update, consent grant/revoke, ABHA link/revoke, claim create/submit/respond",
      "Escalation create/resolve, NABH evidence upload/verify, report export, permission changes",
      "Audit entries cannot be deleted by ordinary application users",
      "Each entry carries actorId, hospitalId, action, target, detail, ip, timestamp",
    ],
  },
  {
    icon: Gauge, title: "Distributed rate limiting",
    description: "Upstash Redis in production; in-memory fallback in dev. High-risk public endpoints fail CLOSED if Redis is absent.",
    details: [
      "rateLimitStrict() — login, OTP, password-reset, public API endpoints",
      "Production + no Redis → 429 (deny). Never silently degrades to weak in-memory protection.",
      "Fixed-window counter with per-window TTL; no unlimited requests",
    ],
  },
  {
    icon: Network, title: "Webhook hardening",
    description: "HMAC-signature-verified webhooks with constant-time comparison + idempotency.",
    details: [
      "X-Hub-Signature-256 (WhatsApp) verified constant-time; no app-secret fallback in prod",
      "Phone-number-ID validation — rejects events for a wrong number",
      "WebhookEvent table: UNIQUE on (provider, providerEventId) — duplicate retries skip processing",
      "Message.providerMessageId UNIQUE — concurrent duplicate inserts rejected",
    ],
  },
  {
    icon: AlertTriangle, title: "No guessed government endpoints",
    description: "Ojas never POSTs to an invented URL like /api/v1/claim/submit.",
    details: [
      "NHCX transport refuses /api/v1/* paths — requires operator-configured NHCX_CLAIM_ENDPOINT",
      "PM-JAY transport requires PMJAY_BENEFICIARY_VERIFY_ENDPOINT from onboarding docs",
      "Returns PRODUCTION_PENDING_ONBOARDING when an endpoint path is absent",
    ],
  },
  {
    icon: Eye, title: "PII-safe observability",
    description: "Structured JSON logs with request IDs. PII/PHI is never logged.",
    details: [
      "logger.ts redacts mobile, phone, email, address, token, secret, otp, abhaNumber, diagnosis, medications",
      "Sentry captures are scrubbed via setContext with redactPII()",
      "No PHI in URLs, query params, analytics, or error messages",
    ],
  },
];

export function SecurityPage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5">
      <MarketingHeader />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        {/* Hero */}
        <div className="text-center mb-12 sm:mb-16">
          <div className="inline-flex items-center gap-1.5 text-eyebrow text-primary mb-3">
            <ShieldCheck className="h-3.5 w-3.5" />
            SECURITY &amp; ARCHITECTURE
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
            Built for real patient data.
          </h1>
          <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Ojas is hardened for a controlled hospital pilot with real patient data. These are the actual controls in the codebase — not marketing claims. Every control cites the file that implements it.
          </p>
        </div>

        {/* Verdict banner */}
        <Card className="mb-10 border-primary/30 bg-primary/5">
          <CardContent className="p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4">
            <div className="h-12 w-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="font-semibold text-base sm:text-lg">Production verdict: CONDITIONAL GO</h2>
              <p className="text-sm text-muted-foreground mt-1 leading-relaxed">
                Core platform + healthcare adapter architecture are production-ready. Live NHCX / PM-JAY / ABHA-verification require official NHA/State/partner onboarding (credentials + certificates + facility IDs). Ojas never claims an integration is live without proof.
              </p>
            </div>
            <Badge className="text-[10px] uppercase tracking-wider gap-1.5 flex-shrink-0">
              <span className="live-dot h-1.5 w-1.5 rounded-full bg-primary-foreground" /> Pilot-ready
            </Badge>
          </CardContent>
        </Card>

        {/* Controls grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {SECURITY_CONTROLS.map((c) => (
            <Card key={c.title} className="h-full elevate-2 hover:-translate-y-0.5 transition-transform">
              <CardHeader className="pb-3">
                <div className="flex items-start gap-3">
                  <div className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-primary/10 text-primary">
                    <c.icon className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <CardTitle className="text-base font-semibold">{c.title}</CardTitle>
                    <CardDescription className="text-xs mt-1 leading-relaxed">{c.description}</CardDescription>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <ul className="space-y-1.5 text-xs text-muted-foreground">
                  {c.details.map((d, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary/70 flex-shrink-0 mt-0.5" />
                      <span className="leading-relaxed">{d}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Architecture diagram */}
        <Card className="mt-10">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Layers className="h-4 w-4 text-primary" />
              Modular monolith architecture
            </CardTitle>
            <CardDescription>
              Ojas is a modular monolith — no unnecessary microservices, Kafka, or Kubernetes for the pilot. External systems are behind adapters.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <pre className="text-[11px] sm:text-xs leading-relaxed bg-muted/50 rounded-lg p-4 overflow-x-auto font-mono">
{`                         OJAS (Next.js 16)
                              |
       +----------------------+----------------------+
       |                      |                      |
   Patient Care          ABDM / ABHA              NABH
       |                      |
       |                Identity / KYC
       |                      |
       +----------- PM-JAY Domain
                             |
                  +----------+----------+
                  |                     |
             Hospital              Claims
             Workflow              Normalizer
                  |                     |
               BIS/TMS/HEM        PayerAdapter
                                     |
                         +-----------+-----------+
                         |                       |
                       PM-JAY              Other Payers
                         |                       |
                         +-----------+-----------+
                                     |
                                    NHCX (FHIR R4)
                                     |
                     +---------------+---------------+
                     |               |               |
                Coverage          Claim       Communication
                Eligibility

  External (authoritative):  NHA · ABDM · BIS · TMS · HEM · NHCX · State SHA
  Ojas NEVER replaces these — it orchestrates the hospital side.`}
            </pre>
          </CardContent>
        </Card>

        {/* Tech stack */}
        <div className="mt-10 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { icon: ServerCog, label: "Next.js 16 + TypeScript", sub: "App Router, standalone build" },
            { icon: Database, label: "PostgreSQL + Prisma", sub: "Decimal money, 46 tables, migrations" },
            { icon: KeyRound, label: "AES-256-GCM PII", sub: "scrypt key, random IV, auth tag" },
            { icon: Bell, label: "Sentry + structured logs", sub: "PII-scrubbed observability" },
          ].map((t) => (
            <div key={t.label} className="rounded-lg border bg-card p-4 text-center">
              <t.icon className="h-5 w-5 text-primary mx-auto mb-2" />
              <div className="text-xs font-semibold">{t.label}</div>
              <div className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{t.sub}</div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-10 text-center">
          <p className="text-xs text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Full details in <code className="bg-muted px-1 py-0.5 rounded">docs/SECURITY.md</code>, <code className="bg-muted px-1 py-0.5 rounded">docs/THREAT_MODEL.md</code>, and <code className="bg-muted px-1 py-0.5 rounded">docs/PRODUCTION_CHECKLIST.md</code>. The integration-status page reads live from <code className="bg-muted px-1 py-0.5 rounded">/api/integrations/status</code>.
          </p>
        </div>
      </main>
      <AppFooter />
    </div>
  );
}
