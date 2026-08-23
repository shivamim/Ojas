"use client";

import * as React from "react";
import { MarketingHeader } from "@/components/marketing-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  Layers, HeartPulse, Network, ShieldCheck, Database, Server, Cpu,
  MessageSquare, Lock, ArrowDown, ArrowRight, ExternalLink, Box,
  Stethoscope, FileText, Bell, Cloud, GitBranch, Workflow,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AppFooter } from "@/components/app-shell";

// ── Layer definitions ─────────────────────────────────────────────────────────
interface ArchLayer {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  components: { name: string; desc: string; icon: React.ComponentType<{ className?: string }> }[];
}

const OJAS_LAYERS: ArchLayer[] = [
  {
    id: "presentation", label: "Presentation (Next.js 16 App Router)", icon: Layers, tone: "border-primary/30 bg-primary/5",
    components: [
      { name: "Hospital admin UI", desc: "Dashboard, patients, NABH, settings", icon: HeartPulse },
      { name: "Coordinator worklist", desc: "Prioritized check-ins + escalations", icon: Stethoscope },
      { name: "Public transparency pages", desc: "Integrations, Security, Docs, Changelog", icon: ShieldCheck },
    ],
  },
  {
    id: "api", label: "API boundary (App Router route handlers)", icon: Workflow, tone: "border-blue-500/30 bg-blue-500/5",
    components: [
      { name: "Auth → Role → Tenant → Ownership", desc: "Every request follows the chain", icon: Lock },
      { name: "Zod input validation", desc: "parseBody() on every write endpoint", icon: ShieldCheck },
      { name: "rateLimitStrict", desc: "Fail-closed for high-risk public endpoints", icon: Bell },
    ],
  },
  {
    id: "domain", label: "Business logic (domain services)", icon: Box, tone: "border-violet-500/30 bg-violet-500/5",
    components: [
      { name: "Patient care", desc: "Enrollment, check-ins, escalations, medication", icon: HeartPulse },
      { name: "PM-JAY domain", desc: "Beneficiary → package → preauth → claim → query → settlement", icon: Stethoscope },
      { name: "NHCX domain", desc: "Coverage Eligibility + Claim + Communication (FHIR R4)", icon: Network },
      { name: "Claim engine", desc: "Payer-agnostic NormalizedClaim + completeness + work queue", icon: FileText },
      { name: "NABH readiness", desc: "Evidence + gap + corrective-action management", icon: ShieldCheck },
    ],
  },
  {
    id: "adapters", label: "External adapters (transport boundary)", icon: GitBranch, tone: "border-amber-500/30 bg-amber-500/5",
    components: [
      { name: "ABDM/ABHA adapter", desc: "8-state machine; sandbox until onboarding", icon: HeartPulse },
      { name: "PM-JAY adapter", desc: "5 modes incl. MANUAL_PORTAL", icon: Stethoscope },
      { name: "NHCX transport", desc: "Refuses guessed endpoints; mTLS + 8-gate live-gating", icon: Network },
      { name: "WhatsApp Cloud API", desc: "HMAC-verified webhook + idempotent inbound", icon: MessageSquare },
      { name: "AI provider router", desc: "Groq/OpenRouter + rule-based fallback", icon: Cpu },
    ],
  },
  {
    id: "persistence", label: "Persistence (Prisma + PostgreSQL)", icon: Database, tone: "border-emerald-500/30 bg-emerald-500/5",
    components: [
      { name: "PostgreSQL", desc: "46 tables, Decimal money, multi-tenant", icon: Database },
      { name: "AES-256-GCM PII encryption", desc: "Random IV + auth tag + scrypt key", icon: Lock },
      { name: "Audit log", desc: "Every sensitive healthcare action", icon: FileText },
      { name: "ExternalTransaction ledger", desc: "Unified external interaction log", icon: Server },
    ],
  },
];

const EXTERNAL_SYSTEMS = [
  { name: "NHA / ABDM", desc: "Authoritative ABHA verification + KYC", icon: HeartPulse },
  { name: "NHCX / HCX", desc: "Authoritative claim exchange + FHIR", icon: Network },
  { name: "PM-JAY (BIS/TMS/HEM)", desc: "Authoritative beneficiary + claims", icon: Stethoscope },
  { name: "State Health Agency", desc: "Authoritative state-scheme portal", icon: ShieldCheck },
  { name: "WhatsApp (Meta)", desc: "Authoritative message transport", icon: MessageSquare },
  { name: "AI providers", desc: "Groq / OpenRouter (external inference)", icon: Cpu },
];

const TECH_STACK = [
  { label: "Next.js 16", sub: "App Router, standalone build", icon: Layers },
  { label: "TypeScript 5", sub: "Strict typing throughout", icon: FileText },
  { label: "Prisma + PostgreSQL", sub: "46 tables, Decimal money", icon: Database },
  { label: "Tailwind + shadcn/ui", sub: "New York style, responsive", icon: Box },
  { label: "Zod", sub: "Strict input validation", icon: ShieldCheck },
  { label: "Upstash Redis", sub: "Distributed rate limiting", icon: Server },
  { label: "Sentry", sub: "PII-scrubbed observability", icon: Bell },
  { label: "Vitest", sub: "825 pure-unit tests", icon: FlaskConical },
];

function FlaskConical({ className }: { className?: string }) {
  return <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className}><path d="M10 2v7.527a1 1 0 0 0 .512.873L18.5 15" /><path d="M10 2v7.527a1 1 0 0 1-.512.873L1.5 15" /><path d="M10 2h4" /><path d="M14 2v6l8 12a2 2 0 0 1-2 3H4a2 2 0 0 1-2-3l8-12" /></svg>;
}

export function ArchitecturePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5">
      <MarketingHeader />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        {/* Hero */}
        <div className="text-center mb-10 sm:mb-12">
          <div className="inline-flex items-center gap-1.5 text-eyebrow text-primary mb-3">
            <Layers className="h-3.5 w-3.5" />
            ARCHITECTURE
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
            Modular monolith, honest boundaries.
          </h1>
          <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Ojas is a modular monolith — no unnecessary microservices, Kafka, or Kubernetes for the pilot. External systems are behind adapters and remain authoritative. Ojas orchestrates the hospital side; it never replaces NHA, BIS, TMS, HEM, or NHCX infrastructure.
          </p>
        </div>

        {/* Architecture layers */}
        <div className="space-y-3">
          {OJAS_LAYERS.map((layer, i) => (
            <React.Fragment key={layer.id}>
              <Card className={cn("border", layer.tone)}>
                <CardHeader className="pb-3">
                  <div className="flex items-center gap-2.5">
                    <div className="h-9 w-9 rounded-lg flex items-center justify-center bg-background/60">
                      <layer.icon className="h-4.5 w-4.5" />
                    </div>
                    <CardTitle className="text-sm font-semibold">{layer.label}</CardTitle>
                  </div>
                </CardHeader>
                <CardContent className="pt-0">
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                    {layer.components.map((c) => (
                      <div key={c.name} className="rounded-lg border bg-background/60 p-2.5">
                        <div className="flex items-center gap-1.5 mb-1">
                          <c.icon className="h-3.5 w-3.5 text-primary" />
                          <span className="text-xs font-semibold">{c.name}</span>
                        </div>
                        <p className="text-[11px] text-muted-foreground leading-relaxed">{c.desc}</p>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
              {i < OJAS_LAYERS.length - 1 && (
                <div className="flex justify-center py-0.5">
                  <ArrowDown className="h-4 w-4 text-muted-foreground/40" />
                </div>
              )}
            </React.Fragment>
          ))}
        </div>

        {/* External systems boundary */}
        <div className="mt-8">
          <div className="flex items-center justify-center gap-2 mb-4">
            <div className="h-px flex-1 max-w-[100px] bg-border" />
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider gap-1.5 border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400">
              <ExternalLink className="h-3 w-3" /> External systems (authoritative)
            </Badge>
            <div className="h-px flex-1 max-w-[100px] bg-border" />
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2.5">
            {EXTERNAL_SYSTEMS.map((s) => (
              <Card key={s.name} className="border-dashed border-amber-500/30 bg-amber-500/5">
                <CardContent className="p-3 text-center">
                  <s.icon className="h-5 w-5 text-amber-600 dark:text-amber-400 mx-auto mb-1.5" />
                  <div className="text-[11px] font-semibold leading-tight">{s.name}</div>
                  <div className="text-[10px] text-muted-foreground mt-1 leading-tight">{s.desc}</div>
                </CardContent>
              </Card>
            ))}
          </div>
          <p className="text-center text-[11px] text-muted-foreground mt-3 max-w-2xl mx-auto leading-relaxed">
            Ojas never builds a fake government server. When direct access is unavailable, the MANUAL_PORTAL workflow lets a hospital operator submit through the official portal and record the official reference in Ojas — a valid production path.
          </p>
        </div>

        {/* Key principles */}
        <div className="mt-12 grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Lock className="h-4 w-4 text-primary" /> Security boundaries</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {[
                "Every request: auth → role → tenant → ownership → business rules → DB",
                "PII (mobile, address, next-of-kin) encrypted AES-256-GCM at rest",
                "Cookie-based JWT (15min access, 30d rotating refresh, reuse detection)",
                "Webhook HMAC + idempotency (providerEventId UNIQUE)",
                "Cron fail-closed + atomic idempotent updates",
                "NHCX LIVE double-gated (8-step DB state machine + env override)",
              ].map((p) => (
                <div key={p} className="flex items-start gap-2">
                  <ShieldCheck className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
                  <span className="text-muted-foreground leading-relaxed">{p}</span>
                </div>
              ))}
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Cloud className="h-4 w-4 text-primary" /> Deployment model</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-xs">
              {[
                "Vercel / equivalent → Next.js standalone build",
                "Managed PostgreSQL (Supabase / RDS / Neon) with PITR",
                "Upstash Redis for distributed rate limiting",
                "Sentry for PII-scrubbed error tracking",
                "npx prisma migrate deploy (NEVER db push --accept-data-loss)",
                "Health check at /api/health (liveness + readiness)",
              ].map((p) => (
                <div key={p} className="flex items-start gap-2">
                  <Server className="h-3.5 w-3.5 text-blue-500 flex-shrink-0 mt-0.5" />
                  <span className="text-muted-foreground leading-relaxed">{p}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {/* Tech stack */}
        <div className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3 text-center">Technology stack</h2>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {TECH_STACK.map((t) => (
              <div key={t.label} className="rounded-lg border bg-card p-3 text-center">
                <t.icon className="h-5 w-5 text-primary mx-auto mb-1.5" />
                <div className="text-xs font-semibold">{t.label}</div>
                <div className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{t.sub}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-10 text-center">
          <p className="text-xs text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Full details in <code className="bg-muted px-1 py-0.5 rounded">docs/DATA_FLOW.md</code>, <code className="bg-muted px-1 py-0.5 rounded">docs/THREAT_MODEL.md</code>, and <code className="bg-muted px-1 py-0.5 rounded">docs/DEPLOYMENT.md</code>. See the <a href="/?view=changelog" className="text-primary underline">changelog</a> for the 12-phase hardening timeline.
          </p>
        </div>
      </main>
      <AppFooter />
    </div>
  );
}
