// Ojas — My workload page. A personalized worklist for the logged-in
// coordinator/doctor: their assigned escalations, unassigned escalations
// they can pick up, their patients' upcoming check-ins, and their recent
// activity. Distinct from the hospital-wide dashboard — this is
// "what do I need to do today?" All data from /api/my-workload.
"use client";

import * as React from "react";
import { MotionConfig, motion } from "framer-motion";
import { toast } from "sonner";
import { formatDistanceToNow, format } from "date-fns";
import {
  ClipboardList, AlertTriangle, CheckCircle2, PhoneCall,
  ChevronRight, ArrowRight, Sparkles, Activity, UserPlus,
  Bot, CalendarPlus, Hand, Clock,
} from "lucide-react";

import { api, useAuth } from "@/lib/auth-context";
import { navigate } from "@/lib/router";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// ── Types matching the /api/my-workload contract ────────────────────────────
type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface EscalationPatient {
  id: string;
  fullName: string;
  surgeryType: string | null;
  age?: number | null;
}

interface MyEscalation {
  id: string;
  severity: Severity;
  status: string;
  reason: string;
  aiProposed: boolean;
  aiConfidence: number | null;
  patient: EscalationPatient;
  createdAt: string;
}

interface UnassignedEscalation {
  id: string;
  severity: Severity;
  reason: string;
  aiProposed: boolean;
  patient: { id: string; fullName: string; surgeryType: string | null };
  createdAt: string;
}

interface UpcomingCheckin {
  id: string;
  scheduledFor: string;
  patient: { id: string; fullName: string; surgeryType: string | null };
}

interface RecentActivityItem {
  id: string;
  eventType: string;
  title: string;
  detail: string | null;
  occurredAt: string;
  patientName: string | null;
}

interface MyWorkloadResponse {
  user: { id: string; name: string; role: string };
  stats: { assigned: number; resolved7d: number; checkinsAnswered7d: number };
  myEscalations: MyEscalation[];
  unassignedEscalations: UnassignedEscalation[];
  upcomingCheckins: UpcomingCheckin[];
  recentActivity: RecentActivityItem[];
}

// ── Helpers ──────────────────────────────────────────────────────────────────
const SEVERITY_ORDER: Record<Severity, number> = {
  CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3,
};

function severityClass(s: Severity): string {
  switch (s) {
    case "CRITICAL": return "risk-critical";
    case "HIGH": return "risk-high";
    case "MEDIUM": return "risk-medium";
    case "LOW": return "risk-low";
  }
}

function greeting(d: Date): string {
  const h = d.getHours();
  if (h < 12) return "Good morning";
  if (h < 17) return "Good afternoon";
  return "Good evening";
}

function activityIcon(eventType: string) {
  const t = eventType.toUpperCase();
  if (t.includes("ENROLL")) return { Icon: UserPlus, cls: "bg-primary/15 text-primary" };
  if (t.includes("ESCALAT")) return { Icon: AlertTriangle, cls: "risk-high" };
  if (t.includes("CHECKIN") || t.includes("CHECK_IN")) return { Icon: PhoneCall, cls: "bg-accent text-accent-foreground" };
  if (t.includes("CALL")) return { Icon: Bot, cls: "bg-primary/15 text-primary" };
  if (t.includes("STATUS")) return { Icon: Activity, cls: "bg-secondary text-secondary-foreground" };
  if (t.includes("RESOLVE")) return { Icon: CheckCircle2, cls: "bg-primary/15 text-primary" };
  return { Icon: Activity, cls: "bg-secondary text-secondary-foreground" };
}

// ── Page ─────────────────────────────────────────────────────────────────────
export function MyWorkloadPage() {
  const { user } = useAuth();
  const [data, setData] = React.useState<MyWorkloadResponse | null>(null);
  const [loading, setLoading] = React.useState(true);

  const firstName = (user?.name || "there").split(" ")[0];
  const today = new Date();

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<MyWorkloadResponse>("/api/my-workload");
      setData(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load your worklist");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const sortedMyEscalations = React.useMemo(() => {
    if (!data?.myEscalations) return [];
    return [...data.myEscalations].sort(
      (a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    );
  }, [data?.myEscalations]);

  const stats = data?.stats;

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
              <ClipboardList className="h-6 w-6 text-primary" />
              Your worklist
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {greeting(today)}, {firstName}.{" "}
              {stats ? (
                <span className="font-medium text-foreground/80">
                  {stats.assigned} assigned · {stats.resolved7d} resolved (7d)
                </span>
              ) : null}
            </p>
          </div>
          <Button onClick={() => navigate("escalations")} variant="outline">
            <AlertTriangle className="h-4 w-4" /> All escalations
          </Button>
        </motion.section>

        {/* Summary cards */}
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          <StatCard
            label="My open escalations"
            value={stats?.assigned}
            hint="Assigned to you, OPEN or IN_PROGRESS"
            icon={AlertTriangle}
            loading={loading}
            delay={0}
            tone={stats && stats.assigned > 0 ? "default" : "good"}
          />
          <StatCard
            label="Resolved this week"
            value={stats?.resolved7d}
            hint="Escalations you resolved (7d)"
            icon={CheckCircle2}
            loading={loading}
            delay={0.06}
            tone="good"
          />
          <StatCard
            label="Check-ins answered (24h)"
            value={stats?.checkinsAnswered7d}
            hint="Across your hospital, last 24h"
            icon={PhoneCall}
            loading={loading}
            delay={0.12}
            tone="default"
          />
        </section>

        {/* Two-column: My escalations (2/3) + Right rail (1/3) */}
        <section className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-6">
          {/* Left: My escalations — 2/3 */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.18 }}
            className="lg:col-span-2"
          >
            <Card className="glass h-full">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-primary" />
                  My escalations
                </CardTitle>
                <CardDescription>
                  Open escalations assigned to you, sorted by severity (CRITICAL first).
                </CardDescription>
              </CardHeader>
              <CardContent className="p-3 md:p-4">
                {loading ? (
                  <div className="space-y-3 p-2">
                    {Array.from({ length: 3 }).map((_, i) => (
                      <Skeleton key={i} className="h-24 w-full" />
                    ))}
                  </div>
                ) : sortedMyEscalations.length === 0 ? (
                  <EmptyState
                    icon={CheckCircle2}
                    title="You have no assigned escalations"
                    description="Pick up an unassigned one from the right."
                  />
                ) : (
                  <ul className="space-y-2 max-h-[600px] overflow-y-auto fancy-scroll pr-1">
                    {sortedMyEscalations.map((e) => (
                      <MyEscalationCard key={e.id} e={e} />
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* Right rail: pick up + upcoming check-ins — 1/3 */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.24 }}
            className="space-y-4 md:space-y-6"
          >
            {/* Available to pick up */}
            <Card className="glass">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Hand className="h-4 w-4 text-accent" />
                  Available to pick up
                </CardTitle>
                <CardDescription>
                  Unassigned escalations. Open one to take it.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-3 md:p-4">
                {loading ? (
                  <div className="space-y-3 p-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <Skeleton key={i} className="h-20 w-full" />
                    ))}
                  </div>
                ) : !data?.unassignedEscalations || data.unassignedEscalations.length === 0 ? (
                  <EmptyState
                    icon={CheckCircle2}
                    title="No unassigned escalations"
                    description="Great work!"
                    compact
                  />
                ) : (
                  <ul className="space-y-2 max-h-80 overflow-y-auto fancy-scroll pr-1">
                    {data.unassignedEscalations.map((e) => (
                      <PickupItem key={e.id} e={e} />
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>

            {/* Upcoming check-ins */}
            <Card className="glass">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2 text-base">
                  <CalendarPlus className="h-4 w-4 text-primary" />
                  Upcoming check-ins
                </CardTitle>
                <CardDescription>
                  Scheduled in the next 24 hours.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-3 md:p-4">
                {loading ? (
                  <div className="space-y-3 p-2">
                    {Array.from({ length: 2 }).map((_, i) => (
                      <Skeleton key={i} className="h-16 w-full" />
                    ))}
                  </div>
                ) : !data?.upcomingCheckins || data.upcomingCheckins.length === 0 ? (
                  <EmptyState
                    icon={Clock}
                    title="No check-ins due"
                    description="No check-ins are due in the next 24h."
                    compact
                  />
                ) : (
                  <ul className="space-y-1.5 max-h-80 overflow-y-auto fancy-scroll pr-1">
                    {data.upcomingCheckins.map((c) => (
                      <UpcomingCheckinItem key={c.id} c={c} />
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </section>

        {/* Recent activity */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
        >
          <Card className="glass">
            <CardHeader className="border-b border-border">
              <CardTitle className="flex items-center gap-2 text-base">
                <Activity className="h-4 w-4 text-primary" />
                Your recent activity
              </CardTitle>
              <CardDescription>
                The latest events you triggered across patients.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4 md:p-6">
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : !data?.recentActivity || data.recentActivity.length === 0 ? (
                <EmptyState
                  icon={Activity}
                  title="No activity yet"
                  description="Your enrollments, check-ins, and escalations will appear here."
                />
              ) : (
                <ol className="relative max-h-96 overflow-y-auto fancy-scroll pr-2 pl-1">
                  <span className="absolute left-3 top-2 bottom-2 w-px bg-border" aria-hidden />
                  {data.recentActivity.map((t) => {
                    const { Icon, cls } = activityIcon(t.eventType);
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
                            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
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
        </motion.section>
      </div>
    </MotionConfig>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function StatCard({
  label, value, hint, icon: Icon, loading, delay, tone = "default",
}: {
  label: string;
  value: number | undefined;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  loading: boolean;
  delay: number;
  tone?: "default" | "good";
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
            <span
              className={cn(
                "flex items-center justify-center h-7 w-7 rounded-md",
                tone === "good" ? "bg-primary/15 text-primary" : "bg-primary/10 text-primary"
              )}
            >
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
          {hint && !loading && (
            <p className="text-[11px] text-muted-foreground">{hint}</p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function MyEscalationCard({ e }: { e: MyEscalation }) {
  const ai = e.aiProposed;
  return (
    <li className="group rounded-lg border border-border bg-card/60 hover:border-primary/40 hover:bg-card transition-colors p-3 md:p-4">
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                "px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider",
                severityClass(e.severity)
              )}
            >
              {e.severity}
            </span>
            <button
              onClick={() => navigate("patient-detail", { patientId: e.patient.id })}
              className="text-sm font-medium truncate hover:text-primary hover:underline text-left"
            >
              {e.patient.fullName}
            </button>
            {typeof e.patient.age === "number" && (
              <>
                <span className="text-[11px] text-muted-foreground">·</span>
                <span className="text-[11px] text-muted-foreground">{e.patient.age}y</span>
              </>
            )}
            <span className="text-[11px] text-muted-foreground">·</span>
            <span className="text-[11px] text-muted-foreground">{e.patient.surgeryType || "—"}</span>
          </div>
          <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
            {e.reason || "No reason recorded."}
          </p>
          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            <p className="text-[11px] text-muted-foreground">
              Opened {formatDistanceToNow(new Date(e.createdAt), { addSuffix: true })} ·{" "}
              {e.status.replace(/_/g, " ").toLowerCase()}
            </p>
            {ai && (
              <span className="inline-flex items-center gap-1 text-[10px] font-medium text-primary bg-primary/10 px-1.5 py-0.5 rounded">
                <Sparkles className="h-2.5 w-2.5" />
                AI-proposed
                {typeof e.aiConfidence === "number" && (
                  <span className="text-muted-foreground">· {Math.round(e.aiConfidence * 100)}%</span>
                )}
              </span>
            )}
          </div>
        </div>
        <Button
          size="sm"
          variant="outline"
          className="opacity-80 group-hover:opacity-100"
          onClick={() => navigate("escalations", { escalationId: e.id })}
        >
          Open <ChevronRight className="h-3.5 w-3.5" />
        </Button>
      </div>
    </li>
  );
}

function PickupItem({ e }: { e: UnassignedEscalation }) {
  return (
    <li className="group rounded-md border border-border bg-card/60 hover:border-primary/40 hover:bg-card transition-colors p-2.5">
      <div className="flex items-start gap-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span
              className={cn(
                "px-1.5 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider",
                severityClass(e.severity)
              )}
            >
              {e.severity}
            </span>
            <button
              onClick={() => navigate("patient-detail", { patientId: e.patient.id })}
              className="text-xs font-medium truncate hover:text-primary hover:underline text-left"
            >
              {e.patient.fullName}
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground mt-1 line-clamp-2">
            {e.reason || "No reason recorded."}
          </p>
          <p className="text-[10px] text-muted-foreground mt-1">
            {formatDistanceToNow(new Date(e.createdAt), { addSuffix: true })}
            {e.aiProposed && (
              <span className="ml-2 inline-flex items-center gap-0.5 text-primary">
                <Sparkles className="h-2.5 w-2.5" /> AI
              </span>
            )}
          </p>
        </div>
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-[11px] opacity-80 group-hover:opacity-100 flex-shrink-0"
          onClick={() => navigate("escalations", { escalationId: e.id })}
        >
          Take <ArrowRight className="h-3 w-3" />
        </Button>
      </div>
    </li>
  );
}

function UpcomingCheckinItem({ c }: { c: UpcomingCheckin }) {
  const dt = new Date(c.scheduledFor);
  return (
    <li className="group rounded-md border border-border bg-card/60 hover:border-primary/40 hover:bg-card transition-colors p-2.5 cursor-pointer"
      onClick={() => navigate("checkins")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium truncate">{c.patient.fullName}</p>
          <p className="text-[11px] text-muted-foreground truncate">
            {c.patient.surgeryType || "—"}
          </p>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {format(dt, "d MMM, h:mm a")} ·{" "}
            {formatDistanceToNow(dt, { addSuffix: true })}
          </p>
        </div>
        <ArrowRight className="h-3.5 w-3.5 text-muted-foreground opacity-60 group-hover:opacity-100 group-hover:text-primary flex-shrink-0 mt-1" />
      </div>
    </li>
  );
}

function EmptyState({
  icon: Icon, title, description, compact,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  compact?: boolean;
}) {
  return (
    <div className={cn(
      "flex flex-col items-center justify-center text-center px-4",
      compact ? "py-6" : "py-10"
    )}>
      <span className={cn(
        "flex items-center justify-center rounded-full bg-primary/10 text-primary mb-3",
        compact ? "h-9 w-9" : "h-12 w-12"
      )}>
        <Icon className={compact ? "h-4 w-4" : "h-6 w-6"} />
      </span>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground mt-1">{description}</p>
    </div>
  );
}
