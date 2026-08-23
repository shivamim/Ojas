// Ojas — Readmission analytics page. Hospital admin view.
// Surfaces real readmission rates over time, by surgery type, and a recent
// readmissions list. All numbers from /api/readmission-analytics. Where the
// API flags insufficient sample size, we honestly show "Insufficient data".
"use client";

import * as React from "react";
import { MotionConfig, motion } from "framer-motion";
import { toast } from "sonner";
import {
  TrendingDown, Activity, Users, AlertCircle, ChevronRight,
  Hospital,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, ComposedChart, Legend, Line,
  ResponsiveContainer, Tooltip, XAxis, YAxis, Cell,
} from "recharts";

import { api } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { navigate } from "@/lib/router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs, TabsList, TabsTrigger,
} from "@/components/ui/tabs";
import {
  Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

// ── Types matching /api/readmission-analytics contract ──────────────────────
interface Summary {
  totalPatients: number;
  readmittedPatients: number;
  readmissionRate: number | null;
  insufficientData: boolean;
}

interface SurgeryRow {
  surgery: string;
  total: number;
  readmitted: number;
  rate: number | null;
}

interface WeeklyTrendPoint {
  weekStart: string;
  total: number;
  readmitted: number;
}

interface RecentReadmission {
  id: string;
  patientName: string | null;
  surgeryType: string | null;
  detail: string | null;
  occurredAt: string;
}

interface ReadmissionAnalyticsResponse {
  summary: Summary;
  bySurgeryType: SurgeryRow[];
  weeklyTrend: WeeklyTrendPoint[];
  recentReadmissions: RecentReadmission[];
}

// Rose (reserved for critical) for readmission bars/lines.
const ROSE = "oklch(0.58 0.22 25)";
const MUTED = "oklch(0.65 0.02 250)"; // muted slate for "total" bars

// ── Page ────────────────────────────────────────────────────────────────────
export function ReadmissionAnalyticsPage() {
  const [days, setDays] = React.useState<90 | 180 | 365>(90);
  const [data, setData] = React.useState<ReadmissionAnalyticsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async (d: number) => {
    setLoading(true);
    try {
      const r = await api<ReadmissionAnalyticsResponse>(`/api/readmission-analytics?days=${d}`);
      setData(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load analytics");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(days); }, [days, load]);

  // Surgery-type chart data — rate preferred, fall back to count when rate is null.
  const surgeryChartData = React.useMemo(() => {
    if (!data?.bySurgeryType) return [];
    return data.bySurgeryType.map((r) => ({
      surgery: r.surgery && r.surgery.trim() ? r.surgery : "Unspecified",
      rate: r.rate,        // may be null
      readmitted: r.readmitted,
      total: r.total,
      // value used for the bar height: rate when available, else raw readmitted count
      value: r.rate !== null ? r.rate : r.readmitted,
      useRate: r.rate !== null,
    }));
  }, [data?.bySurgeryType]);

  // Weekly trend chart data — reformat the weekStart ISO date to a compact label.
  const trendData = React.useMemo(() => {
    if (!data?.weeklyTrend) return [];
    return data.weeklyTrend.map((w) => ({
      ...w,
      label: formatDateShort(w.weekStart),
    }));
  }, [data?.weeklyTrend]);

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
              <TrendingDown className="h-6 w-6 text-primary" />
              Readmission analytics
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Readmission rates over time and by surgery type, computed from real patient records.
            </p>
          </div>
          <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v) as 90 | 180 | 365)}>
            <TabsList>
              <TabsTrigger value="90">90d</TabsTrigger>
              <TabsTrigger value="180">180d</TabsTrigger>
              <TabsTrigger value="365">1y</TabsTrigger>
            </TabsList>
          </Tabs>
        </motion.section>

        {/* Summary cards */}
        <section className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
          <SummaryCard
            label="Total patients"
            value={data?.summary.totalPatients}
            icon={Users}
            loading={loading}
            delay={0}
            helper="All patients enrolled at your hospital."
          />
          <SummaryCard
            label="Readmitted patients"
            value={data?.summary.readmittedPatients}
            icon={Activity}
            loading={loading}
            delay={0.06}
            helper="Patients currently marked as readmitted."
            tone="rose"
          />
          <SummaryCard
            label="Readmission rate"
            value={data?.summary.readmissionRate}
            insufficient={data?.summary.insufficientData}
            icon={TrendingDown}
            loading={loading}
            delay={0.12}
            helper="Readmitted as a share of total patients. Requires ≥ 5 patients."
            tone="rose"
            suffix="%"
          />
        </section>

        {/* Charts */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          {/* By surgery type */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.18 }}
          >
            <Card className="glass h-full">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Hospital className="h-4 w-4 text-primary" />
                  Readmission by surgery type
                </CardTitle>
                <CardDescription>
                  Rate where ≥ 3 patients (rose); otherwise readmitted count is shown.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                {loading ? (
                  <Skeleton className="h-72 w-full" />
                ) : surgeryChartData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <TrendingDown className="h-10 w-10 text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">No data yet</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">Data will appear here once available</p>
                  </div>
                ) : (
                  <div className="h-72 w-full fancy-scroll">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={surgeryChartData}
                        layout="vertical"
                        margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="oklch(0.62 0.14 165 / 0.12)"
                          horizontal={false}
                        />
                        <XAxis
                          type="number"
                          allowDecimals={false}
                          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          type="category"
                          dataKey="surgery"
                          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                          tickLine={false}
                          axisLine={false}
                          width={120}
                          tickFormatter={(v: string) => truncateLabel(v, 18)}
                        />
                        <Tooltip
                          cursor={{ fill: "oklch(0.58 0.22 25 / 0.06)" }}
                          contentStyle={{
                            background: "var(--popover)",
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                          labelStyle={{ fontSize: 11, color: "var(--muted-foreground)" }}
                          formatter={(_v: number, _n: string, item: { payload?: { useRate?: boolean; rate?: number | null; readmitted?: number; total?: number } }) => {
                            const p = item?.payload ?? {};
                            if (p.useRate) {
                              return [`${p.rate}% (${p.readmitted}/${p.total})`, "Readmission rate"];
                            }
                            return [`${p.readmitted} of ${p.total} (rate hidden, < 3 patients)`, "Readmitted"];
                          }}
                        />
                        <Bar dataKey="value" radius={[0, 6, 6, 0]}>
                          {surgeryChartData.map((entry, i) => (
                            <Cell key={i} fill={ROSE} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Weekly trend */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.24 }}
          >
            <Card className="glass h-full">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="h-4 w-4 text-primary" />
                  Weekly trend
                </CardTitle>
                <CardDescription>
                  New patients per week (muted) vs. readmissions per week (rose), over the last 12 weeks.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                {loading ? (
                  <Skeleton className="h-72 w-full" />
                ) : trendData.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <Activity className="h-10 w-10 text-muted-foreground/40 mb-3" />
                    <p className="text-sm text-muted-foreground">No data yet</p>
                    <p className="text-xs text-muted-foreground/70 mt-1">Data will appear here once available</p>
                  </div>
                ) : (
                  <div className="h-72 w-full fancy-scroll">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={trendData}
                        margin={{ top: 8, right: 12, bottom: 4, left: -16 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="oklch(0.62 0.14 165 / 0.12)"
                        />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                          tickLine={false}
                          axisLine={false}
                          minTickGap={16}
                        />
                        <YAxis
                          allowDecimals={false}
                          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                          tickLine={false}
                          axisLine={false}
                          width={28}
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
                          formatter={(v: number, n: string) => [v, n]}
                        />
                        <Legend
                          verticalAlign="top"
                          align="right"
                          iconType="circle"
                          wrapperStyle={{ fontSize: 11, paddingBottom: 4 }}
                        />
                        <Bar
                          dataKey="total"
                          name="Total patients"
                          fill={MUTED}
                          radius={[4, 4, 0, 0]}
                        />
                        <Line
                          type="monotone"
                          dataKey="readmitted"
                          name="Readmitted"
                          stroke={ROSE}
                          strokeWidth={2.5}
                          dot={{ r: 3, fill: ROSE }}
                          activeDot={{ r: 4 }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </section>

        {/* Recent readmissions list */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.32 }}
        >
          <Card className="glass">
            <CardHeader className="border-b border-border">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertCircle className="h-4 w-4 text-rose-500" />
                Recent readmissions
              </CardTitle>
              <CardDescription>
                Latest readmission events, newest first. Click a row to open the patient record.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : !data || data.recentReadmissions.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center py-16 px-6">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                    <Activity className="h-6 w-6 text-primary" />
                  </div>
                  <p className="text-sm font-medium">No readmissions recorded</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                    When a patient is marked as readmitted, they will appear here.
                  </p>
                </div>
              ) : (
                <ul className="divide-y divide-border">
                  {data.recentReadmissions.map((r) => (
                    <RecentReadmissionRow key={r.id} r={r} />
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </motion.section>
      </div>
    </MotionConfig>
  );
}

// ── Summary card ────────────────────────────────────────────────────────────
function SummaryCard({
  label, value, insufficient, icon: Icon, loading, delay, helper, tone, suffix,
}: {
  label: string;
  value: number | null | undefined;
  insufficient?: boolean;
  icon: React.ComponentType<{ className?: string }>;
  loading: boolean;
  delay: number;
  helper: string;
  tone?: "rose";
  suffix?: string;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
    >
      <Card
        className={cn(
          "glass h-full hover:glow-primary transition-shadow",
          tone === "rose" && value !== null && value !== undefined && value > 0 && "border-rose-500/40"
        )}
      >
        <CardContent className="p-4 md:p-5">
          <div className="flex items-center justify-between mb-2">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
              {label}
            </span>
            <span
              className={cn(
                "flex items-center justify-center h-7 w-7 rounded-md",
                tone === "rose"
                  ? "bg-rose-500/10 text-rose-500"
                  : "bg-primary/10 text-primary"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
          </div>
          {loading ? (
            <Skeleton className="h-9 w-24" />
          ) : insufficient || value === null || value === undefined ? (
            <Badge variant="outline" className="text-muted-foreground bg-muted/50">
              Insufficient data
            </Badge>
          ) : (
            <div className="flex items-baseline gap-1">
              <span
                className={cn(
                  "text-3xl font-semibold tabular-nums",
                  tone === "rose" && value > 0 && "text-rose-500"
                )}
              >
                {value}
              </span>
              {suffix && (
                <span className="text-sm text-muted-foreground">{suffix}</span>
              )}
            </div>
          )}
          <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">{helper}</p>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ── Recent readmission row ──────────────────────────────────────────────────
function RecentReadmissionRow({ r }: { r: RecentReadmission }) {
  // The readmission event payload is a SATISFACTION_SURVEY-like record; we
  // surface the detail text and a relative timestamp. Clicking opens the
  // patient detail view if we can resolve the patient via the detail text.
  // (The API returns a timeline event id, not a patientId — but the event
  // text usually contains the patient name, so we route to the timeline
  // filtered view if we can't resolve.)
  const handleClick = () => {
    // Best-effort: jump to the escalations/timeline list. The recent list
    // surfaces the patient name so the user can find them there.
    navigate("patients", { q: r.patientName ?? "" });
  };

  return (
    <li>
      <button
        onClick={handleClick}
        className="w-full text-left flex items-start gap-3 p-4 hover:bg-muted/40 transition-colors group"
      >
        <div className="flex-shrink-0 mt-0.5 h-8 w-8 rounded-full bg-rose-500/10 flex items-center justify-center">
          <AlertCircle className="h-4 w-4 text-rose-500" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="font-medium text-sm truncate">
              {r.patientName || "Unknown patient"}
            </span>
            <span className="text-[11px] text-muted-foreground tabular-nums whitespace-nowrap">
              {timeAgo(r.occurredAt)}
            </span>
          </div>
          {r.surgeryType && (
            <div className="text-xs text-muted-foreground mt-0.5">
              {r.surgeryType}
            </div>
          )}
          {r.detail && (
            <TooltipProvider delayDuration={200}>
              <UITooltip>
                <TooltipTrigger asChild>
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-1 italic cursor-help">
                    {r.detail}
                  </p>
                </TooltipTrigger>
                <TooltipContent side="top" className="max-w-xs">
                  <p className="text-xs leading-relaxed">{r.detail}</p>
                </TooltipContent>
              </UITooltip>
            </TooltipProvider>
          )}
        </div>
        <ChevronRight className="h-4 w-4 text-muted-foreground group-hover:text-foreground transition-colors flex-shrink-0 mt-2" />
      </button>
    </li>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function truncateLabel(s: string, max = 16): string {
  if (!s) return "";
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function formatDateShort(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function timeAgo(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  const diff = Date.now() - d.getTime();
  const sec = Math.floor(diff / 1000);
  if (sec < 60) return "just now";
  const min = Math.floor(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  const wk = Math.floor(day / 7);
  if (wk < 5) return `${wk}w ago`;
  const mo = Math.floor(day / 30);
  if (mo < 12) return `${mo}mo ago`;
  return `${Math.floor(day / 365)}y ago`;
}
