"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Activity, Footprints, ChevronRight, TrendingUp, TrendingDown, Minus,
  Thermometer,
} from "lucide-react";
import {
  Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer,
  Tooltip, XAxis, YAxis,
} from "recharts";

import { api } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";

import type { Milestone, MilestonesResponse, VitalsResponse, VitalsPoint, VitalsSummary } from "../types";
import { riskBadgeClass } from "../helpers";
import { milestoneTypeIcon } from "./milestones";

// ── Overview tab ────────────────────────────────────────────────────────────
export function OverviewTab({
  patientId,
  answeredCount, scheduledCount, missedCount, openEscalations, recoveryDay: dayNum,
}: {
  patientId: string;
  answeredCount: number;
  scheduledCount: number;
  missedCount: number;
  openEscalations: number;
  recoveryDay: number;
}) {
  const [vitals, setVitals] = React.useState<VitalsResponse | null>(null);
  const [vitalsLoading, setVitalsLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    setVitalsLoading(true);
    api<VitalsResponse>(`/api/patients/${patientId}/vitals`)
      .then((r) => { if (!cancelled) setVitals(r); })
      .catch((err) => {
        if (!cancelled) {
          toast.error(err instanceof Error ? err.message : "Failed to load vitals");
        }
      })
      .finally(() => { if (!cancelled) setVitalsLoading(false); });
    return () => { cancelled = true; };
  }, [patientId]);

  return (
    <div className="space-y-4">
      {/* Top row: Check-ins + Escalations stat cards (kept from original) */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-base">Check-ins</CardTitle>
            <CardDescription>Scheduled WhatsApp follow-ups</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <StatRow label="Total scheduled" value={scheduledCount} />
            <StatRow label="Answered" value={answeredCount} accent="emerald" />
            <StatRow label="Missed" value={missedCount} accent="rose" />
          </CardContent>
        </Card>

        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-base">Escalations</CardTitle>
            <CardDescription>AI-flagged for human review</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <StatRow label="Open" value={openEscalations} accent={openEscalations > 0 ? "rose" : "muted"} />
            <div className="pt-2">
              <div className="flex items-center justify-between text-xs text-muted-foreground mb-2">
                <span>Recovery progress</span>
                <span>Day {dayNum}</span>
              </div>
              <Progress value={Math.min(100, (dayNum / 14) * 100)} aria-label="Recovery progress" />
              <div className="text-[11px] text-muted-foreground mt-1.5">
                Day {dayNum} of recovery. Window defaults to 14 days; configured per hospital.
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recovery Vitals panel (replaces single pain-trend card) */}
      <Card className="glass">
        <CardHeader>
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-base flex items-center gap-2">
                <Activity className="h-4 w-4 text-primary" /> Recovery vitals
              </CardTitle>
              <CardDescription>
                Combined pain + temperature trend across answered check-ins
              </CardDescription>
            </div>
            {vitals && !vitalsLoading && vitals.summary.totalAnswered > 0 && (
              <Badge variant="outline" className="bg-muted/50 whitespace-nowrap">
                {vitals.summary.totalAnswered} answered
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {vitalsLoading ? (
            <VitalsSkeleton />
          ) : !vitals || vitals.vitals.length === 0 ? (
            <EmptyVitals patientId={patientId} />
          ) : (
            <>
              <VitalsSummaryCards summary={vitals.summary} />
              <VitalsChart vitals={vitals.vitals} />
              <RiskTrajectoryStrip vitals={vitals.vitals} />
            </>
          )}
        </CardContent>
      </Card>

      {/* Recovery milestones progress strip — at-a-glance view of upcoming milestones */}
      <MilestonesProgressStrip patientId={patientId} />
    </div>
  );
}

// ── Milestones progress strip (Overview tab) ─────────────────────────────────
function MilestonesProgressStrip({ patientId }: { patientId: string }) {
  const [milestones, setMilestones] = React.useState<Milestone[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    api<MilestonesResponse>(`/api/patients/${patientId}/milestones`)
      .then((r) => { if (!cancelled) setMilestones(r.milestones); })
      .catch(() => { /* silent fail — non-critical widget */ })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [patientId]);

  if (loading) return <Skeleton className="h-32" />;
  if (milestones.length === 0) return null;

  const completed = milestones.filter((m) => m.status === "COMPLETED").length;
  const total = milestones.length;
  const pct = total > 0 ? Math.round((completed / total) * 100) : 0;
  const upcoming = milestones
    .filter((m) => m.status === "PENDING")
    .sort((a, b) => new Date(a.targetDate).getTime() - new Date(b.targetDate).getTime())
    .slice(0, 3);

  return (
    <Card className="glass">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Footprints className="h-4 w-4 text-primary" /> Recovery milestones
            </CardTitle>
            <CardDescription>
              {completed} of {total} completed · {pct}% progress
            </CardDescription>
          </div>
          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
            {pct}%
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Progress bar */}
        <div className="h-2 rounded-full bg-muted overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-primary/60 to-primary transition-all duration-700"
            style={{ width: `${pct}%` }}
          />
        </div>
        {/* Upcoming milestones chips */}
        {upcoming.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground mr-1">
              Upcoming:
            </span>
            {upcoming.map((m) => {
              const { Icon, cls } = milestoneTypeIcon(m.type);
              const targetDate = new Date(m.targetDate);
              const isOverdue = targetDate < new Date() && m.status === "PENDING";
              return (
                <span
                  key={m.id}
                  className={cn(
                    "inline-flex items-center gap-1.5 rounded-full border px-2 py-1 text-[11px]",
                    isOverdue
                      ? "border-rose-500/30 bg-rose-500/10 text-rose-700"
                      : "border-border bg-muted/40 text-foreground/80",
                  )}
                  title={`Target: ${targetDate.toLocaleDateString("en-IN")}`}
                >
                  <span className={cn("h-4 w-4 rounded-full flex items-center justify-center", cls)}>
                    <Icon className="h-2.5 w-2.5" />
                  </span>
                  {m.label}
                  {isOverdue && <span className="font-medium">· overdue</span>}
                </span>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function VitalsSkeleton() {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-20" />)}
      </div>
      <Skeleton className="h-52 w-full" />
      <Skeleton className="h-8 w-full" />
    </div>
  );
}

function EmptyVitals({ patientId }: { patientId?: string }) {
  return (
    <div className="py-10 text-center">
      <div className="mx-auto h-14 w-14 rounded-2xl bg-gradient-to-br from-primary/10 to-primary/5 flex items-center justify-center mb-3 ring-1 ring-primary/10">
        <Activity className="h-7 w-7 text-primary/70" />
      </div>
      <h3 className="font-medium text-sm">No vitals recorded yet</h3>
      <p className="text-xs text-muted-foreground mt-1 max-w-sm mx-auto">
        Vitals (pain level, temperature, symptoms) will appear here automatically
        as the patient responds to scheduled WhatsApp check-ins.
      </p>
      <div className="mt-4 flex flex-wrap items-center justify-center gap-2 text-[10px] text-muted-foreground/70">
        <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-rose-500/60" /> Pain (0-10)
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500/60" /> Temperature (°C)
        </span>
        <span className="inline-flex items-center gap-1 rounded-full bg-muted/60 px-2 py-1">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500/60" /> Risk trajectory
        </span>
      </div>
      {patientId && (
        <div className="mt-5 flex items-center justify-center gap-2">
          <a
            href={`/?view=checkins&patientId=${patientId}`}
            className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-muted/50 transition-colors"
          >
            View check-ins schedule →
          </a>
        </div>
      )}
    </div>
  );
}

function VitalsSummaryCards({ summary }: { summary: VitalsSummary }) {
  const {
    latestPain, previousPain, painTrend, latestTemp, avgPain, maxPain, feverEpisodes,
  } = summary;

  const trendIcon = painTrend === "increasing"
    ? <TrendingUp className="h-3.5 w-3.5" />
    : painTrend === "decreasing"
      ? <TrendingDown className="h-3.5 w-3.5" />
      : painTrend === "stable"
        ? <Minus className="h-3.5 w-3.5" />
        : null;
  const trendCls = painTrend === "increasing"
    ? "text-rose-600 dark:text-rose-300"
    : painTrend === "decreasing"
      ? "text-emerald-600 dark:text-emerald-300"
      : "text-muted-foreground";
  const trendLabel = painTrend === "increasing" ? "Increasing"
    : painTrend === "decreasing" ? "Decreasing"
    : painTrend === "stable" ? "Stable"
    : "—";
  const trendDelta = latestPain !== null && previousPain !== null ? latestPain - previousPain : null;
  const hasFever = latestTemp !== null && latestTemp >= 38;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {/* Latest pain */}
      <div className="rounded-lg border border-border bg-background/40 p-3">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Activity className="h-3 w-3" /> Latest pain
        </div>
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold tabular-nums">{latestPain ?? "—"}</span>
          <span className="text-xs text-muted-foreground">/10</span>
        </div>
        <div className={cn("mt-1 flex items-center gap-1 text-xs", trendCls)}>
          {trendIcon}
          <span>{trendLabel}</span>
          {trendDelta !== null && trendDelta !== 0 && (
            <span className="tabular-nums">
              ({trendDelta > 0 ? "+" : ""}{trendDelta})
            </span>
          )}
        </div>
      </div>

      {/* Latest temp */}
      <div className="rounded-lg border border-border bg-background/40 p-3">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Thermometer className="h-3 w-3" /> Latest temp
        </div>
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold tabular-nums">
            {latestTemp !== null ? latestTemp.toFixed(1) : "—"}
          </span>
          <span className="text-xs text-muted-foreground">°C</span>
        </div>
        <div className="mt-1 flex items-center gap-1.5 text-xs flex-wrap">
          {hasFever ? (
            <Badge variant="outline" className="risk-critical border-rose-500/40 text-[10px] px-1.5 py-0 h-5">
              Fever ≥38°C
            </Badge>
          ) : latestTemp !== null ? (
            <span className="text-emerald-600 dark:text-emerald-300">Afebrile</span>
          ) : (
            <span className="text-muted-foreground">—</span>
          )}
          {feverEpisodes > 0 && (
            <span className="text-muted-foreground">
              · {feverEpisodes} episode{feverEpisodes > 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      {/* Avg pain */}
      <div className="rounded-lg border border-border bg-background/40 p-3">
        <div className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
          <Activity className="h-3 w-3" /> Avg pain
        </div>
        <div className="mt-1.5 flex items-baseline gap-1.5">
          <span className="text-2xl font-semibold tabular-nums">{avgPain ?? "—"}</span>
          <span className="text-xs text-muted-foreground">/10</span>
        </div>
        <div className="mt-1 text-xs text-muted-foreground">
          {maxPain !== null ? `max: ${maxPain}/10` : "—"}
        </div>
      </div>
    </div>
  );
}

function VitalsChart({ vitals }: { vitals: VitalsPoint[] }) {
  const data = vitals.map((v) => ({
    day: `D${v.day}`,
    pain: v.pain,
    temp: v.temp,
    symptoms: v.symptoms,
  }));

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-4 text-[11px] text-muted-foreground flex-wrap">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: "oklch(0.62 0.14 165)" }} />
          Pain (0–10)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full" style={{ background: "oklch(0.75 0.15 70)" }} />
          Temp (°C)
        </span>
        <span className="flex items-center gap-1.5 ml-auto">
          <span
            className="inline-block h-0.5 w-4"
            style={{ background: "oklch(0.62 0.2 25)" }}
          />
          Fever ≥38°C
        </span>
      </div>
      <div className="h-52 sm:h-60 w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={data} margin={{ top: 8, right: 4, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="painArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.62 0.14 165)" stopOpacity={0.35} />
                <stop offset="100%" stopColor="oklch(0.62 0.14 165)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
            <XAxis
              dataKey="day"
              tick={{ fontSize: 11 }}
              stroke="var(--muted-foreground)"
              interval="preserveStartEnd"
              minTickGap={8}
            />
            <YAxis
              yAxisId="pain"
              domain={[0, 10]}
              tick={{ fontSize: 11 }}
              stroke="oklch(0.62 0.14 165)"
              width={26}
            />
            <YAxis
              yAxisId="temp"
              orientation="right"
              domain={[35, 41]}
              ticks={[35, 36, 37, 38, 39, 40, 41]}
              tick={{ fontSize: 11 }}
              stroke="oklch(0.75 0.15 70)"
              width={32}
              tickFormatter={(v: number) => `${v}°`}
            />
            <Tooltip content={<VitalsTooltip />} />
            <ReferenceLine
              yAxisId="temp"
              y={38}
              stroke="oklch(0.62 0.2 25)"
              strokeDasharray="4 4"
              strokeWidth={1.5}
              ifOverflow="extendDomain"
            />
            <Area
              yAxisId="pain"
              type="monotone"
              dataKey="pain"
              stroke="oklch(0.62 0.14 165)"
              strokeWidth={2}
              fill="url(#painArea)"
              connectNulls
            />
            <Line
              yAxisId="temp"
              type="monotone"
              dataKey="temp"
              stroke="oklch(0.75 0.15 70)"
              strokeWidth={2}
              dot={{ r: 3, fill: "oklch(0.75 0.15 70)", strokeWidth: 0 }}
              activeDot={{ r: 4 }}
              connectNulls
            />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

function VitalsTooltip({
  active, payload, label,
}: {
  active?: boolean;
  payload?: Array<{
    dataKey: string;
    value: number | null;
    color: string;
    payload?: { symptoms?: string | null };
  }>;
  label?: string | number;
}) {
  if (!active || !payload || payload.length === 0) return null;
  const symptoms = payload[0]?.payload?.symptoms ?? null;
  const painEntry = payload.find((p) => p.dataKey === "pain");
  const tempEntry = payload.find((p) => p.dataKey === "temp");

  return (
    <div className="rounded-lg border border-border bg-popover text-popover-foreground shadow-md p-2.5 text-xs space-y-1.5 max-w-[240px]">
      <div className="font-medium text-foreground">Check-in {label}</div>
      {painEntry && painEntry.value !== null && painEntry.value !== undefined && (
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ background: "oklch(0.62 0.14 165)" }} />
            Pain
          </span>
          <span className="font-medium tabular-nums">{painEntry.value}/10</span>
        </div>
      )}
      {tempEntry && tempEntry.value !== null && tempEntry.value !== undefined && (
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-1.5 text-muted-foreground">
            <span className="h-2 w-2 rounded-full" style={{ background: "oklch(0.75 0.15 70)" }} />
            Temp
          </span>
          <span className="font-medium tabular-nums">
            {Number(tempEntry.value).toFixed(1)}°C
            {Number(tempEntry.value) >= 38 && (
              <span className="ml-1.5 text-rose-600 dark:text-rose-300 font-medium">fever</span>
            )}
          </span>
        </div>
      )}
      {symptoms && (
        <div className="pt-1.5 border-t border-border text-muted-foreground break-words">
          {symptoms}
        </div>
      )}
    </div>
  );
}

function RiskTrajectoryStrip({ vitals }: { vitals: VitalsPoint[] }) {
  return (
    <div className="space-y-1.5">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
        Risk trajectory
      </div>
      <div className="flex items-center gap-1 overflow-x-auto fancy-scroll py-1">
        {vitals.map((v, i) => {
          const risk = v.riskLevel;
          return (
            <div key={i} className="flex items-center gap-1 flex-shrink-0">
              <div className="flex flex-col items-center gap-1 min-w-[44px]">
                <span className="text-[10px] text-muted-foreground tabular-nums">D{v.day}</span>
                {risk ? (
                  <Badge className={cn("text-[10px] px-1.5 py-0 h-5", riskBadgeClass(risk))}>
                    {risk}
                  </Badge>
                ) : (
                  <span className="text-[10px] text-muted-foreground italic h-5 flex items-center">
                    —
                  </span>
                )}
              </div>
              {i < vitals.length - 1 && (
                <ChevronRight className="h-3 w-3 text-muted-foreground/40 flex-shrink-0" />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function StatRow({ label, value, accent }: { label: string; value: number; accent?: "emerald" | "rose" | "muted" }) {
  const cls = accent === "emerald"
    ? "text-emerald-700 dark:text-emerald-300"
    : accent === "rose"
      ? "text-rose-700 dark:text-rose-300"
      : accent === "muted"
        ? "text-muted-foreground"
        : "text-foreground";
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className={cn("text-lg font-semibold tabular-nums", cls)}>{value}</span>
    </div>
  );
}
