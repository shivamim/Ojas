"use client";

import * as React from "react";
import { api, useAuth } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import {
  ClipboardCheck, AlertTriangle, CheckCircle2, XCircle, Clock,
  TrendingUp, FileWarning, CalendarClock, User, ChevronRight, ShieldAlert,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { format, formatDistanceToNow, isPast, differenceInDays } from "date-fns";

// ── Types matching /api/nabh/dashboard ────────────────────────────────────────
interface NabhChapter {
  id: string;
  label: string;
  total: number;
  met: number;
  complianceScore: number;
}
interface NabhGap {
  id: string;
  standardCode: string;
  category: string;
  title: string;
  status: string;
  gapDescription: string | null;
  correctiveAction: string | null;
  correctiveOwner: string | null;
  correctiveDueDate: Date | null;
  expiresAt: Date | null;
}
interface NabhDeadline {
  id: string;
  standardCode: string;
  title: string;
  correctiveOwner: string | null;
  correctiveDueDate: Date | null;
}
interface NabhDashboard {
  hospitalId: string;
  hospitalName: string;
  generatedAt: string;
  readinessScore: number;
  coreReadinessScore: number;
  metCount: number;
  totalCount: number;
  coreMetCount: number;
  coreTotalCount: number;
  chapters: NabhChapter[];
  evidence: {
    total: number;
    byStatus: Record<string, number>;
    gaps: NabhGap[];
    upcomingDeadlines: NabhDeadline[];
  };
  positioning: string;
}

// ── Readiness ring (SVG circular progress) ────────────────────────────────────
function ReadinessRing({ value, label, sublabel }: { value: number; label: string; sublabel?: string }) {
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (value / 100) * circumference;
  const tone = value >= 80 ? "text-emerald-500" : value >= 50 ? "text-amber-500" : "text-red-500";
  return (
    <div className="relative flex items-center justify-center">
      <svg className="h-32 w-32 -rotate-90" viewBox="0 0 120 120">
        <circle cx="60" cy="60" r={radius} fill="none" stroke="currentColor" strokeWidth="10" className="text-muted/30" />
        <circle
          cx="60" cy="60" r={radius} fill="none" stroke="currentColor" strokeWidth="10"
          strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset}
          className={cn("transition-all duration-700", tone)}
        />
      </svg>
      <div className="absolute flex flex-col items-center">
        <span className={cn("text-2xl font-bold", tone)}>{Math.round(value)}%</span>
        <span className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">{label}</span>
        {sublabel && <span className="text-[10px] text-muted-foreground/70">{sublabel}</span>}
      </div>
    </div>
  );
}

function statusTone(status: string) {
  const s = status.toUpperCase();
  if (s === "VERIFIED" || s === "SUBMITTED") return { badge: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", Icon: CheckCircle2 };
  if (s === "GAP") return { badge: "border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-400", Icon: XCircle };
  if (s === "PARTIAL") return { badge: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400", Icon: AlertTriangle };
  if (s === "EXPIRED") return { badge: "border-red-600/50 bg-red-600/10 text-red-700 dark:text-red-400", Icon: ShieldAlert };
  if (s === "REQUIRES_REVIEW") return { badge: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400", Icon: FileWarning };
  return { badge: "border-muted-foreground/30 bg-muted text-muted-foreground", Icon: Clock };
}

function deadlineTone(dueDate: Date | null): { label: string; badge: string } {
  if (!dueDate) return { label: "No deadline", badge: "border-muted-foreground/30 bg-muted text-muted-foreground" };
  const days = differenceInDays(dueDate, new Date());
  if (isPast(dueDate)) return { label: "Overdue", badge: "border-red-600/50 bg-red-600/10 text-red-700 dark:text-red-400" };
  if (days <= 3) return { label: `${days}d left`, badge: "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400" };
  if (days <= 7) return { label: `${days}d left`, badge: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400" };
  return { label: `${days}d left`, badge: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400" };
}

export function NabhDashboardPage() {
  const { user } = useAuth();
  const [data, setData] = React.useState<NabhDashboard | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    api<NabhDashboard>("/api/nabh/dashboard")
      .then((d) => { if (!cancelled) { setData(d); setLoading(false); } })
      .catch((e) => { if (!cancelled) { setError(e instanceof Error ? e.message : "Failed to load"); setLoading(false); } });
    return () => { cancelled = true; };
  }, []);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
        <Skeleton className="h-64" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <Card className="border-destructive/40">
        <CardContent className="p-8 text-center">
          <AlertTriangle className="h-8 w-8 text-destructive mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">{error ?? "Unable to load NABH dashboard"}</p>
        </CardContent>
      </Card>
    );
  }

  const gaps = data.evidence.gaps;
  const deadlines = data.evidence.upcomingDeadlines;
  const byStatus = data.evidence.byStatus;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <ClipboardCheck className="h-6 w-6 text-primary" />
            NABH Readiness Dashboard
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            {data.hospitalName} · Generated {formatDistanceToNow(new Date(data.generatedAt), { addSuffix: true })}
          </p>
        </div>
        <Badge variant="outline" className="text-[10px] uppercase tracking-wider border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-400 gap-1.5">
          <ShieldAlert className="h-3 w-3" /> Readiness platform · NOT accreditation
        </Badge>
      </div>

      {/* Positioning banner */}
      <div className="rounded-lg border border-violet-500/20 bg-violet-500/5 px-4 py-3 text-xs text-muted-foreground leading-relaxed">
        {data.positioning}
      </div>

      {/* Top row: readiness rings */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="flex flex-col items-center py-6">
          <ReadinessRing value={data.readinessScore} label="Overall readiness" sublabel={`${data.metCount}/${data.totalCount} met`} />
        </Card>
        <Card className="flex flex-col items-center py-6">
          <ReadinessRing value={data.coreReadinessScore} label="Core standards" sublabel={`${data.coreMetCount}/${data.coreTotalCount} met`} />
          <p className="text-[10px] text-muted-foreground mt-2 text-center max-w-[200px]">
            NABH requires 100% Core compliance — this is the critical path.
          </p>
        </Card>
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm flex items-center gap-2"><TrendingUp className="h-4 w-4 text-primary" /> Evidence summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Total evidence records</span>
              <span className="font-mono font-semibold">{data.evidence.total}</span>
            </div>
            <div className="border-t pt-2 space-y-1.5">
              {Object.entries(byStatus).sort().map(([status, count]) => {
                const tone = statusTone(status);
                return (
                  <div key={status} className="flex items-center justify-between">
                    <Badge variant="outline" className={cn("text-[9px] uppercase tracking-wider gap-1", tone.badge)}>
                      <tone.Icon className="h-2.5 w-2.5" /> {status.replace(/_/g, " ").toLowerCase()}
                    </Badge>
                    <span className="font-mono text-xs font-semibold">{count}</span>
                  </div>
                );
              })}
              {Object.keys(byStatus).length === 0 && (
                <p className="text-xs text-muted-foreground italic">No evidence records yet.</p>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Chapter breakdown */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Chapter readiness</CardTitle>
          <CardDescription className="text-xs">Per-chapter MET count and readiness score. Core chapters require 100%.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {data.chapters.map((ch) => (
              <div key={ch.id} className="rounded-lg border p-3">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-semibold truncate">{ch.label}</span>
                  <span className={cn(
                    "text-[10px] font-mono font-bold",
                    ch.complianceScore >= 100 ? "text-emerald-600" : ch.complianceScore >= 50 ? "text-amber-600" : "text-red-600",
                  )}>
                    {Math.round(ch.complianceScore)}%
                  </span>
                </div>
                <Progress value={ch.complianceScore} className="h-1.5 mb-2" />
                <div className="flex items-center justify-between text-[10px] text-muted-foreground">
                  <span>{ch.met} of {ch.total} met</span>
                  {ch.complianceScore < 100 && (
                    <span className="text-amber-600 font-medium">{ch.total - ch.met} remaining</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Two-column: gaps + deadlines */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Gaps */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <FileWarning className="h-4 w-4 text-amber-500" />
              Open gaps & corrective actions
              <Badge variant="outline" className="ml-1 text-[10px]">{gaps.length}</Badge>
            </CardTitle>
            <CardDescription className="text-xs">Standards with GAP / PARTIAL / REQUIRES_REVIEW / EXPIRED status.</CardDescription>
          </CardHeader>
          <CardContent>
            {gaps.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No open gaps. All evidence verified.</p>
              </div>
            ) : (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                {gaps.map((gap) => {
                  const tone = statusTone(gap.status);
                  const dt = deadlineTone(gap.correctiveDueDate);
                  return (
                    <div key={gap.id} className="rounded-lg border p-3 hover:bg-muted/30 transition-colors">
                      <div className="flex items-start justify-between gap-2 mb-1.5">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] text-muted-foreground">{gap.standardCode}</span>
                            <Badge variant="outline" className={cn("text-[9px] uppercase gap-1", tone.badge)}>
                              <tone.Icon className="h-2.5 w-2.5" /> {gap.status.replace(/_/g, " ").toLowerCase()}
                            </Badge>
                          </div>
                          <p className="text-xs font-semibold mt-1">{gap.title}</p>
                        </div>
                        {gap.correctiveDueDate && (
                          <Badge variant="outline" className={cn("text-[9px] flex-shrink-0", dt.badge)}>
                            <CalendarClock className="h-2.5 w-2.5 mr-0.5" /> {dt.label}
                          </Badge>
                        )}
                      </div>
                      {gap.gapDescription && (
                        <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed line-clamp-2">{gap.gapDescription}</p>
                      )}
                      {gap.correctiveAction && (
                        <p className="text-[11px] mt-1.5 leading-relaxed">
                          <span className="text-muted-foreground">Corrective action: </span>
                          <span className="text-foreground">{gap.correctiveAction}</span>
                        </p>
                      )}
                      {gap.correctiveOwner && (
                        <p className="text-[10px] text-muted-foreground mt-1.5 flex items-center gap-1">
                          <User className="h-2.5 w-2.5" /> {gap.correctiveOwner}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Upcoming deadlines */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <CalendarClock className="h-4 w-4 text-primary" />
              Upcoming corrective-action deadlines
              <Badge variant="outline" className="ml-1 text-[10px]">{deadlines.length}</Badge>
            </CardTitle>
            <CardDescription className="text-xs">Next 30 days. Overdue items are highlighted.</CardDescription>
          </CardHeader>
          <CardContent>
            {deadlines.length === 0 ? (
              <div className="text-center py-8">
                <CheckCircle2 className="h-8 w-8 text-emerald-500 mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">No upcoming deadlines.</p>
              </div>
            ) : (
              <div className="space-y-2">
                {deadlines
                  .slice()
                  .sort((a, b) => {
                    const da = a.correctiveDueDate ? new Date(a.correctiveDueDate).getTime() : Infinity;
                    const db = b.correctiveDueDate ? new Date(b.correctiveDueDate).getTime() : Infinity;
                    return da - db;
                  })
                  .map((d) => {
                    const dt = deadlineTone(d.correctiveDueDate as Date | null);
                    return (
                      <div key={d.id} className="flex items-center gap-3 rounded-lg border p-2.5">
                        <div className={cn("flex h-9 w-9 items-center justify-center rounded-lg flex-shrink-0", dt.badge)}>
                          <Clock className="h-4 w-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="font-mono text-[10px] text-muted-foreground">{d.standardCode}</span>
                          </div>
                          <p className="text-xs font-semibold truncate">{d.title}</p>
                          {d.correctiveOwner && (
                            <p className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                              <User className="h-2.5 w-2.5" /> {d.correctiveOwner}
                            </p>
                          )}
                        </div>
                        <div className="text-right flex-shrink-0">
                          {d.correctiveDueDate && (
                            <>
                              <p className="text-[10px] text-muted-foreground">{format(new Date(d.correctiveDueDate), "dd MMM")}</p>
                              <Badge variant="outline" className={cn("text-[9px] mt-0.5", dt.badge)}>{dt.label}</Badge>
                            </>
                          )}
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Footer */}
      <p className="text-xs text-muted-foreground text-center leading-relaxed">
        A record existing does not mean compliant. Verified evidence + closed corrective actions drive readiness.
        See <code className="bg-muted px-1 py-0.5 rounded">docs/PRODUCTION_READINESS.md</code> for the NABH positioning.
      </p>
    </div>
  );
}
