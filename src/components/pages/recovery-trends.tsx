// Ojas — Recovery Trends dashboard.
// Cross-patient vitals visualization: pain trends, fever episodes, response rate,
// adherence, per-patient trajectory. Helps coordinators spot deteriorations early.
"use client";

import * as React from "react";
import { MotionConfig, motion } from "framer-motion";
import { toast } from "sonner";
import {
  Activity, TrendingDown, TrendingUp, Thermometer, HeartPulse,
  RefreshCw, Loader2, AlertTriangle, Pill, Clock, Users,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Line, LineChart, ResponsiveContainer,
  Tooltip, XAxis, YAxis, ReferenceLine,
} from "recharts";

import { api } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { navigate } from "@/lib/router";

interface DailyTrend {
  date: string;
  avgPain: number | null;
  avgTemp: number | null;
  feverCount: number;
  answeredCount: number;
  highRiskCount: number;
}

interface PatientTrajectory {
  patientId: string;
  patientName: string;
  surgeryType: string;
  riskLevel: string | null;
  checkinCount: number;
  avgPain: number | null;
  maxPain: number | null;
  latestPain: number | null;
  painDelta: number | null;
  feverEpisodes: number;
  maxTemp: number | null;
  adherenceRate: number | null;
}

interface RecoveryTrendsResponse {
  windowDays: number;
  summary: {
    totalPatients: number;
    totalAnswered: number;
    totalScheduled: number;
    responseRate: number;
    avgPain: number | null;
    maxPain: number | null;
    feverEpisodes: number;
    adherenceRate: number;
    highRiskCount: number;
  };
  dailyTrend: DailyTrend[];
  patientTrajectories: PatientTrajectory[];
}

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-IN", { day: "numeric", month: "short" });
}

export function RecoveryTrendsPage() {
  const [data, setData] = React.useState<RecoveryTrendsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [window, setWindow] = React.useState("14");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<RecoveryTrendsResponse>(`/api/recovery-trends?days=${window}`);
      setData(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load recovery trends");
    } finally {
      setLoading(false);
    }
  }, [window]);

  React.useEffect(() => { load(); }, [load]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-6">
        {/* Header */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight flex items-center gap-2">
              <Activity className="h-7 w-7 text-primary" />
              Recovery Trends
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Cross-patient vitals, pain trajectory, fever surveillance, and adherence.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Select value={window} onValueChange={setWindow}>
              <SelectTrigger className="w-32 h-9">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="7">Last 7 days</SelectItem>
                <SelectItem value="14">Last 14 days</SelectItem>
                <SelectItem value="30">Last 30 days</SelectItem>
                <SelectItem value="90">Last 90 days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="h-4 w-4 mr-2" /> Refresh
            </Button>
          </div>
        </motion.div>

        {loading ? (
          <TrendsSkeleton />
        ) : !data ? null : (
          <>
            {/* Summary cards */}
            <motion.div variants={fadeUp} initial="hidden" animate="show" className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <SummaryCard
                icon={Users}
                label="Active patients"
                value={String(data.summary.totalPatients)}
                tone="primary"
              />
              <SummaryCard
                icon={Clock}
                label="Response rate"
                value={`${data.summary.responseRate}%`}
                sub={`${data.summary.totalAnswered}/${data.summary.totalScheduled} answered`}
                tone={data.summary.responseRate >= 70 ? "good" : data.summary.responseRate >= 50 ? "warn" : "bad"}
              />
              <SummaryCard
                icon={Activity}
                label="Avg pain"
                value={data.summary.avgPain != null ? String(data.summary.avgPain) : "—"}
                sub={`max ${data.summary.maxPain ?? "—"}/10`}
                tone={data.summary.avgPain != null && data.summary.avgPain <= 3 ? "good" : data.summary.avgPain != null && data.summary.avgPain <= 6 ? "warn" : "bad"}
              />
              <SummaryCard
                icon={Thermometer}
                label="Fever episodes"
                value={String(data.summary.feverEpisodes)}
                sub="temp ≥ 38°C"
                tone={data.summary.feverEpisodes === 0 ? "good" : data.summary.feverEpisodes <= 2 ? "warn" : "bad"}
              />
              <SummaryCard
                icon={Pill}
                label="Adherence"
                value={`${data.summary.adherenceRate}%`}
                sub="meds taken"
                tone={data.summary.adherenceRate >= 80 ? "good" : data.summary.adherenceRate >= 60 ? "warn" : "bad"}
              />
              <SummaryCard
                icon={AlertTriangle}
                label="High-risk"
                value={String(data.summary.highRiskCount)}
                sub="check-ins"
                tone={data.summary.highRiskCount === 0 ? "good" : "bad"}
              />
            </motion.div>

            {/* Daily trends chart */}
            <motion.div variants={fadeUp} initial="hidden" animate="show">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <TrendingDown className="h-4 w-4 text-primary" /> Daily pain & temperature trend
                  </CardTitle>
                  <CardDescription className="text-xs mt-1">
                    Average pain (0-10) and temperature (°C) across all answered check-ins per day. Fever threshold at 38°C.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {data.dailyTrend.length === 0 ? (
                    <EmptyChart message="No answered check-ins in the selected window." />
                  ) : (
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={data.dailyTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis
                            dataKey="date"
                            tickFormatter={fmtDate}
                            tick={{ fontSize: 11 }}
                            className="text-muted-foreground"
                          />
                          <YAxis
                            yAxisId="pain"
                            domain={[0, 10]}
                            tick={{ fontSize: 11 }}
                            className="text-muted-foreground"
                          />
                          <YAxis
                            yAxisId="temp"
                            orientation="right"
                            domain={[36, 40]}
                            tick={{ fontSize: 11 }}
                            className="text-muted-foreground"
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--background))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px",
                              fontSize: "12px",
                            }}
                            labelFormatter={fmtDate}
                          />
                          <ReferenceLine y={38} yAxisId="temp" stroke="hsl(var(--destructive))" strokeDasharray="4 4" label={{ value: "Fever", fontSize: 10, fill: "hsl(var(--destructive))" }} />
                          <Line
                            yAxisId="pain"
                            type="monotone"
                            dataKey="avgPain"
                            name="Avg pain"
                            stroke="hsl(var(--primary))"
                            strokeWidth={2}
                            dot={{ r: 3, fill: "hsl(var(--primary))" }}
                            activeDot={{ r: 5 }}
                            connectNulls
                          />
                          <Line
                            yAxisId="temp"
                            type="monotone"
                            dataKey="avgTemp"
                            name="Avg temp °C"
                            stroke="hsl(25 95% 55%)"
                            strokeWidth={2}
                            strokeDasharray="4 2"
                            dot={{ r: 3, fill: "hsl(25 95% 55%)" }}
                            activeDot={{ r: 5 }}
                            connectNulls
                          />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Daily fever + high-risk bars */}
            <motion.div variants={fadeUp} initial="hidden" animate="show">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 text-primary" /> Daily fever & high-risk signals
                  </CardTitle>
                  <CardDescription className="text-xs mt-1">
                    Fever episodes (temp ≥ 38°C) and HIGH/CRITICAL triaged check-ins per day.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {data.dailyTrend.length === 0 ? (
                    <EmptyChart message="No signals in the selected window." />
                  ) : (
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.dailyTrend} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                          <XAxis
                            dataKey="date"
                            tickFormatter={fmtDate}
                            tick={{ fontSize: 11 }}
                            className="text-muted-foreground"
                          />
                          <YAxis
                            allowDecimals={false}
                            tick={{ fontSize: 11 }}
                            className="text-muted-foreground"
                          />
                          <Tooltip
                            contentStyle={{
                              backgroundColor: "hsl(var(--background))",
                              border: "1px solid hsl(var(--border))",
                              borderRadius: "8px",
                              fontSize: "12px",
                            }}
                            labelFormatter={fmtDate}
                          />
                          <Bar dataKey="feverCount" name="Fever episodes" fill="hsl(25 95% 55%)" radius={[4, 4, 0, 0]} />
                          <Bar dataKey="highRiskCount" name="High-risk check-ins" fill="hsl(var(--destructive))" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Per-patient trajectory table */}
            <motion.div variants={fadeUp} initial="hidden" animate="show">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base flex items-center gap-2">
                    <HeartPulse className="h-4 w-4 text-primary" /> Per-patient trajectory
                  </CardTitle>
                  <CardDescription className="text-xs mt-1">
                    Sorted by max pain (highest first). Click a row to open the patient detail page.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {data.patientTrajectories.length === 0 ? (
                    <div className="text-center py-8 text-sm text-muted-foreground">
                      No patient trajectories in the selected window.
                    </div>
                  ) : (
                    <div className="max-h-96 overflow-y-auto">
                      <Table>
                        <TableHeader className="sticky top-0 bg-card">
                          <TableRow>
                            <TableHead>Patient</TableHead>
                            <TableHead className="w-20">Risk</TableHead>
                            <TableHead className="w-16">Check-ins</TableHead>
                            <TableHead className="w-20">Avg pain</TableHead>
                            <TableHead className="w-20">Max pain</TableHead>
                            <TableHead className="w-20">Δ Pain</TableHead>
                            <TableHead className="w-20">Fever</TableHead>
                            <TableHead className="w-20">Adherence</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.patientTrajectories.map((p) => (
                            <TableRow
                              key={p.patientId}
                              className="cursor-pointer hover:bg-muted/50"
                              onClick={() => navigate("patient-detail", { patientId: p.patientId })}
                            >
                              <TableCell>
                                <div className="font-medium text-sm">{p.patientName}</div>
                                <div className="text-xs text-muted-foreground">{p.surgeryType}</div>
                              </TableCell>
                              <TableCell>
                                {p.riskLevel ? (
                                  <Badge variant="outline" className={cn(
                                    "text-[10px]",
                                    p.riskLevel === "CRITICAL" && "bg-rose-500/15 text-rose-700 border-rose-500/30",
                                    p.riskLevel === "HIGH" && "bg-rose-500/15 text-rose-700 border-rose-500/30",
                                    p.riskLevel === "MEDIUM" && "bg-amber-500/15 text-amber-700 border-amber-500/30",
                                    p.riskLevel === "LOW" && "bg-emerald-500/15 text-emerald-700 border-emerald-500/30",
                                  )}>
                                    {p.riskLevel}
                                  </Badge>
                                ) : "—"}
                              </TableCell>
                              <TableCell className="font-mono text-xs">{p.checkinCount}</TableCell>
                              <TableCell className="font-mono text-xs">{p.avgPain ?? "—"}</TableCell>
                              <TableCell className="font-mono text-xs">
                                <span className={cn(
                                  p.maxPain != null && p.maxPain >= 7 && "text-rose-600 font-medium",
                                )}>
                                  {p.maxPain ?? "—"}
                                </span>
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {p.painDelta == null ? "—" : (
                                  <span className={cn(
                                    "inline-flex items-center gap-0.5",
                                    p.painDelta < 0 && "text-emerald-600",
                                    p.painDelta > 0 && "text-rose-600",
                                  )}>
                                    {p.painDelta < 0 && <TrendingDown className="h-3 w-3" />}
                                    {p.painDelta > 0 && <TrendingUp className="h-3 w-3" />}
                                    {p.painDelta > 0 ? "+" : ""}{p.painDelta}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                <span className={cn(
                                  p.feverEpisodes > 0 && "text-amber-600 font-medium",
                                )}>
                                  {p.feverEpisodes}
                                </span>
                              </TableCell>
                              <TableCell className="font-mono text-xs">
                                {p.adherenceRate != null ? `${p.adherenceRate}%` : "—"}
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </>
        )}
      </div>
    </MotionConfig>
  );
}

function SummaryCard({
  icon: Icon,
  label,
  value,
  sub,
  tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  tone: "primary" | "good" | "warn" | "bad";
}) {
  const toneClass = {
    primary: "text-primary",
    good: "text-emerald-600 dark:text-emerald-300",
    warn: "text-amber-600 dark:text-amber-300",
    bad: "text-rose-600 dark:text-rose-300",
  }[tone];
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <Icon className={cn("h-4 w-4", toneClass)} />
        </div>
        <div className={cn("text-2xl font-semibold tabular-nums mt-2", toneClass)}>{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
        {sub && <div className="text-[10px] text-muted-foreground/70 mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-48 flex items-center justify-center text-sm text-muted-foreground">
      <div className="text-center">
        <Activity className="h-8 w-8 mx-auto mb-2 text-muted-foreground/40" />
        {message}
      </div>
    </div>
  );
}

function TrendsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
        {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <Skeleton className="h-80" />
      <Skeleton className="h-64" />
      <Skeleton className="h-96" />
    </div>
  );
}
