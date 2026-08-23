"use client";

import * as React from "react";
import { MotionConfig, motion } from "framer-motion";
import { toast } from "sonner";
import {
  Activity, AlertTriangle, RefreshCw, Loader2, CheckCircle2,
  Clock, TrendingUp, Flame, Inbox,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip,
  XAxis, YAxis,
} from "recharts";

import { api } from "@/lib/auth-context";
import { navigate } from "@/lib/router";
import { cn } from "@/lib/utils";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tabs, TabsList, TabsTrigger,
} from "@/components/ui/tabs";

// ── Types matching /api/team/productivity contract ──────────────────────────
type Role = "HOSPITAL_ADMIN" | "COORDINATOR" | "DOCTOR";

interface ProductivityItem {
  user: { id: string; name: string; email: string; role: Role };
  totalAssigned: number;
  resolved: number;
  open: number;
  criticalResolved: number;
  highResolved: number;
  avgResolutionHours: number | null;
  resolutionRate: number | null;
}

interface ProductivityResponse {
  productivity: ProductivityItem[];
  summary: {
    windowDays: number;
    totalEscalations: number;
    totalResolved: number;
    totalAssigned: number;
    totalUnassigned: number;
    teamMembers: number;
    avgResolutionHoursAll: number | null;
  };
}

const EMERALD_BAR = "oklch(0.62 0.14 165)";   // primary emerald
const AMBER_BAR = "oklch(0.78 0.14 75)";       // accent amber
const ROSE_ACCENT = "oklch(0.58 0.22 25)";     // rose — reserved for critical

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
    .toUpperCase() || "?";
}

// ── Page ────────────────────────────────────────────────────────────────────
export function ProductivityPage() {
  const [days, setDays] = React.useState<30 | 60 | 90>(30);
  const [data, setData] = React.useState<ProductivityResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(async (d: number) => {
    setLoading(true);
    try {
      const res = await api<ProductivityResponse>(`/api/team/productivity?days=${d}`);
      setData(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load productivity");
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await api<ProductivityResponse>(`/api/team/productivity?days=${days}`);
      setData(res);
      toast.success("Productivity refreshed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to refresh");
    } finally {
      setRefreshing(false);
    }
  }, [days]);

  React.useEffect(() => {
    load(days);
  }, [days, load]);

  const s = data?.summary;
  const rows = data?.productivity ?? [];

  // Resolution rate denominator for the team-wide card. If no escalations at
  // all in the window, we surface "—" rather than a misleading 0%.
  const teamResolutionRate =
    s && s.totalEscalations > 0
      ? Math.round((s.totalResolved / s.totalEscalations) * 1000) / 10
      : null;

  // Chart data: first name only for X-axis labels; full name in tooltip payload.
  const resolvedChartData = rows.map((r) => ({
    name: r.user.name.split(" ")[0],
    fullName: r.user.name,
    count: r.resolved,
  }));
  const resolutionTimeChartData = rows
    .filter((r) => r.avgResolutionHours !== null)
    .map((r) => ({
      name: r.user.name.split(" ")[0],
      fullName: r.user.name,
      hours: r.avgResolutionHours as number,
    }));

  // Whether every row in the period has zero escalations (true empty state).
  const isEmpty =
    !loading &&
    rows.length > 0 &&
    rows.every((r) => r.totalAssigned === 0 && r.resolved === 0 && r.open === 0);

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
              <Activity className="h-6 w-6 text-primary" />
              Coordinator productivity
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Resolved escalations, resolution time, and throughput across your care team.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tabs value={String(days)} onValueChange={(v) => setDays(Number(v) as 30 | 60 | 90)}>
              <TabsList>
                <TabsTrigger value="30">30d</TabsTrigger>
                <TabsTrigger value="60">60d</TabsTrigger>
                <TabsTrigger value="90">90d</TabsTrigger>
              </TabsList>
            </Tabs>
            <Button variant="outline" onClick={refresh} disabled={refreshing || loading}>
              {refreshing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh
            </Button>
          </div>
        </motion.section>

        {/* Summary cards */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4">
          <StatCard
            label="Total escalations"
            value={s ? String(s.totalEscalations) : undefined}
            icon={AlertTriangle}
            loading={loading}
            delay={0}
          />
          <StatCard
            label="Total resolved"
            value={s ? String(s.totalResolved) : undefined}
            icon={CheckCircle2}
            loading={loading}
            delay={0.05}
            accent="emerald"
          />
          <StatCard
            label="Avg resolution"
            value={s && s.avgResolutionHoursAll !== null ? `${s.avgResolutionHoursAll}h` : "—"}
            icon={Clock}
            loading={loading}
            delay={0.1}
          />
          <StatCard
            label="Team resolution rate"
            value={teamResolutionRate !== null ? `${teamResolutionRate}%` : "—"}
            icon={TrendingUp}
            loading={loading}
            delay={0.15}
            accent="emerald"
          />
        </section>

        {/* Productivity table (desktop) / cards (mobile) */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <Card className="glass">
            <CardHeader className="border-b border-border">
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                Per-coordinator breakdown
              </CardTitle>
              <CardDescription>
                Sorted by resolved count, descending. The {days}-day window only includes escalations created in that period.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4 space-y-2">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full rounded-md" />
                  ))}
                </div>
              ) : isEmpty ? (
                <EmptyState days={days} />
              ) : rows.length === 0 ? (
                <EmptyState days={days} noTeam />
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="pl-4">Coordinator</TableHead>
                          <TableHead className="text-right">Assigned</TableHead>
                          <TableHead className="text-right">Resolved</TableHead>
                          <TableHead className="text-right">Open</TableHead>
                          <TableHead className="text-right">Critical resolved</TableHead>
                          <TableHead className="text-right">Avg resolution</TableHead>
                          <TableHead className="pr-4 min-w-[160px]">Resolution rate</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {rows.map((r) => (
                          <TableRow key={r.user.id}>
                            <TableCell className="pl-4">
                              <div className="flex items-center gap-3">
                                <Avatar className="h-8 w-8 flex-shrink-0">
                                  <AvatarFallback className="bg-primary/15 text-primary text-[10px] font-semibold">
                                    {initials(r.user.name)}
                                  </AvatarFallback>
                                </Avatar>
                                <div className="min-w-0">
                                  <div className="text-sm font-medium truncate">{r.user.name}</div>
                                  <Badge variant="outline" className="text-[10px] uppercase tracking-wider mt-0.5">
                                    {roleLabel(r.user.role)}
                                  </Badge>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{r.totalAssigned}</TableCell>
                            <TableCell className="text-right tabular-nums">
                              <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                                {r.resolved}
                              </span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              <span
                                className={cn(
                                  r.open > 0
                                    ? "text-amber-600 dark:text-amber-400 font-medium"
                                    : "text-muted-foreground"
                                )}
                              >
                                {r.open}
                              </span>
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {r.criticalResolved > 0 ? (
                                <span className="inline-flex items-center gap-1 text-rose-600 dark:text-rose-400 font-medium">
                                  <Flame className="h-3 w-3" />
                                  {r.criticalResolved}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">0</span>
                              )}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">
                              {r.avgResolutionHours !== null ? `${r.avgResolutionHours}h` : "—"}
                            </TableCell>
                            <TableCell className="pr-4">
                              <MiniRateBar
                                rate={r.resolutionRate}
                                resolved={r.resolved}
                                assigned={r.totalAssigned}
                              />
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile cards */}
                  <div className="md:hidden divide-y divide-border">
                    {rows.map((r) => (
                      <div key={r.user.id} className="p-4 space-y-3">
                        <div className="flex items-center gap-3">
                          <Avatar className="h-9 w-9 flex-shrink-0">
                            <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                              {initials(r.user.name)}
                            </AvatarFallback>
                          </Avatar>
                          <div className="min-w-0 flex-1">
                            <div className="text-sm font-medium truncate">{r.user.name}</div>
                            <Badge variant="outline" className="text-[10px] uppercase tracking-wider mt-0.5">
                              {roleLabel(r.user.role)}
                            </Badge>
                          </div>
                          {r.criticalResolved > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded risk-critical">
                              <Flame className="h-3 w-3" />
                              {r.criticalResolved}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-3 gap-2 text-center">
                          <MiniStat label="Assigned" value={String(r.totalAssigned)} />
                          <MiniStat label="Resolved" value={String(r.resolved)} tone="emerald" />
                          <MiniStat
                            label="Open"
                            value={String(r.open)}
                            tone={r.open > 0 ? "amber" : "muted"}
                          />
                        </div>
                        <div className="flex items-center justify-between text-xs">
                          <span className="text-muted-foreground">
                            Avg resolution:{" "}
                            <span className="text-foreground font-medium tabular-nums">
                              {r.avgResolutionHours !== null ? `${r.avgResolutionHours}h` : "—"}
                            </span>
                          </span>
                          <span className="text-muted-foreground">
                            Rate:{" "}
                            <span className="text-foreground font-medium tabular-nums">
                              {r.resolutionRate !== null ? `${r.resolutionRate}%` : "—"}
                            </span>
                          </span>
                        </div>
                        <MiniRateBar
                          rate={r.resolutionRate}
                          resolved={r.resolved}
                          assigned={r.totalAssigned}
                          compact
                        />
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </motion.section>

        {/* Charts */}
        {!loading && !isEmpty && rows.length > 0 && (
          <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
            {/* Resolved count per coordinator */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.15 }}
            >
              <Card className="glass h-full">
                <CardHeader className="border-b border-border">
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" />
                    Resolved per coordinator
                  </CardTitle>
                  <CardDescription>
                    Escalations moved to RESOLVED in the last {days} days.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4">
                  <div className="h-64 w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={resolvedChartData}
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
                          formatter={(v: number) => [v, "Resolved"]}
                          labelFormatter={(label, payload) => {
                            const item = payload?.[0]?.payload as { fullName?: string } | undefined;
                            return item?.fullName || label;
                          }}
                        />
                        <Bar dataKey="count" fill={EMERALD_BAR} radius={[6, 6, 0, 0]} maxBarSize={64} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                </CardContent>
              </Card>
            </motion.div>

            {/* Avg resolution time per coordinator */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.2 }}
            >
              <Card className="glass h-full">
                <CardHeader className="border-b border-border">
                  <CardTitle className="flex items-center gap-2">
                    <Clock className="h-4 w-4 text-amber-500 dark:text-amber-400" />
                    Avg resolution time
                  </CardTitle>
                  <CardDescription>
                    Mean hours from creation to RESOLVED, per coordinator. Coordinators with no resolved escalations are omitted.
                  </CardDescription>
                </CardHeader>
                <CardContent className="p-4">
                  {resolutionTimeChartData.length === 0 ? (
                    <div className="h-64 flex flex-col items-center justify-center text-center text-sm text-muted-foreground">
                      <Inbox className="h-8 w-8 mb-2 opacity-60" />
                      No resolved escalations in this period.
                    </div>
                  ) : (
                    <div className="h-64 w-full">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={resolutionTimeChartData}
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
                            tickFormatter={(v: number) => `${v}h`}
                          />
                          <Tooltip
                            cursor={{ fill: "oklch(0.78 0.14 75 / 0.10)" }}
                            contentStyle={{
                              background: "var(--popover)",
                              border: "1px solid var(--border)",
                              borderRadius: 8,
                              fontSize: 12,
                            }}
                            labelStyle={{ fontSize: 11, color: "var(--muted-foreground)" }}
                            formatter={(v: number) => [`${v}h`, "Avg resolution"]}
                            labelFormatter={(label, payload) => {
                              const item = payload?.[0]?.payload as { fullName?: string } | undefined;
                              return item?.fullName || label;
                            }}
                          />
                          <Bar dataKey="hours" fill={AMBER_BAR} radius={[6, 6, 0, 0]} maxBarSize={64} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </section>
        )}
      </div>
    </MotionConfig>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function StatCard({
  label, value, icon: Icon, loading, delay, accent,
}: {
  label: string;
  value: string | undefined;
  icon: React.ComponentType<{ className?: string }>;
  loading: boolean;
  delay: number;
  accent?: "emerald";
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
                accent === "emerald"
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                  : "bg-primary/10 text-primary"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
            </span>
          </div>
          {loading ? (
            <Skeleton className="h-8 w-20" />
          ) : (
            <span className="text-2xl md:text-3xl font-semibold tabular-nums">
              {value ?? "—"}
            </span>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function MiniRateBar({
  rate, resolved, assigned, compact,
}: {
  rate: number | null;
  resolved: number;
  assigned: number;
  compact?: boolean;
}) {
  // rate === null means no escalations assigned → show "—" rather than 0%.
  if (rate === null) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs text-muted-foreground tabular-nums">—</span>
      </div>
    );
  }
  // Bar color: high (>=80) emerald, mid (50-79) amber, low (<50) rose-tinted.
  const barColor =
    rate >= 80 ? EMERALD_BAR : rate >= 50 ? AMBER_BAR : ROSE_ACCENT;
  return (
    <div className={cn("flex items-center gap-2", compact && "flex-col items-stretch gap-1")}>
      <span className="text-xs tabular-nums font-medium w-9 flex-shrink-0">
        {rate}%
      </span>
      <div
        className="h-1.5 flex-1 rounded-full overflow-hidden bg-muted"
        role="img"
        aria-label={`Resolution rate ${rate}% (${resolved} of ${assigned} resolved)`}
        title={`${resolved} of ${assigned} resolved`}
      >
        <div
          className="h-full rounded-full transition-all"
          style={{ width: `${rate}%`, backgroundColor: barColor }}
        />
      </div>
      {!compact && (
        <span className="text-[10px] text-muted-foreground tabular-nums w-14 flex-shrink-0 text-right">
          {resolved}/{assigned}
        </span>
      )}
    </div>
  );
}

function MiniStat({
  label, value, tone,
}: {
  label: string;
  value: string;
  tone?: "emerald" | "amber" | "muted";
}) {
  return (
    <div className="rounded-md bg-muted/40 px-2 py-1.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={cn(
          "text-sm font-semibold tabular-nums",
          tone === "emerald" && "text-emerald-600 dark:text-emerald-400",
          tone === "amber" && "text-amber-600 dark:text-amber-400",
          (!tone || tone === "muted") && "text-foreground"
        )}
      >
        {value}
      </div>
    </div>
  );
}

function EmptyState({ days, noTeam }: { days: number; noTeam?: boolean }) {
  return (
    <div className="p-10 flex flex-col items-center text-center">
      <span className="flex items-center justify-center h-12 w-12 rounded-full bg-primary/10 text-primary mb-3">
        <Inbox className="h-6 w-6" />
      </span>
      <p className="text-sm font-medium">
        {noTeam ? "No care team members yet" : "No escalations in this period."}
      </p>
      <p className="text-xs text-muted-foreground mt-1 mb-4 max-w-sm">
        {noTeam
          ? "Invite coordinators from Settings to start tracking productivity."
          : `There were no escalations created in the last ${days} days. Adjust the window or check back after the next check-in cycle.`}
      </p>
      <Button variant="outline" size="sm" onClick={() => navigate("escalations")}>
        View escalations
      </Button>
    </div>
  );
}
