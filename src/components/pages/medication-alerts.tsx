"use client";

// Ojas — Medication alerts page. Hospital admins / coordinators see a list of
// patients who have reported missing medications in recent check-ins (last 7
// days). Cards are colour-coded by severity (HIGH = rose border). Auto-refreshes
// every 60 seconds. Replaces ad-hoc "did you take your meds?" follow-up.
import * as React from "react";
import { MotionConfig, motion } from "framer-motion";
import { toast } from "sonner";
import { formatDistanceToNow, parseISO } from "date-fns";
import {
  BellRing, Pill, Users, XCircle, ShieldAlert, ChevronRight,
  RefreshCw, PartyPopper, Clock, ClipboardList, AlertTriangle,
} from "lucide-react";

import { api } from "@/lib/auth-context";
import { navigate } from "@/lib/router";
import { cn } from "@/lib/utils";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";

// ── Types matching /api/medication-alerts contract ──────────────────────────
type Severity = "HIGH" | "MEDIUM" | "LOW";

interface AlertPatient {
  id: string;
  fullName: string;
  surgeryType: string;
  age: number;
  riskLevel: string | null;
}

interface MedicationAlert {
  patient: AlertPatient;
  total: number;
  taken: number;
  missed: number;
  missedNotes: string[];
  lastMissed: string | null;
  lastResponse: string | null;
  adherenceRate: number | null;
  severity: Severity;
}

interface MedicationAlertsResponse {
  alerts: MedicationAlert[];
  summary: {
    totalPatientsWithAlerts: number;
    totalMissedDoses: number;
    highSeverity: number;
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function ago(iso: string | null | undefined): string {
  if (!iso) return "—";
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return "—";
  }
}

function severityBadge(sev: Severity): {
  cls: string; label: string;
} {
  switch (sev) {
    case "HIGH":
      return {
        cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
        label: "High",
      };
    case "MEDIUM":
      return {
        cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
        label: "Medium",
      };
    default:
      return {
        cls: "bg-muted text-muted-foreground border-border",
        label: "Low",
      };
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

function riskBadgeCls(risk: string | null): string {
  switch (risk) {
    case "CRITICAL":
      return "risk-critical";
    case "HIGH":
      return "risk-high";
    case "MEDIUM":
      return "risk-medium";
    case "LOW":
      return "risk-low";
    default:
      return "bg-muted/60 text-muted-foreground border-border";
  }
}

const REFRESH_MS = 60_000;

// ── Page ────────────────────────────────────────────────────────────────────
export function MedicationAlertsPage() {
  const [data, setData] = React.useState<MedicationAlertsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);

  const load = React.useCallback(async (opts?: { silent?: boolean }) => {
    if (opts?.silent) setRefreshing(true); else setLoading(true);
    try {
      const r = await api<MedicationAlertsResponse>("/api/medication-alerts");
      setData(r);
      setLastUpdated(new Date());
    } catch (err) {
      // Silent on auto-refresh; loud on initial load.
      if (!opts?.silent) {
        toast.error(err instanceof Error ? err.message : "Failed to load medication alerts");
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    load();
    const id = window.setInterval(() => load({ silent: true }), REFRESH_MS);
    return () => window.clearInterval(id);
  }, [load]);

  const alerts = data?.alerts ?? [];
  const summary = data?.summary;
  const isEmpty = !loading && alerts.length === 0;

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
            <span className="relative flex items-center justify-center">
              <BellRing className="h-6 w-6 md:h-7 md:w-7 text-primary" />
              {!loading && alerts.length > 0 && (
                <span
                  className="absolute -top-1 -right-1 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-background"
                  aria-hidden="true"
                />
              )}
            </span>
            Medication alerts
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Patients who reported missing medications in recent check-ins.
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <span
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1",
                refreshing && "text-primary"
              )}
            >
              <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
              {refreshing
                ? "Refreshing…"
                : lastUpdated
                  ? `Updated ${ago(lastUpdated.toISOString())}`
                  : "Auto-refreshes every 60s"}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-muted/40 px-2.5 py-1">
              <Clock className="h-3 w-3" />
              Window: last 7 days
            </span>
          </div>
        </motion.section>

        {/* Summary cards */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          <SummaryCard
            label="Patients with alerts"
            value={summary?.totalPatientsWithAlerts}
            icon={Users}
            loading={loading}
            delay={0}
          />
          <SummaryCard
            label="Total missed doses (7d)"
            value={summary?.totalMissedDoses}
            icon={XCircle}
            tint="amber"
            loading={loading}
            delay={0.05}
          />
          <SummaryCard
            label="High severity"
            value={summary?.highSeverity}
            icon={ShieldAlert}
            tint="rose"
            loading={loading}
            delay={0.1}
          />
        </section>

        {/* Alert list / states */}
        {loading ? (
          <AlertListSkeleton />
        ) : isEmpty ? (
          <EmptyState />
        ) : (
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.15 }}
            className="space-y-3"
          >
            <div className="flex items-baseline justify-between gap-2">
              <h2 className="text-base font-semibold">
                Patient alerts
              </h2>
              <span className="text-xs text-muted-foreground">
                Sorted by missed doses — highest first
              </span>
            </div>
            <ul className="space-y-3">
              {alerts.map((a, i) => (
                <motion.li
                  key={a.patient.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(i * 0.04, 0.3) }}
                >
                  <AlertCard alert={a} />
                </motion.li>
              ))}
            </ul>
          </motion.section>
        )}
      </div>
    </MotionConfig>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────
function SummaryCard({
  label, value, icon: Icon, loading, tint, delay,
}: {
  label: string;
  value: number | undefined;
  icon: React.ComponentType<{ className?: string }>;
  loading: boolean;
  tint?: "rose" | "amber";
  delay: number;
}) {
  const tintCls =
    tint === "rose"
      ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
      : tint === "amber"
        ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
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
              {value ?? 0}
            </span>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function AlertCard({ alert }: { alert: MedicationAlert }) {
  const sev = severityBadge(alert.severity);
  const isHigh = alert.severity === "HIGH";
  const rate = alert.adherenceRate;

  return (
    <Card
      className={cn(
        "glass overflow-hidden transition-shadow hover:glow-primary",
        isHigh && "border-l-4 border-l-rose-500"
      )}
    >
      <CardContent className="p-4 md:p-5">
        {/* Row 1: patient identity + actions */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => navigate("patient-detail", { patientId: alert.patient.id })}
                className="text-left font-semibold text-base hover:text-primary hover:underline underline-offset-2 truncate max-w-full"
              >
                {alert.patient.fullName}
              </button>
              <Badge variant="outline" className="text-[10px] px-1.5 py-0 h-5 bg-muted/60 text-muted-foreground border-border">
                {alert.patient.age}y
              </Badge>
              {alert.patient.riskLevel && (
                <Badge
                  variant="outline"
                  className={cn("text-[10px] px-1.5 py-0 h-5 border", riskBadgeCls(alert.patient.riskLevel))}
                >
                  {alert.patient.riskLevel}
                </Badge>
              )}
              <Badge variant="outline" className={cn("text-[10px] px-1.5 py-0 h-5 border", sev.cls)}>
                {isHigh && <AlertTriangle className="h-3 w-3 mr-0.5" />}
                {sev.label} severity
              </Badge>
            </div>
            <div className="text-xs text-muted-foreground">
              {alert.patient.surgeryType}
            </div>
          </div>

          <Button
            size="sm"
            variant="outline"
            className="flex-shrink-0"
            onClick={() => navigate("patient-detail", { patientId: alert.patient.id })}
          >
            View patient <ChevronRight className="h-3.5 w-3.5" />
          </Button>
        </div>

        {/* Row 2: stats */}
        <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Counts */}
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1.5 text-sm">
            <span className="flex items-baseline gap-1">
              <span className="text-lg font-semibold tabular-nums text-rose-600 dark:text-rose-400">
                {alert.missed}
              </span>
              <span className="text-xs text-muted-foreground">missed</span>
            </span>
            <span className="flex items-baseline gap-1">
              <span className="text-lg font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                {alert.taken}
              </span>
              <span className="text-xs text-muted-foreground">taken</span>
            </span>
            <span className="flex items-baseline gap-1">
              <span className="text-lg font-semibold tabular-nums text-muted-foreground">
                {alert.total}
              </span>
              <span className="text-xs text-muted-foreground">total responses</span>
            </span>
          </div>

          {/* Adherence bar */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Adherence rate</span>
              <span className={cn("font-semibold tabular-nums", rateColor(rate))}>
                {rate != null ? `${rate}%` : "—"}
              </span>
            </div>
            <Progress
              value={rate ?? 0}
              className={cn("h-1.5", rateBarClass(rate))}
            />
          </div>
        </div>

        {/* Row 3: notes + timing */}
        {(alert.missedNotes.length > 0 || alert.lastMissed) && (
          <div className="mt-4 pt-3 border-t border-border space-y-2">
            {alert.missedNotes.length > 0 && (
              <div className="flex items-start gap-2">
                <ClipboardList className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-muted-foreground" />
                <div className="flex flex-col gap-1 min-w-0">
                  {alert.missedNotes.slice(0, 3).map((n, i) => (
                    <p
                      key={i}
                      className="text-xs italic text-muted-foreground leading-relaxed break-words"
                    >
                      &ldquo;{n}&rdquo;
                    </p>
                  ))}
                  {alert.missedNotes.length > 3 && (
                    <p className="text-[11px] text-muted-foreground">
                      +{alert.missedNotes.length - 3} more notes
                    </p>
                  )}
                </div>
              </div>
            )}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] text-muted-foreground">
              {alert.lastMissed && (
                <span className="inline-flex items-center gap-1">
                  <XCircle className="h-3 w-3 text-rose-500" />
                  Last missed {ago(alert.lastMissed)}
                </span>
              )}
              {alert.lastResponse && (
                <span className="inline-flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  Last response {ago(alert.lastResponse)}
                </span>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
    >
      <Card className="glass">
        <CardContent className="p-10 md:p-14 text-center">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-emerald-500/15 flex items-center justify-center mb-4">
            <PartyPopper className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
          </div>
          <h3 className="text-lg font-semibold">No medication alerts</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
            All patients are taking their medications as prescribed. Great work
            keeping everyone on track with their recovery.
          </p>
          <Button
            size="sm"
            variant="outline"
            className="mt-5"
            onClick={() => navigate("medication-adherence")}
          >
            <Pill className="h-4 w-4" /> View adherence overview
          </Button>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function AlertListSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 4 }).map((_, i) => (
        <Card key={i} className="glass">
          <CardContent className="p-4 md:p-5 space-y-3">
            <div className="flex items-center justify-between">
              <div className="space-y-2">
                <Skeleton className="h-5 w-44" />
                <Skeleton className="h-3 w-32" />
              </div>
              <Skeleton className="h-8 w-28 rounded-md" />
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-2">
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-20" />
              <Skeleton className="h-5 w-28" />
            </div>
            <Skeleton className="h-1.5 w-full rounded-full" />
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
