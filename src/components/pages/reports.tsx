"use client";

import * as React from "react";
import { MotionConfig, motion } from "framer-motion";
import { toast } from "sonner";
import {
  FileBarChart, Printer, Bot, AlertTriangle, Activity, PhoneCall,
  Users, CheckSquare, XSquare, ShieldCheck, Sparkles, TrendingUp,
  Stethoscope, PieChart as PieChartIcon, Download, Loader2,
} from "lucide-react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ComposedChart,
  Legend, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { api } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tabs, TabsList, TabsTrigger,
} from "@/components/ui/tabs";

// ── Types matching /api/reports contract ────────────────────────────────────
interface Totals {
  patients: number;
  checkinsScheduled: number;
  checkinsAnswered: number;
  checkinsMissed: number;
  escalations: number;
  escalationsResolved: number;
  escalationsCritical: number;
  aiCalls: number;
  aiFallbacks: number;
  aiTokensOut: number;
}

interface Rates {
  feedbackRate: number | null;
  earlyFollowUpRate: number | null;
  readmissionRate: number | null;
  insufficientDataFlags: {
    feedbackRate: boolean;
    earlyFollowUpRate: boolean;
    readmissionRate: boolean;
  };
}

interface PainPoint { day: string; avgPain: number; count?: number }

interface SeverityDist {
  LOW: number;
  MEDIUM: number;
  HIGH: number;
  CRITICAL: number;
}

interface NabhIndicator {
  value: number | null;
  chapter: string;
  requirement?: string;
  standard?: string;
}

interface Nabh {
  postDischargeFollowupCoverage: NabhIndicator;
  escalationResolutionRate: NabhIndicator;
  criticalEscalationCount: NabhIndicator;
}

type PatientStatus =
  | "ENROLLED"
  | "ACTIVE"
  | "RECOVERED"
  | "READMITTED"
  | "LOST_TO_FOLLOWUP";

interface SurgeryTypeRow {
  surgery: string;
  count: number;
}

interface PatientStatusDist {
  ENROLLED: number;
  ACTIVE: number;
  RECOVERED: number;
  READMITTED: number;
  LOST_TO_FOLLOWUP: number;
}

interface EscalationTrendPoint {
  date: string;
  count: number;
}

interface CheckinTrendPoint {
  date: string;
  answered: number;
  total: number;
}

interface ReportsResponse {
  window: { days: number; since: string; until: string };
  totals: Totals;
  rates: Rates;
  painTrend: PainPoint[];
  severityDistribution: SeverityDist;
  nabhIndicators: Nabh;
  surgeryTypeDistribution: SurgeryTypeRow[];
  patientStatusDistribution: PatientStatusDist;
  escalationTrend: EscalationTrendPoint[];
  checkinTrend: CheckinTrendPoint[];
}

// Severity bar colors — map to the risk-* utility palettes via inline oklch.
// (recharts <Cell> can't take a class; we approximate the palette with oklch
// values that match the risk-* tokens in globals.css.)
const SEVERITY_BAR_COLOR: Record<keyof SeverityDist, string> = {
  LOW: "oklch(0.62 0.14 165)",      // emerald
  MEDIUM: "oklch(0.78 0.14 75)",    // amber
  HIGH: "oklch(0.9 0.12 45)",       // warm orange
  CRITICAL: "oklch(0.58 0.22 25)",  // rose (reserved for critical)
};

// Surgery-type palette — emerald/teal family, varied lightness for visual
// separation between slices/bars. Used by the surgery distribution chart.
const SURGERY_PALETTE = [
  "oklch(0.62 0.14 165)",  // emerald (primary)
  "oklch(0.55 0.13 180)",  // teal
  "oklch(0.68 0.12 155)",  // mint
  "oklch(0.58 0.12 195)",  // sea green
  "oklch(0.72 0.13 170)",  // light emerald
  "oklch(0.60 0.14 185)",  // teal-emerald
  "oklch(0.65 0.11 145)",  // spring green
  "oklch(0.70 0.12 200)",  // sky-teal
];

// Patient-status colors per spec:
//   ENROLLED=primary(teal), ACTIVE=emerald, RECOVERED=muted/gray,
//   READMITTED=rose (reserved for critical), LOST_TO_FOLLOWUP=amber.
const STATUS_COLORS: Record<PatientStatus, string> = {
  ENROLLED: "oklch(0.60 0.13 195)",       // teal (primary)
  ACTIVE: "oklch(0.62 0.14 165)",         // emerald
  RECOVERED: "oklch(0.65 0.02 250)",      // muted slate
  READMITTED: "oklch(0.58 0.22 25)",      // rose
  LOST_TO_FOLLOWUP: "oklch(0.78 0.14 75)", // amber
};

const STATUS_LABELS: Record<PatientStatus, string> = {
  ENROLLED: "Enrolled",
  ACTIVE: "Active",
  RECOVERED: "Recovered",
  READMITTED: "Readmitted",
  LOST_TO_FOLLOWUP: "Lost to follow-up",
};

// ── Page ────────────────────────────────────────────────────────────────────
export function ReportsPage() {
  const [days, setDays] = React.useState<30 | 60 | 90>(30);
  const [data, setData] = React.useState<ReportsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [exportingCsv, setExportingCsv] = React.useState(false);

  const load = React.useCallback(async (d: number) => {
    setLoading(true);
    try {
      const r = await api<ReportsResponse>(`/api/reports?days=${d}`);
      setData(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load reports");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load(days);
  }, [days, load]);

  const handleExport = () => {
    toast("PDF export requires a real PDF provider", {
      description:
        "This dev build prints the report. Use your browser's print dialog.",
    });
    // Honest — no fake PDF generation. Hand off to the browser.
    setTimeout(() => window.print(), 250);
  };

  // CSV export hits a separate endpoint that returns text/csv (not JSON), so we
  // bypass api() and fetch directly with credentials, then trigger a download
  // via a Blob + object URL. The server sets a Content-Disposition filename.
  const handleExportCsv = React.useCallback(async () => {
    setExportingCsv(true);
    try {
      const res = await fetch(`/api/reports/export?days=${days}`, {
        credentials: "include",
      });
      if (!res.ok) {
        // Try to surface a JSON error message, fall back to status text.
        const errBody = await res.json().catch(() => ({}));
        throw new Error(
          (errBody as { error?: string }).error || `Export failed (${res.status})`
        );
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      // Prefer the server-supplied filename; fall back to a sensible default.
      const disp = res.headers.get("content-disposition") || "";
      const match = disp.match(/filename="?([^";]+)"?/i);
      a.download = match ? match[1] : `ojas-report-${days}d.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("CSV exported", {
        description: `${days}-day report downloaded as a CSV file.`,
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to export CSV");
    } finally {
      setExportingCsv(false);
    }
  }, [days]);

  const severityData: { name: keyof SeverityDist; count: number; fill: string }[] = React.useMemo(() => {
    if (!data?.severityDistribution) return [];
    return (Object.keys(data.severityDistribution) as (keyof SeverityDist)[]).map((k) => ({
      name: k,
      count: data.severityDistribution[k],
      fill: SEVERITY_BAR_COLOR[k],
    }));
  }, [data?.severityDistribution]);

  // Surgery-type distribution rows (top 8 from API). Null/blank surgery types
  // are labeled "Unspecified" so the counts still surface honestly.
  const surgeryData = React.useMemo(() => {
    if (!data?.surgeryTypeDistribution) return [];
    return data.surgeryTypeDistribution.map((r) => ({
      surgery: r.surgery && r.surgery.trim() ? r.surgery : "Unspecified",
      count: r.count,
    }));
  }, [data?.surgeryTypeDistribution]);

  // Patient-status donut data. Order is fixed so colors/legend are stable.
  const statusData = React.useMemo(() => {
    if (!data?.patientStatusDistribution) return [];
    const order: PatientStatus[] = [
      "ENROLLED", "ACTIVE", "RECOVERED", "READMITTED", "LOST_TO_FOLLOWUP",
    ];
    return order.map((k) => ({
      key: k,
      name: STATUS_LABELS[k],
      count: data.patientStatusDistribution[k],
      fill: STATUS_COLORS[k],
    }));
  }, [data?.patientStatusDistribution]);

  const totalPatients = statusData.reduce((s, d) => s + d.count, 0);

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-6">
        {/* Header */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 print:items-start"
        >
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight flex items-center gap-2">
              <FileBarChart className="h-6 w-6 text-primary" />
              Compliance reports
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              NABH-aligned metrics, computed from real check-in and escalation records.
            </p>
          </div>
          <div className="flex items-center gap-2 print:hidden">
            <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v) as 30 | 60 | 90)}>
              <TabsList>
                <TabsTrigger value="30">30d</TabsTrigger>
                <TabsTrigger value="60">60d</TabsTrigger>
                <TabsTrigger value="90">90d</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="outline" onClick={handleExport}>
              <Printer className="h-4 w-4" /> Export PDF
            </Button>
            <Button
              variant="outline"
              onClick={handleExportCsv}
              disabled={exportingCsv || loading}
            >
              {exportingCsv ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Export CSV
            </Button>
          </div>
        </motion.section>

        {/* KPI grid */}
        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
          <KpiCard label="Patients" value={data?.totals.patients} icon={Users} loading={loading} delay={0} />
          <KpiCard label="Check-ins scheduled" value={data?.totals.checkinsScheduled} icon={CheckSquare} loading={loading} delay={0.04} />
          <KpiCard label="Check-ins answered" value={data?.totals.checkinsAnswered} icon={PhoneCall} loading={loading} delay={0.08} />
          <KpiCard label="Check-ins missed" value={data?.totals.checkinsMissed} icon={XSquare} loading={loading} delay={0.12} />
          <KpiCard label="Open escalations" value={data?.totals.escalations} icon={AlertTriangle} loading={loading} delay={0.16} />
          <KpiCard label="Critical escalations" value={data?.totals.escalationsCritical} icon={AlertTriangle} loading={loading} delay={0.2} critical />
        </section>

        {/* Rates */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.25 }}
        >
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Rates
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
            <RateCard
              title="Feedback rate"
              value={data?.rates.feedbackRate}
              insufficient={data?.rates.insufficientDataFlags.feedbackRate}
              helper="Answered check-ins as a share of all scheduled check-ins."
              loading={loading}
            />
            <RateCard
              title="Early follow-up rate"
              value={data?.rates.earlyFollowUpRate}
              insufficient={data?.rates.insufficientDataFlags.earlyFollowUpRate}
              helper="Share of answered check-ins responded to within 36 hours of schedule."
              loading={loading}
            />
            <RateCard
              title="Readmission rate"
              value={data?.rates.readmissionRate}
              insufficient={data?.rates.insufficientDataFlags.readmissionRate}
              helper="Readmitted patients as a share of total patients."
              loading={loading}
            />
          </div>
        </motion.section>

        {/* Charts */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          {/* Pain trend */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.3 }}
          >
            <Card className="glass h-full">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Activity className="h-4 w-4 text-primary" />
                  Average reported pain (0-10)
                </CardTitle>
                <CardDescription>
                  From answered check-ins over the last {days} days.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                {loading ? (
                  <Skeleton className="h-56 w-full" />
                ) : !data?.painTrend || data.painTrend.length === 0 ? (
                  <div className="text-xs text-muted-foreground italic py-12 text-center">
                    No answered check-ins in this window.
                  </div>
                ) : (
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={data.painTrend} margin={{ top: 8, right: 12, bottom: 4, left: -16 }}>
                        <defs>
                          <linearGradient id="painArea" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="oklch(0.62 0.14 165)" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="oklch(0.62 0.14 165)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.62 0.14 165 / 0.12)" />
                        <XAxis
                          dataKey="day"
                          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                          tickLine={false}
                          axisLine={false}
                          minTickGap={16}
                        />
                        <YAxis
                          domain={[0, 10]}
                          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                          tickLine={false}
                          axisLine={false}
                          width={28}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "var(--popover)",
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                          labelStyle={{ fontSize: 11, color: "var(--muted-foreground)" }}
                          formatter={(v: number) => [v, "Avg pain"]}
                        />
                        <Area
                          type="monotone"
                          dataKey="avgPain"
                          stroke="oklch(0.62 0.14 165)"
                          strokeWidth={2}
                          fill="url(#painArea)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Severity distribution */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.35 }}
          >
            <Card className="glass h-full">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2 text-base">
                  <AlertTriangle className="h-4 w-4 text-primary" />
                  Escalation severity distribution
                </CardTitle>
                <CardDescription>
                  All escalations created in the last {days} days.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                {loading ? (
                  <Skeleton className="h-56 w-full" />
                ) : severityData.length === 0 ||
                  severityData.every((s) => s.count === 0) ? (
                  <div className="text-xs text-muted-foreground italic py-12 text-center">
                    No escalations in this window.
                  </div>
                ) : (
                  <div className="h-56 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={severityData}
                        margin={{ top: 8, right: 12, bottom: 4, left: -16 }}
                      >
                        <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.62 0.14 165 / 0.12)" vertical={false} />
                        <XAxis
                          dataKey="name"
                          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                          tickLine={false}
                          axisLine={false}
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
                          formatter={(v: number) => [v, "Escalations"]}
                        />
                        <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                          {severityData.map((entry) => (
                            <Cell key={entry.name} fill={entry.fill} />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </section>

        {/* NABH summary + AI usage */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.4 }}
          >
            <Card className="glass-strong border-primary/30 h-full">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldCheck className="h-4 w-4 text-primary" />
                  NABH compliance summary
                </CardTitle>
                <CardDescription>
                  Last {days} days. Every figure is computed from real records.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {loading ? (
                  <div className="space-y-2">
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ) : (
                  <>
                    <NabhRow
                      label="Post-discharge follow-up coverage"
                      value={data?.nabhIndicators?.postDischargeFollowupCoverage?.value}
                      suffix="%"
                    />
                    <NabhRow
                      label="Escalation resolution rate"
                      value={data?.nabhIndicators?.escalationResolutionRate?.value}
                      suffix="%"
                    />
                    <NabhRow
                      label="Critical escalation count"
                      value={data?.nabhIndicators?.criticalEscalationCount?.value}
                    />
                    <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">
                      NABH-aligned metrics. Every figure is computed from real check-in and escalation records.
                      &apos;Insufficient data&apos; is shown where sample size &lt; 5.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.45 }}
          >
            <Card className="glass h-full">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Bot className="h-4 w-4 text-primary" />
                  AI usage summary
                </CardTitle>
                <CardDescription>
                  Metered from logged agent runs over the last {days} days.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4 space-y-3">
                {loading ? (
                  <div className="grid grid-cols-3 gap-3">
                    <Skeleton className="h-16" />
                    <Skeleton className="h-16" />
                    <Skeleton className="h-16" />
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-3">
                      <UsageCell label="AI calls" value={data?.totals.aiCalls} icon={Bot} />
                      <UsageCell
                        label="AI fallbacks"
                        value={data?.totals.aiFallbacks}
                        icon={Sparkles}
                        suffix={
                          data && data.totals.aiCalls > 0
                            ? ` (${Math.round((data.totals.aiFallbacks / data.totals.aiCalls) * 100)}%)`
                            : ""
                        }
                      />
                      <UsageCell
                        label="Tokens out"
                        value={data?.totals.aiTokensOut}
                        icon={TrendingUp}
                      />
                    </div>
                    <p className="text-[11px] text-muted-foreground leading-relaxed pt-1">
                      AI usage is metered from real logged agent runs (ai_agent_runs).
                      Fallbacks are calls where the AI provider was unavailable and a rule-based
                      summary was used instead — honestly labeled in every run.
                    </p>
                  </>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </section>

        {/* Trends & distribution — 4 new charts (Task 11-b) */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.5 }}
        >
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Trends &amp; distribution
          </h2>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            {/* Surgery type distribution */}
            <Card className="glass h-full">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Stethoscope className="h-4 w-4 text-primary" />
                  Patient distribution by surgery type
                </CardTitle>
                <CardDescription>
                  Top 8 surgery types by patient count, all-time.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                {loading ? (
                  <Skeleton className="h-60 w-full" />
                ) : surgeryData.length === 0 ? (
                  <div className="text-xs text-muted-foreground italic py-16 text-center">
                    No patients yet.
                  </div>
                ) : (
                  <div className="h-60 w-full fancy-scroll">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={surgeryData}
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
                          width={112}
                          tickFormatter={(v: string) => truncateLabel(v, 16)}
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
                          formatter={(v: number) => [v, "Patients"]}
                        />
                        <Bar dataKey="count" radius={[0, 6, 6, 0]}>
                          {surgeryData.map((entry, i) => (
                            <Cell
                              key={entry.surgery}
                              fill={SURGERY_PALETTE[i % SURGERY_PALETTE.length]}
                            />
                          ))}
                        </Bar>
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Patient status breakdown (donut) */}
            <Card className="glass h-full">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2 text-base">
                  <PieChartIcon className="h-4 w-4 text-primary" />
                  Patient status breakdown
                </CardTitle>
                <CardDescription>
                  All patients grouped by current care status.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                {loading ? (
                  <Skeleton className="h-60 w-full" />
                ) : statusData.length === 0 || totalPatients === 0 ? (
                  <div className="text-xs text-muted-foreground italic py-16 text-center">
                    No patients yet.
                  </div>
                ) : (
                  <div className="relative h-60 w-full fancy-scroll">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={statusData}
                          dataKey="count"
                          nameKey="name"
                          cx="50%"
                          cy="50%"
                          innerRadius={55}
                          outerRadius={85}
                          paddingAngle={2}
                          stroke="none"
                          isAnimationActive
                        >
                          {statusData.map((entry) => (
                            <Cell key={entry.key} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            background: "var(--popover)",
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                          labelStyle={{ fontSize: 11, color: "var(--muted-foreground)" }}
                          formatter={(v: number) => [v, "Patients"]}
                        />
                        <Legend
                          verticalAlign="bottom"
                          align="center"
                          iconType="circle"
                          height={36}
                          wrapperStyle={{ fontSize: 11, lineHeight: "18px" }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="pointer-events-none absolute left-1/2 top-[42%] -translate-x-1/2 -translate-y-1/2 text-center">
                      <span className="block text-2xl font-semibold tabular-nums">
                        {totalPatients}
                      </span>
                      <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
                        patients
                      </span>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Escalation trend */}
            <Card className="glass h-full">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2 text-base">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  Escalations over time
                </CardTitle>
                <CardDescription>
                  Daily escalation count over the last {days} days.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                {loading ? (
                  <Skeleton className="h-60 w-full" />
                ) : !data?.escalationTrend || data.escalationTrend.length === 0 ? (
                  <div className="text-xs text-muted-foreground italic py-16 text-center">
                    No escalations in this period.
                  </div>
                ) : (
                  <div className="h-60 w-full fancy-scroll">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart
                        data={data.escalationTrend}
                        margin={{ top: 8, right: 12, bottom: 4, left: -16 }}
                      >
                        <defs>
                          <linearGradient id="escArea" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="oklch(0.58 0.22 25)" stopOpacity={0.4} />
                            <stop offset="100%" stopColor="oklch(0.78 0.14 75)" stopOpacity={0.05} />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="oklch(0.62 0.14 165 / 0.12)"
                        />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                          tickLine={false}
                          axisLine={false}
                          minTickGap={16}
                          tickFormatter={formatDateShort}
                        />
                        <YAxis
                          allowDecimals={false}
                          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                          tickLine={false}
                          axisLine={false}
                          width={28}
                        />
                        <Tooltip
                          contentStyle={{
                            background: "var(--popover)",
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                          labelStyle={{ fontSize: 11, color: "var(--muted-foreground)" }}
                          formatter={(v: number) => [v, "Escalations"]}
                          labelFormatter={formatDateShort}
                        />
                        <Area
                          type="monotone"
                          dataKey="count"
                          stroke="oklch(0.58 0.22 25)"
                          strokeWidth={2}
                          fill="url(#escArea)"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Check-in response trend */}
            <Card className="glass h-full">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2 text-base">
                  <PhoneCall className="h-4 w-4 text-primary" />
                  Check-in response trend
                </CardTitle>
                <CardDescription>
                  Daily answered vs. total check-ins over the last {days} days.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                {loading ? (
                  <Skeleton className="h-60 w-full" />
                ) : !data?.checkinTrend || data.checkinTrend.length === 0 ? (
                  <div className="text-xs text-muted-foreground italic py-16 text-center">
                    No check-ins in this period.
                  </div>
                ) : (
                  <div className="h-60 w-full fancy-scroll">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart
                        data={data.checkinTrend}
                        margin={{ top: 8, right: 12, bottom: 4, left: -16 }}
                      >
                        <CartesianGrid
                          strokeDasharray="3 3"
                          stroke="oklch(0.62 0.14 165 / 0.12)"
                        />
                        <XAxis
                          dataKey="date"
                          tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                          tickLine={false}
                          axisLine={false}
                          minTickGap={16}
                          tickFormatter={formatDateShort}
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
                          labelFormatter={formatDateShort}
                        />
                        <Legend
                          verticalAlign="top"
                          align="right"
                          iconType="circle"
                          wrapperStyle={{ fontSize: 11, paddingBottom: 4 }}
                        />
                        <Bar
                          dataKey="total"
                          name="Total"
                          fill="oklch(0.65 0.02 250)"
                          radius={[4, 4, 0, 0]}
                        />
                        <Line
                          type="monotone"
                          dataKey="answered"
                          name="Answered"
                          stroke="oklch(0.62 0.14 165)"
                          strokeWidth={2.5}
                          dot={{ r: 3, fill: "oklch(0.62 0.14 165)" }}
                          activeDot={{ r: 4 }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </motion.section>
      </div>
    </MotionConfig>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function KpiCard({
  label, value, icon: Icon, loading, critical, delay,
}: {
  label: string;
  value: number | undefined;
  icon: React.ComponentType<{ className?: string }>;
  loading: boolean;
  critical?: boolean;
  delay: number;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
    >
      <Card className={cn("glass hover:glow-primary transition-shadow h-full", critical && value && value > 0 && "border-destructive/40")}>
        <CardContent className="p-3 md:p-4 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] md:text-[11px] font-medium text-muted-foreground uppercase tracking-wider leading-tight">
              {label}
            </span>
            <span className={cn(
              "flex items-center justify-center h-6 w-6 rounded-md",
              critical ? "bg-destructive/10 text-destructive" : "bg-primary/10 text-primary"
            )}>
              <Icon className="h-3 w-3" />
            </span>
          </div>
          {loading ? (
            <Skeleton className="h-7 w-12" />
          ) : (
            <span className={cn(
              "text-xl md:text-2xl font-semibold tabular-nums",
              critical && value && value > 0 && "text-destructive"
            )}>
              {value ?? 0}
            </span>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function RateCard({
  title, value, insufficient, helper, loading,
}: {
  title: string;
  value: number | null | undefined;
  insufficient: boolean | undefined;
  helper: string;
  loading: boolean;
}) {
  return (
    <Card className="glass h-full">
      <CardContent className="p-4 md:p-5">
        <p className="text-sm font-medium">{title}</p>
        {loading ? (
          <Skeleton className="h-9 w-24 mt-2" />
        ) : (
          <div className="mt-2 flex items-baseline gap-2">
            {insufficient || value === null || value === undefined ? (
              <Badge variant="outline" className="text-muted-foreground bg-muted/50">
                Insufficient data
              </Badge>
            ) : (
              <>
                <span className="text-3xl font-semibold tabular-nums">{value}%</span>
              </>
            )}
          </div>
        )}
        <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">{helper}</p>
      </CardContent>
    </Card>
  );
}

function NabhRow({
  label, value, suffix,
}: {
  label: string;
  value: number | null | undefined;
  suffix?: string;
}) {
  const insufficient = value === null || value === undefined;
  return (
    <div className="flex items-center justify-between gap-3 py-1.5 border-b border-border last:border-0">
      <span className="text-sm text-muted-foreground">{label}</span>
      {insufficient ? (
        <Badge variant="outline" className="text-muted-foreground bg-muted/50">
          Insufficient data
        </Badge>
      ) : (
        <span className="text-base font-semibold tabular-nums">
          {value}{suffix}
        </span>
      )}
    </div>
  );
}

function UsageCell({
  label, value, icon: Icon, suffix,
}: {
  label: string;
  value: number | undefined;
  icon: React.ComponentType<{ className?: string }>;
  suffix?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/60 p-3">
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3.5 w-3.5 text-primary" />
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="text-lg font-semibold tabular-nums">{value ?? 0}</span>
        {suffix && <span className="text-[10px] text-muted-foreground">{suffix}</span>}
      </div>
    </div>
  );
}

// Truncate long surgery-type names for the Y-axis tick labels so they don't
// overflow the chart's left gutter. Full name is still shown in the tooltip.
function truncateLabel(s: string, max = 16): string {
  if (!s) return "";
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

// Format ISO date strings (YYYY-MM-DD) as e.g. "Mar 5" for compact X-axis
// ticks and tooltip labels.
function formatDateShort(iso: string): string {
  if (!iso) return "";
  const d = new Date(iso + "T00:00:00");
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
