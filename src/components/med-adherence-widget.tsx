"use client";

// Ojas — Medication Adherence widget. Shows hospital-wide medication adherence
// rate with a 14-day trend sparkline and per-patient breakdown of recent misses.
// Designed as a compact dashboard card.

import * as React from "react";
import { motion } from "framer-motion";
import { format, parseISO } from "date-fns";
import { Pill, TrendingUp, TrendingDown, AlertCircle, ChevronRight } from "lucide-react";
import {
  Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { api } from "@/lib/auth-context";
import { navigate } from "@/lib/router";
import { cn } from "@/lib/utils";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

interface MedAdherenceResponse {
  summary: {
    total: number;
    taken: number;
    missed: number;
    adherenceRate: number | null;
  };
  byPatient: {
    patientId: string;
    patientName: string;
    surgeryType: string;
    total: number;
    taken: number;
    missed: number;
    adherenceRate: number | null;
    lastResponse: string | null;
  }[];
  trend: { date: string; taken: number; missed: number; rate: number | null }[];
}

function rateTone(rate: number | null): "good" | "warn" | "bad" | "none" {
  if (rate === null) return "none";
  if (rate >= 80) return "good";
  if (rate >= 60) return "warn";
  return "bad";
}

const TONE_CLS: Record<"good" | "warn" | "bad" | "none", { text: string; bg: string; ring: string; bar: string }> = {
  good: { text: "text-emerald-700 dark:text-emerald-300", bg: "bg-emerald-500/10", ring: "ring-emerald-500/30", bar: "bg-emerald-500" },
  warn: { text: "text-amber-700 dark:text-amber-300", bg: "bg-amber-500/10", ring: "ring-amber-500/30", bar: "bg-amber-500" },
  bad:  { text: "text-rose-700 dark:text-rose-300", bg: "bg-rose-500/10", ring: "ring-rose-500/30", bar: "bg-rose-500" },
  none: { text: "text-muted-foreground", bg: "bg-muted", ring: "ring-border", bar: "bg-muted-foreground" },
};

export function MedAdherenceWidget() {
  const [data, setData] = React.useState<MedAdherenceResponse | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await api<MedAdherenceResponse>("/api/medication-adherence");
        if (!cancelled) setData(r);
      } catch {
        // non-fatal
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const rate = data?.summary.adherenceRate ?? null;
  const tone = rateTone(rate);
  const toneCls = TONE_CLS[tone];

  // Trend delta (last 7d vs previous 7d)
  const trend = data?.trend ?? [];
  const last7 = trend.slice(-7).filter((t) => t.rate !== null);
  const prev7 = trend.slice(-14, -7).filter((t) => t.rate !== null);
  const last7Avg = last7.length > 0 ? last7.reduce((s, t) => s + (t.rate ?? 0), 0) / last7.length : null;
  const prev7Avg = prev7.length > 0 ? prev7.reduce((s, t) => s + (t.rate ?? 0), 0) / prev7.length : null;
  const delta = (last7Avg !== null && prev7Avg !== null) ? last7Avg - prev7Avg : null;

  // Patients needing attention: missed > 0, sorted by missed desc
  const needsAttention = (data?.byPatient ?? [])
    .filter((p) => p.missed > 0)
    .slice(0, 4);

  return (
    <Card className="glass h-full elevate-1">
      <CardHeader className="border-b border-border">
        <CardTitle className="flex items-center gap-2 text-base">
          <Pill className="h-4 w-4 text-primary" />
          Medication adherence
        </CardTitle>
        <CardDescription>
          Hospital-wide, last 14 days.
        </CardDescription>
        <CardAction>
          <Button
            size="sm"
            variant="ghost"
            className="text-[11px] h-7 px-2"
            onClick={() => navigate("medication-adherence")}
          >
            View all <ChevronRight />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="p-4">
        {loading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
            <Skeleton className="h-6 w-full" />
          </div>
        ) : !data || data.summary.total === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-8 px-3">
            <span className="flex items-center justify-center h-10 w-10 rounded-full bg-secondary text-muted-foreground mb-2">
              <Pill className="h-5 w-5" />
            </span>
            <p className="text-xs font-medium">No adherence data yet</p>
            <p className="text-[11px] text-muted-foreground mt-1 max-w-[16rem]">
              Once check-ins capture medication confirmation, adherence trends will appear here.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* Big number + delta */}
            <div className="flex items-baseline justify-between gap-2">
              <div className="flex items-baseline gap-2">
                <motion.span
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.4 }}
                  className={cn("num text-3xl font-semibold leading-none tabular-nums", toneCls.text)}
                >
                  {rate !== null ? `${rate}%` : "—"}
                </motion.span>
                <span className="text-[11px] text-muted-foreground uppercase tracking-wider">
                  adherence
                </span>
              </div>
              {delta !== null && (
                <span className={cn(
                  "inline-flex items-center gap-0.5 text-[11px] font-medium num",
                  delta > 0 ? "text-emerald-600 dark:text-emerald-400" : delta < 0 ? "text-rose-600 dark:text-rose-400" : "text-muted-foreground"
                )}>
                  {delta > 0 ? <TrendingUp className="h-3 w-3" /> : delta < 0 ? <TrendingDown className="h-3 w-3" /> : null}
                  {delta > 0 ? "+" : ""}{delta.toFixed(1)}% vs prev wk
                </span>
              )}
            </div>

            {/* Trend sparkline */}
            <div className="h-20 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={trend} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
                  <defs>
                    <linearGradient id="medGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis dataKey="date" hide />
                  <YAxis domain={[0, 100]} hide />
                  <Tooltip
                    contentStyle={{
                      background: "var(--popover)",
                      border: "1px solid var(--border)",
                      borderRadius: 8,
                      fontSize: 12,
                      color: "var(--popover-foreground)",
                      boxShadow: "0 4px 12px -2px oklch(0.18 0.02 200 / 0.12)",
                    }}
                    labelFormatter={(d) => format(parseISO(d as string), "d MMM")}
                    formatter={(_v, _name, item) => {
                      const t = item?.payload as { taken: number; missed: number; rate: number | null };
                      return [`${t.rate ?? "—"}% (${t.taken}/${t.taken + t.missed})`, "Adherence"];
                    }}
                  />
                  <Area
                    type="monotone"
                    dataKey="rate"
                    stroke="var(--primary)"
                    strokeWidth={2}
                    fill="url(#medGrad)"
                    dot={false}
                    activeDot={{ r: 3, fill: "var(--primary)" }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Counts row */}
            <div className="grid grid-cols-3 gap-2 text-center">
              <div className={cn("rounded-md p-2", TONE_CLS.good.bg)}>
                <div className="num text-sm font-bold text-emerald-700 dark:text-emerald-300">{data.summary.taken}</div>
                <div className="text-[9px] text-muted-foreground uppercase tracking-wider">taken</div>
              </div>
              <div className={cn("rounded-md p-2", TONE_CLS.bad.bg)}>
                <div className="num text-sm font-bold text-rose-700 dark:text-rose-300">{data.summary.missed}</div>
                <div className="text-[9px] text-muted-foreground uppercase tracking-wider">missed</div>
              </div>
              <div className="rounded-md p-2 bg-muted">
                <div className="num text-sm font-bold">{data.summary.total}</div>
                <div className="text-[9px] text-muted-foreground uppercase tracking-wider">total</div>
              </div>
            </div>

            {/* Patients needing attention */}
            {needsAttention.length > 0 && (
              <div className="pt-2 border-t border-border">
                <div className="flex items-center gap-1.5 mb-2">
                  <AlertCircle className="h-3 w-3 text-rose-600 dark:text-rose-400" />
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">
                    Needs attention
                  </span>
                </div>
                <ul className="space-y-1">
                  {needsAttention.map((p) => {
                    const pRate = p.adherenceRate;
                    const pTone = rateTone(pRate);
                    const pToneCls = TONE_CLS[pTone];
                    return (
                      <li key={p.patientId}>
                        <button
                          onClick={() => navigate("patient-detail", { patientId: p.patientId })}
                          className="w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md hover:bg-accent/50 transition-colors text-left group"
                        >
                          <span className="text-xs font-medium truncate flex-1">{p.patientName}</span>
                          <Badge variant="outline" className={cn("num text-[10px]", pToneCls.text, pToneCls.bg, "border-transparent")}>
                            {pRate !== null ? `${pRate}%` : "—"}
                          </Badge>
                          <span className="text-[10px] text-muted-foreground num">
                            {p.missed} missed
                          </span>
                          <ChevronRight className="h-3 w-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
