"use client";

import * as React from "react";
import { MotionConfig, motion } from "framer-motion";
import { toast } from "sonner";
import {
  Users, AlertTriangle, RefreshCw, ArrowRight, UserPlus,
  Loader2, Activity, AlertOctagon, Scale,
} from "lucide-react";
import {
  Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis, CartesianGrid,
} from "recharts";

import { api } from "@/lib/auth-context";
import { navigate } from "@/lib/router";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// ── Types matching /api/team contract ───────────────────────────────────────
type Role = "HOSPITAL_ADMIN" | "COORDINATOR" | "DOCTOR";
type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface WorkloadItem {
  user: { id: string; name: string; email: string; role: Role };
  openEscalations: number;
  criticalCount: number;
  highCount: number;
  mediumCount: number;
  lowCount: number;
  recentActivity: number;
}

interface TeamResponse {
  workload: WorkloadItem[];
  unassigned: { total: number; critical: number; high: number; medium: number; low: number };
  summary: {
    totalTeamMembers: number;
    totalOpenEscalations: number;
    totalUnassigned: number;
    totalAnsweredCheckins7d: number;
    avgEscalationsPerMember: number;
    maxEscalations: number;
  };
}

const SEVERITY_BAR_COLORS: Record<Severity, string> = {
  CRITICAL: "oklch(0.62 0.2 25)",   // rose
  HIGH: "oklch(0.75 0.15 70)",       // amber
  MEDIUM: "oklch(0.62 0.14 165)",    // emerald
  LOW: "oklch(0.7 0.04 220)",        // muted slate
};

function roleLabel(role: Role): string {
  switch (role) {
    case "HOSPITAL_ADMIN": return "Admin";
    case "COORDINATOR": return "Coordinator";
    case "DOCTOR": return "Doctor";
  }
}

function initials(name: string): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .filter(Boolean)
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

function severityBadgeClass(s: Severity): string {
  switch (s) {
    case "CRITICAL": return "risk-critical";
    case "HIGH": return "risk-high";
    case "MEDIUM": return "risk-medium";
    case "LOW": return "risk-low";
  }
}

// ── Page ────────────────────────────────────────────────────────────────────
export function TeamWorkloadPage() {
  const [data, setData] = React.useState<TeamResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const d = await api<TeamResponse>("/api/team");
      setData(d);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load team workload");
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const d = await api<TeamResponse>("/api/team");
      setData(d);
      toast.success("Workload refreshed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to refresh");
    } finally {
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const s = data?.summary;
  const unassigned = data?.unassigned;
  const workload = data?.workload ?? [];
  const maxEsc = s?.maxEscalations ?? 0;

  const chartData = workload.map((w) => ({
    name: w.user.name.split(" ")[0],
    fullName: w.user.name,
    count: w.openEscalations,
    isMax: w.openEscalations === maxEsc && maxEsc > 0,
  }));

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
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Team workload</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Distribution of open escalations across your care team
            </p>
          </div>
          <Button variant="outline" onClick={refresh} disabled={refreshing || loading}>
            {refreshing ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4" />
            )}
            Refresh
          </Button>
        </motion.section>

        {/* Summary cards */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <StatCard
            label="Team members"
            value={s?.totalTeamMembers}
            icon={Users}
            loading={loading}
            delay={0}
          />
          <StatCard
            label="Open escalations"
            value={s?.totalOpenEscalations}
            icon={AlertTriangle}
            loading={loading}
            delay={0.05}
          />
          <StatCard
            label="Unassigned"
            value={s?.totalUnassigned}
            icon={AlertOctagon}
            loading={loading}
            delay={0.1}
            critical={!!(s && s.totalUnassigned > 0)}
          />
          <StatCard
            label="Avg / member"
            value={s?.avgEscalationsPerMember}
            icon={Scale}
            loading={loading}
            delay={0.15}
          />
        </section>

        {/* Unassigned banner */}
        {!loading && unassigned && unassigned.total > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
          >
            <Alert className="border-amber-400/50 bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100">
              <AlertOctagon className="h-4 w-4 text-amber-600 dark:text-amber-400" />
              <AlertTitle className="text-sm">
                {unassigned.total} {unassigned.total === 1 ? "escalation is" : "escalations are"} unassigned
                {" — "}
                {unassigned.critical > 0 && <>{unassigned.critical} critical, </>}
                {unassigned.high > 0 && <>{unassigned.high} high</>}
                {unassigned.high === 0 && unassigned.critical === 0 && (
                  <>{unassigned.medium + unassigned.low} non-critical</>
                )}
              </AlertTitle>
              <AlertDescription className="text-xs flex items-center gap-3 flex-wrap">
                <span>Assign these to a coordinator to balance the workload.</span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px] border-amber-500/40 bg-amber-100/60 hover:bg-amber-100 dark:bg-amber-900/40 dark:hover:bg-amber-900/60"
                  onClick={() => navigate("escalations")}
                >
                  View escalations <ArrowRight className="h-3 w-3" />
                </Button>
              </AlertDescription>
            </Alert>
          </motion.div>
        )}

        {/* Team member cards */}
        <section>
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground mb-3">
            Care team {loading ? "…" : `(${workload.length})`}
          </h2>
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-48 w-full rounded-xl" />
              ))}
            </div>
          ) : workload.length === 0 ? (
            <EmptyTeam />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {workload.map((w, i) => (
                <motion.div
                  key={w.user.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.25, delay: Math.min(i * 0.04, 0.4) }}
                >
                  <MemberCard
                    item={w}
                    isMax={w.openEscalations === maxEsc && maxEsc > 0}
                  />
                </motion.div>
              ))}
            </div>
          )}
        </section>

        {/* Workload balance chart */}
        {!loading && workload.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
          >
            <Card className="glass">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2">
                  <Activity className="h-4 w-4 text-primary" />
                  Workload balance
                </CardTitle>
                <CardDescription>
                  Open escalations per team member. The max-load member is highlighted in amber.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-4">
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartData}
                      margin={{ top: 8, right: 8, bottom: 4, left: -16 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                      <XAxis
                        dataKey="name"
                        tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                        tickLine={false}
                        axisLine={{ stroke: "var(--border)" }}
                        interval={0}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                        tickLine={false}
                        axisLine={{ stroke: "var(--border)" }}
                      />
                      <Tooltip
                        cursor={{ fill: "oklch(0.62 0.14 165 / 0.08)" }}
                        contentStyle={{
                          background: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        labelStyle={{ fontSize: 11, color: "var(--muted-foreground)" }}
                        formatter={(v: number) => [v, "Open escalations"]}
                        labelFormatter={(label, payload) => {
                          const item = payload?.[0]?.payload as { fullName?: string } | undefined;
                          return item?.fullName || label;
                        }}
                      />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]} maxBarSize={64}>
                        {chartData.map((entry, idx) => (
                          <Cell
                            key={idx}
                            fill={entry.isMax
                              ? "oklch(0.75 0.15 70)"
                              : "oklch(0.62 0.14 165)"}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                {/* Legend */}
                <div className="flex items-center justify-center gap-4 mt-3 text-[11px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "oklch(0.62 0.14 165)" }} />
                    Open escalations
                  </span>
                  <span className="inline-flex items-center gap-1.5">
                    <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: "oklch(0.75 0.15 70)" }} />
                    Max load
                  </span>
                </div>
              </CardContent>
            </Card>
          </motion.section>
        )}
      </div>
    </MotionConfig>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StatCard({
  label, value, icon: Icon, loading, delay, critical,
}: {
  label: string;
  value: number | undefined;
  icon: React.ComponentType<{ className?: string }>;
  loading: boolean;
  delay: number;
  critical?: boolean;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
    >
      <Card className={cn(
        "glass hover:glow-primary transition-shadow h-full",
        critical && "ring-1 ring-rose-400/50"
      )}>
        <CardContent className="p-4 md:p-5 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {label}
            </span>
            <span className={cn(
              "flex items-center justify-center h-7 w-7 rounded-md",
              critical
                ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                : "bg-primary/10 text-primary"
            )}>
              <Icon className="h-3.5 w-3.5" />
            </span>
          </div>
          {loading ? (
            <Skeleton className="h-8 w-16" />
          ) : (
            <span className={cn(
              "text-2xl md:text-3xl font-semibold tabular-nums",
              critical && "text-rose-600 dark:text-rose-400"
            )}>
              {value ?? 0}
            </span>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function MemberCard({ item, isMax }: { item: WorkloadItem; isMax: boolean }) {
  const total = item.openEscalations;
  const segments: { sev: Severity; n: number }[] = [
    { sev: "CRITICAL", n: item.criticalCount },
    { sev: "HIGH", n: item.highCount },
    { sev: "MEDIUM", n: item.mediumCount },
    { sev: "LOW", n: item.lowCount },
  ].filter((s) => s.n > 0) as { sev: Severity; n: number }[];

  return (
    <Card className={cn(
      "glass hover:glow-primary transition-shadow h-full",
      isMax && "ring-1 ring-amber-400/50"
    )}>
      <CardContent className="p-4 md:p-5 flex flex-col gap-3">
        {/* Identity */}
        <div className="flex items-center gap-3">
          <Avatar className="h-10 w-10 flex-shrink-0">
            <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
              {initials(item.user.name) || "?"}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">{item.user.name}</div>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                {roleLabel(item.user.role)}
              </Badge>
              {isMax && (
                <Badge
                  variant="outline"
                  className="text-[10px] uppercase tracking-wider border-amber-400/60 bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300"
                >
                  Max load
                </Badge>
              )}
            </div>
          </div>
        </div>

        {/* Big number */}
        <div className="flex items-baseline gap-2">
          <span className="text-4xl font-semibold tabular-nums leading-none">{total}</span>
          <span className="text-xs text-muted-foreground">
            open escalation{total === 1 ? "" : "s"}
          </span>
        </div>

        {/* Severity badges */}
        <div className="flex flex-wrap gap-1.5 min-h-[20px]">
          {segments.length === 0 ? (
            <span className="text-[11px] text-muted-foreground italic">
              No open escalations
            </span>
          ) : (
            segments.map((s) => (
              <span
                key={s.sev}
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider",
                  severityBadgeClass(s.sev)
                )}
              >
                {s.n} {s.sev}
              </span>
            ))
          )}
        </div>

        {/* Proportional severity bar */}
        {total > 0 && (
          <div
            className="h-2 w-full rounded-full overflow-hidden bg-muted flex"
            role="img"
            aria-label={`Severity breakdown: ${segments.map((s) => `${s.n} ${s.sev}`).join(", ")}`}
          >
            {segments.map((s) => (
              <div
                key={s.sev}
                style={{
                  width: `${(s.n / total) * 100}%`,
                  backgroundColor: SEVERITY_BAR_COLORS[s.sev],
                }}
                title={`${s.n} ${s.sev}`}
              />
            ))}
          </div>
        )}

        {/* Action */}
        <Button
          variant="outline"
          size="sm"
          className="w-full mt-auto"
          onClick={() => navigate("escalations")}
        >
          View escalations <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </CardContent>
    </Card>
  );
}

function EmptyTeam() {
  return (
    <Card className="glass">
      <CardContent className="p-10 flex flex-col items-center text-center">
        <span className="flex items-center justify-center h-12 w-12 rounded-full bg-primary/10 text-primary mb-3">
          <UserPlus className="h-6 w-6" />
        </span>
        <p className="text-sm font-medium">No team members yet</p>
        <p className="text-xs text-muted-foreground mt-1 mb-4 max-w-sm">
          Invite coordinators from Settings to start distributing escalations
          across your care team.
        </p>
        <Button variant="outline" size="sm" onClick={() => navigate("settings")}>
          Go to settings <ArrowRight className="h-3.5 w-3.5" />
        </Button>
      </CardContent>
    </Card>
  );
}
