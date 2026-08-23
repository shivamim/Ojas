"use client";

// Ojas — AI usage compliance view. Hospital admins see every AI agent call
// (prompt ref, output, tokens, latency, outcome, fallback flag) — the
// compliance record and billing input. Fallback rates are honestly surfaced,
// with a rose tint when they exceed 10%.
import * as React from "react";
import { MotionConfig, motion } from "framer-motion";
import { toast } from "sonner";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import {
  Bot, Activity, Coins, AlertTriangle, Loader2, Cpu, ShieldAlert,
  Sparkles, CheckCircle2, Clock, ChevronRight, FileText, Zap,
} from "lucide-react";
import {
  Bar, BarChart, Cell, ResponsiveContainer, Tooltip as RTooltip,
  XAxis, YAxis, Pie, PieChart,
} from "recharts";

import { api } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

// ── Types matching /api/ai/runs ─────────────────────────────────────────────
type AgentType = "TRIAGE" | "CONVERSATIONAL" | "CARE_COACH" | "ESCALATION_ORCHESTRATOR" | "INSIGHTS";
type Outcome = "AUTO_APPLIED" | "PENDING_CONFIRMATION" | "CONFIRMED" | "OVERRIDDEN" | "FAILED" | "FALLBACK";

interface AiRun {
  id: string;
  hospitalId: string;
  agentType: string;
  promptRef: string;
  inputSummary: string;
  output: string;
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  outcome: Outcome;
  fallbackUsed: boolean;
  errorMessage: string | null;
  checkinId: string | null;
  createdAt: string;
}

interface Aggregate {
  totalCalls: number;
  totalTokens: number;
  fallbacks: number;
  byAgent: Record<string, number>;
}

interface AiRunsResponse {
  runs: AiRun[];
  aggregate: Aggregate;
}

// ── Agent metadata ──────────────────────────────────────────────────────────
const AGENT_META: Record<string, { label: string; color: string; icon: React.ComponentType<{ className?: string }> }> = {
  TRIAGE:                  { label: "Triage", color: "#10b981", icon: Activity },
  CONVERSATIONAL:          { label: "Conversational", color: "#14b8a6", icon: Sparkles },
  CARE_COACH:              { label: "Care Coach", color: "#f59e0b", icon: Bot },
  ESCALATION_ORCHESTRATOR: { label: "Escalation Orchestrator", color: "#f97316", icon: AlertTriangle },
  INSIGHTS:                { label: "Insights", color: "#0ea5e9", icon: FileText },
};

function agentMeta(t: string) {
  return AGENT_META[t] || { label: t, color: "#64748b", icon: Cpu };
}

const OUTCOME_META: Record<Outcome, { label: string; cls: string }> = {
  AUTO_APPLIED:          { label: "Auto-applied", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" },
  PENDING_CONFIRMATION:  { label: "Pending confirmation", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" },
  CONFIRMED:             { label: "Confirmed", cls: "bg-primary/15 text-primary border-primary/30" },
  OVERRIDDEN:            { label: "Overridden", cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30" },
  FAILED:                { label: "Failed", cls: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30" },
  FALLBACK:              { label: "Fallback", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" },
};

function ago(iso: string): string {
  try { return formatDistanceToNow(parseISO(iso), { addSuffix: true }); } catch { return "—"; }
}

function absTime(iso: string): string {
  try { return format(parseISO(iso), "d MMM yyyy · h:mm a"); } catch { return iso; }
}

function truncate(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

function tryPrettyJson(s: string): string {
  try {
    const parsed = JSON.parse(s);
    return JSON.stringify(parsed, null, 2);
  } catch {
    return s;
  }
}

// ── Page ────────────────────────────────────────────────────────────────────
export function AiUsagePage() {
  const [data, setData] = React.useState<AiRunsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [agentFilter, setAgentFilter] = React.useState<string>("ALL");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<AiRunsResponse>("/api/ai/runs?limit=200");
      setData(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load AI usage");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const filtered = React.useMemo(() => {
    if (!data) return [];
    if (agentFilter === "ALL") return data.runs;
    return data.runs.filter((r) => r.agentType === agentFilter);
  }, [data, agentFilter]);

  const agg = data?.aggregate;
  const fallbackRate = agg && agg.totalCalls > 0 ? (agg.fallbacks / agg.totalCalls) * 100 : 0;
  const distinctAgents = agg ? Object.keys(agg.byAgent).length : 0;
  const highFallback = fallbackRate > 10;

  // Outcome distribution
  const outcomeCounts = React.useMemo(() => {
    const m: Record<string, number> = {};
    for (const r of filtered) m[r.outcome] = (m[r.outcome] || 0) + 1;
    return m;
  }, [filtered]);

  // By-agent data for chart
  const byAgentData = React.useMemo(() => {
    if (!agg) return [];
    return Object.entries(agg.byAgent)
      .map(([k, v]) => ({ name: agentMeta(k).label, value: v, type: k, color: agentMeta(k).color }))
      .sort((a, b) => b.value - a.value);
  }, [agg]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-6">
        {/* Header */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight flex items-center gap-2">
            <Bot className="h-6 w-6 text-primary" />
            AI usage
          </h1>
          <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
            Every AI agent call is logged with prompt reference, output, tokens, latency, and outcome.
            This is your compliance record and billing input.
          </p>
        </motion.section>

        {loading ? (
          <LoadingSkeleton />
        ) : !data || data.runs.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* KPI cards */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <KpiCard
                icon={Activity}
                label="Total calls"
                value={agg?.totalCalls?.toLocaleString() ?? "0"}
                sub="across all agents"
              />
              <KpiCard
                icon={Coins}
                label="Total tokens"
                value={agg?.totalTokens?.toLocaleString() ?? "0"}
                sub="prompt + completion"
              />
              <KpiCard
                icon={AlertTriangle}
                label="Fallback rate"
                value={`${fallbackRate.toFixed(1)}%`}
                sub={`${agg?.fallbacks ?? 0} of ${agg?.totalCalls ?? 0} calls`}
                tint={highFallback ? "rose" : undefined}
              />
              <KpiCard
                icon={Cpu}
                label="Distinct agents"
                value={String(distinctAgents)}
                sub="in use this period"
              />
            </div>

            {highFallback && (
              <Alert className="border-rose-500/40 bg-rose-500/10">
                <ShieldAlert className="h-4 w-4 text-rose-600 dark:text-rose-400" />
                <AlertTitle className="text-sm">Fallback rate above 10%</AlertTitle>
                <AlertDescription className="text-xs">
                  More than 1 in 10 AI calls fell back to the rule-based path. This usually indicates LLM provider instability or rate-limit pressure. Review the run log below and contact your provider if it persists.
                </AlertDescription>
              </Alert>
            )}

            {/* Charts row */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* By-agent breakdown */}
              <Card className="glass">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Cpu className="h-4 w-4 text-primary" /> Calls by agent
                  </CardTitle>
                  <CardDescription className="text-xs">
                    Distribution of AI calls across the agent fleet.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {byAgentData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <Bot className="h-10 w-10 text-muted-foreground/40 mb-3" />
                      <p className="text-sm text-muted-foreground">No data yet</p>
                      <p className="text-xs text-muted-foreground/70 mt-1">Data will appear here once available</p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      {byAgentData.map((d) => {
                        const max = Math.max(...byAgentData.map((x) => x.value), 1);
                        const pct = (d.value / max) * 100;
                        const Icon = agentMeta(d.type).icon;
                        const iconColor = d.color;
                        return (
                          <div key={d.type} className="flex items-center gap-3">
                            <div className="flex items-center gap-2 w-40 flex-shrink-0">
                              <span style={{ color: iconColor }}>
                                <Icon className="h-3.5 w-3.5" />
                              </span>
                              <span className="text-xs truncate">{d.name}</span>
                            </div>
                            <div className="flex-1 h-6 rounded bg-muted/60 overflow-hidden">
                              <div
                                className="h-full rounded transition-all"
                                style={{ width: `${pct}%`, backgroundColor: d.color }}
                              />
                            </div>
                            <span className="text-xs font-medium w-8 text-right">{d.value}</span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Outcome distribution */}
              <Card className="glass">
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-primary" /> Outcome distribution
                  </CardTitle>
                  <CardDescription className="text-xs">
                    AUTO_APPLIED = no human action needed. PENDING_CONFIRMATION = awaiting coordinator review. FALLBACK = rule-based path used (provider unavailable).
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col sm:flex-row items-center gap-4">
                    <div className="h-[140px] w-[140px] flex-shrink-0">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={Object.entries(outcomeCounts).map(([k, v]) => ({
                              name: OUTCOME_META[k as Outcome]?.label || k,
                              value: v,
                              outcome: k,
                            }))}
                            dataKey="value"
                            nameKey="name"
                            innerRadius={36}
                            outerRadius={68}
                            paddingAngle={2}
                          >
                            {Object.entries(outcomeCounts).map(([k]) => (
                              <Cell
                                key={k}
                                fill={OUTCOME_COLOR[k as Outcome] || "#94a3b8"}
                                stroke="transparent"
                              />
                            ))}
                          </Pie>
                          <RTooltip
                            contentStyle={{ background: "rgba(15,23,42,0.95)", border: "none", borderRadius: 8, fontSize: 12, color: "white" }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex-1 grid grid-cols-2 gap-2 w-full">
                      {Object.entries(outcomeCounts)
                        .sort((a, b) => b[1] - a[1])
                        .map(([k, v]) => (
                          <div key={k} className="flex items-center gap-2">
                            <span className="h-2.5 w-2.5 rounded-sm flex-shrink-0" style={{ backgroundColor: OUTCOME_COLOR[k as Outcome] || "#94a3b8" }} />
                            <span className="text-xs text-muted-foreground flex-1">{OUTCOME_META[k as Outcome]?.label || k}</span>
                            <span className="text-xs font-medium">{v}</span>
                          </div>
                        ))}
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Honesty note */}
            <Alert className="border-primary/30 bg-primary/5">
              <Sparkles className="h-4 w-4 text-primary" />
              <AlertTitle className="text-sm">How Ojas uses AI — honestly</AlertTitle>
              <AlertDescription className="text-xs space-y-1.5">
                <p>All AI features in Ojas make real LLM calls. Rule-based fallbacks fire only on provider error or timeout, and are logged with outcome = <code className="font-mono">FALLBACK</code> — never presented as the model&apos;s output.</p>
                <p>Above-LOW risk AI recommendations (triage, escalation proposals, care-coach drafts) require explicit coordinator confirmation before anything happens. The audit trail is your compliance record.</p>
              </AlertDescription>
            </Alert>

            {/* Run log */}
            <Card className="glass">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div>
                    <CardTitle className="text-sm font-medium flex items-center gap-2">
                      <Clock className="h-4 w-4 text-primary" /> Run log
                    </CardTitle>
                    <CardDescription className="text-xs mt-0.5">
                      {filtered.length} {filtered.length === 1 ? "call" : "calls"} in scope.
                    </CardDescription>
                  </div>
                  <Select value={agentFilter} onValueChange={setAgentFilter}>
                    <SelectTrigger className="w-[200px] h-8">
                      <SelectValue placeholder="All agents" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="ALL">All agents</SelectItem>
                      <SelectItem value="TRIAGE">Triage</SelectItem>
                      <SelectItem value="CONVERSATIONAL">Conversational</SelectItem>
                      <SelectItem value="CARE_COACH">Care Coach</SelectItem>
                      <SelectItem value="ESCALATION_ORCHESTRATOR">Escalation Orchestrator</SelectItem>
                      <SelectItem value="INSIGHTS">Insights</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <RunLogTable runs={filtered} />
              </CardContent>
            </Card>
          </>
        )}
      </div>
    </MotionConfig>
  );
}

const OUTCOME_COLOR: Record<Outcome, string> = {
  AUTO_APPLIED: "#10b981",
  PENDING_CONFIRMATION: "#f59e0b",
  CONFIRMED: "#14b8a6",
  OVERRIDDEN: "#f97316",
  FAILED: "#f43f5e",
  FALLBACK: "#a855f7",
};

// ── KPI card ────────────────────────────────────────────────────────────────
function KpiCard({ icon: Icon, label, value, sub, tint }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
  tint?: "rose";
}) {
  return (
    <Card className={cn("glass", tint === "rose" && "border-rose-500/40")}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <span className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</span>
          <Icon className={cn("h-4 w-4", tint === "rose" ? "text-rose-600 dark:text-rose-400" : "text-primary")} />
        </div>
        <div className={cn("text-2xl font-semibold mt-2", tint === "rose" && "text-rose-600 dark:text-rose-400")}>
          {value}
        </div>
        {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

// ── Run log table ───────────────────────────────────────────────────────────
function RunLogTable({ runs }: { runs: AiRun[] }) {
  const [selected, setSelected] = React.useState<AiRun | null>(null);

  return (
    <>
      {/* Desktop table */}
      <div className="hidden md:block overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/40 border-y border-border">
            <tr className="text-left text-muted-foreground">
              <th className="px-4 py-2.5 font-medium">When</th>
              <th className="px-4 py-2.5 font-medium">Agent</th>
              <th className="px-4 py-2.5 font-medium">Outcome</th>
              <th className="px-4 py-2.5 font-medium">Tokens (in/out)</th>
              <th className="px-4 py-2.5 font-medium">Latency</th>
              <th className="px-4 py-2.5 font-medium">Output preview</th>
              <th className="px-4 py-2.5"></th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {runs.map((r) => {
              const meta = agentMeta(r.agentType);
              const Icon = meta.icon;
              return (
                <tr key={r.id} className="hover:bg-accent/30 transition-colors">
                  <td className="px-4 py-2.5 align-top">
                    <div className="font-medium">{ago(r.createdAt)}</div>
                    <div className="text-[10px] text-muted-foreground">{absTime(r.createdAt)}</div>
                  </td>
                  <td className="px-4 py-2.5 align-top">
                    <div className="flex items-center gap-1.5">
                      <span style={{ color: meta.color }}>
                        <Icon className="h-3.5 w-3.5" />
                      </span>
                      <span className="font-medium">{meta.label}</span>
                    </div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">{r.promptRef}</div>
                  </td>
                  <td className="px-4 py-2.5 align-top">
                    <Badge variant="outline" className={OUTCOME_META[r.outcome]?.cls || "bg-muted text-muted-foreground"}>
                      {OUTCOME_META[r.outcome]?.label || r.outcome}
                    </Badge>
                    {r.fallbackUsed && (
                      <div className="text-[10px] text-amber-600 dark:text-amber-400 mt-1 flex items-center gap-1">
                        <ShieldAlert className="h-3 w-3" /> fallback
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 align-top">
                    <span className="font-mono">{r.tokensIn} / {r.tokensOut}</span>
                  </td>
                  <td className="px-4 py-2.5 align-top">
                    <span className="font-mono">{r.latencyMs.toLocaleString()} ms</span>
                  </td>
                  <td className="px-4 py-2.5 align-top max-w-xs">
                    <span className="text-muted-foreground line-clamp-2">{truncate(r.output, 120)}</span>
                  </td>
                  <td className="px-4 py-2.5 align-top text-right">
                    <button
                      onClick={() => setSelected(r)}
                      className="inline-flex items-center gap-1 text-primary hover:underline text-xs"
                    >
                      Inspect <ChevronRight className="h-3 w-3" />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Mobile cards */}
      <div className="md:hidden divide-y divide-border">
        {runs.map((r) => {
          const meta = agentMeta(r.agentType);
          const Icon = meta.icon;
          return (
            <button
              key={r.id}
              onClick={() => setSelected(r)}
              className="w-full text-left p-4 hover:bg-accent/30 transition-colors"
            >
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-1.5">
                  <span style={{ color: meta.color }}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <span className="font-medium text-sm">{meta.label}</span>
                </div>
                <span className="text-[10px] text-muted-foreground">{ago(r.createdAt)}</span>
              </div>
              <div className="flex items-center gap-2 mt-2 flex-wrap">
                <Badge variant="outline" className={OUTCOME_META[r.outcome]?.cls || "bg-muted text-muted-foreground"}>
                  {OUTCOME_META[r.outcome]?.label || r.outcome}
                </Badge>
                {r.fallbackUsed && (
                  <Badge variant="outline" className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30">
                    <ShieldAlert className="h-3 w-3" /> fallback
                  </Badge>
                )}
                <span className="text-[10px] text-muted-foreground font-mono">
                  {r.tokensIn}/{r.tokensOut} tok · {r.latencyMs}ms
                </span>
              </div>
              <div className="text-xs text-muted-foreground mt-2 line-clamp-2">{truncate(r.output, 100)}</div>
            </button>
          );
        })}
      </div>

      {/* Detail dialog */}
      <Dialog open={!!selected} onOpenChange={(v) => !v && setSelected(null)}>
        <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto fancy-scroll">
          {selected && <RunDetail run={selected} />}
        </DialogContent>
      </Dialog>
    </>
  );
}

function RunDetail({ run }: { run: AiRun }) {
  const meta = agentMeta(run.agentType);
  const Icon = meta.icon;
  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center gap-2 text-base">
          <span style={{ color: meta.color }}>
            <Icon className="h-4 w-4" />
          </span>
          {meta.label} · run detail
        </DialogTitle>
        <DialogDescription>
          {absTime(run.createdAt)} · prompt ref <code className="font-mono">{run.promptRef}</code>
        </DialogDescription>
      </DialogHeader>

      <div className="space-y-4 py-2">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
          <DetailStat label="Outcome" value={OUTCOME_META[run.outcome]?.label || run.outcome} />
          <DetailStat label="Latency" value={`${run.latencyMs.toLocaleString()} ms`} />
          <DetailStat label="Tokens (in)" value={run.tokensIn.toLocaleString()} />
          <DetailStat label="Tokens (out)" value={run.tokensOut.toLocaleString()} />
        </div>

        {run.fallbackUsed && (
          <Alert className="border-amber-500/50 bg-amber-500/10">
            <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertTitle className="text-xs">Fallback used</AlertTitle>
            <AlertDescription className="text-[11px]">
              The LLM provider was unavailable or returned a malformed response. A rule-based fallback was applied and logged — never presented as the model&apos;s output.
            </AlertDescription>
          </Alert>
        )}

        {run.errorMessage && (
          <Alert className="border-rose-500/40 bg-rose-500/10">
            <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
            <AlertTitle className="text-xs">Error</AlertTitle>
            <AlertDescription className="text-[11px] font-mono">{run.errorMessage}</AlertDescription>
          </Alert>
        )}

        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
            <Zap className="h-3.5 w-3.5" /> Input summary
          </div>
          <pre className="text-[11px] font-mono whitespace-pre-wrap break-words rounded-lg border border-border bg-muted/40 p-3 max-h-60 overflow-y-auto fancy-scroll">
            {run.inputSummary}
          </pre>
        </div>

        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5" /> Output
          </div>
          <pre className="text-[11px] font-mono whitespace-pre-wrap break-words rounded-lg border border-primary/30 bg-primary/5 p-3 max-h-72 overflow-y-auto fancy-scroll">
            {tryPrettyJson(run.output)}
          </pre>
        </div>

        {run.checkinId && (
          <div className="text-[11px] text-muted-foreground">
            Linked check-in: <code className="font-mono">{run.checkinId}</code>
          </div>
        )}
      </div>
    </>
  );
}

function DetailStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-xs font-medium mt-0.5">{value}</div>
    </div>
  );
}

// ── Skeletons / empty ───────────────────────────────────────────────────────
function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <Card key={i} className="glass">
            <CardContent className="p-4 space-y-2">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-7 w-16" />
              <Skeleton className="h-3 w-24" />
            </CardContent>
          </Card>
        ))}
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="glass"><CardContent className="p-4 space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-6 w-full" />
          ))}
        </CardContent></Card>
        <Card className="glass"><CardContent className="p-4">
          <Skeleton className="h-32 w-full rounded-lg" />
        </CardContent></Card>
      </div>
      <Card className="glass">
        <CardContent className="p-0 divide-y divide-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="p-3 flex items-center gap-4">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 flex-1" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function EmptyState() {
  // Show all 6 AI agents with descriptions so admins understand what to expect
  const agents = [
    { meta: AGENT_META.TRIAGE, desc: "Triages check-in responses — pain, symptoms, meds — into risk levels (LOW/MEDIUM/HIGH/CRITICAL)." },
    { meta: AGENT_META.CONVERSATIONAL, desc: "Hinglish conversational agent for patient follow-up questions and clarifications." },
    { meta: AGENT_META.CARE_COACH, desc: "Generates care guidance — recovery milestones, warning signs, lifestyle advice." },
    { meta: AGENT_META.ESCALATION_ORCHESTRATOR, desc: "Decides escalation severity and routes to the right clinician." },
    { meta: AGENT_META.INSIGHTS, desc: "Weekly insights summary over aggregate hospital data — trends, anomalies, recommendations." },
    { meta: { label: "Risk Stratification", color: "#8b5cf6", icon: ShieldAlert }, desc: "Runs at patient enrollment to classify readmission risk — drives check-in frequency." },
  ];

  return (
    <div className="space-y-6">
      <Card className="glass elevate-1">
        <CardContent className="p-8 md:p-12 flex flex-col items-center justify-center text-center">
          {/* Layered icon with ring + pulse */}
          <div className="relative mb-5">
            <span className="absolute inset-0 rounded-full bg-primary/10 animate-ping opacity-50" aria-hidden />
            <div className="relative h-16 w-16 rounded-2xl bg-gradient-to-br from-primary/20 to-primary/5 flex items-center justify-center ring-1 ring-primary/20">
              <Bot className="h-8 w-8 text-primary" />
            </div>
            <span className="absolute -top-1 -right-1 flex h-5 w-5 items-center justify-center rounded-full bg-background ring-2 ring-primary/20">
              <Sparkles className="h-3 w-3 text-primary" />
            </span>
          </div>
          <h3 className="text-lg font-semibold">No AI calls logged yet</h3>
          <p className="text-sm text-muted-foreground mt-2 max-w-md leading-relaxed">
            Once coordinators start logging check-in responses, enrolling patients, or generating insights,
            every AI agent call will appear here with full provenance — prompt ref, output, tokens, latency,
            and fallback status.
          </p>
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2 text-[11px]">
            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
              <Zap className="h-3 w-3 mr-1" /> Groq primary
            </Badge>
            <Badge variant="outline" className="bg-amber-500/5 text-amber-700 dark:text-amber-300 border-amber-500/20">
              <Cpu className="h-3 w-3 mr-1" /> Bedrock fallback
            </Badge>
            <Badge variant="outline" className="bg-muted text-muted-foreground border-border">
              <ShieldAlert className="h-3 w-3 mr-1" /> Rule-based safety net
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Agent preview — show what each agent will produce once data flows */}
      <Card className="glass elevate-1">
        <CardHeader className="border-b border-border">
          <CardTitle className="flex items-center gap-2 text-base">
            <Sparkles className="h-4 w-4 text-primary" />
            Six AI agents, ready to run
          </CardTitle>
          <CardDescription>
            Every call is logged with full provenance for compliance. Here&rsquo;s what to expect.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <ul className="divide-y divide-border">
            {agents.map(({ meta, desc }, i) => {
              const Icon = meta.icon;
              return (
                <motion.li
                  key={meta.label}
                  initial={{ opacity: 0, y: 4 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: i * 0.05 }}
                  className="flex items-start gap-3 p-4 hover:bg-muted/30 transition-colors"
                >
                  <span
                    className="flex-shrink-0 flex items-center justify-center h-9 w-9 rounded-lg"
                    style={{ backgroundColor: `${meta.color}20`, color: meta.color }}
                  >
                    <Icon className="h-4 w-4" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{meta.label}</span>
                      <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
                        <Clock className="h-2.5 w-2.5 mr-1" /> pending
                      </Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{desc}</p>
                  </div>
                </motion.li>
              );
            })}
          </ul>
        </CardContent>
      </Card>

      {/* What triggers AI calls */}
      <Card className="glass elevate-1">
        <CardHeader className="border-b border-border">
          <CardTitle className="flex items-center gap-2 text-base">
            <Activity className="h-4 w-4 text-primary" />
            What triggers AI calls?
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <TriggerCard
            icon={CheckCircle2}
            title="Check-in answered"
            desc="Triage Agent runs on every pain/symptom/meds response."
          />
          <TriggerCard
            icon={Sparkles}
            title="Patient enrolled"
            desc="Risk Stratification Agent classifies readmission risk at enrollment."
          />
          <TriggerCard
            icon={Bot}
            title="Coordinator asks"
            desc="Conversational Agent responds to coordinator questions in Hinglish."
          />
          <TriggerCard
            icon={AlertTriangle}
            title="Escalation proposed"
            desc="Escalation Orchestrator decides severity and clinician routing."
          />
          <TriggerCard
            icon={FileText}
            title="Insights generated"
            desc="Insights Agent summarizes 7-day aggregate data on the dashboard."
          />
          <TriggerCard
            icon={Zap}
            title="Care plan drafted"
            desc="Care Coach generates recovery guidance and lifestyle advice."
          />
        </CardContent>
      </Card>
    </div>
  );
}

function TriggerCard({
  icon: Icon, title, desc,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  desc: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card/40 p-3 hover:border-primary/30 hover:bg-card/60 transition-colors">
      <div className="flex items-center gap-2 mb-1.5">
        <span className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10 text-primary">
          <Icon className="h-3.5 w-3.5" />
        </span>
        <span className="text-xs font-semibold">{title}</span>
      </div>
      <p className="text-[11px] text-muted-foreground leading-relaxed">{desc}</p>
    </div>
  );
}
