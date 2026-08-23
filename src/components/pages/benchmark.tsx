// Ojas — Hospital benchmarking page. Compares the current hospital's metrics
// against anonymized aggregate stats across ALL hospitals on the platform.
// All numbers from /api/benchmark (real aggregate queries, no fabrication).
// We also fetch /api/dashboard in parallel to read the current hospital's
// plan tier — used to highlight this hospital's slice in the plan donut.
"use client";

import * as React from "react";
import { MotionConfig, motion } from "framer-motion";
import { toast } from "sonner";
import {
  BarChart3, Building2, Users, Bot, TrendingUp, TrendingDown,
  Info, Sparkles, Activity, Target, AlertTriangle, CheckCircle2,
  Brain, Loader2, RefreshCw,
} from "lucide-react";
import {
  Cell, Pie, PieChart, ResponsiveContainer, Tooltip,
} from "recharts";

import { api } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// ── Types matching /api/benchmark contract ──────────────────────────────────
interface MyHospitalStats {
  patientCount: number;
  checkinCount: number;
  answeredCount: number;
  escalationCount: number;
  resolvedEscalations: number;
  criticalEscalations: number;
  aiRuns: number;
  responseRate: number | null;
  readmissionRate: number | null;
  resolutionRate: number | null;
}

interface BenchmarkStats {
  totalHospitals: number;
  avgPatients: number;
  avgCheckins: number;
  avgEscalations: number;
  avgAiRuns: number;
  percentiles: {
    patients: number;
    checkins: number;
    escalations: number;
    aiRuns: number;
  };
  planDistribution: { STARTER: number; GROWTH: number; ENTERPRISE: number };
}

interface BenchmarkResponse {
  myHospital: MyHospitalStats;
  benchmark: BenchmarkStats;
  note: string;
}

interface DashboardHospitalInfo {
  hospital: { name: string; planTier: string };
}

// ── Types matching /api/benchmark/insights contract ─────────────────────────
interface InsightsResponse {
  insight: string;
  fallbackUsed: boolean;
}

type PlanTier = "STARTER" | "GROWTH" | "ENTERPRISE";

// Emerald / accent / muted palette for the donut
const PLAN_COLORS: Record<PlanTier, string> = {
  STARTER: "oklch(0.65 0.02 250)",     // muted slate
  GROWTH: "oklch(0.62 0.14 165)",      // emerald (primary)
  ENTERPRISE: "oklch(0.72 0.15 70)",   // amber (accent)
};

// ── Page ─────────────────────────────────────────────────────────────────────
export function BenchmarkPage() {
  const [data, setData] = React.useState<BenchmarkResponse | null>(null);
  const [planTier, setPlanTier] = React.useState<PlanTier | null>(null);
  const [loading, setLoading] = React.useState(true);

  // AI insights state
  const [insight, setInsight] = React.useState<InsightsResponse | null>(null);
  const [insightLoading, setInsightLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      // Fetch benchmark + dashboard (for our plan tier) in parallel.
      const [b, d] = await Promise.all([
        api<BenchmarkResponse>("/api/benchmark"),
        api<DashboardHospitalInfo>("/api/dashboard").catch(() => null),
      ]);
      setData(b);
      const pt = d?.hospital?.planTier as PlanTier | undefined;
      if (pt === "STARTER" || pt === "GROWTH" || pt === "ENTERPRISE") {
        setPlanTier(pt);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load benchmark");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  // Generate AI benchmark insight via /api/benchmark/insights (real LLM, with
  // honest rule-based fallback surfaced via fallbackUsed).
  const generateInsight = React.useCallback(async () => {
    setInsightLoading(true);
    try {
      const r = await api<InsightsResponse>("/api/benchmark/insights", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setInsight(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate insights");
    } finally {
      setInsightLoading(false);
    }
  }, []);

  const myH = data?.myHospital;
  const bm = data?.benchmark;

  // Comparison rows — my value vs peer average
  const comparisons: {
    label: string;
    mine: number;
    avg: number;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { label: "Patients", mine: myH?.patientCount ?? 0, avg: bm?.avgPatients ?? 0, icon: Users },
    { label: "Check-ins", mine: myH?.checkinCount ?? 0, avg: bm?.avgCheckins ?? 0, icon: Activity },
    { label: "Escalations", mine: myH?.escalationCount ?? 0, avg: bm?.avgEscalations ?? 0, icon: AlertTriangle },
    { label: "AI calls", mine: myH?.aiRuns ?? 0, avg: bm?.avgAiRuns ?? 0, icon: Bot },
  ];

  // Percentile rankings
  const percentiles: {
    label: string;
    value: number;
    icon: React.ComponentType<{ className?: string }>;
  }[] = [
    { label: "Patients", value: bm?.percentiles.patients ?? 0, icon: Users },
    { label: "Check-ins", value: bm?.percentiles.checkins ?? 0, icon: Activity },
    { label: "Escalations", value: bm?.percentiles.escalations ?? 0, icon: AlertTriangle },
    { label: "AI calls", value: bm?.percentiles.aiRuns ?? 0, icon: Bot },
  ];

  // Plan distribution chart data
  const planData = React.useMemo(() => {
    if (!bm?.planDistribution) return [];
    return (Object.keys(bm.planDistribution) as PlanTier[]).map((k) => ({
      name: k,
      value: bm.planDistribution[k],
      tier: k,
    }));
  }, [bm?.planDistribution]);

  const totalPlanCount = planData.reduce((s, p) => s + p.value, 0);

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-6 md:space-y-8">
        {/* Header */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4"
        >
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight flex items-center gap-2">
              <BarChart3 className="h-6 w-6 text-primary" />
              Hospital benchmarking
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              How your hospital compares to peers on the platform.
            </p>
          </div>
          <Button
            variant="default"
            onClick={generateInsight}
            disabled={insightLoading || loading}
            className="glow-primary"
          >
            {insightLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Generating…
              </>
            ) : (
              <>
                <Brain className="h-4 w-4" /> Generate AI insights
              </>
            )}
          </Button>
        </motion.section>

        {/* AI insight card (appears above peer overview cards when generated) */}
        {insight && (
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Card className="glass-strong glow-primary">
              <CardContent className="p-4 md:p-6 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <span className="flex items-center justify-center h-8 w-8 rounded-md bg-primary/15 text-primary">
                      <Sparkles className="h-4 w-4" />
                    </span>
                    <div>
                      <h2 className="text-sm font-semibold flex items-center gap-2">
                        AI benchmark insight
                        <Badge variant="outline" className="text-[9px] uppercase tracking-wider border-primary/40 text-primary">
                          LLM
                        </Badge>
                      </h2>
                      <p className="text-[11px] text-muted-foreground">
                        Generated from your hospital&rsquo;s live data.
                      </p>
                    </div>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={generateInsight}
                    disabled={insightLoading}
                    className="text-muted-foreground hover:text-foreground"
                  >
                    {insightLoading ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <RefreshCw className="h-3.5 w-3.5" />
                    )}
                    Regenerate
                  </Button>
                </div>

                {insight.fallbackUsed && (
                  <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200">
                    <AlertTriangle className="h-4 w-4" />
                    <AlertDescription>
                      AI provider was unavailable — showing a rule-based summary instead.
                    </AlertDescription>
                  </Alert>
                )}

                <p className="text-sm leading-relaxed whitespace-pre-line">
                  {insight.insight}
                </p>

                <p className="text-[11px] text-muted-foreground pt-1 border-t border-border">
                  AI decision support — not a diagnosis.
                </p>
              </CardContent>
            </Card>
          </motion.section>
        )}

        {/* Peer overview cards */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          <PeerCard
            label="Hospitals on platform"
            value={bm?.totalHospitals}
            icon={Building2}
            loading={loading}
            delay={0}
          />
          <PeerCard
            label="Avg patients / hospital"
            value={bm?.avgPatients}
            icon={Users}
            loading={loading}
            delay={0.06}
          />
          <PeerCard
            label="Avg AI calls / hospital"
            value={bm?.avgAiRuns}
            icon={Bot}
            loading={loading}
            delay={0.12}
          />
        </section>

        {/* Your hospital vs peer average */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.18 }}
        >
          <Card className="glass">
            <CardHeader className="border-b border-border">
              <CardTitle className="flex items-center gap-2 text-base">
                <Target className="h-4 w-4 text-primary" />
                Your hospital vs peer average
              </CardTitle>
              <CardDescription>
                Your value (emerald) against the platform-wide average (muted).
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 md:p-6 space-y-4">
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : !data ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <BarChart3 className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">No data yet</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Data will appear here once available</p>
                </div>
              ) : (
                comparisons.map((c) => (
                  <ComparisonRow key={c.label} {...c} />
                ))
              )}
            </CardContent>
          </Card>
        </motion.section>

        {/* Percentile rankings */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.24 }}
        >
          <div className="mb-3">
            <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
              Percentile rankings
            </h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Where you rank against other hospitals. Higher is better.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
            {loading ? (
              Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="glass">
                  <CardContent className="p-4">
                    <Skeleton className="h-24 w-full" />
                  </CardContent>
                </Card>
              ))
            ) : (
              percentiles.map((p, i) => (
                <PercentileCard key={p.label} {...p} delay={i * 0.05} />
              ))
            )}
          </div>
        </motion.section>

        {/* Plan tier distribution + Quality metrics */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          {/* Plan tier distribution */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.3 }}
          >
            <Card className="glass h-full">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Building2 className="h-4 w-4 text-primary" />
                  Plan tier distribution
                </CardTitle>
                <CardDescription>
                  {planTier ? (
                    <>Your hospital is on the <span className="font-semibold text-foreground">{planTier}</span> tier.</>
                  ) : (
                    <>Distribution of plan tiers across the platform.</>
                  )}
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 md:p-6">
                {loading ? (
                  <div className="flex items-center justify-center">
                    <Skeleton className="h-48 w-48 rounded-full" />
                  </div>
                ) : totalPlanCount === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <BarChart3 className="h-10 w-10 text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">No data yet</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">Data will appear here once available</p>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    <div className="h-48 w-48 flex-shrink-0 relative">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={planData}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={48}
                            outerRadius={84}
                            paddingAngle={2}
                            stroke="var(--card)"
                            strokeWidth={2}
                          >
                            {planData.map((entry) => (
                              <Cell
                                key={entry.tier}
                                fill={PLAN_COLORS[entry.tier]}
                                fillOpacity={planTier === entry.tier ? 1 : 0.45}
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            contentStyle={{
                              background: "var(--popover)",
                              border: "1px solid var(--border)",
                              borderRadius: 8,
                              fontSize: 12,
                            }}
                            formatter={(v: number, n: string) => [`${v} hospital${v === 1 ? "" : "s"}`, n]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-2xl font-bold tabular-nums">{totalPlanCount}</span>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">total</span>
                      </div>
                    </div>
                    <ul className="flex-1 w-full space-y-2">
                      {planData.map((p) => (
                        <li
                          key={p.tier}
                          className={cn(
                            "flex items-center justify-between rounded-md border px-3 py-2 transition-colors",
                            planTier === p.tier
                              ? "border-primary/40 bg-primary/5"
                              : "border-border bg-card/40"
                          )}
                        >
                          <div className="flex items-center gap-2">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ backgroundColor: PLAN_COLORS[p.tier] }}
                            />
                            <span className="text-sm font-medium">{p.tier}</span>
                            {planTier === p.tier && (
                              <Badge variant="outline" className="text-[9px] uppercase tracking-wider border-primary/40 text-primary">
                                you
                              </Badge>
                            )}
                          </div>
                          <span className="text-sm tabular-nums text-muted-foreground">
                            {p.value}
                            <span className="text-[10px] ml-1">
                              ({totalPlanCount > 0 ? Math.round((p.value / totalPlanCount) * 100) : 0}%)
                            </span>
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Quality metrics */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.36 }}
          >
            <Card className="glass h-full">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Quality metrics
                </CardTitle>
                <CardDescription>
                  Your hospital&rsquo;s response, readmission, and resolution rates.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 md:p-6 grid grid-cols-1 sm:grid-cols-3 gap-3">
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-28 w-full" />
                  ))
                ) : (
                  <>
                    <QualityCard
                      label="Response rate"
                      value={myH?.responseRate ?? null}
                      icon={Activity}
                    />
                    <QualityCard
                      label="Readmission rate"
                      value={myH?.readmissionRate ?? null}
                      icon={TrendingDown}
                      inverted
                    />
                    <QualityCard
                      label="Resolution rate"
                      value={myH?.resolutionRate ?? null}
                      icon={CheckCircle2}
                    />
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </section>

        {/* Honesty note */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.42 }}
        >
          <Card className="glass border-accent/40 bg-accent/5">
            <CardContent className="p-4 md:p-6 flex items-start gap-3">
              <span className="flex items-center justify-center h-9 w-9 rounded-md bg-accent/15 text-accent-foreground flex-shrink-0">
                <Info className="h-4 w-4" />
              </span>
              <div className="flex-1 min-w-0">
                <h3 className="text-sm font-semibold mb-1 flex items-center gap-2">
                  About this benchmark
                  <Badge variant="outline" className="text-[9px] uppercase tracking-wider border-accent/40 text-accent-foreground">
                    honest data
                  </Badge>
                </h3>
                {loading ? (
                  <Skeleton className="h-12 w-full" />
                ) : (
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {data?.note || "Benchmarking is computed from real aggregate data."}
                  </p>
                )}
              </div>
            </CardContent>
          </Card>
        </motion.section>
      </div>
    </MotionConfig>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function PeerCard({
  label, value, icon: Icon, loading, delay,
}: {
  label: string;
  value: number | undefined;
  icon: React.ComponentType<{ className?: string }>;
  loading: boolean;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
    >
      <Card className="glass hover:glow-primary transition-shadow h-full">
        <CardContent className="p-4 md:p-5 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {label}
            </span>
            <span className="flex items-center justify-center h-7 w-7 rounded-md bg-primary/10 text-primary">
              <Icon className="h-3.5 w-3.5" />
            </span>
          </div>
          {loading ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <span className="text-2xl md:text-3xl font-semibold tabular-nums">
              {value ?? 0}
            </span>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function ComparisonRow({
  label, mine, avg, icon: Icon,
}: {
  label: string;
  mine: number;
  avg: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  const above = mine > avg;
  const equal = mine === avg;
  const max = Math.max(mine, avg, 1);
  const minePct = (mine / max) * 100;
  const avgPct = (avg / max) * 100;

  return (
    <div className="rounded-lg border border-border bg-card/40 p-3 md:p-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center h-7 w-7 rounded-md bg-primary/10 text-primary">
            <Icon className="h-3.5 w-3.5" />
          </span>
          <span className="text-sm font-medium">{label}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-semibold text-primary tabular-nums">{mine}</span>
          <span className="text-[11px] text-muted-foreground">vs avg</span>
          <span className="text-sm text-muted-foreground tabular-nums">{avg}</span>
          {!equal && (
            <Badge
              variant="outline"
              className={cn(
                "text-[10px] uppercase tracking-wider border-transparent",
                above
                  ? "bg-primary/15 text-primary"
                  : "bg-accent/15 text-accent-foreground"
              )}
            >
              {above ? (
                <TrendingUp className="h-3 w-3 mr-0.5" />
              ) : (
                <TrendingDown className="h-3 w-3 mr-0.5" />
              )}
              {above ? "above average" : "below average"}
            </Badge>
          )}
          {equal && (
            <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
              at average
            </Badge>
          )}
        </div>
      </div>
      {/* Bar showing mine vs avg on the same axis */}
      <div className="mt-3 space-y-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground w-8 uppercase">You</span>
          <div className="flex-1 h-2 rounded-full bg-primary/10 overflow-hidden">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${minePct}%` }}
            />
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground w-8 uppercase">Peer</span>
          <div className="flex-1 h-2 rounded-full bg-muted/30 overflow-hidden">
            <div
              className="h-full rounded-full bg-muted-foreground/60 transition-all"
              style={{ width: `${avgPct}%` }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function PercentileCard({
  label, value, icon: Icon, delay,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  delay: number;
}) {
  const ordinal = value === 0 ? "0th" : nth(value);
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
    >
      <Card className="glass hover:glow-primary transition-shadow h-full">
        <CardContent className="p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <Icon className="h-3.5 w-3.5 text-primary" />
              {label}
            </span>
          </div>
          <div>
            <span className="text-3xl font-bold tabular-nums text-primary">{value}</span>
            <span className="text-sm text-muted-foreground ml-1">th percentile</span>
          </div>
          <div>
            <Progress value={value} className="h-2" />
            <p className="text-[10px] text-muted-foreground mt-1">
              {ordinal} percentile — {value >= 75 ? "top quartile" : value >= 50 ? "above median" : value > 0 ? "below median" : "baseline"}
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function QualityCard({
  label, value, icon: Icon, inverted,
}: {
  label: string;
  value: number | null;
  icon: React.ComponentType<{ className?: string }>;
  inverted?: boolean; // true for readmission (lower is better)
}) {
  // Qualitative label
  let quality: "Good" | "Needs attention" | "Insufficient data";
  let qualityCls: string;
  if (value === null) {
    quality = "Insufficient data";
    qualityCls = "bg-muted/30 text-muted-foreground";
  } else if (inverted) {
    // Lower is better (readmission)
    if (value <= 10) { quality = "Good"; qualityCls = "bg-primary/15 text-primary"; }
    else if (value <= 20) { quality = "Needs attention"; qualityCls = "bg-accent/15 text-accent-foreground"; }
    else { quality = "Needs attention"; qualityCls = "bg-accent/15 text-accent-foreground"; }
  } else {
    // Higher is better (response, resolution)
    if (value >= 80) { quality = "Good"; qualityCls = "bg-primary/15 text-primary"; }
    else if (value >= 50) { quality = "Needs attention"; qualityCls = "bg-accent/15 text-accent-foreground"; }
    else { quality = "Needs attention"; qualityCls = "bg-accent/15 text-accent-foreground"; }
  }

  return (
    <div className="rounded-lg border border-border bg-card/40 p-4 flex flex-col gap-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Icon className="h-3.5 w-3.5 text-primary" />
          {label}
        </span>
      </div>
      <div>
        {value === null ? (
          <span className="text-xl font-semibold text-muted-foreground">—</span>
        ) : (
          <>
            <span className="text-2xl font-bold tabular-nums">{value}</span>
            <span className="text-sm text-muted-foreground ml-0.5">%</span>
          </>
        )}
      </div>
      <Badge variant="outline" className={cn("text-[10px] uppercase tracking-wider border-transparent w-fit", qualityCls)}>
        {quality}
      </Badge>
    </div>
  );
}

// ── Tiny ordinal helper ──────────────────────────────────────────────────────
function nth(n: number): string {
  if (n % 100 >= 11 && n % 100 <= 13) return `${n}th`;
  switch (n % 10) {
    case 1: return `${n}st`;
    case 2: return `${n}nd`;
    case 3: return `${n}rd`;
    default: return `${n}th`;
  }
}
