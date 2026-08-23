"use client";

// Ojas — Today's Tasks widget. Shows a unified worklist for the coordinator
// combining follow-ups, check-ins, escalations, milestones, and high-alert
// medication adherence checks. Renders as a tabbed card on the dashboard.

import * as React from "react";
import { motion } from "framer-motion";
import { formatDistanceToNow, format } from "date-fns";
import {
  CalendarClock, CheckSquare, AlertTriangle, Target, Pill,
  ChevronRight, Loader2, Inbox,
} from "lucide-react";

import { api } from "@/lib/auth-context";
import { navigate } from "@/lib/router";
import { cn } from "@/lib/utils";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";

// ── Types matching /api/todays-tasks contract ───────────────────────────────
type TaskType = "FOLLOW_UP" | "CHECKIN" | "ESCALATION" | "MILESTONE" | "HIGH_ALERT_MED";
type Priority = "CRITICAL" | "HIGH" | "MEDIUM";

interface Task {
  id: string;
  type: TaskType;
  patientId: string;
  patientName: string;
  surgeryType: string;
  riskLevel: string | null;
  title: string;
  subtitle: string;
  dueAt: string | null;
  priority: Priority;
  metadata: Record<string, unknown>;
}

interface TodaysTasksResponse {
  generatedAt: string;
  tasks: {
    followUps: Task[];
    checkins: Task[];
    escalations: Task[];
    milestones: Task[];
    highAlertMeds: Task[];
  };
  summary: {
    total: number;
    followUps: number;
    checkins: number;
    escalations: number;
    criticalEscalations: number;
    milestones: number;
    overdueMilestones: number;
    highAlertMeds: number;
  };
}

// ── Task type config ────────────────────────────────────────────────────────
const TASK_CONFIG: Record<TaskType, {
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  tint: string;
  iconBg: string;
}> = {
  FOLLOW_UP: {
    label: "Follow-ups",
    icon: CalendarClock,
    tint: "text-primary",
    iconBg: "bg-primary/10",
  },
  CHECKIN: {
    label: "Check-ins",
    icon: CheckSquare,
    tint: "text-accent-foreground",
    iconBg: "bg-accent/15",
  },
  ESCALATION: {
    label: "Escalations",
    icon: AlertTriangle,
    tint: "text-rose-700 dark:text-rose-300",
    iconBg: "bg-rose-500/10",
  },
  MILESTONE: {
    label: "Milestones",
    icon: Target,
    tint: "text-amber-700 dark:text-amber-300",
    iconBg: "bg-amber-500/10",
  },
  HIGH_ALERT_MED: {
    label: "High-alert meds",
    icon: Pill,
    tint: "text-purple-700 dark:text-purple-300",
    iconBg: "bg-purple-500/10",
  },
};

const PRIORITY_BADGE: Record<Priority, string> = {
  CRITICAL: "risk-critical",
  HIGH: "risk-high",
  MEDIUM: "risk-medium",
};

// ── Page widget ─────────────────────────────────────────────────────────────
export function TodaysTasksWidget() {
  const [data, setData] = React.useState<TodaysTasksResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState<TaskType>("ESCALATION");

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const r = await api<TodaysTasksResponse>("/api/todays-tasks");
        if (!cancelled) setData(r);
        // Auto-pick the most urgent tab with content
        if (!cancelled && r) {
          if (r.tasks.escalations.length > 0) setActiveTab("ESCALATION");
          else if (r.tasks.milestones.length > 0) setActiveTab("MILESTONE");
          else if (r.tasks.checkins.length > 0) setActiveTab("CHECKIN");
          else if (r.tasks.followUps.length > 0) setActiveTab("FOLLOW_UP");
          else if (r.tasks.highAlertMeds.length > 0) setActiveTab("HIGH_ALERT_MED");
        }
      } catch {
        // non-fatal — widget shows nothing
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const summary = data?.summary;
  const tabs: { type: TaskType; count: number; alert?: boolean }[] = [
    { type: "ESCALATION", count: summary?.escalations ?? 0, alert: (summary?.criticalEscalations ?? 0) > 0 },
    { type: "MILESTONE", count: summary?.milestones ?? 0, alert: (summary?.overdueMilestones ?? 0) > 0 },
    { type: "CHECKIN", count: summary?.checkins ?? 0 },
    { type: "FOLLOW_UP", count: summary?.followUps ?? 0 },
    { type: "HIGH_ALERT_MED", count: summary?.highAlertMeds ?? 0 },
  ];

  // Map TaskType to the tasks object key (singular type → plural key)
  const TASK_KEY_MAP: Record<TaskType, keyof TodaysTasksResponse["tasks"]> = {
    ESCALATION: "escalations",
    MILESTONE: "milestones",
    CHECKIN: "checkins",
    FOLLOW_UP: "followUps",
    HIGH_ALERT_MED: "highAlertMeds",
  };
  const activeTasks: Task[] = data ? data.tasks[TASK_KEY_MAP[activeTab]] || [] : [];

  return (
    <Card className="glass h-full elevate-1">
      <CardHeader className="border-b border-border">
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" />
          Today&rsquo;s tasks
          {!loading && summary && summary.total > 0 && (
            <Badge variant="outline" className="ml-1 num text-[10px]">{summary.total}</Badge>
          )}
        </CardTitle>
        <CardDescription>
          Unified worklist — escalations, milestones, check-ins, follow-ups, high-alert meds.
        </CardDescription>
        <CardAction>
          {!loading && summary && summary.total > 0 && (
            <Button
              size="sm"
              variant="ghost"
              className="text-[11px] h-7 px-2"
              onClick={() => navigate("my-workload")}
            >
              Open worklist <ChevronRight className="h-3 w-3" />
            </Button>
          )}
        </CardAction>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-4 space-y-3">
            <Skeleton className="h-9 w-full" />
            {Array.from({ length: 3 }).map((_, i) => (
              <Skeleton key={i} className="h-14 w-full" />
            ))}
          </div>
        ) : !summary || summary.total === 0 ? (
          <div className="flex flex-col items-center justify-center text-center py-12 px-4">
            <span className="relative flex items-center justify-center h-14 w-14 rounded-full bg-primary/10 text-primary mb-4">
              <CheckSquare className="h-7 w-7" />
              <span className="absolute -top-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-background">
                <span className="live-dot h-2 w-2 rounded-full bg-primary" />
              </span>
            </span>
            <p className="text-sm font-semibold">You&rsquo;re all caught up</p>
            <p className="text-xs text-muted-foreground mt-1 max-w-xs">
              No tasks pending for today. Use the breathing room to log check-ins or enroll new patients.
            </p>
          </div>
        ) : (
          <>
            {/* Tab strip */}
            <div className="flex items-center gap-1 px-3 pt-3 border-b border-border overflow-x-auto fancy-scroll">
              {tabs.map((t) => {
                const cfg = TASK_CONFIG[t.type];
                const Icon = cfg.icon;
                const isActive = activeTab === t.type;
                const isEmpty = t.count === 0;
                return (
                  <button
                    key={t.type}
                    onClick={() => setActiveTab(t.type)}
                    disabled={isEmpty}
                    className={cn(
                      "relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium border-b-2 transition-colors -mb-px",
                      isActive
                        ? "border-primary text-primary"
                        : isEmpty
                          ? "border-transparent text-muted-foreground/40 cursor-not-allowed"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {cfg.label}
                    {t.count > 0 && (
                      <span className={cn(
                        "num inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold",
                        t.alert
                          ? "bg-destructive/15 text-destructive live-pulse"
                          : isActive
                            ? "bg-primary/15 text-primary"
                            : "bg-muted text-muted-foreground"
                      )}>
                        {t.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Task list */}
            <ul className="max-h-[22rem] overflow-y-auto fancy-scroll p-2">
              {activeTasks.length === 0 ? (
                <li className="text-xs text-muted-foreground italic py-8 text-center">
                  No {TASK_CONFIG[activeTab].label.toLowerCase()} pending.
                </li>
              ) : (
                activeTasks.map((task, i) => (
                  <TaskRow key={task.id} task={task} delay={i * 0.04} />
                ))
              )}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── Single task row ─────────────────────────────────────────────────────────
function TaskRow({ task, delay }: { task: Task; delay: number }) {
  const cfg = TASK_CONFIG[task.type];
  const Icon = cfg.icon;
  const isCritical = task.priority === "CRITICAL";
  const isOverdueMilestone = task.type === "MILESTONE" && task.metadata?.isOverdue === true;

  let dueLabel = "";
  if (task.dueAt) {
    try {
      const dt = new Date(task.dueAt);
      dueLabel = task.type === "ESCALATION"
        ? `opened ${formatDistanceToNow(dt, { addSuffix: true })}`
        : task.type === "MILESTONE"
          ? `${format(dt, "d MMM")}${isOverdueMilestone ? " · overdue" : ""}`
          : `${format(dt, "h:mm a")} · ${formatDistanceToNow(dt, { addSuffix: true })}`;
    } catch {
      dueLabel = "";
    }
  }

  return (
    <motion.li
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.2, delay }}
      className="group"
    >
      <button
        onClick={() => navigate("patient-detail", { patientId: task.patientId })}
        className={cn(
          "w-full flex items-start gap-3 p-2.5 rounded-lg border border-border bg-card/60 hover:border-primary/40 hover:bg-card transition-colors text-left",
          isCritical && "ring-1 ring-destructive/30 live-pulse"
        )}
      >
        {/* Icon */}
        <span className={cn(
          "flex-shrink-0 flex items-center justify-center h-7 w-7 rounded-md mt-0.5",
          cfg.iconBg, cfg.tint
        )}>
          <Icon className="h-3.5 w-3.5" />
        </span>

        {/* Body */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={cn("px-1.5 py-0.5 rounded text-[9px] font-semibold uppercase tracking-wider", PRIORITY_BADGE[task.priority])}>
              {task.priority}
            </span>
            <span className="text-sm font-medium truncate">{task.patientName}</span>
            {task.riskLevel && (
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                · {task.riskLevel.toLowerCase()} risk
              </span>
            )}
          </div>
          <p className="text-xs text-foreground/85 mt-0.5 truncate">{task.title}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <p className="text-[11px] text-muted-foreground truncate">{task.subtitle}</p>
            {dueLabel && (
              <>
                <span className="text-[10px] text-muted-foreground/40">·</span>
                <span className={cn(
                  "text-[10px] num",
                  isOverdueMilestone ? "text-rose-600 dark:text-rose-400 font-medium" : "text-muted-foreground"
                )}>
                  {dueLabel}
                </span>
              </>
            )}
          </div>
        </div>

        <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5 transition-all flex-shrink-0 mt-1" />
      </button>
    </motion.li>
  );
}
