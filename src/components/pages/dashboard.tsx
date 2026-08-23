"use client";

// Ojas — coordinator dashboard. Visual elevation pass: count-up mono stat cards,
// a date-card greeting moment, severity-railed worklist, token-styled recharts
// with a draw-in reveal, proportional risk-distribution bars, and inviting empty
// states. No interface / data-fetch / prop changes — restyle + re-compose only.

import * as React from "react";
import { MotionConfig, motion, useMotionValue, useTransform, animate, useReducedMotion } from "framer-motion";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import {
  Users, AlertTriangle, Clock, Bot, UserPlus, ArrowRight,
  Sparkles, Loader2, Activity, CheckCircle2, Stethoscope,
  PhoneCall, CalendarPlus, Brain, ChevronRight, ShieldAlert,
  TrendingUp, ArrowUpRight, Inbox, BarChart3, FileText, ClipboardList,
} from "lucide-react";
import {
  Area, AreaChart, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { api, useAuth } from "@/lib/auth-context";
import { navigate } from "@/lib/router";
import { cn } from "@/lib/utils";
import { RecoveryRing } from "@/components/recovery-ring";
import { OnboardingChecklist } from "@/components/onboarding-checklist";
import { TodaysTasksWidget } from "@/components/todays-tasks-widget";
import { MedAdherenceWidget } from "@/components/med-adherence-widget";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// ── Types matching the /api/dashboard contract ──────────────────────────────
interface DashboardStats {
  totalPatients: number;
  activePatients: number;
  newPatients7d: number;
  checkinsDue24h: number;
  checkinsAnswered7d: number;
  checkinsMissed7d: number;
  openEscalations: number;
  criticalEscalations: number;
  escalationsResolved7d: number;
  aiRuns7d: number;
  readmittedPatients: number;
  recoveredPatients: number;
}

interface TimelineItem {
  id: string;
  eventType: string;
  title: string;
  detail: string | null;
  occurredAt: string;
  patientName: string | null;
}

interface UpcomingCheckin {
  id: string;
  scheduledFor: string;
  patientName: string;
  surgeryType: string;
}

interface TopEscalation {
  id: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  status: string;
  reason: string;
  patientName: string;
  surgeryType: string;
  createdAt: string;
}

interface DashboardResponse {
  hospital: { name: string; planTier: string };
  stats: DashboardStats;
  recentTimeline: TimelineItem[];
  upcomingCheckins: UpcomingCheckin[];
  topEscalations: TopEscalation[];
}

interface InsightsResponse {
  summary: string;
  fallbackUsed: boolean;
}

interface ActivityItem {
  id: string;
  eventType: string;
  title: string;
  detail: string | null;
  occurredAt: string;
  patientName: string | null;
}

interface ActivityResponse {
  activities: ActivityItem[];
}

interface PainPoint { day: string; avgPain: number; count?: number }

// ── Severity ordering + helpers ─────────────────────────────────────────────
const SEVERITY_ORDER: Record<TopEscalation["severity"], number> = {
  CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3,
};

function severityClass(s: TopEscalation["severity"]): string {
  switch (s) {
    case "CRITICAL": return "risk-critical";
    case "HIGH": return "risk-high";
    case "MEDIUM": return "risk-medium";
    case "LOW": return "risk-low";
  }
}

function severityRail(s: TopEscalation["severity"]): string {
  switch (s) {
    case "CRITICAL": return "rail-critical";
    case "HIGH": return "rail-high";
    case "MEDIUM": return "rail-medium";
    case "LOW": return "rail-low";
  }
}

function greeting(d: Date): string {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function timelineIcon(eventType: string) {
  const t = eventType.toUpperCase();
  if (t.includes("ENROLL")) return { Icon: UserPlus, cls: "bg-primary/15 text-primary" };
  if (t.includes("ESCALAT")) return { Icon: AlertTriangle, cls: "risk-high" };
  if (t.includes("CHECKIN") || t.includes("CHECK_IN")) return { Icon: PhoneCall, cls: "bg-accent text-accent-foreground" };
  if (t.includes("CALL")) return { Icon: Bot, cls: "bg-primary/15 text-primary" };
  if (t.includes("STATUS")) return { Icon: Activity, cls: "bg-secondary text-secondary-foreground" };
  if (t.includes("RESOLVE")) return { Icon: CheckCircle2, cls: "bg-primary/15 text-primary" };
  return { Icon: Activity, cls: "bg-secondary text-secondary-foreground" };
}

// ── Count-up: numbers feel alive on load, reduced-motion safe ───────────────
function CountUp({ value, duration = 1.1, className }: { value: number; duration?: number; className?: string }) {
  const reduce = useReducedMotion();
  const mv = useMotionValue(0);
  const rounded = useTransform(mv, (v) => Math.round(v).toLocaleString());
  const [display, setDisplay] = React.useState(reduce ? value.toLocaleString() : "0");
  React.useEffect(() => {
    if (reduce) { setDisplay(value.toLocaleString()); return; }
    const controls = animate(mv, value, { duration, ease: [0.2, 0.8, 0.2, 1] });
    const unsub = rounded.on("change", (v) => setDisplay(v));
    return () => { controls.stop(); unsub(); };
  }, [value, duration, reduce, mv, rounded]);
  return <span className={className}>{display}</span>;
}

function LiveClock() {
  const [time, setTime] = React.useState("");
  const [date, setDate] = React.useState("");
  React.useEffect(() => {
    const update = () => {
      const now = new Date();
      setTime(now.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: true }));
      setDate(now.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short" }));
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <div className="hidden sm:flex flex-col items-end text-right">
      <span className="text-lg font-semibold tabular-nums tracking-tight">{time}</span>
      <span className="text-xs text-muted-foreground">{date}</span>
    </div>
  );
}

// ── Compact system-health widget (P1 observability on the dashboard) ────────
// Fetches /api/health every 60s and shows a tiny memory bar + uptime + response
// time. Non-fatal: if the fetch fails (sandbox: no DB), the widget silently
// hides itself rather than cluttering the dashboard with an error.
interface HealthPayload {
  status: string;
  responseTimeMs?: number;
  runtime?: {
    node: string;
    bun: string;
    uptimeSeconds: number;
    memory?: { rssMb: number; heapUsedMb: number; heapTotalMb: number; externalMb: number } | null;
  };
  checks?: { database: "ok" | "error"; databaseResponseTimeMs?: number };
}

function formatUptimeShort(s: number): string {
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  return `${Math.floor(s / 86400)}d`;
}

function SystemHealthWidget() {
  const [health, setHealth] = React.useState<HealthPayload | null>(null);
  const [visible, setVisible] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = await res.json() as HealthPayload;
        if (!cancelled) {
          setHealth(data);
          setVisible(true);
        }
      } catch {
        // Silent: the widget hides itself when health is unreachable (sandbox).
        if (!cancelled) setVisible(false);
      }
    };
    load();
    const id = setInterval(load, 60_000); // refresh every 60s
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  if (!visible || !health) return null;

  const mem = health.runtime?.memory;
  const heapPct = mem && mem.heapTotalMb > 0 ? Math.min(100, (mem.heapUsedMb / mem.heapTotalMb) * 100) : null;
  const heapTone = heapPct === null ? "bg-muted-foreground" : heapPct < 60 ? "bg-emerald-500" : heapPct < 85 ? "bg-amber-500" : "bg-red-500";
  const dbOk = health.checks?.database === "ok";
  const rtTone = health.responseTimeMs === undefined ? "text-muted-foreground" : health.responseTimeMs < 200 ? "text-emerald-600 dark:text-emerald-400" : health.responseTimeMs < 500 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";

  return (
    <Card className="glass p-3 sm:p-4 elevate-1">
      <div className="flex items-center gap-2 mb-2">
        <Activity className="h-3.5 w-3.5 text-primary" />
        <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">System health</span>
        <span className={`ml-auto h-2 w-2 rounded-full ${dbOk ? "bg-emerald-500" : "bg-amber-500"}`} title={dbOk ? "Database connected" : "Database unavailable"} />
      </div>
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <div className={`text-sm font-bold tabular-nums ${rtTone}`}>{health.responseTimeMs ?? "—"}ms</div>
          <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Response</div>
        </div>
        <div>
          <div className="text-sm font-bold tabular-nums">{health.runtime ? formatUptimeShort(health.runtime.uptimeSeconds) : "—"}</div>
          <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Uptime</div>
        </div>
        <div>
          <div className="text-sm font-bold tabular-nums">{mem ? `${Math.round(mem.heapUsedMb)}MB` : "—"}</div>
          <div className="text-[9px] text-muted-foreground uppercase tracking-wider">Heap</div>
        </div>
      </div>
      {mem && heapPct !== null && (
        <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden" title={`Heap: ${mem.heapUsedMb.toFixed(1)} / ${mem.heapTotalMb.toFixed(1)} MB`}>
          <div className={`h-full rounded-full transition-all duration-500 ${heapTone}`} style={{ width: `${heapPct}%` }} />
        </div>
      )}
    </Card>
  );
}

// ── Recent patients widget (P1 quick re-access) ────────────────────────────
// Shows the 5 most recently enrolled patients for this hospital. Each row is
// a clickable card that navigates to the patient detail page. Non-fatal: hides
// itself if the fetch fails (sandbox: no DB) rather than cluttering the
// dashboard with an error.
interface RecentPatient {
  id: string;
  fullName: string;
  age: number;
  gender: string;
  surgeryType: string;
  dischargeDate: string;
  status: string;
  createdAt: string;
}

function RecentPatientsWidget() {
  const [patients, setPatients] = React.useState<RecentPatient[] | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/patients?limit=5", { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { patients: RecentPatient[] };
        if (!cancelled) { setPatients(data.patients ?? []); setLoading(false); }
      } catch {
        if (!cancelled) { setPatients(null); setLoading(false); }
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <Card className="glass p-4 elevate-1">
        <div className="flex items-center gap-2 mb-3">
          <Users className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Recent patients</span>
        </div>
        <div className="space-y-2">
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
        </div>
      </Card>
    );
  }

  if (!patients || patients.length === 0) {
    // Non-fatal: hide when no patients or fetch failed (sandbox).
    return null;
  }

  return (
    <Card className="glass p-4 elevate-1">
      <div className="flex items-center gap-2 mb-3">
        <Users className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold">Recent patients</span>
        <button
          type="button"
          onClick={() => navigate("patients")}
          className="ml-auto text-[11px] text-primary hover:text-primary/80 hover:underline transition-colors"
        >
          View all →
        </button>
      </div>
      <div className="space-y-1.5">
        {patients.map((p, i) => {
          const daysSinceDischarge = Math.max(
            0,
            Math.floor((Date.now() - new Date(p.dischargeDate).getTime()) / 86400000),
          );
          const statusTone =
            p.status === "ACTIVE" ? "bg-emerald-500" :
            p.status === "RECOVERED" ? "bg-blue-500" :
            p.status === "READMITTED" ? "bg-red-500" :
            p.status === "LOST_TO_FOLLOWUP" ? "bg-amber-500" :
            "bg-muted-foreground";
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => navigate("patient-detail", { patientId: p.id })}
              className="w-full text-left flex items-center gap-3 rounded-lg border border-transparent hover:border-border hover:bg-muted/30 transition-all px-2 py-2 group"
            >
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold flex-shrink-0">
                {p.fullName.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{p.fullName}</div>
                <div className="text-[10px] text-muted-foreground flex items-center gap-1.5">
                  <span>{p.age}{p.gender.charAt(0)}</span>
                  <span>·</span>
                  <span className="truncate">{p.surgeryType}</span>
                </div>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <div className="text-right">
                  <div className="text-[10px] text-muted-foreground">Day {daysSinceDischarge}</div>
                  <div className="flex items-center gap-1 justify-end">
                    <span className={cn("h-1.5 w-1.5 rounded-full", statusTone)} />
                    <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{p.status.replace(/_/g, " ").toLowerCase()}</span>
                  </div>
                </div>
                <ArrowRight className="h-3.5 w-3.5 text-muted-foreground group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
              </div>
            </button>
          );
        })}
      </div>
    </Card>
  );
}

// ── Page ────────────────────────────────────────────────────────────────────
export function DashboardPage() {
  const { user } = useAuth();
  const [data, setData] = React.useState<DashboardResponse | null>(null);
  const [loading, setLoading] = React.useState(true);

  const [painTrend, setPainTrend] = React.useState<PainPoint[] | null>(null);
  const [painLoading, setPainLoading] = React.useState(true);

  const [insights, setInsights] = React.useState<InsightsResponse | null>(null);
  const [insightsLoading, setInsightsLoading] = React.useState(false);

  const [activityData, setActivityData] = React.useState<ActivityItem[]>([]);
  const [activityLoading, setActivityLoading] = React.useState(true);

  const firstName = (user?.name || "there").split(" ")[0];
  const today = new Date();

  // Fetch dashboard stats
  const loadDashboard = React.useCallback(async () => {
    setLoading(true);
    try {
      const d = await api<DashboardResponse>("/api/dashboard");
      setData(d);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch pain trend (7d) — uses the reports API for the small sparkline
  const loadPainTrend = React.useCallback(async () => {
    setPainLoading(true);
    try {
      const r = await api<{ painTrend: PainPoint[] }>("/api/reports?days=7");
      setPainTrend(r.painTrend || []);
    } catch {
      setPainTrend([]); // non-fatal — UI shows "Insufficient data"
    } finally {
      setPainLoading(false);
    }
  }, []);

  // Fetch recent activity (lightweight dedicated endpoint)
  const loadActivity = React.useCallback(async () => {
    setActivityLoading(true);
    try {
      const r = await api<ActivityResponse>("/api/activity");
      setActivityData(r.activities || []);
    } catch {
      setActivityData([]); // non-fatal
    } finally {
      setActivityLoading(false);
    }
  }, []);

  React.useEffect(() => {
    loadDashboard();
    loadPainTrend();
    loadActivity();
  }, [loadDashboard, loadPainTrend, loadActivity]);

  const generateInsights = async () => {
    setInsightsLoading(true);
    try {
      const r = await api<InsightsResponse>("/api/dashboard", { method: "POST" });
      setInsights(r);
      if (r.fallbackUsed) {
        toast("AI provider was unavailable — fallback summary shown.", {
          description: "Review the dashboard metrics directly.",
        });
      } else {
        toast.success("Weekly insights generated");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to generate insights");
    } finally {
      setInsightsLoading(false);
    }
  };

  const stats = data?.stats;
  const sortedEscalations = React.useMemo(() => {
    if (!data?.topEscalations) return [];
    return [...data.topEscalations].sort(
      (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    );
  }, [data?.topEscalations]);

  const hasCritical = !!stats && stats.criticalEscalations > 0;

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-6 md:space-y-8">
        {/* Welcome header — date card + greeting + status summary */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-5"
        >
          <div className="flex items-center gap-4">
            {/* Date card — a real visual moment, not a plain h1 */}
            <div className="flex flex-col items-center justify-center min-w-[68px] rounded-xl border border-border bg-card elevate-1 px-3 py-2 text-center">
              <span className="text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                {format(today, "MMM")}
              </span>
              <span className="num text-2xl font-semibold leading-none mt-0.5">{format(today, "d")}</span>
              <span className="text-[10px] text-muted-foreground mt-0.5">{format(today, "EEEE")}</span>
            </div>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl md:text-[1.75rem] font-semibold tracking-tight leading-tight">
                  {greeting(today)}, {firstName}
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                  {data?.hospital?.name || "—"}
                </p>
                {/* Status summary — mono numerics, purposeful color */}
                {!loading && stats && (
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-2 text-xs">
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <AlertTriangle className={cn("h-3.5 w-3.5", hasCritical ? "text-destructive" : "text-muted-foreground/60")} />
                      <span className="num font-semibold text-foreground">{stats.openEscalations}</span> open
                      {hasCritical && <span className="text-destructive font-medium">· {stats.criticalEscalations} critical</span>}
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground/60" />
                      <span className="num font-semibold text-foreground">{stats.checkinsDue24h}</span> due today
                    </span>
                    <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                      <Bot className="h-3.5 w-3.5 text-muted-foreground/60" />
                      <span className="num font-semibold text-foreground">{stats.aiRuns7d}</span> AI calls / wk
                    </span>
                  </div>
                )}
              </div>
              <LiveClock />
            </div>
          </div>
          <Button onClick={() => navigate("enroll")} className="glow-primary shrink-0">
            <UserPlus className="h-4 w-4" /> Enroll patient
          </Button>
        </motion.section>

        {/* Quick Stats Summary Bar — attention-drawing pills */}
        {!loading && stats && (stats.checkinsDue24h > 0 || stats.criticalEscalations > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, delay: 0.1 }}
            className="flex flex-wrap items-center gap-2"
          >
            {stats.checkinsDue24h > 0 && (
              <Badge
                variant="outline"
                className="gap-1.5 px-3 py-1 text-xs font-medium border-accent/40 bg-accent/10 text-accent-foreground hover:bg-accent/20 transition-colors cursor-pointer"
                onClick={() => navigate("checkins")}
              >
                <Clock className="h-3 w-3" />
                <span className="num font-semibold">{stats.checkinsDue24h}</span> {stats.checkinsDue24h === 1 ? "patient needs" : "patients need"} check-in today
              </Badge>
            )}
            {stats.criticalEscalations > 0 && (
              <Badge
                variant="outline"
                className="gap-1.5 px-3 py-1 text-xs font-medium border-destructive/40 bg-destructive/10 text-destructive hover:bg-destructive/20 transition-colors cursor-pointer"
                onClick={() => navigate("escalations")}
              >
                <AlertTriangle className="h-3 w-3" />
                <span className="num font-semibold">{stats.criticalEscalations}</span> critical {stats.criticalEscalations === 1 ? "escalation" : "escalations"} open
              </Badge>
            )}
          </motion.div>
        )}

        {/* Onboarding checklist (shows for hospital admins when < 100% complete) */}
        <OnboardingChecklist />

        {/* Stat cards — command-center readout */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <StatCard
            label="Total patients"
            value={stats?.totalPatients}
            hint={stats ? `${stats.activePatients} active · ${stats.newPatients7d} new (7d)` : undefined}
            trend={stats && stats.newPatients7d > 0 ? { dir: "up", text: `+${stats.newPatients7d}` } : undefined}
            icon={Users}
            loading={loading}
            delay={0}
          />
          <StatCard
            label="Open escalations"
            value={stats?.openEscalations}
            hint={stats ? `${stats.criticalEscalations} critical` : undefined}
            criticalCount={stats?.criticalEscalations}
            icon={AlertTriangle}
            loading={loading}
            delay={0.05}
          />
          <StatCard
            label="Check-ins due (24h)"
            value={stats?.checkinsDue24h}
            hint={stats ? `${stats.checkinsAnswered7d} answered (7d)` : undefined}
            icon={Clock}
            loading={loading}
            delay={0.1}
          />
          <StatCard
            label="AI calls (7d)"
            value={stats?.aiRuns7d}
            hint={stats ? `${stats.escalationsResolved7d} escalations resolved` : undefined}
            trend={stats && stats.escalationsResolved7d > 0 ? { dir: "up", text: `${stats.escalationsResolved7d} resolved`, good: true } : undefined}
            icon={Bot}
            loading={loading}
            delay={0.15}
          />
        </section>

        {/* System health + recent patients — 2-col grid on desktop */}
        <motion.section
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.16 }}
          className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6"
        >
          <SystemHealthWidget />
          <RecentPatientsWidget />
        </motion.section>

        {/* Quick Actions — 2×2 grid */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.17 }}
        >
          <h2 className="text-eyebrow text-muted-foreground mb-3">Quick actions</h2>
          <div className="grid grid-cols-2 gap-3 md:gap-4">
            {([
              { Icon: PhoneCall, title: "Log Check-in", desc: "Record a patient follow-up", view: "checkins" as const },
              { Icon: UserPlus, title: "Enroll Patient", desc: "Register a new discharge", view: "enroll" as const },
              { Icon: AlertTriangle, title: "View Escalations", desc: "Review open risk alerts", view: "escalations" as const },
              { Icon: Brain, title: "Run AI Triage", desc: "Generate a risk summary", view: "risk-summary" as const },
            ] as const).map((action, i) => (
              <motion.div
                key={action.view}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: 0.17 + i * 0.06, ease: [0.2, 0.8, 0.2, 1] }}
              >
                <button
                  type="button"
                  onClick={() => navigate(action.view)}
                  className="w-full text-left bg-card border rounded-xl p-4 hover:scale-[1.02] transition-transform cursor-pointer group"
                >
                  <action.Icon className="h-5 w-5 text-primary mb-2 group-hover:text-primary/80 transition-colors" />
                  <div className="text-sm font-medium leading-snug">{action.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{action.desc}</div>
                </button>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* Today's Focus — recovery ring + quick actions */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.18 }}
          className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6"
        >
          {/* Recovery overview ring */}
          <Card className="glass lg:col-span-1 flex flex-col items-center justify-center text-center p-6 elevate-1">
            <div className="text-eyebrow text-muted-foreground mb-4">Recovery overview</div>
            {loading || !stats ? (
              <Skeleton className="h-[120px] w-[120px] rounded-full" />
            ) : (
              <>
                <RecoveryRing
                  value={stats.totalPatients > 0
                    ? Math.max(0, Math.min(100, ((stats.totalPatients - stats.openEscalations) / stats.totalPatients) * 100))
                    : 100}
                  label="on track"
                  sublabel={`${stats.totalPatients - stats.openEscalations} of ${stats.totalPatients} patients`}
                />
                <div className="mt-4 grid grid-cols-2 gap-3 w-full text-center">
                  <div className="rounded-lg bg-primary/5 p-2">
                    <div className="num text-lg font-bold text-primary">{stats.checkinsAnswered7d}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">answered (7d)</div>
                  </div>
                  <div className="rounded-lg bg-accent/10 p-2">
                    <div className="num text-lg font-bold">{stats.escalationsResolved7d}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wider">resolved (7d)</div>
                  </div>
                </div>
                {(stats.readmittedPatients > 0 || stats.recoveredPatients > 0) && (
                  <div className="mt-2 grid grid-cols-2 gap-3 w-full text-center">
                    <div className="rounded-lg bg-primary/10 p-2">
                      <div className="num text-lg font-bold text-primary">{stats.recoveredPatients}</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">recovered</div>
                    </div>
                    {/* readmitted = clinical risk signal → rose is appropriate here */}
                    <div className="rounded-lg bg-destructive/10 p-2">
                      <div className="num text-lg font-bold text-destructive">{stats.readmittedPatients}</div>
                      <div className="text-[10px] text-muted-foreground uppercase tracking-wider">readmitted</div>
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>

          {/* Quick actions */}
          <Card className="glass lg:col-span-2 elevate-1">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-base">
                <Sparkles className="h-4 w-4 text-primary" />
                Today&rsquo;s focus
              </CardTitle>
              <CardDescription>Quick actions based on your current workload</CardDescription>
            </CardHeader>
            <CardContent className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
              <QuickAction
                icon={AlertTriangle}
                label="Review escalations"
                hint={stats ? `${stats.openEscalations} open` : ""}
                urgent={stats ? stats.criticalEscalations > 0 : false}
                bgColor="destructive"
                onClick={() => navigate("escalations")}
              />
              <QuickAction
                icon={Clock}
                label="Log check-ins"
                hint={stats ? `${stats.checkinsDue24h} due` : ""}
                bgColor="accent"
                onClick={() => navigate("checkins")}
              />
              <QuickAction
                icon={UserPlus}
                label="Enroll patient"
                bgColor="primary"
                onClick={() => navigate("enroll")}
              />
              <QuickAction
                icon={Brain}
                label="AI insights"
                hint="Weekly summary"
                bgColor="primary"
                onClick={() => {
                  const el = document.getElementById("weekly-insights");
                  el?.scrollIntoView({ behavior: "smooth", block: "center" });
                }}
              />
              <QuickAction
                icon={BarChart3}
                label="View reports"
                hint="Analytics & trends"
                bgColor="accent"
                onClick={() => navigate("reports")}
              />
            </CardContent>
          </Card>
        </motion.section>

        {/* Two-column: worklist + check-ins */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          {/* Worklist — 2/3 */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
            className="lg:col-span-2"
          >
            <Card className="glass h-full elevate-1">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-primary" />
                  Prioritized worklist
                  {!loading && sortedEscalations.length > 0 && (
                    <Badge variant="outline" className="ml-1 num text-[10px]">{sortedEscalations.length}</Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Open escalations sorted by severity (CRITICAL first).
                </CardDescription>
              </CardHeader>
              <CardContent className="p-3 md:p-4">
                {loading ? (
                  <div className="space-y-3 p-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-20 w-full" />
                    ))}
                  </div>
                ) : sortedEscalations.length === 0 ? (
                  <EmptyWorklist />
                ) : (
                  <ul className="space-y-2 max-h-[28rem] overflow-y-auto fancy-scroll pr-1">
                    {sortedEscalations.map((e) => (
                      <WorklistItem key={e.id} e={e} />
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Upcoming check-ins + Risk distribution — 1/3 stacked */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.25 }}
            className="space-y-4 md:space-y-6"
          >
            <Card className="glass elevate-1">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2">
                  <CalendarPlus className="h-4 w-4 text-primary" />
                  Upcoming check-ins
                </CardTitle>
                <CardDescription>Next 24 hours.</CardDescription>
              </CardHeader>
              <CardContent className="p-3 md:p-4">
                {loading ? (
                  <div className="space-y-3 p-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-14 w-full" />
                    ))}
                  </div>
                ) : !data?.upcomingCheckins || data.upcomingCheckins.length === 0 ? (
                  <EmptyState
                    icon={CheckCircle2}
                    title="No check-ins due"
                    description="No check-ins are scheduled in the next 24 hours."
                    actionLabel="Enroll a patient"
                    onAction={() => navigate("enroll")}
                  />
                ) : (
                  <ul className="space-y-1.5 max-h-96 overflow-y-auto fancy-scroll pr-1">
                    {data.upcomingCheckins.map((c) => (
                      <UpcomingCheckinItem key={c.id} c={c} />
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            <RiskDistributionWidget />
          </motion.div>
        </section>

        {/* Today's tasks + Medication adherence */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.28 }}
            className="lg:col-span-2"
          >
            <TodaysTasksWidget />
          </motion.div>
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.32 }}
          >
            <MedAdherenceWidget />
          </motion.div>
        </section>

        {/* Recent activity + pain trend */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          {/* Activity feed — 2/3 */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.3 }}
            className="lg:col-span-2"
          >
            <RecentActivity activities={activityData} loading={activityLoading} />
          </motion.div>

          {/* Pain trend + Insights — 1/3 stacked */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.35 }}
            className="space-y-4 md:space-y-6"
          >
            <Card className="glass elevate-1">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Stethoscope className="h-4 w-4 text-primary" />
                  Pain trend (7d)
                </CardTitle>
                <CardDescription>Average reported pain, 0–10.</CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                {painLoading ? (
                  <Skeleton className="h-24 w-full" />
                ) : !painTrend || painTrend.length === 0 ? (
                  <div className="text-xs text-muted-foreground italic py-6 text-center">
                    Insufficient data
                  </div>
                ) : (
                  <div className="h-24 w-full draw-in">
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={painTrend} margin={{ top: 4, right: 4, bottom: 0, left: -28 }}>
                        <defs>
                          <linearGradient id="painGrad" x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.5} />
                            <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                          </linearGradient>
                        </defs>
                        <XAxis dataKey="day" hide />
                        <YAxis domain={[0, 10]} hide />
                        <Tooltip
                          contentStyle={{
                            background: "var(--popover)",
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                            fontSize: 12,
                            color: "var(--popover-foreground)",
                            boxShadow: "0 4px 12px -2px oklch(0.18 0.02 200 / 0.12)",
                          }}
                          labelStyle={{ fontSize: 11, color: "var(--muted-foreground)" }}
                          itemStyle={{ color: "var(--popover-foreground)" }}
                          formatter={(v: number) => [v, "Avg pain"]}
                        />
                        <Area
                          type="monotone"
                          dataKey="avgPain"
                          stroke="var(--chart-1)"
                          strokeWidth={2}
                          fill="url(#painGrad)"
                          dot={false}
                          activeDot={{ r: 3, fill: "var(--chart-1)" }}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Weekly insights */}
            <Card className="glass elevate-1" id="weekly-insights">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Brain className="h-4 w-4 text-primary" />
                  Weekly insights
                </CardTitle>
                <CardDescription>AI-generated summary of the last 7 days.</CardDescription>
                <CardAction>
                  <Button
                    size="sm"
                    onClick={generateInsights}
                    disabled={insightsLoading}
                  >
                    {insightsLoading ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Sparkles className="h-4 w-4" />
                    )}
                    {insightsLoading ? "Generating…" : "Generate"}
                  </Button>
                </CardAction>
              </CardHeader>
              <CardContent className="p-4">
                {!insights ? (
                  <p className="text-xs text-muted-foreground">
                    Click <span className="text-foreground font-medium">Generate</span> to run the Insights Agent over your real aggregate data.
                  </p>
                ) : (
                  <div className="space-y-3">
                    {insights.fallbackUsed && (
                      <Alert className="border-accent/60 bg-accent/10 text-accent-foreground">
                        <AlertTriangle className="h-4 w-4" />
                        <AlertTitle className="text-xs">Fallback summary</AlertTitle>
                        <AlertDescription className="text-xs">
                          AI provider was unavailable — this is a fallback summary. Review the dashboard metrics directly.
                        </AlertDescription>
                      </Alert>
                    )}
                    <div className="rounded-lg border border-primary/30 bg-primary/5 p-3">
                      <p className="text-sm leading-relaxed whitespace-pre-wrap">{insights.summary}</p>
                    </div>
                    <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                      <Sparkles className="h-3 w-3" />
                      AI is decision support, not a diagnosis.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </section>
      </div>
    </MotionConfig>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StatCard({
  label, value, hint, icon: Icon, loading, criticalCount, delay, trend,
}: {
  label: string;
  value: number | undefined;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  loading: boolean;
  criticalCount?: number;
  delay: number;
  trend?: { dir: "up" | "down"; text: string; good?: boolean };
}) {
  const isCritical = typeof criticalCount === "number" && criticalCount > 0;
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay, ease: [0.2, 0.8, 0.2, 1] }}
    >
      <Card
        className={cn(
          "glass elevate-1 elevate-hover h-full overflow-hidden",
          isCritical && "ring-1 ring-destructive/30"
        )}
      >
        <CardContent className="p-4 md:p-5 flex flex-col gap-2.5">
          <div className="flex items-center justify-between">
            <span className="text-eyebrow text-muted-foreground">{label}</span>
            <span
              className={cn(
                "flex items-center justify-center h-7 w-7 rounded-md transition-colors",
                isCritical ? "bg-destructive/10 text-destructive live-pulse" : "bg-primary/10 text-primary"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
          </div>
          {loading ? (
            <Skeleton className="h-9 w-20" />
          ) : (
            <div className="flex items-baseline gap-2 flex-wrap">
              <span className="num text-3xl md:text-[2rem] font-semibold leading-none tracking-tight">
                {value ?? 0}
              </span>
              {isCritical ? (
                <Badge variant="outline" className="risk-critical border-transparent text-[10px] gap-1">
                  <span className="h-1.5 w-1.5 rounded-full bg-current" />
                  {criticalCount} critical
                </Badge>
              ) : trend ? (
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 text-[11px] font-medium num",
                    trend.good ? "text-primary" : "text-muted-foreground"
                  )}
                >
                  {trend.dir === "up" && <ArrowUpRight className="h-3 w-3" />}
                  {trend.text}
                </span>
              ) : null}
            </div>
          )}
          {hint && !loading && (
            <p className="text-[11px] text-muted-foreground">{hint}</p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function WorklistItem({ e }: { e: TopEscalation }) {
  const isCritical = e.severity === "CRITICAL";
  return (
    <li
      className={cn(
        "group relative rounded-lg border border-border bg-card/60 hover:border-primary/40 hover:bg-card transition-colors overflow-hidden",
        severityRail(e.severity),
        isCritical && "live-pulse"
      )}
    >
      <div className="flex items-start gap-3 p-3 md:p-4 pl-4">
        {/* Severity icon — glanceable without reading the badge */}
        <span
          className={cn(
            "flex-shrink-0 flex items-center justify-center h-7 w-7 rounded-md mt-0.5",
            severityClass(e.severity)
          )}
        >
          <AlertTriangle className="h-3.5 w-3.5" />
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider", severityClass(e.severity))}>
              {e.severity}
            </span>
            <span className="text-sm font-medium truncate">{e.patientName}</span>
            <span className="text-[11px] text-muted-foreground">·</span>
            <span className="text-[11px] text-muted-foreground truncate">{e.surgeryType}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {e.reason || "No reason recorded."}
          </p>
          <p className="text-[11px] text-muted-foreground mt-1 num">
            Opened {formatDistanceToNow(new Date(e.createdAt), { addSuffix: true })} · status {e.status.replace("_", " ").toLowerCase()}
          </p>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="opacity-80 group-hover:opacity-100 shrink-0"
          onClick={() => navigate("escalations", { escalationId: e.id })}
        >
          Open <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </li>
  );
}

function UpcomingCheckinItem({ c }: { c: UpcomingCheckin }) {
  const dt = new Date(c.scheduledFor);
  return (
    <li className="group rounded-md border border-border bg-card/60 hover:border-primary/40 hover:bg-card transition-colors p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{c.patientName}</p>
          <p className="text-[11px] text-muted-foreground truncate">{c.surgeryType}</p>
          <p className="text-[11px] text-muted-foreground mt-0.5 num">
            {format(dt, "d MMM, h:mm a")} ·{" "}
            {formatDistanceToNow(dt, { addSuffix: true })}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[11px] opacity-80 group-hover:opacity-100 shrink-0"
          onClick={() => navigate("checkins")}
        >
          Log <ArrowRight className="h-3 w-3" />
        </Button>
      </div>
    </li>
  );
}

function EmptyWorklist() {
  return (
    <div className="flex flex-col items-center justify-center text-center py-12 px-4">
      <span className="relative flex items-center justify-center h-14 w-14 rounded-full bg-primary/10 text-primary mb-4">
        <CheckCircle2 className="h-7 w-7" />
        <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-background">
          <span className="live-dot h-2 w-2 rounded-full bg-primary" />
        </span>
      </span>
      <p className="text-sm font-semibold">No open escalations right now</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">
        Every patient is currently on track. This is the goal — use the breathing room to log check-ins or enroll new patients.
      </p>
      <div className="flex items-center gap-2 mt-4">
        <Button size="sm" variant="outline" onClick={() => navigate("checkins")}>
          <Clock className="h-3.5 w-3.5" /> Log check-ins
        </Button>
        <Button size="sm" variant="ghost" onClick={() => navigate("patients")}>
          View patients <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  );
}

function EmptyState({
  icon: Icon, title, description, actionLabel, onAction,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-10 px-4">
      <span className="flex items-center justify-center h-12 w-12 rounded-full bg-secondary text-muted-foreground mb-3">
        <Icon className="h-6 w-6" />
      </span>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-xs">{description}</p>
      {actionLabel && onAction && (
        <Button size="sm" variant="outline" className="mt-4" onClick={onAction}>
          {actionLabel} <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      )}
    </div>
  );
}

// ── Quick action card ───────────────────────────────────────────────────────
function QuickAction({
  icon: Icon, label, hint, urgent, bgColor, onClick,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  hint?: string;
  urgent?: boolean;
  bgColor?: "primary" | "accent" | "destructive";
  onClick: () => void;
}) {
  const bgConfig: Record<string, { iconBg: string; iconColor: string; hoverBorder: string; subtleBg: string }> = {
    primary:   { iconBg: "bg-primary/10",     iconColor: "text-primary group-hover:bg-primary/20",     hoverBorder: "hover:border-primary/30 hover:bg-primary/5",   subtleBg: "bg-primary/[0.03]" },
    accent:    { iconBg: "bg-accent/10",       iconColor: "text-accent-foreground group-hover:bg-accent/20", hoverBorder: "hover:border-accent/30 hover:bg-accent/5", subtleBg: "bg-accent/[0.03]" },
    destructive: { iconBg: "bg-destructive/10", iconColor: "text-destructive group-hover:bg-destructive/20", hoverBorder: "hover:border-destructive/30 hover:bg-destructive/5", subtleBg: "bg-destructive/[0.03]" },
  };
  const cfg = bgConfig[bgColor || (urgent ? "destructive" : "primary")];

  return (
    <button
      onClick={onClick}
      className={cn(
        "group relative flex flex-col items-start gap-2 p-3.5 rounded-xl border text-left transition-all duration-200 elevate-1 elevate-hover hover:-translate-y-0.5",
        urgent
          ? "border-destructive/30 bg-destructive/5 hover:border-destructive/50"
          : cn("border-border", cfg.subtleBg, cfg.hoverBorder)
      )}
    >
      <span className={cn(
        "flex items-center justify-center h-8 w-8 rounded-lg transition-colors",
        urgent ? "bg-destructive/10 text-destructive" : cn(cfg.iconBg, cfg.iconColor)
      )}>
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex-1">
        <div className="text-xs font-semibold leading-tight">{label}</div>
        {hint && <div className="text-[10px] text-muted-foreground mt-0.5 num">{hint}</div>}
      </div>
      <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all" />
      {urgent && (
        <span className="absolute top-2.5 right-2.5 flex h-2 w-2 rounded-full bg-destructive live-pulse" />
      )}
    </button>
  );
}

// ── Risk distribution widget ────────────────────────────────────────────────
interface RiskDistribution {
  CRITICAL: number;
  HIGH: number;
  MEDIUM: number;
  LOW: number;
  UNASSESSED: number;
}
interface RiskSummaryResponse {
  distribution: RiskDistribution;
  stats: { total: number; assessed: number; unassessed: number };
}

const RISK_ROWS: { key: keyof RiskDistribution; label: string; cls: string; barCls: string }[] = [
  { key: "CRITICAL",   label: "Critical",     cls: "risk-critical",   barCls: "bg-destructive" },
  { key: "HIGH",       label: "High",         cls: "risk-high",       barCls: "bg-[oklch(0.7_0.16_45)]" },
  { key: "MEDIUM",     label: "Medium",       cls: "risk-medium",     barCls: "bg-accent" },
  { key: "LOW",        label: "Low",          cls: "risk-low",        barCls: "bg-primary" },
  { key: "UNASSESSED", label: "Not assessed", cls: "bg-muted text-muted-foreground", barCls: "bg-muted-foreground/40" },
];

function RiskDistributionWidget() {
  const { user } = useAuth();
  const [data, setData] = React.useState<RiskSummaryResponse | null>(null);
  const [loading, setLoading] = React.useState(true);

  // Only HOSPITAL_ADMIN + COORDINATOR can call /api/risk-summary
  const canView = user?.role === "HOSPITAL_ADMIN" || user?.role === "COORDINATOR";

  React.useEffect(() => {
    if (!canView) { setLoading(false); return; }
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await api<RiskSummaryResponse>("/api/risk-summary");
        if (!cancelled) setData(r);
      } catch {
        // non-fatal — widget shows nothing
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [canView]);

  if (!canView) return null;

  const dist = data?.distribution;
  const total = dist ? dist.CRITICAL + dist.HIGH + dist.MEDIUM + dist.LOW + dist.UNASSESSED : 0;
  const allUnassessed = !!dist && (dist.CRITICAL + dist.HIGH + dist.MEDIUM + dist.LOW === 0);

  return (
    <Card className="glass elevate-1">
      <CardHeader className="border-b border-border">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlert className="h-4 w-4 text-primary" />
          Risk distribution
        </CardTitle>
        <CardDescription>Patients by AI risk level.</CardDescription>
        <CardAction>
          <Button
            size="sm"
            variant="ghost"
            className="text-[11px] h-7 px-2"
            onClick={() => navigate("risk-summary")}
          >
            View all <ChevronRight className="h-3 w-3" />
          </Button>
        </CardAction>
      </CardHeader>
      <CardContent className="p-3 md:p-4">
        {loading ? (
          <div className="space-y-2.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        ) : allUnassessed ? (
          <div className="flex flex-col items-center justify-center text-center py-6 px-3">
            <span className="flex items-center justify-center h-10 w-10 rounded-full bg-accent/20 text-accent-foreground mb-2">
              <ShieldAlert className="h-5 w-5" />
            </span>
            <p className="text-xs font-medium">No risk assessments yet</p>
            <p className="text-[11px] text-muted-foreground mt-1 max-w-[16rem]">
              Risk is assessed automatically at enrollment. Enroll a patient to populate this view.
            </p>
            <Button size="sm" variant="outline" className="mt-3 h-7 text-[11px]" onClick={() => navigate("enroll")}>
              <UserPlus className="h-3 w-3" /> Enroll patient
            </Button>
          </div>
        ) : (
          <ul className="space-y-2">
            {RISK_ROWS.map(({ key, label, cls, barCls }, i) => {
              const count = dist?.[key] ?? 0;
              const pct = total > 0 ? (count / total) * 100 : 0;
              return (
                <li key={key} className="flex items-center gap-2.5">
                  <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider w-[88px] text-center flex-shrink-0", cls)}>
                    {label}
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
                    <motion.div
                      className={cn("h-full rounded-full", barCls)}
                      initial={{ width: 0 }}
                      animate={{ width: `${pct}%` }}
                      transition={{ duration: 0.7, delay: 0.05 * i, ease: [0.2, 0.8, 0.2, 1] }}
                    />
                  </div>
                  <span className="num text-xs font-semibold w-6 text-right tabular-nums">{count}</span>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

// ── Recent activity component ────────────────────────────────────────────────
function RecentActivity({
  activities,
  loading,
}: {
  activities: ActivityItem[];
  loading: boolean;
}) {
  return (
    <Card className="glass h-full elevate-1">
      <CardHeader className="border-b border-border">
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-primary" />
              Recent activity
            </CardTitle>
            <CardDescription className="mt-1">Latest events across all patients.</CardDescription>
          </div>
          {!loading && activities.length > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="text-[11px] h-7 px-2 shrink-0"
              onClick={() => navigate("timeline")}
            >
              View all <ChevronRight className="h-3 w-3" />
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-4 md:p-6">
        {loading ? (
          <div className="space-y-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : activities.length === 0 ? (
          <EmptyState
            icon={Inbox}
            title="No activity yet"
            description="Patient enrollments, check-ins, and escalations will appear here."
            actionLabel="Enroll a patient"
            onAction={() => navigate("enroll")}
          />
        ) : (
          <ol className="relative max-h-96 overflow-y-auto fancy-scroll pr-2 pl-1">
            <span className="absolute left-3 top-2 bottom-2 w-px bg-border" aria-hidden />
            {activities.map((t) => {
              const { Icon, cls } = timelineIcon(t.eventType);
              return (
                <li key={t.id} className="relative flex gap-3 pb-4 last:pb-0">
                  <span
                    className={cn(
                      "z-10 flex-shrink-0 flex items-center justify-center rounded-full h-6 w-6 ring-4 ring-card",
                      cls
                    )}
                  >
                    <Icon className="h-3 w-3" />
                  </span>
                  <div className="flex-1 min-w-0 -mt-0.5">
                    <div className="flex items-baseline justify-between gap-2 flex-wrap">
                      <p className="text-sm font-medium leading-tight">{t.title}</p>
                      <span className="text-[11px] text-muted-foreground whitespace-nowrap num">
                        {formatDistanceToNow(new Date(t.occurredAt), { addSuffix: true })}
                      </span>
                    </div>
                    {t.detail && (
                      <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{t.detail}</p>
                    )}
                    {t.patientName && (
                      <p className="text-[11px] text-muted-foreground mt-0.5">
                        Patient: <span className="text-foreground/80 font-medium">{t.patientName}</span>
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}
