// Ojas — P1.5 Coordinator Success Metrics page.
// "Hospitals buy outcomes (lower workload), not AI." Shows per-coordinator
// weekly impact — patients managed, time saved, AI deteriorations caught,
// response rate — with a Before-Ojas / This-Week comparison row.
"use client";

import * as React from "react";
import { MotionConfig, motion } from "framer-motion";
import { toast } from "sonner";
import {
  Trophy, RefreshCw, Users, Clock, AlertTriangle, Bot, CheckCircle2,
  TrendingUp, FileDown, Sparkles, Mail,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip,
  XAxis, YAxis,
} from "recharts";

import { api } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";

// ── Types matching /api/coordinator-metrics contract ────────────────────────
interface CoordinatorMetrics {
  patientsManaged: number;
  timePerPatientMin: number;
  missedFollowups: number;
  aiFlaggedDeteriorations: number;
  escalationsResolvedWithinSla: number | null;
  patientResponseRate: number | null;
  answeredCheckins: number;
  scheduledCheckins: number;
  escalationsResolved: number;
  escalationsTotal: number;
}

interface CoordinatorRow {
  userId: string;
  name: string;
  email: string;
  role: string;
  metrics: CoordinatorMetrics;
}

interface BeforeOjasBaseline {
  readmissionRate: number;
  responseRate: number;
  missedFollowupRate: number;
}

interface CoordinatorMetricsResponse {
  coordinators: CoordinatorRow[];
  weekStart: string;
  weekEnd: string;
  beforeOjasBaseline: BeforeOjasBaseline;
}

const EMERALD = "oklch(0.62 0.14 165)";
const MUTED = "oklch(0.65 0.02 250)";

function roleLabel(role: string): string {
  switch (role) {
    case "HOSPITAL_ADMIN": return "Admin";
    case "COORDINATOR": return "Coordinator";
    case "DOCTOR": return "Doctor";
    default: return role.replace("_", " ").toLowerCase();
  }
}

function initials(name: string): string {
  return name.split(" ").map((n) => n[0]).filter(Boolean).slice(0, 2).join("").toUpperCase() || "?";
}

function formatDateShort(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

// ── PDF Export ────────────────────────────────────────────────────────────────
function exportCoordinatorPdf(
  data: CoordinatorMetricsResponse | null,
  averages: { responseRate: number | null; slaRate: number | null; totalPatients: number; totalAiFlags: number } | null,
): void {
  if (!data) {
    toast.error("No data to export");
    return;
  }

  const w = window.open("", "_blank");
  if (!w) return;

  const weekRange = `${formatDateShort(data.weekStart)} – ${formatDateShort(data.weekEnd)}`;

  const coordinatorRows = data.coordinators.map((c) => {
    const m = c.metrics;
    const responseRate = m.patientResponseRate !== null ? `${m.patientResponseRate}%` : "—";
    const slaRate = m.escalationsResolvedWithinSla !== null ? `${m.escalationsResolvedWithinSla}%` : "—";
    return `
    <tr>
      <td style="padding:6px 10px;border:1px solid #ddd;font-weight:500;">${c.name}</td>
      <td style="padding:6px 10px;border:1px solid #ddd;text-align:center;">${m.patientsManaged}</td>
      <td style="padding:6px 10px;border:1px solid #ddd;text-align:center;">${m.timePerPatientMin} min</td>
      <td style="padding:6px 10px;border:1px solid #ddd;text-align:center;">${m.aiFlaggedDeteriorations}</td>
      <td style="padding:6px 10px;border:1px solid #ddd;text-align:center;">${m.escalationsResolved}</td>
      <td style="padding:6px 10px;border:1px solid #ddd;text-align:center;">${slaRate}</td>
      <td style="padding:6px 10px;border:1px solid #ddd;text-align:center;">${responseRate}</td>
    </tr>`;
  }).join("");

  const comparisonRows = [
    {
      label: "Response rate",
      before: Math.round(data.beforeOjasBaseline.responseRate * 1000) / 10,
      now: averages?.responseRate ?? 0,
    },
    {
      label: "Missed follow-ups",
      before: Math.round(data.beforeOjasBaseline.missedFollowupRate * 1000) / 10,
      now: data.coordinators.reduce((s, c) => s + c.metrics.missedFollowups, 0),
    },
    {
      label: "AI deteriorations caught",
      before: 0,
      now: averages?.totalAiFlags ?? 0,
    },
  ].map((r) => `
    <tr>
      <td style="padding:6px 10px;border:1px solid #ddd;">${r.label}</td>
      <td style="padding:6px 10px;border:1px solid #ddd;text-align:center;">${r.before}</td>
      <td style="padding:6px 10px;border:1px solid #ddd;text-align:center;font-weight:600;color:#16a34a;">${r.now}</td>
    </tr>`).join("");

  w.document.write(`<!DOCTYPE html><html><head><title>Coordinator Success Report</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;margin:32px;color:#111;background:#fff;}
  h1{font-size:20px;margin:0 0 4px;}
  h2{font-size:15px;margin:20px 0 8px;color:#555;}
  .meta{font-size:12px;color:#666;margin-bottom:16px;}
  .kpi{display:inline-block;padding:8px 16px;border-radius:8px;margin-right:12px;margin-bottom:8px;background:#f0fdf4;border:1px solid #bbf7d0;}
  .kpi-label{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#666;}
  .kpi-value{font-size:22px;font-weight:700;}
  table{border-collapse:collapse;width:100%;margin-bottom:16px;font-size:12px;}
  th{background:#f5f5f5;padding:6px 10px;border:1px solid #ddd;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.04em;}
  @media print{body{margin:16px;}h1{font-size:16px;}}
</style></head><body>
<h1>Coordinator Success Metrics</h1>
<div class="meta">Last 7 days · ${weekRange}</div>

<div style="margin-bottom:20px;">
  <div class="kpi"><div class="kpi-label">Total Patients Managed</div><div class="kpi-value">${averages?.totalPatients ?? 0}</div></div>
  <div class="kpi"><div class="kpi-label">AI Deteriorations Caught</div><div class="kpi-value">${averages?.totalAiFlags ?? 0}</div></div>
  <div class="kpi"><div class="kpi-label">Avg Response Rate</div><div class="kpi-value">${averages?.responseRate ?? "—"}%</div></div>
  <div class="kpi"><div class="kpi-label">Avg SLA Compliance</div><div class="kpi-value">${averages?.slaRate ?? "—"}%</div></div>
</div>

<h2>Before Ojas vs This Week</h2>
<table>
  <tr><th>Metric</th><th>Before Ojas</th><th>This Week</th></tr>
  ${comparisonRows}
</table>

<h2>Per-Coordinator Impact</h2>
<table>
  <tr><th>Coordinator</th><th>Patients</th><th>Time/Patient</th><th>AI Flags</th><th>Esc. Resolved</th><th>SLA &lt; 24h</th><th>Response Rate</th></tr>
  ${coordinatorRows}
</table>

<div style="margin-top:24px;font-size:10px;color:#999;border-top:1px solid #eee;padding-top:8px;">
  Auto-generated by Ojas Post-Discharge Care Platform · ${new Date().toISOString()}
</div>
</body></html>`);
  w.document.close();
  w.print();
}

// ── Page ────────────────────────────────────────────────────────────────────
export function CoordinatorSuccessPage() {
  const [data, setData] = React.useState<CoordinatorMetricsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<CoordinatorMetricsResponse>("/api/coordinator-metrics");
      setData(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load coordinator metrics");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  // Hospital-wide averages for the comparison row.
  const averages = React.useMemo(() => {
    if (!data || data.coordinators.length === 0) return null;
    const cs = data.coordinators;
    const sumResponse = cs
      .filter((c) => c.metrics.patientResponseRate !== null)
      .reduce((s, c) => s + (c.metrics.patientResponseRate ?? 0), 0);
    const nResponse = cs.filter((c) => c.metrics.patientResponseRate !== null).length;
    const sumSla = cs
      .filter((c) => c.metrics.escalationsResolvedWithinSla !== null)
      .reduce((s, c) => s + (c.metrics.escalationsResolvedWithinSla ?? 0), 0);
    const nSla = cs.filter((c) => c.metrics.escalationsResolvedWithinSla !== null).length;
    const totalPatients = cs.reduce((s, c) => s + c.metrics.patientsManaged, 0);
    const totalAiFlags = cs.reduce((s, c) => s + c.metrics.aiFlaggedDeteriorations, 0);
    return {
      responseRate: nResponse > 0 ? Math.round((sumResponse / nResponse) * 10) / 10 : null,
      slaRate: nSla > 0 ? Math.round((sumSla / nSla) * 10) / 10 : null,
      totalPatients,
      totalAiFlags,
    };
  }, [data]);

  // Comparison chart data — Before Ojas vs This Week for response rate.
  const comparisonData = React.useMemo(() => {
    if (!data || !averages) return [];
    return [
      {
        label: "Response rate",
        before: Math.round(data.beforeOjasBaseline.responseRate * 1000) / 10,
        now: averages.responseRate ?? 0,
      },
      {
        label: "Missed follow-ups",
        before: Math.round(data.beforeOjasBaseline.missedFollowupRate * 1000) / 10,
        now: data.coordinators.reduce((s, c) => s + c.metrics.missedFollowups, 0),
      },
      {
        label: "AI deteriorations caught",
        before: 0,
        now: averages.totalAiFlags,
      },
    ];
  }, [data, averages]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-6">
        {/* Header */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        >
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight flex items-center gap-2">
              <Trophy className="h-6 w-6 text-primary" />
              Coordinator success metrics
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Last 7 days · {data ? `${formatDateShort(data.weekStart)} – ${formatDateShort(data.weekEnd)}` : "Loading…"}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4 mr-1.5", loading && "animate-spin")} />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => exportCoordinatorPdf(data, averages)}
            >
              <FileDown className="h-4 w-4 mr-1.5" />
              Export PDF
            </Button>
          </div>
        </motion.section>

        {/* Comparison row — Before Ojas vs This Week */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.06 }}
        >
          <Card className="glass">
            <CardHeader className="border-b border-border">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                Before Ojas vs this week
              </CardTitle>
              <CardDescription>
                Hospital-wide comparison. Lower is better for missed follow-ups; higher is better for response rate and AI deteriorations caught.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              {loading ? (
                <Skeleton className="h-56 w-full" />
              ) : comparisonData.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <TrendingUp className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">No data yet</p>
                </div>
              ) : (
                <div className="h-56 w-full fancy-scroll">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={comparisonData}
                      margin={{ top: 8, right: 16, bottom: 4, left: -16 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.62 0.14 165 / 0.12)" />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                        tickLine={false}
                        axisLine={false}
                        width={36}
                      />
                      <Tooltip
                        cursor={{ fill: "oklch(0.62 0.14 165 / 0.06)" }}
                        contentStyle={{
                          background: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        labelStyle={{ fontSize: 11, color: "var(--muted-foreground)" }}
                      />
                      <Bar dataKey="before" name="Before Ojas" fill={MUTED} radius={[4, 4, 0, 0]} />
                      <Bar dataKey="now" name="This week" fill={EMERALD} radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.section>

        {/* Coordinator cards */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
              Per-coordinator impact
            </h2>
            {data && (
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                {data.coordinators.length} {data.coordinators.length === 1 ? "coordinator" : "coordinators"}
              </Badge>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-64 w-full" />
              ))}
            </div>
          ) : !data || data.coordinators.length === 0 ? (
            <Card className="glass">
              <CardContent className="flex flex-col items-center justify-center text-center py-16 px-6">
                <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                  <Users className="h-6 w-6 text-primary" />
                </div>
                <p className="text-sm font-medium">No coordinators yet</p>
                <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                  Coordinator impact metrics will appear here once your team starts managing patients.
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {data.coordinators.map((c, i) => (
                <CoordinatorCard key={c.userId} c={c} delay={i * 0.06} />
              ))}
            </div>
          )}
        </section>
      </div>
    </MotionConfig>
  );
}

// ── Coordinator card ────────────────────────────────────────────────────────
function CoordinatorCard({ c, delay }: { c: CoordinatorRow; delay: number }) {
  const m = c.metrics;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
    >
      <Card className="glass h-full hover:glow-primary transition-shadow">
        <CardHeader className="border-b border-border pb-3">
          <div className="flex items-start gap-3">
            <Avatar className="h-10 w-10 ring-1 ring-border">
              <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                {initials(c.name)}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <CardTitle className="text-base truncate">{c.name}</CardTitle>
              <div className="flex items-center gap-2 mt-0.5">
                <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                  {roleLabel(c.role)}
                </Badge>
                <span className="text-[11px] text-muted-foreground flex items-center gap-1 truncate">
                  <Mail className="h-3 w-3" />
                  <span className="truncate">{c.email}</span>
                </span>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-4">
          <div className="grid grid-cols-2 gap-3">
            <MetricCell
              icon={Users}
              label="Patients managed"
              value={String(m.patientsManaged)}
              tone="neutral"
            />
            <MetricCell
              icon={Clock}
              label="Time per patient"
              value={m.patientsManaged > 0 ? `${m.timePerPatientMin} min` : "—"}
              helper={`~${m.answeredCheckins} answered check-ins × 3 min`}
              tone="good"
            />
            <MetricCell
              icon={AlertTriangle}
              label="Missed follow-ups"
              value={String(m.missedFollowups)}
              tone={m.missedFollowups > 0 ? "warn" : "good"}
            />
            <MetricCell
              icon={Bot}
              label="AI deteriorations caught"
              value={String(m.aiFlaggedDeteriorations)}
              tone={m.aiFlaggedDeteriorations > 0 ? "good" : "neutral"}
            />
            <MetricCell
              icon={CheckCircle2}
              label="Esc. resolved < 24h"
              value={m.escalationsResolvedWithinSla !== null ? `${m.escalationsResolvedWithinSla}%` : "—"}
              helper={`${m.escalationsResolved}/${m.escalationsTotal} resolved`}
              tone={
                m.escalationsResolvedWithinSla === null ? "neutral"
                : m.escalationsResolvedWithinSla >= 80 ? "good"
                : m.escalationsResolvedWithinSla >= 50 ? "warn" : "bad"
              }
            />
            <MetricCell
              icon={TrendingUp}
              label="Patient response rate"
              value={m.patientResponseRate !== null ? `${m.patientResponseRate}%` : "—"}
              helper={`${m.answeredCheckins}/${m.scheduledCheckins} check-ins`}
              tone={
                m.patientResponseRate === null ? "neutral"
                : m.patientResponseRate >= 70 ? "good"
                : m.patientResponseRate >= 50 ? "warn" : "bad"
              }
            />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ── Metric cell ─────────────────────────────────────────────────────────────
function MetricCell({
  icon: Icon, label, value, helper, tone = "neutral",
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  helper?: string;
  tone?: "neutral" | "good" | "warn" | "bad";
}) {
  const toneClass = {
    neutral: "bg-muted/60 text-foreground",
    good: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    warn: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    bad: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  }[tone];
  return (
    <div className="rounded-lg border border-border/70 p-3 bg-card/50">
      <div className="flex items-center gap-1.5 mb-1.5">
        <span className={cn("flex items-center justify-center h-6 w-6 rounded-md", toneClass)}>
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider truncate">
          {label}
        </span>
      </div>
      <div className="text-xl font-semibold tabular-nums">{value}</div>
      {helper && (
        <div className="text-[10px] text-muted-foreground mt-0.5 truncate">{helper}</div>
      )}
    </div>
  );
}
