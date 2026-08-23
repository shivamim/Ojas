"use client";

import * as React from "react";
import { MarketingHeader } from "@/components/marketing-header";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  TrendingDown, TrendingUp, Activity, Heart, Clock, Bell, Users,
  FlaskConical, Database, Cpu, FileText, CheckCircle2, GitBranch,
  RefreshCw, Loader2, AlertTriangle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AppFooter } from "@/components/app-shell";

// ── Source-type taxonomy (V3-37: raw vs calculated vs AI-derived) ─────────────
type SourceType = "raw" | "calculated" | "ai-derived" | "baseline";

const SOURCE_META: Record<SourceType, { label: string; tone: string; icon: React.ComponentType<{ className?: string }>; desc: string }> = {
  raw: { label: "Raw", tone: "border-slate-400/40 bg-slate-400/10 text-slate-600 dark:text-slate-300", icon: Database, desc: "Direct count from a DB table" },
  calculated: { label: "Calculated", tone: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400", icon: GitBranch, desc: "Derived from raw counts via a formula" },
  "ai-derived": { label: "AI-derived", tone: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-400", icon: Cpu, desc: "Risk band from an LLM call (human-reviewed)" },
  baseline: { label: "Baseline", tone: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400", icon: FileText, desc: "Hospital-entered pre-Ojas historical" },
};

interface MetricFormula {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  source: SourceType;
  formula: string;
  numerator: string;
  denominator: string;
  unit: string;
  description: string;
  fields: string[];
  auditAction?: string;
}

const METRICS: MetricFormula[] = [
  {
    id: "readmission", name: "30-day readmission rate", icon: TrendingDown, source: "calculated",
    formula: "readmittedPatients / enrolledPatients × 100",
    numerator: "Patient.count(status=READMITTED, createdAt ≥ pilot.startDate)",
    denominator: "Patient.count(createdAt ≥ pilot.startDate)",
    unit: "% (1 decimal)",
    description: "The share of enrolled patients who were readmitted within the pilot window. Computed live from the Patient table. Compared against the hospital-entered pre-Ojas baseline (readmissionRateWithoutOjas).",
    fields: ["PilotStudy.readmissionRateWithOjas", "PilotStudy.readmissionRateWithoutOjas", "Patient.status=READMITTED"],
    auditAction: "PILOT_BASELINE_UPDATED",
  },
  {
    id: "adherence", name: "Medication adherence rate", icon: CheckCircle2, source: "calculated",
    formula: "adherentMedPatients / activeMedications × 100",
    numerator: "distinct Patient with Checkin.medsTaken=true (among active-med patients)",
    denominator: "Medication.count(status=ACTIVE)",
    unit: "% (1 decimal)",
    description: "Of active medications, the share whose patient has at least one check-in confirming medsTaken=true. Distinct on patientId so multiple meds per patient don't skew the rate.",
    fields: ["Medication.status=ACTIVE", "Checkin.medsTaken=true"],
  },
  {
    id: "response", name: "Check-in response rate", icon: Activity, source: "calculated",
    formula: "checkinsAnswered / checkinsScheduled × 100",
    numerator: "Checkin.count(status=ANSWERED, scheduledFor ≥ pilot.startDate)",
    denominator: "Checkin.count(scheduledFor ≥ pilot.startDate)",
    unit: "% (1 decimal)",
    description: "The share of scheduled check-ins that were answered. The core engagement signal — a low response rate triggers coordinator outreach.",
    fields: ["Checkin.status=ANSWERED", "Checkin.scheduledFor"],
  },
  {
    id: "satisfaction", name: "Patient satisfaction score", icon: Heart, source: "raw",
    formula: "avg(SatisfactionSurvey.overallRating)",
    numerator: "SatisfactionSurvey.overallRating (1-5)",
    denominator: "SatisfactionSurvey.count",
    unit: "score 1-5 (2 decimals)",
    description: "CAHPS-aligned satisfaction survey collected after the recovery window closes. One survey per patient (@@unique). Overall + care quality + communication + responsiveness + wouldRecommend.",
    fields: ["SatisfactionSurvey.overallRating", "SatisfactionSurvey.careQuality", "SatisfactionSurvey.communication", "SatisfactionSurvey.responsiveness"],
  },
  {
    id: "escalation", name: "Escalation count by severity", icon: Bell, source: "raw",
    formula: "count(Escalation) GROUP BY severity",
    numerator: "Escalation.count(createdAt ≥ pilot.startDate)",
    denominator: "(none — raw count)",
    unit: "count (LOW / MEDIUM / HIGH / CRITICAL)",
    description: "Escalations grouped by severity. The worklist prioritisation signal. AI-proposed escalations (aiProposed=true) are always human-reviewed before they reach a patient or doctor.",
    fields: ["Escalation.severity", "Escalation.aiProposed", "Escalation.status"],
  },
  {
    id: "response-time", name: "Time to coordinator response", icon: Clock, source: "calculated",
    formula: "avg(acknowledgedAt - createdAt)",
    numerator: "Escalation.acknowledgedAt - Escalation.createdAt (ms)",
    denominator: "Escalation.count(acknowledgedAt ≠ null)",
    unit: "ms (converted to minutes for display)",
    description: "Average time from escalation creation to coordinator acknowledgement. A key SLA signal — the worklist surfaces aging escalations.",
    fields: ["Escalation.acknowledgedAt", "Escalation.createdAt"],
  },
  {
    id: "risk", name: "AI risk stratification", icon: Cpu, source: "ai-derived",
    formula: "LLM(age, comorbidities, surgeryType, surgeryDate) → LOW / MEDIUM / HIGH / CRITICAL",
    numerator: "(LLM call — logged in AiAgentRun)",
    denominator: "(per-patient at enrollment)",
    unit: "band + 0-100 score",
    description: "Runs at enrollment. Produces a baseline risk band + 0-100 score. Rule-based fallback fires if the model is unavailable (honestly labelled FALLBACK). Decision support for the coordinator — never a diagnosis. Human reviews before any action above LOW.",
    fields: ["Patient.riskLevel", "Patient.riskScore", "Patient.riskAssessedAt", "AiAgentRun.outcome"],
    auditAction: "AI_RISK_STRATIFICATION_RUN",
  },
];

// ── Live pilot metrics DTO types (Task 5: wire page to /api/pilot/metrics) ───
type PilotStatus = "ACTIVE" | "COMPLETED" | "SUSPENDED";
type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface PilotStudyDTO {
  id: string;
  hospitalId: string;
  startDate: string;
  endDate: string | null;
  patientCount: number;
  controlCount: number;
  status: PilotStatus;
  readmissionRateWithOjas: number | null;
  readmissionRateWithoutOjas: number | null;
  medicationAdherenceRate: number | null;
  patientSatisfactionScore: number | null;
  responseRate: number | null;
  escalationCount: number | null;
  notes: string | null;
}

interface PilotMetricsDTO {
  enrolledPatients: number;
  readmissionRate: number | null;
  medicationAdherenceRate: number | null;
  responseRate: number | null;
  escalationCountBySeverity: Record<Severity, number>;
  timeToCoordinatorResponseMs: number | null;
  daysElapsed: number;
  totalEscalations: number;
  activeMedications: number;
  checkinsAnswered: number;
  checkinsScheduled: number;
}

interface LiveData {
  pilot: PilotStudyDTO;
  metrics: PilotMetricsDTO;
}

const STATUS_TONE: Record<PilotStatus, { label: string; ring: string; text: string; dot: string }> = {
  ACTIVE: {
    label: "Active",
    ring: "border-emerald-500/40 bg-emerald-500/5",
    text: "text-emerald-700 dark:text-emerald-400",
    dot: "bg-emerald-500",
  },
  COMPLETED: {
    label: "Completed",
    ring: "border-blue-500/40 bg-blue-500/5",
    text: "text-blue-700 dark:text-blue-400",
    dot: "bg-blue-500",
  },
  SUSPENDED: {
    label: "Suspended",
    ring: "border-red-500/40 bg-red-500/5",
    text: "text-red-700 dark:text-red-400",
    dot: "bg-red-500",
  },
};

const SEVERITY_TONE: Record<Severity, { dot: string; text: string; ring: string }> = {
  LOW: { dot: "bg-slate-400", text: "text-slate-600 dark:text-slate-300", ring: "border-slate-400/30" },
  MEDIUM: { dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-400", ring: "border-amber-500/30" },
  HIGH: { dot: "bg-orange-500", text: "text-orange-700 dark:text-orange-400", ring: "border-orange-500/30" },
  CRITICAL: { dot: "bg-red-500", text: "text-red-700 dark:text-red-400", ring: "border-red-500/30" },
};

const SEVERITY_ORDER: Severity[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function formatMsAsMinutes(ms: number | null): string {
  if (ms == null) return "—";
  const minutes = ms / 60000;
  if (minutes < 1) return `${Math.round(ms / 1000)}s`;
  if (minutes < 10) return `${minutes.toFixed(1)} min`;
  return `${Math.round(minutes)} min`;
}

function formatPercent(v: number | null): string {
  if (v == null) return "—";
  return `${v.toFixed(1)}%`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "";
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return iso;
  }
}

// ── Live-section subcomponents ───────────────────────────────────────────────

function LiveSectionSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-24 w-full rounded-xl" />
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-28 w-full rounded-xl" />
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}

function MetricCard({
  icon: Icon,
  label,
  value,
  sub,
  trend,
  tone = "default",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  trend?: "down-good" | "up-bad" | "neutral" | "unknown";
  tone?: "default" | "emerald" | "blue" | "violet" | "amber" | "red";
}) {
  const toneClasses: Record<string, string> = {
    default: "bg-primary/10 text-primary",
    emerald: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    blue: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
    violet: "bg-violet-500/10 text-violet-600 dark:text-violet-400",
    amber: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    red: "bg-red-500/10 text-red-600 dark:text-red-400",
  };
  return (
    <Card className="elevate-2 hover:-translate-y-0.5 transition-transform">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <div className={cn("h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0", toneClasses[tone])}>
            <Icon className="h-4 w-4" />
          </div>
          {trend === "down-good" && <TrendingDown className="h-4 w-4 text-emerald-500" aria-label="down vs baseline (good)" />}
          {trend === "up-bad" && <TrendingUp className="h-4 w-4 text-red-500" aria-label="up vs baseline (bad)" />}
          {trend === "neutral" && (
            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">flat</span>
          )}
        </div>
        <div className="text-2xl font-bold tabular-nums leading-none">{value}</div>
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">{label}</div>
        {sub && <div className="text-[10px] text-muted-foreground/70 mt-0.5 truncate">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function RawCount({
  icon: Icon,
  label,
  value,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | number;
}) {
  return (
    <div className="rounded-lg border bg-card p-3 hover:-translate-y-0.5 transition-transform">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <div className="text-lg font-semibold tabular-nums leading-none">{value}</div>
    </div>
  );
}

function LiveSection({ data }: { data: LiveData }) {
  const { pilot, metrics } = data;
  const statusTone = STATUS_TONE[pilot.status] ?? STATUS_TONE.ACTIVE;

  // Readmission trend vs without-Ojas baseline.
  // Lower is better → with < without → emerald down-arrow (good).
  // Higher is worse → with > without → red up-arrow (bad).
  const baseline = pilot.readmissionRateWithoutOjas;
  const current = metrics.readmissionRate;
  let readmitTrend: "down-good" | "up-bad" | "neutral" | "unknown" = "unknown";
  if (current != null && baseline != null) {
    if (current < baseline) readmitTrend = "down-good";
    else if (current > baseline) readmitTrend = "up-bad";
    else readmitTrend = "neutral";
  }
  const readmitSub =
    baseline != null
      ? `vs ${baseline.toFixed(1)}% pre-Ojas baseline`
      : "no baseline set";

  return (
    <div className="space-y-4">
      {/* Pilot status banner */}
      <Card className={cn("border-2", statusTone.ring)}>
        <CardContent className="p-5">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="h-10 w-10 rounded-lg flex items-center justify-center bg-background/60 border flex-shrink-0">
                <span className={cn("h-3 w-3 rounded-full animate-pulse", statusTone.dot)} />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="text-base font-semibold leading-none">Pilot status</h3>
                  <Badge
                    variant="outline"
                    className={cn("uppercase text-[10px] tracking-wider", statusTone.text, statusTone.ring)}
                  >
                    {statusTone.label}
                  </Badge>
                </div>
                <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                  Started {formatDate(pilot.startDate)}
                  {pilot.endDate ? ` · ended ${formatDate(pilot.endDate)}` : ""}
                  {pilot.notes ? ` · ${pilot.notes}` : ""}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-6 flex-shrink-0">
              <div className="text-center">
                <div className="text-2xl font-bold tabular-nums leading-none">
                  {metrics.daysElapsed}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">
                  days elapsed
                </div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold tabular-nums leading-none">
                  {metrics.enrolledPatients}
                </div>
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-1">
                  enrolled
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 4-column live metric grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        <MetricCard
          icon={TrendingDown}
          label="Readmission rate"
          value={formatPercent(metrics.readmissionRate)}
          sub={readmitSub}
          trend={readmitTrend}
          tone="emerald"
        />
        <MetricCard
          icon={CheckCircle2}
          label="Medication adherence"
          value={formatPercent(metrics.medicationAdherenceRate)}
          sub={metrics.activeMedications > 0 ? `${metrics.activeMedications} active meds` : "no active meds"}
          tone="emerald"
        />
        <MetricCard
          icon={Activity}
          label="Check-in response"
          value={formatPercent(metrics.responseRate)}
          sub={`${metrics.checkinsAnswered}/${metrics.checkinsScheduled} answered`}
          tone="blue"
        />
        <MetricCard
          icon={Clock}
          label="Avg response time"
          value={formatMsAsMinutes(metrics.timeToCoordinatorResponseMs)}
          sub="escalation ack latency"
          tone="violet"
        />
      </div>

      {/* Escalation severity breakdown */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
          Escalations by severity · {metrics.totalEscalations} total
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {SEVERITY_ORDER.map((sev) => {
            const tone = SEVERITY_TONE[sev];
            const count = metrics.escalationCountBySeverity?.[sev] ?? 0;
            return (
              <div
                key={sev}
                className={cn(
                  "rounded-lg border bg-card p-3 flex items-center gap-2.5 hover:-translate-y-0.5 transition-transform",
                  tone.ring
                )}
              >
                <span className={cn("h-2.5 w-2.5 rounded-full flex-shrink-0", tone.dot)} />
                <div className="min-w-0">
                  <div className={cn("text-[10px] font-semibold uppercase tracking-wider", tone.text)}>
                    {sev}
                  </div>
                  <div className="text-lg font-bold tabular-nums leading-tight">{count}</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Raw-counts strip */}
      <div>
        <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2 px-1">
          Raw counts
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <RawCount icon={Users} label="Enrolled patients" value={metrics.enrolledPatients} />
          <RawCount icon={Heart} label="Active medications" value={metrics.activeMedications} />
          <RawCount
            icon={Activity}
            label="Check-ins answered"
            value={`${metrics.checkinsAnswered} / ${metrics.checkinsScheduled}`}
          />
          <RawCount icon={Bell} label="Total escalations" value={metrics.totalEscalations} />
        </div>
      </div>
    </div>
  );
}

// ── Page ─────────────────────────────────────────────────────────────────────

export function PilotMetricsPage() {
  const [liveData, setLiveData] = React.useState<LiveData | null>(null);
  const [liveLoading, setLiveLoading] = React.useState(false);
  const [liveError, setLiveError] = React.useState<string | null>(null);

  // Fetch live pilot metrics from /api/pilot/metrics. Requires HOSPITAL_ADMIN
  // role + a live PostgreSQL connection. In the sandbox (no Postgres) the API
  // returns 500 — we surface that gracefully and keep the formula docs visible.
  const loadLive = React.useCallback(async () => {
    setLiveLoading(true);
    setLiveError(null);
    try {
      const res = await fetch("/api/pilot/metrics", { cache: "no-store" });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data = (await res.json()) as LiveData;
      setLiveData(data);
    } catch (e) {
      setLiveError(e instanceof Error ? e.message : "unknown error");
      setLiveData(null);
    } finally {
      setLiveLoading(false);
    }
  }, []);

  React.useEffect(() => {
    void loadLive();
  }, [loadLive]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5">
      <MarketingHeader />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        {/* Hero */}
        <div className="text-center mb-10 sm:mb-12">
          <div className="inline-flex items-center gap-1.5 text-eyebrow text-primary mb-3">
            <FlaskConical className="h-3.5 w-3.5" />
            PILOT METRICS
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
            Every metric, formula-visible.
          </h1>
          <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Pilot metrics are computed live from real patient, check-in, escalation, and medication data — never from a static report. Every formula is shown here with its numerator, denominator, source tables, and lineage (raw / calculated / AI-derived / baseline). Ojas never alters source data to improve metrics.
          </p>
        </div>

        {/* ── LIVE METRICS SECTION (Task 5) ──────────────────────────────── */}
        <section className="mb-10">
          <div className="flex items-center justify-between mb-4 gap-3">
            <div className="flex items-center gap-2 min-w-0">
              <Activity className="h-5 w-5 text-primary flex-shrink-0" />
              <h2 className="text-xl font-semibold tracking-tight truncate">Live pilot metrics</h2>
              {liveData && !liveLoading && (
                <Badge
                  variant="outline"
                  className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 flex-shrink-0"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
                  live
                </Badge>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void loadLive()}
              disabled={liveLoading}
              className="flex-shrink-0"
            >
              {liveLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Refresh
            </Button>
          </div>

          {/* Loading skeleton (initial load) */}
          {liveLoading && !liveData && <LiveSectionSkeleton />}

          {/* Graceful fallback — sandbox without PostgreSQL etc. */}
          {liveError && !liveLoading && (
            <Card className="border-amber-500/40 bg-amber-500/5">
              <CardContent className="p-5">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                  <div className="min-w-0">
                    <h3 className="text-sm font-semibold text-amber-800 dark:text-amber-400">
                      Live data unavailable
                    </h3>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">
                      The sandbox has no PostgreSQL connection, so the live metrics could not be
                      loaded (<code className="font-mono bg-muted px-1 py-0.5 rounded text-[10px]">{liveError}</code>).
                      In production with a managed Postgres, this section shows real pilot metrics
                      computed on the fly by{" "}
                      <code className="font-mono bg-muted px-1 py-0.5 rounded text-[10px]">
                        /api/pilot/metrics
                      </code>
                      . The formula documentation below remains accurate.
                    </p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => void loadLive()}
                      disabled={liveLoading}
                    >
                      {liveLoading ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <RefreshCw className="h-3.5 w-3.5" />
                      )}
                      Try again
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Live data display */}
          {liveData && !liveError && <LiveSection data={liveData} />}
        </section>

        {/* Source-type legend */}
        <div className="mb-8 grid grid-cols-2 sm:grid-cols-4 gap-2">
          {Object.entries(SOURCE_META).map(([key, meta]) => (
            <div key={key} className={cn("rounded-lg border p-2.5", meta.tone)}>
              <div className="flex items-center gap-1.5 mb-1">
                <meta.icon className="h-3.5 w-3.5" />
                <span className="text-xs font-semibold">{meta.label}</span>
              </div>
              <p className="text-[10px] leading-tight opacity-80">{meta.desc}</p>
            </div>
          ))}
        </div>

        {/* Metrics grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {METRICS.map((m) => {
            const srcMeta = SOURCE_META[m.source];
            return (
              <Card key={m.id} className="elevate-2 hover:-translate-y-0.5 transition-transform">
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-2.5 min-w-0">
                      <div className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-primary/10 text-primary">
                        <m.icon className="h-4.5 w-4.5" />
                      </div>
                      <div className="min-w-0">
                        <CardTitle className="text-sm font-semibold leading-tight">{m.name}</CardTitle>
                        <CardDescription className="text-xs mt-0.5">{m.unit}</CardDescription>
                      </div>
                    </div>
                    <Badge variant="outline" className={cn("text-[9px] uppercase tracking-wider gap-1 flex-shrink-0", srcMeta.tone)}>
                      <srcMeta.icon className="h-2.5 w-2.5" /> {srcMeta.label}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  {/* Formula visualization */}
                  <div className="rounded-md bg-muted/50 border p-3">
                    <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Formula</div>
                    <code className="text-xs font-mono text-primary break-all">{m.formula}</code>
                  </div>

                  {/* Numerator / denominator */}
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-md border p-2">
                      <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">Numerator</div>
                      <code className="text-[10px] font-mono leading-tight block">{m.numerator}</code>
                    </div>
                    <div className="rounded-md border p-2">
                      <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-0.5">Denominator</div>
                      <code className="text-[10px] font-mono leading-tight block">{m.denominator}</code>
                    </div>
                  </div>

                  <p className="text-xs text-muted-foreground leading-relaxed">{m.description}</p>

                  {/* Source fields */}
                  <div>
                    <div className="text-[9px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">Source fields</div>
                    <div className="flex flex-wrap gap-1">
                      {m.fields.map((f) => (
                        <code key={f} className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">{f}</code>
                      ))}
                    </div>
                  </div>

                  {m.auditAction && (
                    <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground/70 border-t pt-2">
                      <FileText className="h-3 w-3" /> Audited as <code className="font-mono">{m.auditAction}</code>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* Data-lineage note */}
        <Card className="mt-8 border-primary/20 bg-primary/5">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <Database className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="text-sm font-semibold mb-1">Data lineage + integrity</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  All metrics are computed on-the-fly by <code className="bg-muted px-1 py-0.5 rounded text-[10px]">/api/pilot/metrics</code> from the hospital's live PostgreSQL data — never from a cached or exported report. The pilot cohort is scoped by <code className="bg-muted px-1 py-0.5 rounded text-[10px]">pilot.startDate</code> (defaulting to the hospital's earliest patient enrollment). AI-derived metrics (risk stratification) are logged in <code className="bg-muted px-1 py-0.5 rounded text-[10px]">AiAgentRun</code> with prompt version, model version, tokens, latency, and outcome. Ojas never alters source data to improve metrics.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Cohort + scope */}
        <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
          {[
            { icon: Users, label: "Cohort", value: "Enrolled patients since pilot.startDate", sub: "PilotStudy.hospitalId @unique — one per hospital" },
            { icon: Clock, label: "Window", value: "startDate → now (daysElapsed)", sub: "Backdated to earliest enrollment on creation" },
            { icon: TrendingUp, label: "Comparison", value: "with-Ojas vs without-Ojas baseline", sub: "Hospital admin enters the pre-Ojas baseline" },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border bg-card p-4">
              <item.icon className="h-5 w-5 text-primary mb-2" />
              <div className="text-xs font-semibold">{item.label}</div>
              <div className="text-xs text-foreground mt-1 leading-relaxed">{item.value}</div>
              <div className="text-[10px] text-muted-foreground mt-1 leading-relaxed">{item.sub}</div>
            </div>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-10 text-center">
          <p className="text-xs text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Full pilot workflow in <code className="bg-muted px-1 py-0.5 rounded">docs/PRODUCTION_READINESS.md</code>. The hospital-facing pilot tracker is at <code className="bg-muted px-1 py-0.5 rounded">?view=pilot-tracker</code> (auth required). See the <a href="/?view=changelog" className="text-primary underline">changelog</a> for the hardening timeline.
          </p>
        </div>
      </main>
      <AppFooter />
    </div>
  );
}
