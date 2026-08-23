// Ojas — Care coordinator performance review page. Hospital admin view that
// shows a monthly summary of each coordinator's activity and outcomes. Data
// comes from /api/team/performance-review?months=N (no fabrication).
"use client";

import * as React from "react";
import { MotionConfig, motion } from "framer-motion";
import { toast } from "sonner";
import {
  Award, RefreshCw, Loader2, Users, CheckCircle2, Activity,
  AlertTriangle, Clock, Flame, Bot, PhoneCall, Sparkles, Inbox,
} from "lucide-react";

import { api } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";

// ── Types matching /api/team/performance-review contract ─────────────────────
type Role = "HOSPITAL_ADMIN" | "COORDINATOR" | "DOCTOR";
type PerformanceLabel = "excellent" | "good" | "developing" | "new";

interface ReviewStats {
  totalAssigned: number;
  resolved: number;
  open: number;
  criticalResolved: number;
  avgResolutionHours: number | null;
  resolutionRate: number | null;
  checkinsLogged: number;
  escalationsHandled: number;
  aiCalls: number;
  totalActions: number;
}

interface ReviewItem {
  user: { id: string; name: string; email: string; role: Role };
  stats: ReviewStats;
  performance: PerformanceLabel;
}

interface PerformanceReviewResponse {
  reviews: ReviewItem[];
  period: { months: number; since: string };
  summary: {
    teamMembers: number;
    totalResolved: number;
    totalActions: number;
  };
}

// Bar color palette (matches productivity.tsx)
const EMERALD_BAR = "oklch(0.62 0.14 165)";
const AMBER_BAR = "oklch(0.78 0.14 75)";
const ROSE_ACCENT = "oklch(0.58 0.22 25)";

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

// Performance badge styling per the task spec
const PERFORMANCE_STYLES: Record<
  PerformanceLabel,
  { badge: string; label: string; insight: string }
> = {
  excellent: {
    badge: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    label: "Excellent",
    insight: "Excellent — consistently resolving escalations quickly.",
  },
  good: {
    badge: "bg-primary/15 text-primary border-primary/30",
    label: "Good",
    insight: "Good — solid, reliable throughput across the team.",
  },
  developing: {
    badge: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
    label: "Developing",
    insight: "Developing — focus on resolution speed and throughput.",
  },
  new: {
    badge: "bg-muted text-muted-foreground border-border",
    label: "New",
    insight: "New — still getting up to speed.",
  },
};

// ── Page ────────────────────────────────────────────────────────────────────
export function PerformanceReviewPage() {
  const [months, setMonths] = React.useState<1 | 3 | 6>(1);
  const [data, setData] = React.useState<PerformanceReviewResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);

  const load = React.useCallback(async (m: number) => {
    setLoading(true);
    try {
      const res = await api<PerformanceReviewResponse>(
        `/api/team/performance-review?months=${m}`
      );
      setData(res);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load performance review");
    } finally {
      setLoading(false);
    }
  }, []);

  const refresh = React.useCallback(async () => {
    setRefreshing(true);
    try {
      const res = await api<PerformanceReviewResponse>(
        `/api/team/performance-review?months=${months}`
      );
      setData(res);
      toast.success("Performance review refreshed");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to refresh");
    } finally {
      setRefreshing(false);
    }
  }, [months]);

  React.useEffect(() => {
    load(months);
  }, [months, load]);

  const s = data?.summary;
  const reviews = data?.reviews ?? [];

  // True empty: team exists but had zero activity in the period
  const isEmpty =
    !loading &&
    reviews.length > 0 &&
    reviews.every(
      (r) =>
        r.stats.totalAssigned === 0 &&
        r.stats.resolved === 0 &&
        r.stats.totalActions === 0
    );

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
              <Award className="h-6 w-6 text-primary" />
              Performance review
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Monthly summary of each coordinator&rsquo;s activity and outcomes.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Tabs
              value={String(months)}
              onValueChange={(v) => setMonths(Number(v) as 1 | 3 | 6)}
            >
              <TabsList>
                <TabsTrigger value="1">1m</TabsTrigger>
                <TabsTrigger value="3">3m</TabsTrigger>
                <TabsTrigger value="6">6m</TabsTrigger>
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
        <section className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4">
          <SummaryCard
            label="Team members"
            value={s ? String(s.teamMembers) : undefined}
            icon={Users}
            loading={loading}
            delay={0}
          />
          <SummaryCard
            label="Total escalations resolved"
            value={s ? String(s.totalResolved) : undefined}
            icon={CheckCircle2}
            loading={loading}
            delay={0.05}
            accent="emerald"
          />
          <SummaryCard
            label="Total actions logged"
            value={s ? String(s.totalActions) : undefined}
            icon={Activity}
            loading={loading}
            delay={0.1}
          />
        </section>

        {/* Coordinator cards */}
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-muted-foreground uppercase tracking-wider">
                Coordinators
              </h2>
              <p className="text-xs text-muted-foreground mt-0.5">
                Sorted by total actions, descending. The {months}-month window only includes activity in that period.
              </p>
            </div>
            {!loading && reviews.length > 0 && (
              <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                {reviews.length} {reviews.length === 1 ? "member" : "members"}
              </Badge>
            )}
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {Array.from({ length: 3 }).map((_, i) => (
                <Card key={i} className="glass">
                  <CardContent className="p-4 md:p-5 space-y-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-10 w-10 rounded-full" />
                      <div className="space-y-1.5 flex-1">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-3 w-20" />
                      </div>
                    </div>
                    <Skeleton className="h-16 w-full" />
                    <Skeleton className="h-8 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : isEmpty ? (
            <EmptyState months={months} />
          ) : reviews.length === 0 ? (
            <EmptyState months={months} noTeam />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 md:gap-4">
              {reviews.map((r, i) => (
                <CoordinatorCard key={r.user.id} review={r} delay={i * 0.04} />
              ))}
            </div>
          )}
        </section>

        {/* AI decision-support disclaimer */}
        <p className="text-[11px] text-muted-foreground text-center pt-2">
          AI decision support — not a diagnosis.
        </p>
      </div>
    </MotionConfig>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SummaryCard({
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

function CoordinatorCard({
  review, delay,
}: {
  review: ReviewItem;
  delay: number;
}) {
  const { user, stats, performance } = review;
  const perf = PERFORMANCE_STYLES[performance];

  // Rate bar color
  const rate = stats.resolutionRate;
  const rateColor =
    rate === null ? "var(--muted-foreground)"
    : rate >= 80 ? EMERALD_BAR
    : rate >= 50 ? AMBER_BAR
    : ROSE_ACCENT;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
    >
      <Card className="glass hover:glow-primary transition-shadow h-full">
        <CardContent className="p-4 md:p-5 space-y-4">
          {/* Header: avatar + name + role + performance */}
          <div className="flex items-start gap-3">
            <Avatar className="h-10 w-10 flex-shrink-0">
              <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                {initials(user.name)}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium truncate">{user.name}</div>
              <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                  {roleLabel(user.role)}
                </Badge>
                <Badge
                  variant="outline"
                  className={cn("text-[10px] uppercase tracking-wider", perf.badge)}
                >
                  {perf.label}
                </Badge>
              </div>
            </div>
          </div>

          {/* Stats grid */}
          <div className="grid grid-cols-2 gap-2">
            <StatBox
              label="Resolved"
              value={String(stats.resolved)}
              icon={CheckCircle2}
              tone="emerald"
            />
            <StatBox
              label="Open"
              value={String(stats.open)}
              icon={AlertTriangle}
              tone={stats.open > 0 ? "amber" : "muted"}
            />
            <StatBox
              label="Critical resolved"
              value={String(stats.criticalResolved)}
              icon={Flame}
              tone={stats.criticalResolved > 0 ? "rose" : "muted"}
            />
            <StatBox
              label="Avg resolution"
              value={stats.avgResolutionHours !== null ? `${stats.avgResolutionHours}h` : "—"}
              icon={Clock}
              tone="muted"
            />
          </div>

          {/* Resolution rate progress bar */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Resolution rate</span>
              <span className="font-medium tabular-nums">
                {rate !== null ? `${rate}%` : "—"}
              </span>
            </div>
            {rate !== null ? (
              <div
                className="h-2 rounded-full overflow-hidden bg-muted"
                role="img"
                aria-label={`Resolution rate ${rate}% (${stats.resolved} of ${stats.totalAssigned} resolved)`}
                title={`${stats.resolved} of ${stats.totalAssigned} resolved`}
              >
                <div
                  className="h-full rounded-full transition-all"
                  style={{ width: `${rate}%`, backgroundColor: rateColor }}
                />
              </div>
            ) : (
              <Progress value={0} className="h-2 opacity-40" />
            )}
            <p className="text-[10px] text-muted-foreground">
              {stats.totalAssigned > 0
                ? `${stats.resolved} of ${stats.totalAssigned} resolved`
                : "No escalations assigned in this period."}
            </p>
          </div>

          {/* Activity counts */}
          <div className="grid grid-cols-3 gap-2 pt-1 border-t border-border">
            <ActivityCount
              label="Check-ins"
              value={stats.checkinsLogged}
              icon={PhoneCall}
            />
            <ActivityCount
              label="AI calls"
              value={stats.aiCalls}
              icon={Bot}
            />
            <ActivityCount
              label="Actions"
              value={stats.totalActions}
              icon={Activity}
            />
          </div>

          {/* Qualitative insight */}
          <div className="flex items-start gap-2 rounded-md bg-primary/5 border border-primary/15 px-3 py-2">
            <Sparkles className="h-3.5 w-3.5 text-primary flex-shrink-0 mt-0.5" />
            <p className="text-xs text-foreground/80 leading-relaxed">
              {perf.insight}
            </p>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

function StatBox({
  label, value, icon: Icon, tone,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  tone: "emerald" | "amber" | "rose" | "muted";
}) {
  const toneCls = {
    emerald: "text-emerald-600 dark:text-emerald-400",
    amber: "text-amber-600 dark:text-amber-400",
    rose: "text-rose-600 dark:text-rose-400",
    muted: "text-foreground",
  }[tone];

  return (
    <div className="rounded-md border border-border bg-card/40 px-2.5 py-2">
      <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-muted-foreground">
        <Icon className="h-3 w-3" />
        {label}
      </div>
      <div className={cn("text-base font-semibold tabular-nums mt-0.5", toneCls)}>
        {value}
      </div>
    </div>
  );
}

function ActivityCount({
  label, value, icon: Icon,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="text-center">
      <div className="flex items-center justify-center h-6 w-6 rounded-md bg-muted/40 text-muted-foreground mx-auto mb-1">
        <Icon className="h-3 w-3" />
      </div>
      <div className="text-sm font-semibold tabular-nums">{value}</div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
        {label}
      </div>
    </div>
  );
}

function EmptyState({ months, noTeam }: { months: number; noTeam?: boolean }) {
  return (
    <Card className="glass">
      <CardContent className="p-10 flex flex-col items-center text-center">
        <span className="flex items-center justify-center h-12 w-12 rounded-full bg-primary/10 text-primary mb-3">
          <Inbox className="h-6 w-6" />
        </span>
        <p className="text-sm font-medium">
          {noTeam ? "No team members yet" : "No team activity in this period."}
        </p>
        <p className="text-xs text-muted-foreground mt-1 max-w-sm">
          {noTeam
            ? "Invite coordinators from Settings to start tracking performance."
            : `There were no escalations or audit-logged actions in the last ${months} ${months === 1 ? "month" : "months"}. Adjust the window or check back after the next check-in cycle.`}
        </p>
      </CardContent>
    </Card>
  );
}
