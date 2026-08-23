"use client";

// Ojas — Medication adherence page. Hospital admins / coordinators review
// patient-reported medication taking across answered check-ins. Charts the
// 14-day trend (taken vs missed) and lists per-patient adherence breakdowns.
import * as React from "react";
import { MotionConfig, motion } from "framer-motion";
import { toast } from "sonner";
import { formatDistanceToNow, parseISO } from "date-fns";
import {
  Pill, CheckCircle2, XCircle, Activity, TrendingUp,
  ChevronRight, ClipboardList, Info, Sparkles,
} from "lucide-react";
import {
  ComposedChart, Bar, Line, XAxis, YAxis, CartesianGrid,
  ResponsiveContainer, Tooltip as RTooltip, Legend,
} from "recharts";

import { api } from "@/lib/auth-context";
import { navigate } from "@/lib/router";
import { cn } from "@/lib/utils";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

// ── Types matching /api/medication-adherence contract ───────────────────────
interface AdherenceSummary {
  total: number;
  taken: number;
  missed: number;
  adherenceRate: number | null;
}

interface PatientAdherence {
  patientId: string;
  patientName: string;
  surgeryType: string;
  total: number;
  taken: number;
  missed: number;
  lastResponse: string | null;
  adherenceRate: number | null;
}

interface TrendPoint {
  date: string;
  taken: number;
  missed: number;
  rate: number | null;
}

interface AdherenceResponse {
  summary: AdherenceSummary;
  byPatient: PatientAdherence[];
  trend: TrendPoint[];
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function ago(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return formatDistanceToNow(parseISO(iso), { addSuffix: true }); } catch { return "—"; }
}

function shortDate(iso: string): string {
  try {
    const d = parseISO(iso);
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return iso;
  }
}

function rateColor(rate: number | null): string {
  if (rate == null) return "text-muted-foreground";
  if (rate >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (rate >= 50) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

function rateBarClass(rate: number | null): string {
  if (rate == null) return "[&>div]:bg-muted-foreground/50";
  if (rate >= 80) return "[&>div]:bg-emerald-500";
  if (rate >= 50) return "[&>div]:bg-amber-500";
  return "[&>div]:bg-rose-500";
}

function rowTint(rate: number | null): string {
  if (rate == null) return "hover:bg-muted/40";
  if (rate < 50) return "bg-rose-500/[0.06] hover:bg-rose-500/[0.1]";
  return "hover:bg-muted/40";
}

// ── Page ────────────────────────────────────────────────────────────────────
export function MedicationAdherencePage() {
  const [data, setData] = React.useState<AdherenceResponse | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<AdherenceResponse>("/api/medication-adherence");
      setData(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load medication adherence");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const summary = data?.summary;
  const trend = data?.trend ?? [];
  const byPatient = data?.byPatient ?? [];

  const hasData = !!summary && summary.total > 0;

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-6 md:space-y-8">
        {/* Header */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight flex items-center gap-2">
            <Pill className="h-6 w-6 md:h-7 md:w-7 text-primary" />
            Medication adherence
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Patient-reported medication taking across check-in responses.
          </p>
          <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 border border-border rounded-lg p-3 max-w-3xl">
            <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-primary" />
            <p>
              Adherence is captured when a coordinator logs a check-in response and answers
              &ldquo;did the patient take their medications?&rdquo;. Days with no responses are
              excluded from the rate calculation.
            </p>
          </div>
        </motion.section>

        {/* Summary cards */}
        <section className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
          <SummaryCard
            label="Total responses"
            value={summary?.total}
            icon={ClipboardList}
            loading={loading}
            delay={0}
          />
          <SummaryCard
            label="Taken"
            value={summary?.taken}
            icon={CheckCircle2}
            tint="emerald"
            loading={loading}
            delay={0.05}
          />
          <SummaryCard
            label="Missed"
            value={summary?.missed}
            icon={XCircle}
            tint="rose"
            loading={loading}
            delay={0.1}
          />
          <SummaryCard
            label="Adherence rate"
            value={summary?.adherenceRate ?? undefined}
            emptyValue="—"
            suffix="%"
            icon={TrendingUp}
            loading={loading}
            delay={0.15}
          />
        </section>

        {/* Trend chart */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <Card className="glass">
            <CardHeader className="border-b border-border">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4 text-primary" />
                14-day adherence trend
              </CardTitle>
              <CardDescription>
                Stacked daily counts of taken (emerald) and missed (rose) responses, with the daily
                adherence rate as a line.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 md:p-6">
              {loading ? (
                <Skeleton className="h-64 w-full" />
              ) : !hasData ? (
                <div className="flex flex-col items-center justify-center text-center py-12 px-4">
                  <span className="flex items-center justify-center h-12 w-12 rounded-full bg-muted text-muted-foreground mb-3">
                    <Activity className="h-6 w-6" />
                  </span>
                  <p className="text-sm font-medium">No responses in the last 14 days</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                    Once patients start answering the medication question during check-ins, the daily
                    trend will appear here.
                  </p>
                </div>
              ) : (
                <div className="h-[280px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={trend} margin={{ top: 8, right: 12, bottom: 4, left: -8 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis
                        dataKey="date"
                        tickFormatter={shortDate}
                        tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        yAxisId="count"
                        allowDecimals={false}
                        tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                        tickLine={false}
                        axisLine={false}
                        width={32}
                      />
                      <YAxis
                        yAxisId="rate"
                        orientation="right"
                        domain={[0, 100]}
                        tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                        tickLine={false}
                        axisLine={false}
                        width={32}
                        unit="%"
                      />
                      <RTooltip
                        cursor={{ fill: "var(--muted)", opacity: 0.4 }}
                        contentStyle={{
                          background: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        labelFormatter={(l) => shortDate(String(l))}
                        formatter={(v: number, n: string) => {
                          if (n === "rate") return [v == null ? "—" : `${v}%`, "Adherence"];
                          return [v, n.charAt(0).toUpperCase() + n.slice(1)];
                        }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 11 }}
                        formatter={(v) => v.charAt(0).toUpperCase() + v.slice(1)}
                      />
                      <Bar
                        yAxisId="count"
                        dataKey="taken"
                        stackId="resp"
                        fill="oklch(0.62 0.14 165)"
                        radius={[0, 0, 0, 0]}
                        maxBarSize={28}
                        name="taken"
                      />
                      <Bar
                        yAxisId="count"
                        dataKey="missed"
                        stackId="resp"
                        fill="oklch(0.62 0.22 25)"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={28}
                        name="missed"
                      />
                      <Line
                        yAxisId="rate"
                        type="monotone"
                        dataKey="rate"
                        stroke="oklch(0.58 0.16 220)"
                        strokeWidth={2}
                        dot={{ r: 2, fill: "oklch(0.58 0.16 220)" }}
                        activeDot={{ r: 4 }}
                        connectNulls
                        name="rate"
                      />
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.section>

        {/* Per-patient table */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
        >
          <Card className="glass">
            <CardHeader className="border-b border-border">
              <CardTitle className="flex items-center gap-2 text-base">
                <Pill className="h-4 w-4 text-primary" />
                Per-patient adherence
              </CardTitle>
              <CardDescription>
                Sorted by missed responses — highest first. Rows tinted rose below 50% adherence.
              </CardDescription>
              <CardAction>
                <Button size="sm" variant="outline" onClick={() => navigate("patients")}>
                  View all patients <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="p-3 md:p-4">
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : !hasData ? (
                <div className="flex flex-col items-center justify-center text-center py-12 px-4">
                  <span className="flex items-center justify-center h-12 w-12 rounded-full bg-muted text-muted-foreground mb-3">
                    <Pill className="h-6 w-6" />
                  </span>
                  <p className="text-sm font-medium">No medication adherence data yet</p>
                  <p className="text-xs text-muted-foreground mt-1 max-w-sm">
                    Ask &ldquo;did you take your meds?&rdquo; during check-in responses.
                  </p>
                </div>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="w-[22%]">Patient</TableHead>
                          <TableHead>Surgery</TableHead>
                          <TableHead className="text-center">Total</TableHead>
                          <TableHead className="text-center">Taken</TableHead>
                          <TableHead className="text-center">Missed</TableHead>
                          <TableHead className="w-[24%]">Adherence</TableHead>
                          <TableHead className="text-right">Last response</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {byPatient.map((p) => (
                          <PatientRow key={p.patientId} p={p} />
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile cards */}
                  <ul className="md:hidden space-y-2">
                    {byPatient.map((p) => (
                      <PatientCard key={p.patientId} p={p} />
                    ))}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>
        </motion.section>

        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 pt-1">
          <Sparkles className="h-3 w-3 text-primary" />
          Self-reported adherence is informational — confirm with the treating physician before clinical decisions.
        </p>
      </div>
    </MotionConfig>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────
function SummaryCard({
  label, value, hint, icon: Icon, loading, tint, emptyValue, suffix, delay,
}: {
  label: string;
  value: number | undefined;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  loading: boolean;
  tint?: "emerald" | "rose";
  emptyValue?: string;
  suffix?: string;
  delay: number;
}) {
  const tintCls =
    tint === "emerald"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : tint === "rose"
      ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
      : "bg-primary/10 text-primary";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
    >
      <Card className="glass hover:glow-primary transition-shadow h-full">
        <CardContent className="p-4 md:p-5 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] md:text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {label}
            </span>
            <span className={cn("flex items-center justify-center h-7 w-7 rounded-md", tintCls)}>
              <Icon className="h-3.5 w-3.5" />
            </span>
          </div>
          {loading ? (
            <Skeleton className="h-7 w-14" />
          ) : (
            <span className="text-2xl md:text-3xl font-semibold tabular-nums">
              {value !== undefined ? `${value}${suffix ?? ""}` : (emptyValue ?? "0")}
            </span>
          )}
          {hint && !loading && (
            <p className="text-[11px] text-muted-foreground">{hint}</p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function PatientRow({ p }: { p: PatientAdherence }) {
  return (
    <TableRow className={cn("transition-colors", rowTint(p.adherenceRate))}>
      <TableCell>
        <button
          onClick={() => navigate("patient-detail", { patientId: p.patientId })}
          className="text-left group"
        >
          <div className="text-sm font-medium group-hover:text-primary group-hover:underline underline-offset-2">
            {p.patientName}
          </div>
        </button>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{p.surgeryType}</TableCell>
      <TableCell className="text-center text-sm tabular-nums">{p.total}</TableCell>
      <TableCell className="text-center">
        <span className="text-sm font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
          {p.taken}
        </span>
      </TableCell>
      <TableCell className="text-center">
        <span className="text-sm font-semibold tabular-nums text-rose-600 dark:text-rose-400">
          {p.missed}
        </span>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Progress
            value={p.adherenceRate ?? 0}
            className={cn("h-1.5 flex-1", rateBarClass(p.adherenceRate))}
          />
          <span className={cn("text-xs font-semibold tabular-nums w-12 text-right", rateColor(p.adherenceRate))}>
            {p.adherenceRate != null ? `${p.adherenceRate}%` : "—"}
          </span>
        </div>
      </TableCell>
      <TableCell className="text-right text-xs text-muted-foreground">{ago(p.lastResponse)}</TableCell>
    </TableRow>
  );
}

function PatientCard({ p }: { p: PatientAdherence }) {
  return (
    <li className={cn("rounded-lg border border-border p-3 transition-colors", rowTint(p.adherenceRate))}>
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={() => navigate("patient-detail", { patientId: p.patientId })}
          className="text-left min-w-0 flex-1"
        >
          <div className="text-sm font-medium hover:text-primary hover:underline underline-offset-2 truncate">
            {p.patientName}
          </div>
          <div className="text-[11px] text-muted-foreground">{p.surgeryType}</div>
        </button>
        <Badge
          variant="outline"
          className={cn(
            "text-[10px] border-transparent tabular-nums",
            p.adherenceRate == null
              ? "bg-muted/60 text-muted-foreground"
              : p.adherenceRate >= 80
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                : p.adherenceRate >= 50
                  ? "bg-amber-500/15 text-amber-700 dark:text-amber-300"
                  : "bg-rose-500/15 text-rose-700 dark:text-rose-300"
          )}
        >
          {p.adherenceRate != null ? `${p.adherenceRate}%` : "—"}
        </Badge>
      </div>

      <Progress
        value={p.adherenceRate ?? 0}
        className={cn("h-1.5 mt-2", rateBarClass(p.adherenceRate))}
      />

      <div className="flex items-center justify-between mt-2 text-[11px] text-muted-foreground">
        <span>
          <span className="text-emerald-600 dark:text-emerald-400 font-semibold tabular-nums">{p.taken}</span> taken
          {" · "}
          <span className="text-rose-600 dark:text-rose-400 font-semibold tabular-nums">{p.missed}</span> missed
          {" · "}
          <span className="tabular-nums">{p.total}</span> total
        </span>
        <span>{ago(p.lastResponse)}</span>
      </div>
    </li>
  );
}
