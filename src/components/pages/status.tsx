"use client";

import * as React from "react";
import { MarketingHeader } from "@/components/marketing-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Activity, RefreshCw, Database, Server, AlertTriangle, CheckCircle2,
  XCircle, Clock, Zap, ShieldCheck, Globe, Loader2,
  TrendingUp, Gauge, Timer, Cpu, MemoryStick, HardDrive, Terminal,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AppFooter } from "@/components/app-shell";

// ── Types ────────────────────────────────────────────────────────────────────
interface RuntimeMemory {
  rssMb: number;
  heapUsedMb: number;
  heapTotalMb: number;
  externalMb: number;
}
interface RuntimeInfo {
  node: string;
  bun: string;
  platform: string;
  arch: string;
  uptimeSeconds: number;
  memory: RuntimeMemory | null;
}
interface HealthResponse {
  status: "ok" | "degraded";
  timestamp: string;
  version: string;
  responseTimeMs?: number;           // overall health-check latency
  runtime?: RuntimeInfo;             // NEW — Node/Bun/memory/uptime
  checks: {
    database: "ok" | "error";
    databaseResponseTimeMs?: number;  // DB probe latency
  };
}
interface IntegrationStatus {
  configured: boolean;
  status: string;
  label: string;
  environmentState?: string;
  certConfigured?: boolean;
  providerMode?: string;
}
interface IntegrationsResponse {
  whatsapp: IntegrationStatus;
  abdm: IntegrationStatus;
  abha: IntegrationStatus;
  nhcx: IntegrationStatus;
  pmjay: IntegrationStatus;
  razorpay: IntegrationStatus;
  sentry: IntegrationStatus;
  redis: IntegrationStatus;
  ai: IntegrationStatus & { provider?: string };
  database: IntegrationStatus;
}

function healthTone(status: string) {
  if (status === "ok") return { badge: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500", Icon: CheckCircle2, label: "Operational" };
  if (status === "degraded") return { badge: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400", dot: "bg-amber-500", Icon: AlertTriangle, label: "Degraded" };
  return { badge: "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400", dot: "bg-red-500", Icon: XCircle, label: "Down" };
}

function integrationTone(status: string) {
  const s = status.toUpperCase();
  if (s === "LIVE" || s === "PRODUCTION") return { badge: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500", Icon: CheckCircle2 };
  if (s === "SANDBOX" || s === "SANDBOX_VERIFIED") return { badge: "border-primary/30 bg-primary/10 text-primary", dot: "bg-primary", Icon: Activity };
  if (s === "MANUAL_PORTAL") return { badge: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400", dot: "bg-blue-500", Icon: ShieldCheck };
  if (s.includes("PENDING") || s.includes("BLOCKED")) return { badge: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400", dot: "bg-amber-500", Icon: AlertTriangle };
  if (s === "READINESS_PLATFORM") return { badge: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-400", dot: "bg-violet-500", Icon: ShieldCheck };
  return { badge: "border-muted-foreground/30 bg-muted text-muted-foreground", dot: "bg-muted-foreground", Icon: XCircle };
}

const INTEGRATION_LABELS: Record<string, { name: string; icon: React.ComponentType<{ className?: string }> }> = {
  whatsapp: { name: "WhatsApp", icon: Globe },
  abdm: { name: "ABDM", icon: ShieldCheck },
  abha: { name: "ABHA", icon: Activity },
  nhcx: { name: "NHCX", icon: Server },
  pmjay: { name: "PM-JAY", icon: ShieldCheck },
  razorpay: { name: "Razorpay", icon: Zap },
  sentry: { name: "Sentry", icon: AlertTriangle },
  redis: { name: "Redis", icon: Database },
  ai: { name: "AI provider", icon: Activity },
  database: { name: "PostgreSQL", icon: Database },
};

// Integration grouping for visual layout (row 1: external, row 2: platform).
const EXTERNAL_INTEGRATIONS = ["whatsapp", "abdm", "abha", "nhcx", "pmjay", "razorpay"];
const PLATFORM_INTEGRATIONS = ["sentry", "redis", "ai", "database"];

const MAX_LATENCY_SAMPLES = 20;
const REFRESH_INTERVAL_MS = 30_000;

// Returns the tailwind text-color class for a given latency in ms.
function latencyTone(ms?: number) {
  if (ms === undefined) return "text-muted-foreground";
  if (ms < 100) return "text-emerald-600 dark:text-emerald-400";
  if (ms < 500) return "text-amber-600 dark:text-amber-400";
  return "text-red-600 dark:text-red-400";
}

// SLO target for the /api/health endpoint response time (ms).
const HEALTH_SLO_MS = 200;

/** SLO badge — shows whether the current latency meets the <200ms SLO.
 *  - emerald "SLO met" when currentResponseMs <= SLO
 *  - amber "SLO breach" when currentResponseMs > SLO but < 2×SLO
 *  - red "SLO violated" when currentResponseMs >= 2×SLO
 *  - muted "SLO —" when no data yet
 */
function SloBadge({ currentResponseMs }: { currentResponseMs?: number }) {
  if (currentResponseMs === undefined) {
    return (
      <Badge variant="outline" className="text-[9px] uppercase tracking-wider gap-1 border-muted-foreground/30 bg-muted text-muted-foreground">
        SLO —
      </Badge>
    );
  }
  const ratio = currentResponseMs / HEALTH_SLO_MS;
  let tone: string;
  let label: string;
  let Icon: React.ComponentType<{ className?: string }>;
  if (ratio <= 1) {
    tone = "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400";
    label = "SLO met";
    Icon = CheckCircle2;
  } else if (ratio <= 2) {
    tone = "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400";
    label = "SLO breach";
    Icon = AlertTriangle;
  } else {
    tone = "border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400";
    label = "SLO violated";
    Icon = XCircle;
  }
  return (
    <Badge variant="outline" className={cn("text-[9px] uppercase tracking-wider gap-1", tone)} title={`Target: <${HEALTH_SLO_MS}ms · Current: ${currentResponseMs}ms`}>
      <Icon className="h-2.5 w-2.5" /> {label} · &lt;{HEALTH_SLO_MS}ms
    </Badge>
  );
}

// Inline SVG sparkline (no chart lib). ~200x40 with gradient fill under line.
function LatencySparkline({
  data,
  width = 200,
  height = 40,
}: {
  data: number[];
  width?: number;
  height?: number;
}) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const pts = data.map((v, i) => {
    const x = i * stepX;
    // Pad vertically so the line never touches the edges.
    const pad = 4;
    const y = pad + (1 - (v - min) / range) * (height - pad * 2);
    return { x, y };
  });
  const polyPoints = pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const fillPath = `M ${pts[0]!.x.toFixed(2)},${height} L ${pts
    .map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`)
    .join(" L ")} L ${pts[pts.length - 1]!.x.toFixed(2)},${height} Z`;
  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className="overflow-visible"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="latency-spark-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--color-primary)" stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fillPath} fill="url(#latency-spark-fill)" />
      <polyline
        points={polyPoints}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth={1.75}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/** Format a duration in seconds as a human-readable uptime string. */
function formatUptime(totalSeconds: number): string {
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const mins = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  if (days > 0) return `${days}d ${hours}h ${mins}m`;
  if (hours > 0) return `${hours}h ${mins}m ${secs}s`;
  return `${mins}m ${secs}s`;
}

/** A single labeled stat row inside the system-info card. */
function SysInfoRow({
  icon: Icon,
  label,
  value,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="flex items-center justify-between gap-3 py-1.5">
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-center gap-1.5 min-w-0">
        <code className="text-xs font-mono font-semibold text-foreground truncate">{value}</code>
        {hint && <span className="text-[10px] text-muted-foreground/70 flex-shrink-0">{hint}</span>}
      </div>
    </div>
  );
}

/** Memory usage bar — shows heapUsed / heapTotal with a proportional fill. */
function MemoryBar({ used, total, label }: { used: number; total: number; label: string }) {
  const pct = total > 0 ? Math.min(100, (used / total) * 100) : 0;
  const tone = pct < 60 ? "bg-emerald-500" : pct < 85 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px] text-muted-foreground">
        <span>{label}</span>
        <span className="font-mono">{used.toFixed(1)} / {total.toFixed(1)} MB</span>
      </div>
      <div className="h-1.5 rounded-full bg-muted overflow-hidden">
        <div className={cn("h-full rounded-full transition-all duration-500", tone)} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

/** System-info card showing Node/Bun version, memory, uptime, platform. */
function SystemInfoCard({ runtime, loading }: { runtime?: RuntimeInfo; loading: boolean }) {
  return (
    <Card className="elevate-1">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm flex items-center gap-2">
          <Terminal className="h-4 w-4 text-primary" /> System info
        </CardTitle>
        <CardDescription className="text-xs">
          Runtime environment + process metrics. Useful for diagnosing performance.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-4 w-1/2" />
          </div>
        ) : runtime ? (
          <div className="space-y-3">
            {/* Runtime versions */}
            <div className="divide-y divide-border">
              <SysInfoRow icon={Cpu} label="Node.js" value={runtime.node} />
              <SysInfoRow icon={Terminal} label="Bun" value={runtime.bun} hint={runtime.bun === "n/a" ? "(Node process)" : undefined} />
              <SysInfoRow
                icon={Server}
                label="Platform"
                value={`${runtime.platform} / ${runtime.arch}`}
              />
              <SysInfoRow
                icon={Clock}
                label="Uptime"
                value={formatUptime(runtime.uptimeSeconds)}
                hint="since server start"
              />
            </div>

            {/* Memory usage */}
            {runtime.memory && (
              <div className="space-y-2 pt-2 border-t border-border">
                <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                  <MemoryStick className="h-3 w-3" /> Memory
                </div>
                <MemoryBar
                  used={runtime.memory.heapUsedMb}
                  total={runtime.memory.heapTotalMb}
                  label="Heap (used / total)"
                />
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className="rounded-md bg-muted/50 px-2 py-1.5">
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <HardDrive className="h-2.5 w-2.5" /> RSS
                    </div>
                    <div className="text-xs font-mono font-semibold mt-0.5">{runtime.memory.rssMb.toFixed(1)} MB</div>
                  </div>
                  <div className="rounded-md bg-muted/50 px-2 py-1.5">
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
                      <Cpu className="h-2.5 w-2.5" /> External
                    </div>
                    <div className="text-xs font-mono font-semibold mt-0.5">{runtime.memory.externalMb.toFixed(1)} MB</div>
                  </div>
                </div>
              </div>
            )}
          </div>
        ) : (
          <p className="text-xs text-muted-foreground text-center py-3">
            Runtime info unavailable.
          </p>
        )}
      </CardContent>
    </Card>
  );
}


export function StatusPage() {
  const [health, setHealth] = React.useState<HealthResponse | null>(null);
  const [integrations, setIntegrations] = React.useState<IntegrationsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [refreshing, setRefreshing] = React.useState(false);
  const [lastChecked, setLastChecked] = React.useState<Date | null>(null);

  // Latency history (last N samples) for the sparkline widget.
  const [latencyHistory, setLatencyHistory] = React.useState<number[]>([]);
  // Countdown to next auto-refresh (seconds), resets after each load().
  const [secondsUntilRefresh, setSecondsUntilRefresh] = React.useState<number>(REFRESH_INTERVAL_MS / 1000);

  const load = React.useCallback(async (silent = false) => {
    if (silent) setRefreshing(true); else setLoading(true);
    try {
      const [h, i] = await Promise.all([
        fetch("/api/health").then((r) => r.json() as Promise<HealthResponse>).catch(() => null),
        fetch("/api/integrations/status").then((r) => r.json() as Promise<IntegrationsResponse>).catch(() => null),
      ]);
      setHealth(h);
      setIntegrations(i);
      setLastChecked(new Date());
      // Feed new latency sample into history (cap at MAX_LATENCY_SAMPLES).
      if (h && typeof h.responseTimeMs === "number") {
        setLatencyHistory((prev) => {
          const next = [...prev, h.responseTimeMs!];
          return next.length > MAX_LATENCY_SAMPLES ? next.slice(next.length - MAX_LATENCY_SAMPLES) : next;
        });
      }
      // Reset the countdown after every load (manual or auto).
      setSecondsUntilRefresh(REFRESH_INTERVAL_MS / 1000);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  React.useEffect(() => {
    load();
    // Auto-refresh every 30 seconds.
    const interval = setInterval(() => load(true), REFRESH_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [load]);

  // 1-second countdown tick for the "next refresh" indicator.
  React.useEffect(() => {
    if (secondsUntilRefresh <= 0) return;
    const tick = setInterval(() => {
      setSecondsUntilRefresh((s) => (s > 0 ? s - 1 : 0));
    }, 1000);
    return () => clearInterval(tick);
  }, [secondsUntilRefresh]);

  const overallTone = health ? healthTone(health.status) : healthTone("degraded");

  const currentResponseMs = health?.responseTimeMs;
  const currentDbMs = health?.checks.databaseResponseTimeMs;

  // Render a single integration tile (hover-lift + tooltip).
  const renderIntegrationTile = (key: string, status: IntegrationStatus) => {
    const meta = INTEGRATION_LABELS[key] ?? { name: key, icon: Activity };
    const tone = integrationTone(status.status);
    return (
      <div
        key={key}
        title={status.label}
        className="rounded-lg border p-3 hover:-translate-y-0.5 hover:bg-muted/30 transition-transform"
      >
        <div className="flex items-center justify-between mb-1.5">
          <div className="flex items-center gap-1.5 min-w-0">
            <meta.icon className="h-3.5 w-3.5 text-muted-foreground flex-shrink-0" />
            <span className="text-xs font-semibold truncate">{meta.name}</span>
          </div>
          <span className={cn("h-2 w-2 rounded-full flex-shrink-0", tone.dot)} />
        </div>
        <Badge variant="outline" className={cn("text-[9px] uppercase tracking-wider gap-1 w-full justify-center", tone.badge)}>
          <tone.Icon className="h-2.5 w-2.5" /> {status.status.replace(/_/g, " ").toLowerCase()}
        </Badge>
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5">
      <MarketingHeader />

      <main className="max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        {/* Hero */}
        <div className="text-center mb-8 sm:mb-10">
          <div className="inline-flex items-center gap-1.5 text-eyebrow text-primary mb-3">
            <Activity className="h-3.5 w-3.5" />
            SYSTEM STATUS
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
            Live operational status.
          </h1>
          <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Real-time platform status from <code className="bg-muted px-1 py-0.5 rounded text-sm">/api/health</code> + <code className="bg-muted px-1 py-0.5 rounded text-sm">/api/integrations/status</code>. Auto-refreshes every 30 seconds. The status is truthful — a sandbox-only deployment honestly reports "degraded" when PostgreSQL is unavailable.
          </p>
        </div>

        {/* Overall status banner */}
        <Card className={cn("mb-6 border-2", overallTone.badge)}>
          <CardContent className="p-6">
            <div className="flex flex-col sm:flex-row items-center sm:justify-between gap-4">
              <div className="flex items-center gap-4">
                <div className={cn("relative flex h-14 w-14 items-center justify-center rounded-full", overallTone.badge)}>
                  <overallTone.Icon className="h-7 w-7" />
                  {health?.status === "ok" && (
                    <span className="absolute inset-0 rounded-full animate-ping opacity-30 bg-emerald-500" />
                  )}
                  {health?.status === "degraded" && (
                    <span className="absolute -inset-1 rounded-full ring-2 ring-amber-500/60 animate-pulse" />
                  )}
                </div>
                <div>
                  <div className="text-lg font-bold">
                    {loading ? "Checking…" : health ? overallTone.label : "Unable to reach"}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">
                    {health
                      ? `v${health.version}${typeof currentResponseMs === "number" ? ` · ${currentResponseMs}ms` : ""} · ${new Date(health.timestamp).toLocaleString()}`
                      : "No response from /api/health"}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {lastChecked && (
                  <span className="text-[10px] text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" /> {lastChecked.toLocaleTimeString()}
                  </span>
                )}
                <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => load(true)} disabled={refreshing}>
                  {refreshing ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
                  Refresh
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Response latency sparkline widget */}
        <Card className="mb-6">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <CardTitle className="text-sm flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" /> Response latency
              </CardTitle>
              <SloBadge currentResponseMs={currentResponseMs} />
            </div>
            <CardDescription className="text-xs">
              Last {MAX_LATENCY_SAMPLES} samples · auto-refresh {REFRESH_INTERVAL_MS / 1000}s · SLO target &lt;{HEALTH_SLO_MS}ms
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <Skeleton className="h-16 w-full" />
            ) : latencyHistory.length < 2 ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground py-3">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Collecting samples… ({latencyHistory.length}/{MAX_LATENCY_SAMPLES})
              </div>
            ) : (
              <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6">
                <div className="flex-shrink-0">
                  <div className="flex items-baseline gap-1.5">
                    <Gauge className="h-4 w-4 text-muted-foreground" />
                    <span className={cn("text-3xl font-bold tabular-nums", latencyTone(currentResponseMs))}>
                      {currentResponseMs ?? "—"}
                    </span>
                    <span className="text-xs text-muted-foreground">ms</span>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                    <Database className="h-3 w-3" />
                    DB probe
                    <span className={cn("font-semibold tabular-nums", latencyTone(currentDbMs))}>
                      {currentDbMs !== undefined ? `${currentDbMs}ms` : "—"}
                    </span>
                  </div>
                </div>
                <div className="flex-1 w-full">
                  <LatencySparkline data={latencyHistory} />
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Uptime summary mini-widget */}
        <div className="mb-6 grid grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                <Activity className="h-3 w-3" /> Version
              </div>
              <div className="text-sm font-semibold truncate">
                {health?.version ? `v${health.version}` : "—"}
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                <ShieldCheck className="h-3 w-3" /> Last incident
              </div>
              <div className="text-sm font-semibold flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-emerald-500" />
                <span className="truncate">None in this window</span>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-3 sm:p-4">
              <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-wider text-muted-foreground mb-1">
                <Timer className="h-3 w-3" /> Next refresh
              </div>
              <div className="text-sm font-semibold tabular-nums">
                {secondsUntilRefresh}s
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Infrastructure + system info — 2-col grid on desktop */}
        <div className="mb-6 grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Database className="h-4 w-4 text-primary" /> Database (PostgreSQL)
              </CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <Skeleton className="h-6 w-24" />
              ) : health ? (
                <div className="flex items-center gap-2">
                  {health.checks.database === "ok" ? (
                    <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 gap-1.5">
                      <CheckCircle2 className="h-3 w-3" /> Connected
                    </Badge>
                  ) : (
                    <Badge variant="outline" className="border-red-500/50 bg-red-500/10 text-red-700 dark:text-red-400 gap-1.5">
                      <XCircle className="h-3 w-3" /> Unavailable
                    </Badge>
                  )}
                  <span className="text-[11px] text-muted-foreground">
                    {health.checks.database === "ok" ? "SELECT 1 succeeded" : "sandbox has no PostgreSQL — production connects to managed Postgres"}
                  </span>
                </div>
              ) : (
                <span className="text-xs text-muted-foreground">No response</span>
              )}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm flex items-center gap-2">
                <Server className="h-4 w-4 text-primary" /> Application server
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 gap-1.5">
                  <CheckCircle2 className="h-3 w-3" /> Responding
                </Badge>
                <span className="text-[11px] text-muted-foreground">Next.js 16 (Turbopack)</span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* System info panel — runtime, memory, uptime (P1 observability) */}
        <div className="mb-6">
          <SystemInfoCard runtime={health?.runtime} loading={loading} />
        </div>


        {/* Integration status grid — grouped into External / Platform rows */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" /> Integration status
            </CardTitle>
            <CardDescription className="text-xs">
              Truthful status per integration. Never claims LIVE when only sandbox/blocked. See the <a href="/?view=integrations" className="text-primary underline">Integrations page</a> for details.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-16" />)}
              </div>
            ) : integrations ? (
              <div className="space-y-5">
                <div>
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    External services
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {EXTERNAL_INTEGRATIONS.map((key) => {
                      const status = integrations[key as keyof IntegrationsResponse];
                      return status ? renderIntegrationTile(key, status) : null;
                    })}
                  </div>
                </div>
                <div>
                  <div className="mb-2 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                    Platform services
                  </div>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {PLATFORM_INTEGRATIONS.map((key) => {
                      const status = integrations[key as keyof IntegrationsResponse];
                      return status ? renderIntegrationTile(key, status) : null;
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground text-center py-4">Unable to load integration status.</p>
            )}
          </CardContent>
        </Card>

        {/* Auto-refresh note */}
        <div className="mb-6 flex items-center justify-center gap-2 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" />
          <span>Auto-refreshes every 30 seconds</span>
          <span className="text-muted-foreground/40">·</span>
          <RefreshCw className={cn("h-3 w-3", refreshing && "animate-spin")} />
          <span>{refreshing ? "Refreshing…" : "Idle"}</span>
        </div>

        {/* Footer */}
        <div className="text-center">
          <p className="text-xs text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            This page reads live from <code className="bg-muted px-1 py-0.5 rounded">/api/health</code> + <code className="bg-muted px-1 py-0.5 rounded">/api/integrations/status</code>. In production with a managed PostgreSQL + configured integrations, the status reflects the real operational state. See the <a href="/?view=api-reference" className="text-primary underline">API reference</a> for endpoint details.
          </p>
        </div>
      </main>
      <AppFooter />
    </div>
  );
}
