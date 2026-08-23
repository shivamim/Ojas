"use client";

import * as React from "react";
import { MarketingHeader } from "@/components/marketing-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import {
  GitCommit, Rocket, Shield, FlaskConical, FileText, RefreshCw,
  ChevronDown, ChevronUp, Bot, CheckCircle2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AppFooter } from "@/components/app-shell";

interface ChangelogEntry {
  phase: string;
  title: string;
  taskId: string;
  agent: string;
  task: string;
  stageSummary: string;
  keyPoints: string[];
  category: "setup" | "hardening" | "testing" | "docs" | "feature" | "review";
}

const CATEGORY_META: Record<ChangelogEntry["category"], { icon: React.ComponentType<{ className?: string }>; tone: string; dot: string; label: string }> = {
  setup: { icon: Rocket, tone: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400", dot: "bg-blue-500", label: "Setup" },
  hardening: { icon: Shield, tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500", label: "Hardening" },
  testing: { icon: FlaskConical, tone: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-400", dot: "bg-violet-500", label: "Testing" },
  docs: { icon: FileText, tone: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400", dot: "bg-amber-500", label: "Docs" },
  feature: { icon: GitCommit, tone: "border-primary/30 bg-primary/10 text-primary", dot: "bg-primary", label: "Feature" },
  review: { icon: RefreshCw, tone: "border-cyan-500/40 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400", dot: "bg-cyan-500", label: "Review" },
};

function PhaseCard({ entry, isLast }: { entry: ChangelogEntry; isLast: boolean }) {
  const [expanded, setExpanded] = React.useState(false);
  const meta = CATEGORY_META[entry.category];
  const Icon = meta.icon;

  return (
    <div className="relative pl-10 sm:pl-14 pb-8">
      {/* Timeline line */}
      {!isLast && (
        <div className="absolute left-[18px] sm:left-[26px] top-10 bottom-0 w-px bg-border" />
      )}
      {/* Timeline dot */}
      <div className={cn(
        "absolute left-0 top-1.5 flex h-9 w-9 sm:h-13 sm:w-13 items-center justify-center rounded-full ring-4 ring-background",
        meta.dot,
      )}>
        <Icon className="h-4 w-4 sm:h-5 sm:w-5 text-white" />
      </div>

      <Card className="elevate-2 hover:-translate-y-0.5 transition-transform">
        <CardContent className="p-4 sm:p-5">
          {/* Header row */}
          <div className="flex items-start justify-between gap-3 mb-2">
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-mono font-bold text-muted-foreground">{entry.phase}</span>
                <Badge variant="outline" className={cn("text-[9px] uppercase tracking-wider gap-1", meta.tone)}>
                  <Icon className="h-2.5 w-2.5" /> {meta.label}
                </Badge>
                <span className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Bot className="h-2.5 w-2.5" /> {entry.agent}
                </span>
              </div>
              <h3 className="text-sm sm:text-base font-semibold mt-1.5 leading-tight">{entry.title}</h3>
            </div>
            {entry.keyPoints.length > 0 && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors flex-shrink-0 mt-1"
              >
                {expanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
                {expanded ? "Less" : "Details"}
              </button>
            )}
          </div>

          {/* Task summary */}
          <p className="text-xs text-muted-foreground leading-relaxed line-clamp-2">{entry.task}</p>

          {/* Expandable key points */}
          {expanded && (
            <div className="mt-3 pt-3 border-t space-y-3">
              {entry.keyPoints.length > 0 && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Key changes</div>
                  <ul className="space-y-1.5">
                    {entry.keyPoints.map((pt, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs leading-relaxed">
                        <CheckCircle2 className="h-3 w-3 text-primary/70 flex-shrink-0 mt-0.5" />
                        <span className="text-muted-foreground">{pt.length > 180 ? pt.slice(0, 180) + "…" : pt}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {entry.stageSummary && (
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Stage summary</div>
                  <p className="text-xs text-muted-foreground leading-relaxed">{entry.stageSummary.slice(0, 400)}{entry.stageSummary.length > 400 ? "…" : ""}</p>
                </div>
              )}
              {entry.taskId && (
                <div className="text-[10px] font-mono text-muted-foreground/60">Task ID: {entry.taskId}</div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export function ChangelogPage() {
  const [phases, setPhases] = React.useState<ChangelogEntry[]>([]);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    fetch("/api/changelog")
      .then((r) => r.json())
      .then((d: { phases: ChangelogEntry[] }) => { setPhases(d.phases ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  // Count by category for the summary strip
  const byCategory = React.useMemo(() => {
    const counts: Record<string, number> = {};
    for (const p of phases) counts[p.category] = (counts[p.category] ?? 0) + 1;
    return counts;
  }, [phases]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5">
      <MarketingHeader />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        {/* Hero */}
        <div className="text-center mb-10 sm:mb-12">
          <div className="inline-flex items-center gap-1.5 text-eyebrow text-primary mb-3">
            <GitCommit className="h-3.5 w-3.5" />
            CHANGELOG
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
            Production-hardening timeline
          </h1>
          <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Every phase of the Ojas production-hardening effort, parsed directly from the engineering worklog. {phases.length} phases from baseline setup to the current pilot-ready state.
          </p>
        </div>

        {/* Category summary strip */}
        {!loading && phases.length > 0 && (
          <div className="mb-10 flex items-center justify-center gap-2 sm:gap-3 flex-wrap">
            {Object.entries(CATEGORY_META).map(([cat, meta]) => {
              const count = byCategory[cat] ?? 0;
              if (count === 0) return null;
              return (
                <div key={cat} className={cn("flex items-center gap-1.5 rounded-full border px-2.5 py-1", meta.tone)}>
                  <meta.icon className="h-3 w-3" />
                  <span className="text-[10px] font-semibold uppercase tracking-wider">{meta.label}</span>
                  <span className="text-[10px] font-mono font-bold">{count}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Timeline */}
        {loading ? (
          <div className="space-y-4 pl-10">
            {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
          </div>
        ) : phases.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No changelog entries found.</CardContent></Card>
        ) : (
          <div>
            {phases.map((entry, i) => (
              <PhaseCard key={entry.phase + i} entry={entry} isLast={i === phases.length - 1} />
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="mt-10 text-center">
          <p className="text-xs text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            This timeline is generated from <code className="bg-muted px-1 py-0.5 rounded">worklog.md</code> — the same engineering handover document used by every development phase. It is updated as part of each production-hardening round.
          </p>
        </div>
      </main>
      <AppFooter />
    </div>
  );
}
