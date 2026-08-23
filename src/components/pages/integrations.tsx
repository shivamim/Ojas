"use client";

import * as React from "react";
import { MarketingHeader } from "@/components/marketing-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity, ShieldCheck, FlaskConical, KeyRound, AlertTriangle,
  CheckCircle2, XCircle, Server, Network, Cpu, Database, Lock,
  HeartPulse, Stethoscope, FileText, MessageSquare, Bell,
} from "lucide-react";
import { AppFooter } from "@/components/app-shell";

// ── Types matching /api/integrations/status output ─────────────────────────────
interface IntegrationStatus {
  configured: boolean;
  status: string;
  label: string;
  environmentState?: string;
  certConfigured?: boolean;
  providerMode?: string;
}
interface IntegrationsResponse {
  whatsapp: IntegrationStatus;
  abdm: IntegrationStatus;
  abha: IntegrationStatus;
  nhcx: IntegrationStatus;
  pmjay: IntegrationStatus;
  razorpay: IntegrationStatus;
  sentry: IntegrationStatus;
  redis: IntegrationStatus;
  ai: IntegrationStatus & { provider?: string };
  database: IntegrationStatus;
}

// ── Status -> visual mapping (truthful: never green for non-LIVE) ──────────────
function statusTone(status: string): {
  badgeClass: string;
  Icon: React.ComponentType<{ className?: string }>;
  dotClass: string;
} {
  const s = status.toUpperCase();
  if (s === "LIVE" || s === "PRODUCTION") {
    return { badgeClass: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", Icon: CheckCircle2, dotClass: "bg-emerald-500" };
  }
  if (s === "SANDBOX" || s === "SANDBOX_VERIFIED") {
    return { badgeClass: "border-primary/30 bg-primary/10 text-primary", Icon: FlaskConical, dotClass: "bg-primary" };
  }
  if (s === "MANUAL_PORTAL") {
    return { badgeClass: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400", Icon: KeyRound, dotClass: "bg-blue-500" };
  }
  if (s === "BLOCKED_BY_EXTERNAL_ONBOARDING" || s === "PRODUCTION_PENDING_ONBOARDING" || s === "PENDING_ONBOARDING") {
    return { badgeClass: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400", Icon: AlertTriangle, dotClass: "bg-amber-500" };
  }
  if (s === "FALLBACK") {
    return { badgeClass: "border-slate-400/40 bg-slate-400/10 text-slate-600 dark:text-slate-300", Icon: Activity, dotClass: "bg-slate-400" };
  }
  if (s === "READINESS_PLATFORM") {
    return { badgeClass: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-400", Icon: ShieldCheck, dotClass: "bg-violet-500" };
  }
  // NOT_CONFIGURED, DISABLED, LOCAL, FAILED
  return { badgeClass: "border-muted-foreground/30 bg-muted text-muted-foreground", Icon: XCircle, dotClass: "bg-muted-foreground" };
}

function StatusBadge({ status }: { status: string }) {
  const { badgeClass, Icon } = statusTone(status);
  return (
    <Badge variant="outline" className={`text-[10px] uppercase tracking-wider gap-1.5 ${badgeClass}`}>
      <Icon className="h-3 w-3" />
      {status.replace(/_/g, " ").toLowerCase()}
    </Badge>
  );
}

function IntegrationCard({
  name, description, icon: Icon, status, label, extra,
}: {
  name: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  status: string;
  label: string;
  extra?: React.ReactNode;
}) {
  const { badgeClass, Icon: StatusIcon, dotClass } = statusTone(status);
  return (
    <Card className="h-full elevate-2 hover:-translate-y-0.5 transition-transform overflow-hidden">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3 min-w-0">
            <div className="h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0 bg-primary/10 text-primary">
              <Icon className="h-5 w-5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-base font-semibold">{name}</CardTitle>
              <CardDescription className="text-xs mt-1 leading-relaxed">{description}</CardDescription>
            </div>
          </div>
          <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
            <span className="flex items-center gap-1.5">
              <span className={`relative flex h-2 w-2`}>
                {!["NOT_CONFIGURED", "DISABLED", "LOCAL", "FAILED"].includes(status.toUpperCase()) && (
                  <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-60 ${dotClass}`} />
                )}
                <span className={`relative inline-flex rounded-full h-2 w-2 ${dotClass}`} />
              </span>
            </span>
            <Badge variant="outline" className={`text-[10px] uppercase tracking-wider gap-1.5 ${badgeClass}`}>
              <StatusIcon className="h-3 w-3" />
              {status.replace(/_/g, " ").toLowerCase()}
            </Badge>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <p className="text-xs text-muted-foreground leading-relaxed">{label}</p>
        {extra}
      </CardContent>
    </Card>
  );
}

export function IntegrationsPage() {
  const [data, setData] = React.useState<IntegrationsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/integrations/status")
      .then(async (r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json() as Promise<IntegrationsResponse>;
      })
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e.message); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5">
      <MarketingHeader />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        {/* Hero */}
        <div className="text-center mb-12 sm:mb-16">
          <div className="inline-flex items-center gap-1.5 text-eyebrow text-primary mb-3">
            <ShieldCheck className="h-3.5 w-3.5" />
            HONEST BY DESIGN
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
            Integration Status
          </h1>
          <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Every external integration is shown with its truthful, current state. We never label a sandbox or local
            workflow as live. This page reads from the same <code className="text-xs bg-muted px-1.5 py-0.5 rounded">/api/integrations/status</code> endpoint the app uses internally.
          </p>
        </div>

        {/* Truthfulness contract */}
        <div className="mb-10 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Live", desc: "Real, externally-verified integration", tone: "border-emerald-500/40 bg-emerald-500/5" },
            { label: "Sandbox", desc: "Adapter built + validated; not live", tone: "border-primary/30 bg-primary/5" },
            { label: "Pending onboarding", desc: "Needs official credentials/certs", tone: "border-amber-500/40 bg-amber-500/5" },
            { label: "Manual portal", desc: "Operator-driven official workflow", tone: "border-blue-500/40 bg-blue-500/5" },
          ].map((t) => (
            <div key={t.label} className={`rounded-lg border p-3 ${t.tone}`}>
              <div className="text-xs font-semibold uppercase tracking-wider">{t.label}</div>
              <div className="text-[11px] text-muted-foreground mt-1 leading-relaxed">{t.desc}</div>
            </div>
          ))}
        </div>

        {/* Status grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} className="h-44 rounded-xl" />
            ))}
          </div>
        ) : error ? (
          <Card className="border-destructive/40">
            <CardContent className="p-8 text-center">
              <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">Unable to load integration status: {error}</p>
            </CardContent>
          </Card>
        ) : data ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            <IntegrationCard
              name="ABHA / ABDM" description="Ayushman Bharat Digital Mission — patient identity, verification, KYC"
              icon={HeartPulse}
              status={data.abha.status} label={data.abha.label}
            />
            <IntegrationCard
              name="PM-JAY" description="Ayushman Bharat beneficiary + preauth + claim + settlement domain"
              icon={Stethoscope}
              status={data.pmjay.status} label={data.pmjay.label}
              extra={data.pmjay.providerMode ? (
                <div className="mt-2 text-[11px] text-muted-foreground">
                  Provider mode: <span className="font-mono font-semibold">{data.pmjay.providerMode}</span>
                </div>
              ) : undefined}
            />
            <IntegrationCard
              name="NHCX" description="National Health Claims Exchange — Coverage Eligibility, Claim, Communication (FHIR R4)"
              icon={Network}
              status={data.nhcx.status} label={data.nhcx.label}
              extra={data.nhcx.environmentState ? (
                <div className="mt-2 text-[11px] text-muted-foreground">
                  Environment state: <span className="font-mono font-semibold">{data.nhcx.environmentState}</span>
                  {data.nhcx.certConfigured !== undefined && (
                    <span className="ml-2">· mTLS: {data.nhcx.certConfigured ? "configured" : "pending"}</span>
                  )}
                </div>
              ) : undefined}
            />
            <IntegrationCard
              name="WhatsApp" description="Cloud API — scheduled check-ins, family updates, inbound replies"
              icon={MessageSquare}
              status={data.whatsapp.status} label={data.whatsapp.label}
            />
            <IntegrationCard
              name="AI" description="Risk stratification, triage, conversational, care-coach agents"
              icon={Cpu}
              status={data.ai.status} label={data.ai.label}
              extra={data.ai.provider ? (
                <div className="mt-2 text-[11px] text-muted-foreground">
                  Provider: <span className="font-mono font-semibold">{data.ai.provider}</span>
                </div>
              ) : undefined}
            />
            <IntegrationCard
              name="PostgreSQL" description="Production database — Prisma ORM, Decimal money, multi-tenant"
              icon={Database}
              status={data.database.status} label={data.database.label}
            />
            <IntegrationCard
              name="Redis / Upstash" description="Distributed rate limiting — fail-closed for high-risk endpoints"
              icon={Server}
              status={data.redis.status} label={data.redis.label}
            />
            <IntegrationCard
              name="Razorpay" description="Subscription billing (Razorpay) — checkout + webhook"
              icon={FileText}
              status={data.razorpay.status} label={data.razorpay.label}
            />
            <IntegrationCard
              name="Sentry" description="Error tracking + observability — PII scrubbed before capture"
              icon={Bell}
              status={data.sentry.status} label={data.sentry.label}
            />
          </div>
        ) : null}

        {/* NHCX live-gating explainer */}
        <Card className="mt-10 border-primary/20">
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" />
              NHCX live-gating — an operator cannot flip LIVE by accident
            </CardTitle>
            <CardDescription>
              LIVE is double-gated: an 8-step DB state machine on the HospitalIntegrationProfile AND an operator-declared environment variable. Each gate is verified, timestamped, and audited.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 text-xs">
              {[
                "SANDBOX_CONFIGURED", "SANDBOX_VERIFIED", "PARTNER_ONBOARDING_VERIFIED",
                "CERTIFICATES_VERIFIED", "PRODUCTION_ENDPOINT_VERIFIED",
                "PRODUCTION_CONNECTIVITY_VERIFIED", "LIVE_APPROVED", "LIVE",
              ].map((gate, i) => (
                <li key={gate} className="flex items-center gap-2 rounded-md border bg-muted/30 px-2.5 py-2">
                  <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 text-primary text-[10px] font-bold flex-shrink-0">
                    {i + 1}
                  </span>
                  <span className="font-mono text-[10px] leading-tight">{gate}</span>
                </li>
              ))}
            </ol>
            <p className="text-[11px] text-muted-foreground mt-3 leading-relaxed">
              Ojas never auto-promotes to LIVE. Even with all credentials + certificates present, the operator must explicitly advance each gate with evidence. Rolling back sets the state to FAILED and is audited.
            </p>
          </CardContent>
        </Card>

        {/* Footer note */}
        <div className="mt-10 text-center">
          <p className="text-xs text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            This status reflects the Ojas sandbox deployment. A production deployment with official NHA/State/partner credentials, certificates, and facility onboarding will show LIVE for the integrations that have completed the onboarding gates. See <code className="bg-muted px-1 py-0.5 rounded">docs/NHA_NHCX_PMJAY_GO_LIVE.md</code> for the full runbook.
          </p>
        </div>
      </main>
      <AppFooter />
    </div>
  );
}
