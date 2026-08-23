"use client";

// Ojas — Superadmin console. Cross-tenant view of all hospitals, users,
// audit logs, and AI usage. Sub-nav deep-links to four views via navigate().
import * as React from "react";
import { MotionConfig } from "framer-motion";
import { toast } from "sonner";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import {
  Shield, Users, FileBarChart, Bot, Building2, Plus, Loader2,
  Trash2, Pencil, Save, X,
  Activity, Coins, AlertTriangle, Cpu, Sparkles, Printer,
  Filter, ChevronRight, ShieldAlert,
} from "lucide-react";

import { api } from "@/lib/auth-context";
import { navigate, type View } from "@/lib/router";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogClose,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ── Types ───────────────────────────────────────────────────────────────────
type SubView = "hospitals" | "users" | "audit" | "ai-usage";

interface Hospital {
  id: string;
  name: string;
  slug: string;
  planTier: "STARTER" | "GROWTH" | "ENTERPRISE";
  bedCount: number;
  nabhLevel: string | null;
  city: string | null;
  country: string;
  createdAt: string;
  deletedAt?: string | null;
  _count?: { patients: number; users: number; checkins?: number; escalations?: number };
}

interface HospitalDetail extends Hospital {
  settings?: unknown;
  subscriptions?: unknown[];
  users: { id: string; name: string; email: string; role: string; createdAt: string }[];
  _count: { patients: number; users: number; checkins: number; escalations: number };
}

interface AuditLog {
  id: string;
  hospitalId: string | null;
  actorId: string | null;
  actor: { name: string; email: string } | null;
  hospital: { name: string } | null;
  action: string;
  target: string | null;
  detail: string | null;
  ip: string | null;
  createdAt: string;
}

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
  outcome: string;
  fallbackUsed: boolean;
  errorMessage: string | null;
  checkinId: string | null;
  createdAt: string;
}

interface AiAggregate {
  totalCalls: number;
  totalTokens: number;
  fallbacks: number;
  byAgent: Record<string, number>;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const SUBNAV: { id: SubView; label: string; icon: React.ComponentType<{ className?: string }>; view: View }[] = [
  { id: "hospitals", label: "Hospitals", icon: Building2, view: "superadmin-hospitals" },
  { id: "users", label: "Users", icon: Users, view: "superadmin-users" },
  { id: "audit", label: "Audit logs", icon: FileBarChart, view: "superadmin-audit" },
  { id: "ai-usage", label: "AI usage", icon: Bot, view: "superadmin-ai-usage" },
];

const PLAN_BADGE: Record<string, string> = {
  STARTER: "bg-muted text-muted-foreground border-border",
  GROWTH: "bg-primary/15 text-primary border-primary/30",
  ENTERPRISE: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
};

function roleLabel(r: string): string {
  switch (r) {
    case "HOSPITAL_ADMIN": return "Hospital admin";
    case "COORDINATOR": return "Coordinator";
    case "DOCTOR": return "Doctor";
    case "SUPER_ADMIN": return "Super admin";
    default: return r;
  }
}
function roleBadgeCls(r: string): string {
  switch (r) {
    case "HOSPITAL_ADMIN": return "bg-primary/15 text-primary border-primary/30";
    case "COORDINATOR": return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
    case "DOCTOR": return "bg-teal-500/15 text-teal-700 dark:text-teal-300 border-teal-500/30";
    case "SUPER_ADMIN": return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
    default: return "bg-muted text-muted-foreground border-border";
  }
}

function ago(iso: string): string {
  try { return formatDistanceToNow(parseISO(iso), { addSuffix: true }); } catch { return "—"; }
}
function absTime(iso: string): string {
  try { return format(parseISO(iso), "d MMM yyyy · h:mm a"); } catch { return iso; }
}
function dateOnly(iso: string): string {
  try { return format(parseISO(iso), "d MMM yyyy"); } catch { return iso; }
}

function fmt(n: number): string {
  return new Intl.NumberFormat("en-IN").format(n);
}

const AGENT_META: Record<string, { label: string; color: string }> = {
  TRIAGE:                  { label: "Triage", color: "#10b981" },
  CONVERSATIONAL:          { label: "Conversational", color: "#14b8a6" },
  CARE_COACH:              { label: "Care Coach", color: "#f59e0b" },
  ESCALATION_ORCHESTRATOR: { label: "Escalation Orchestrator", color: "#f97316" },
  INSIGHTS:                { label: "Insights", color: "#8b5cf6" },
};

const OUTCOME_CLS: Record<string, string> = {
  AUTO_APPLIED:          "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  PENDING_CONFIRMATION:  "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  CONFIRMED:             "bg-primary/15 text-primary border-primary/30",
  OVERRIDDEN:            "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
  FAILED:                "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
  FALLBACK:              "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
};

// ── Page ────────────────────────────────────────────────────────────────────
export function SuperadminPage({ initialView }: { initialView: SubView }) {
  // Sync sub-view with URL via navigate(). The initialView prop is the source
  // of truth from page.tsx; we don't keep local state to avoid drift.
  const active = initialView;

  const switchView = (v: SubView) => {
    const target = SUBNAV.find((s) => s.id === v);
    if (target) navigate(target.view);
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" /> Superadmin console
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cross-tenant view of every hospital, user, audit event, and AI call. Use with care.
          </p>
        </div>

        {/* Sub-nav */}
        <div className="sticky top-0 md:top-0 z-10 -mx-4 md:mx-0 px-4 md:px-0 py-2 bg-background/80 backdrop-blur-md">
          <div className="flex items-center gap-1 overflow-x-auto fancy-scroll rounded-lg bg-muted/60 p-1 w-full md:w-fit">
            {SUBNAV.map((item) => {
              const Icon = item.icon;
              const isActive = active === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => switchView(item.id)}
                  className={cn(
                    "flex items-center gap-2 px-3 py-1.5 rounded-md text-sm font-medium transition-colors whitespace-nowrap",
                    isActive
                      ? "bg-background text-foreground shadow-sm"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <Icon className="h-4 w-4" /> {item.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Active view */}
        {active === "hospitals" && <HospitalsTab />}
        {active === "users" && <UsersTab />}
        {active === "audit" && <AuditTab />}
        {active === "ai-usage" && <AiUsageTab />}
      </div>
    </MotionConfig>
  );
}

// ── Cross-tenant system health widget (P1 observability) ──────────────────
// Shows the platform's runtime health (response time, memory, uptime, DB
// status) at the top of the superadmin console. The superadmin already has
// the hospital-scoped dashboard widget; this is the cross-tenant view that
// confirms the platform itself is healthy.
interface PlatformHealth {
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

function SuperadminHealthWidget() {
  const [health, setHealth] = React.useState<PlatformHealth | null>(null);
  const [loading, setLoading] = React.useState(true);
  // Latency history for the sparkline — accumulates the last 20 response-time
  // samples (one per 60s refresh = ~20min of history). Same pattern as the
  // status page's latency widget, for cross-page visual consistency.
  const [latencyHistory, setLatencyHistory] = React.useState<number[]>([]);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/health", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as PlatformHealth;
        if (!cancelled) {
          setHealth(data);
          setLoading(false);
          // Accumulate the response-time sample (cap at 20).
          if (data.responseTimeMs !== undefined) {
            setLatencyHistory((prev) => [...prev, data.responseTimeMs!].slice(-20));
          }
        }
      } catch {
        if (!cancelled) { setHealth(null); setLoading(false); }
      }
    };
    load();
    const id = setInterval(load, 60_000);
    return () => { cancelled = true; clearInterval(id); };
  }, []);

  const dbOk = health?.checks?.database === "ok";
  const rt = health?.responseTimeMs;
  const rtTone = rt === undefined ? "text-muted-foreground" : rt < 200 ? "text-emerald-600 dark:text-emerald-400" : rt < 500 ? "text-amber-600 dark:text-amber-400" : "text-red-600 dark:text-red-400";
  const mem = health?.runtime?.memory;
  const heapPct = mem && mem.heapTotalMb > 0 ? Math.min(100, (mem.heapUsedMb / mem.heapTotalMb) * 100) : null;
  const heapTone = heapPct === null ? "bg-muted-foreground" : heapPct < 60 ? "bg-emerald-500" : heapPct < 85 ? "bg-amber-500" : "bg-red-500";

  return (
    <Card className="border-border bg-card/50">
      <CardContent className="p-4">
        <div className="flex items-center gap-2 mb-3">
          <Activity className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold">Platform health</span>
          <span className={cn("ml-auto h-2 w-2 rounded-full", loading ? "bg-muted-foreground" : dbOk ? "bg-emerald-500" : "bg-amber-500")} title={loading ? "Checking…" : dbOk ? "Database connected" : "Database unreachable"} />
        </div>
        {loading ? (
          <div className="grid grid-cols-4 gap-3">
            {[0, 1, 2, 3].map((i) => <div key={i} className="h-10 rounded bg-muted/50 animate-pulse" />)}
          </div>
        ) : !health ? (
          <p className="text-xs text-muted-foreground text-center py-3">
            Health check unreachable — the server may be starting up.
          </p>
        ) : (
          <div className="space-y-3">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              <div className="rounded-lg bg-muted/30 p-2.5">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Response</div>
                <div className={cn("text-base font-bold tabular-nums", rtTone)}>{rt ?? "—"}ms</div>
              </div>
              <div className="rounded-lg bg-muted/30 p-2.5">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Uptime</div>
                <div className="text-base font-bold tabular-nums">{health.runtime ? formatUptimeShort(health.runtime.uptimeSeconds) : "—"}</div>
              </div>
              <div className="rounded-lg bg-muted/30 p-2.5">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Heap</div>
                <div className="text-base font-bold tabular-nums">{mem ? `${Math.round(mem.heapUsedMb)}MB` : "—"}</div>
                {heapPct !== null && (
                  <div className="mt-1 h-1 rounded-full bg-muted overflow-hidden">
                    <div className={cn("h-full rounded-full transition-all duration-500", heapTone)} style={{ width: `${heapPct}%` }} />
                  </div>
                )}
              </div>
              <div className="rounded-lg bg-muted/30 p-2.5">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground">Database</div>
                <div className={cn("text-base font-bold", dbOk ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")}>
                  {dbOk ? "OK" : "Down"}
                </div>
              </div>
            </div>
            {/* Response-time sparkline — visual trend of the last 20 samples */}
            {latencyHistory.length >= 2 && (
              <div className="flex items-center gap-3 pt-2 border-t border-border">
                <div className="text-[9px] uppercase tracking-wider text-muted-foreground flex-shrink-0">
                  Trend
                </div>
                <div className="flex-1">
                  <HealthSparkline data={latencyHistory} width={220} height={28} />
                </div>
                <div className="text-[9px] text-muted-foreground/70 flex-shrink-0">
                  {latencyHistory.length}/20 samples
                </div>
              </div>
            )}
          </div>
        )}
        <div className="mt-3 pt-2 border-t border-border flex items-center gap-3 text-[10px] text-muted-foreground">
          <span>Node {health?.runtime?.node ?? "—"}</span>
          <span>·</span>
          <span>Bun {health?.runtime?.bun ?? "—"}</span>
          <span>·</span>
          <span>Auto-refresh 60s</span>
          <a href="/?view=status" className="ml-auto text-primary hover:underline">Full status →</a>
        </div>
      </CardContent>
    </Card>
  );
}

/** Inline SVG sparkline for the health widget — same visual pattern as the
 *  status page's LatencySparkline (gradient fill + primary line). */
function HealthSparkline({ data, width = 220, height = 28 }: { data: number[]; width?: number; height?: number }) {
  if (data.length < 2) return null;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const stepX = width / (data.length - 1);
  const pad = 3;
  const pts = data.map((v, i) => ({
    x: i * stepX,
    y: pad + (1 - (v - min) / range) * (height - pad * 2),
  }));
  const polyPoints = pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" ");
  const fillPath = `M ${pts[0]!.x.toFixed(2)},${height} L ${pts.map((p) => `${p.x.toFixed(2)},${p.y.toFixed(2)}`).join(" L ")} L ${pts[pts.length - 1]!.x.toFixed(2)},${height} Z`;
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="overflow-visible" aria-hidden="true">
      <defs>
        <linearGradient id="sa-health-spark" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.3} />
          <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
        </linearGradient>
      </defs>
      <path d={fillPath} fill="url(#sa-health-spark)" />
      <polyline
        points={polyPoints}
        fill="none"
        stroke="var(--color-primary)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

// ── Hospitals tab ───────────────────────────────────────────────────────────
function HospitalsTab() {
  const [hospitals, setHospitals] = React.useState<Hospital[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [addOpen, setAddOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ hospitals: Hospital[] }>("/api/hospitals");
      setHospitals(r.hospitals);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load hospitals");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Hospitals</h2>
          <p className="text-xs text-muted-foreground">
            {hospitals ? `${hospitals.length} active hospitals` : "Loading…"}
          </p>
        </div>
        <Button onClick={() => setAddOpen(true)} className="glow-primary">
          <Plus className="h-4 w-4" /> Add hospital
        </Button>
      </div>

      {/* Cross-tenant platform health widget (P1 observability) */}
      <SuperadminHealthWidget />

      <Card className="glass">
        <CardContent className="p-0">
          {loading ? (
            <div className="p-4 space-y-3">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : hospitals && hospitals.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Hospital</TableHead>
                  <TableHead>Plan</TableHead>
                  <TableHead className="text-right">Beds</TableHead>
                  <TableHead>NABH</TableHead>
                  <TableHead>City</TableHead>
                  <TableHead className="text-right">Patients</TableHead>
                  <TableHead className="text-right">Users</TableHead>
                  <TableHead>Created</TableHead>
                  <TableHead className="w-10" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {hospitals.map((h) => (
                  <TableRow
                    key={h.id}
                    onClick={() => setSelectedId(h.id)}
                    className="cursor-pointer"
                  >
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="inline-flex items-center justify-center h-8 w-8 rounded-md bg-primary/10 text-primary shrink-0">
                          <Building2 className="h-4 w-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium truncate max-w-[240px]">{h.name}</div>
                          <div className="text-xs text-muted-foreground truncate max-w-[240px]">{h.slug}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge className={cn("text-[10px] uppercase tracking-wider", PLAN_BADGE[h.planTier])}>
                        {h.planTier}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{h.bedCount}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{h.nabhLevel ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{h.city ?? "—"}</TableCell>
                    <TableCell className="text-right tabular-nums">{h._count?.patients ?? 0}</TableCell>
                    <TableCell className="text-right tabular-nums">{h._count?.users ?? 0}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{dateOnly(h.createdAt)}</TableCell>
                    <TableCell><ChevronRight className="h-4 w-4 text-muted-foreground" /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <EmptyState
              icon={<Building2 className="h-6 w-6" />}
              title="No hospitals yet"
              description="Add your first hospital to provision its tenant."
              action={<Button onClick={() => setAddOpen(true)} className="glow-primary"><Plus className="h-4 w-4" /> Add hospital</Button>}
            />
          )}
        </CardContent>
      </Card>

      {/* Detail sheet */}
      <HospitalDetailSheet
        hospitalId={selectedId}
        onOpenChange={(o) => !o && setSelectedId(null)}
        onChanged={load}
      />

      {/* Add dialog */}
      <AddHospitalDialog open={addOpen} onOpenChange={setAddOpen} onCreated={load} />
    </div>
  );
}

function HospitalDetailSheet({
  hospitalId, onOpenChange, onChanged,
}: {
  hospitalId: string | null;
  onOpenChange: (o: boolean) => void;
  onChanged: () => void;
}) {
  const [detail, setDetail] = React.useState<HospitalDetail | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [editing, setEditing] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = React.useState(false);

  // Edit form state
  const [form, setForm] = React.useState({
    name: "", planTier: "STARTER" as "STARTER" | "GROWTH" | "ENTERPRISE",
    bedCount: 0, nabhLevel: "", city: "",
  });
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!hospitalId) { setDetail(null); setEditing(false); return; }
    setLoading(true);
    (async () => {
      try {
        const r = await api<{ hospital: HospitalDetail }>(`/api/hospitals/${hospitalId}`);
        setDetail(r.hospital);
        setForm({
          name: r.hospital.name,
          planTier: r.hospital.planTier,
          bedCount: r.hospital.bedCount,
          nabhLevel: r.hospital.nabhLevel ?? "",
          city: r.hospital.city ?? "",
        });
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load hospital detail");
      } finally {
        setLoading(false);
      }
    })();
  }, [hospitalId]);

  const save = async () => {
    if (!hospitalId) return;
    setSaving(true);
    try {
      await api(`/api/hospitals/${hospitalId}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: form.name,
          planTier: form.planTier,
          bedCount: Number(form.bedCount),
          nabhLevel: form.nabhLevel,
          city: form.city,
        }),
      });
      toast.success("Hospital updated");
      setEditing(false);
      onChanged();
      // Re-fetch detail to reflect updates
      const r = await api<{ hospital: HospitalDetail }>(`/api/hospitals/${hospitalId}`);
      setDetail(r.hospital);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update hospital");
    } finally {
      setSaving(false);
    }
  };

  const doDelete = async () => {
    if (!hospitalId) return;
    setDeleting(true);
    try {
      await api(`/api/hospitals/${hospitalId}`, { method: "DELETE" });
      toast.success("Hospital soft-deleted");
      onOpenChange(false);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete hospital");
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Sheet open={!!hospitalId} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-2xl overflow-y-auto fancy-scroll p-0"
      >
        <SheetHeader className="px-6 pt-6 pb-4 border-b border-border sticky top-0 bg-background/95 backdrop-blur z-10">
          <SheetTitle className="flex items-center gap-2 text-xl">
            <Building2 className="h-5 w-5 text-primary" />
            {loading ? <Skeleton className="h-6 w-48" /> : (detail?.name ?? "Hospital")}
          </SheetTitle>
          <SheetDescription>
            {detail ? `Tenant ID: ${detail.id}` : "Loading…"}
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="p-6 space-y-3">
            {[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
          </div>
        ) : detail ? (
          <div className="p-6 space-y-6">
            {/* Quick stats */}
            <div className="grid grid-cols-3 gap-3">
              <Stat icon={<Building2 className="h-4 w-4" />} label="Patients" value={fmt(detail._count.patients)} />
              <Stat icon={<Users className="h-4 w-4" />} label="Users" value={fmt(detail._count.users)} />
              <Stat icon={<Activity className="h-4 w-4" />} label="Escalations" value={fmt(detail._count.escalations)} />
            </div>

            {/* Detail / edit form */}
            <Card className="border-border bg-card/50">
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Pencil className="h-4 w-4 text-primary" /> Hospital details
                </CardTitle>
                {!editing && (
                  <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </Button>
                )}
              </CardHeader>
              <CardContent className="space-y-4">
                {editing ? (
                  <>
                    <div className="space-y-2">
                      <Label htmlFor="h-name">Name</Label>
                      <Input id="h-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label>Plan tier</Label>
                        <Select value={form.planTier} onValueChange={(v) => setForm({ ...form, planTier: v as typeof form.planTier })}>
                          <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="STARTER">Starter</SelectItem>
                            <SelectItem value="GROWTH">Growth</SelectItem>
                            <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="h-beds">Bed count</Label>
                        <Input id="h-beds" type="number" min={0} value={form.bedCount}
                          onChange={(e) => setForm({ ...form, bedCount: Number(e.target.value) || 0 })} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <Label htmlFor="h-nabh">NABH level</Label>
                        <Input id="h-nabh" value={form.nabhLevel} placeholder="e.g. Entry-level"
                          onChange={(e) => setForm({ ...form, nabhLevel: e.target.value })} />
                      </div>
                      <div className="space-y-2">
                        <Label htmlFor="h-city">City</Label>
                        <Input id="h-city" value={form.city} placeholder="e.g. Pune"
                          onChange={(e) => setForm({ ...form, city: e.target.value })} />
                      </div>
                    </div>
                    <div className="flex items-center justify-end gap-2 pt-2">
                      <Button variant="outline" onClick={() => setEditing(false)} disabled={saving}>
                        <X className="h-4 w-4" /> Cancel
                      </Button>
                      <Button onClick={save} disabled={saving} className="glow-primary">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        Save changes
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                    <DetailRow label="Plan tier" value={
                      <Badge className={cn("text-[10px] uppercase tracking-wider", PLAN_BADGE[detail.planTier])}>{detail.planTier}</Badge>
                    } />
                    <DetailRow label="Bed count" value={fmt(detail.bedCount)} />
                    <DetailRow label="NABH level" value={detail.nabhLevel ?? "—"} />
                    <DetailRow label="City" value={detail.city ?? "—"} />
                    <DetailRow label="Country" value={detail.country} />
                    <DetailRow label="Created" value={dateOnly(detail.createdAt)} />
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Users list */}
            <Card className="border-border bg-card/50">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Users className="h-4 w-4 text-primary" /> Team members
                  <Badge variant="outline" className="text-[10px]">{detail.users.length}</Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Joined</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {detail.users.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4} className="text-center text-muted-foreground py-6">
                          No users yet — invites go through the hospital admin.
                        </TableCell>
                      </TableRow>
                    ) : detail.users.map((u) => (
                      <TableRow key={u.id}>
                        <TableCell className="font-medium">{u.name}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">{u.email}</TableCell>
                        <TableCell>
                          <Badge className={cn("text-[10px]", roleBadgeCls(u.role))}>{roleLabel(u.role)}</Badge>
                        </TableCell>
                        <TableCell className="text-xs text-muted-foreground">{dateOnly(u.createdAt)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Danger zone */}
            <Card className="border-rose-500/40 bg-rose-500/5">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2 text-rose-700 dark:text-rose-300">
                  <AlertTriangle className="h-4 w-4" /> Danger zone
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div>
                    <div className="text-sm font-medium">Soft-delete this hospital</div>
                    <p className="text-xs text-muted-foreground mt-1 max-w-md">
                      Sets <code className="font-mono text-[11px]">deletedAt</code>. Data stays encrypted at rest.
                      Logged in the audit trail. Reversible only via direct DB intervention.
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    className="border-rose-500/40 text-rose-700 dark:text-rose-300 hover:bg-rose-500/10 shrink-0"
                    onClick={() => setConfirmDeleteOpen(true)}
                    disabled={deleting}
                  >
                    <Trash2 className="h-4 w-4" /> Soft-delete
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        ) : null}
      </SheetContent>

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Soft-delete &ldquo;{detail?.name}&rdquo;?</AlertDialogTitle>
            <AlertDialogDescription>
              The hospital will be hidden from the active list and its users will lose access on next
              session refresh. Patient PII remains encrypted at rest. This action is logged.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void doDelete(); }}
              disabled={deleting}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              Soft-delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Sheet>
  );
}

function AddHospitalDialog({ open, onOpenChange, onCreated }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [form, setForm] = React.useState({
    name: "", planTier: "STARTER" as "STARTER" | "GROWTH" | "ENTERPRISE",
    bedCount: 0, nabhLevel: "", city: "",
  });
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      const t = setTimeout(() => {
        setForm({ name: "", planTier: "STARTER", bedCount: 0, nabhLevel: "", city: "" });
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  const submit = async () => {
    if (!form.name || form.name.trim().length < 2) {
      toast.error("Hospital name is required");
      return;
    }
    setSaving(true);
    try {
      await api("/api/hospitals", {
        method: "POST",
        body: JSON.stringify({
          name: form.name.trim(),
          planTier: form.planTier,
          bedCount: Number(form.bedCount) || 0,
          nabhLevel: form.nabhLevel || null,
          city: form.city || null,
        }),
      });
      toast.success("Hospital created");
      onOpenChange(false);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create hospital");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add a new hospital</DialogTitle>
          <DialogDescription>
            Provisions a new tenant. A starter settings row + subscription row are created automatically.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="new-name">Hospital name</Label>
            <Input id="new-name" value={form.name} placeholder="e.g. Ruby Hall Clinic, Pune"
              onChange={(e) => setForm({ ...form, name: e.target.value })} autoFocus />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label>Plan tier</Label>
              <Select value={form.planTier} onValueChange={(v) => setForm({ ...form, planTier: v as typeof form.planTier })}>
                <SelectTrigger className="w-full"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="STARTER">Starter</SelectItem>
                  <SelectItem value="GROWTH">Growth</SelectItem>
                  <SelectItem value="ENTERPRISE">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-beds">Bed count</Label>
              <Input id="new-beds" type="number" min={0} value={form.bedCount}
                onChange={(e) => setForm({ ...form, bedCount: Number(e.target.value) || 0 })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="new-nabh">NABH level (optional)</Label>
              <Input id="new-nabh" value={form.nabhLevel} placeholder="Entry-level"
                onChange={(e) => setForm({ ...form, nabhLevel: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="new-city">City (optional)</Label>
              <Input id="new-city" value={form.city} placeholder="Pune"
                onChange={(e) => setForm({ ...form, city: e.target.value })} />
            </div>
          </div>
        </div>
        <DialogFooter>
          <DialogClose asChild><Button variant="outline">Cancel</Button></DialogClose>
          <Button onClick={submit} disabled={saving} className="glow-primary">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Create hospital
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Users tab ───────────────────────────────────────────────────────────────
function UsersTab() {
  const [hospitals, setHospitals] = React.useState<Hospital[] | null>(null);
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [detail, setDetail] = React.useState<HospitalDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [loadingDetail, setLoadingDetail] = React.useState(false);

  React.useEffect(() => {
    (async () => {
      try {
        const r = await api<{ hospitals: Hospital[] }>("/api/hospitals");
        setHospitals(r.hospitals);
        if (r.hospitals.length > 0) setSelectedId(r.hospitals[0].id);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load hospitals");
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  React.useEffect(() => {
    if (!selectedId) { setDetail(null); return; }
    setLoadingDetail(true);
    (async () => {
      try {
        const r = await api<{ hospital: HospitalDetail }>(`/api/hospitals/${selectedId}`);
        setDetail(r.hospital);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load users");
      } finally {
        setLoadingDetail(false);
      }
    })();
  }, [selectedId]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">Users</h2>
        <p className="text-xs text-muted-foreground">
          Select a hospital to view its provisioned users. User provisioning is invite-only — hospital admins invite their own team.
        </p>
      </div>

      {loading ? (
        <Skeleton className="h-10 w-full max-w-xs" />
      ) : hospitals && hospitals.length > 0 ? (
        <div className="flex items-center gap-3 flex-wrap">
          <Label className="text-xs text-muted-foreground flex items-center gap-1">
            <Filter className="h-3 w-3" /> Hospital
          </Label>
          <Select value={selectedId ?? undefined} onValueChange={setSelectedId}>
            <SelectTrigger className="w-full max-w-xs"><SelectValue placeholder="Select hospital" /></SelectTrigger>
            <SelectContent>
              {hospitals.map((h) => (
                <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      ) : (
        <EmptyState
          icon={<Building2 className="h-6 w-6" />}
          title="No hospitals yet"
          description="Add a hospital first to view its users."
        />
      )}

      <Card className="glass">
        <CardContent className="p-0">
          {loadingDetail ? (
            <div className="p-4 space-y-3">
              {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12 w-full" />)}
            </div>
          ) : detail && detail.users.length > 0 ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Joined</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {detail.users.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="inline-flex items-center justify-center h-8 w-8 rounded-full bg-primary/10 text-primary text-xs font-semibold shrink-0">
                          {u.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()}
                        </div>
                        <span className="font-medium">{u.name}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{u.email}</TableCell>
                    <TableCell>
                      <Badge className={cn("text-[10px]", roleBadgeCls(u.role))}>{roleLabel(u.role)}</Badge>
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{dateOnly(u.createdAt)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : detail ? (
            <EmptyState
              icon={<Users className="h-6 w-6" />}
              title="No users yet"
              description="This hospital has no provisioned users. Its admin can invite team members from their Settings page."
            />
          ) : (
            <EmptyState
              icon={<Users className="h-6 w-6" />}
              title="Select a hospital"
              description="Pick a hospital above to view its users."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Audit tab ───────────────────────────────────────────────────────────────
function AuditTab() {
  const [logs, setLogs] = React.useState<AuditLog[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [hospitalFilter, setHospitalFilter] = React.useState<string>("all");
  const [actionSearch, setActionSearch] = React.useState("");
  const [hospitals, setHospitals] = React.useState<{ id: string; name: string }[]>([]);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      // We fetch all + a hospitals list in parallel for filtering.
      const [logsRes, hospRes] = await Promise.all([
        api<{ logs: AuditLog[] }>("/api/audit?limit=200"),
        api<{ hospitals: Hospital[] }>("/api/hospitals").catch(() => ({ hospitals: [] as Hospital[] })),
      ]);
      setLogs(logsRes.logs);
      setHospitals(hospRes.hospitals.map((h) => ({ id: h.id, name: h.name })));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const filtered = React.useMemo(() => {
    if (!logs) return [];
    return logs.filter((l) => {
      if (hospitalFilter !== "all" && l.hospitalId !== hospitalFilter) return false;
      if (actionSearch) {
        const q = actionSearch.toLowerCase();
        return (
          l.action.toLowerCase().includes(q) ||
          (l.actor?.name ?? "").toLowerCase().includes(q) ||
          (l.actor?.email ?? "").toLowerCase().includes(q) ||
          (l.target ?? "").toLowerCase().includes(q) ||
          (l.detail ?? "").toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [logs, hospitalFilter, actionSearch]);

  const exportLogs = () => {
    toast("Opening print dialog — save as PDF to export.", {
      description: "Use your browser's Print to PDF option to archive this view.",
    });
    setTimeout(() => window.print(), 300);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <h2 className="text-lg font-semibold">Audit logs</h2>
          <p className="text-xs text-muted-foreground">
            {logs ? `${logs.length} most recent events across all tenants` : "Loading…"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={exportLogs} className="print:hidden">
          <Printer className="h-4 w-4" /> Export PDF
        </Button>
      </div>

      <Card className="glass">
        <CardContent className="p-4 space-y-4 print:p-0 print:shadow-none print:border-0">
          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap print:hidden">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Filter className="h-3 w-3" /> Hospital
              </Label>
              <Select value={hospitalFilter} onValueChange={setHospitalFilter}>
                <SelectTrigger className="w-full max-w-[200px] h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All hospitals</SelectItem>
                  {hospitals.map((h) => (
                    <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2 flex-1 min-w-[200px]">
              <Input
                placeholder="Search action, actor, target, detail…"
                value={actionSearch}
                onChange={(e) => setActionSearch(e.target.value)}
                className="h-8"
              />
            </div>
          </div>

          {/* Table */}
          {loading ? (
            <div className="space-y-2">
              {[0, 1, 2, 3, 4, 5].map((i) => <Skeleton key={i} className="h-10 w-full" />)}
            </div>
          ) : filtered.length > 0 ? (
            <div className="max-h-[65vh] overflow-y-auto fancy-scroll rounded-md border border-border">
              <Table>
                <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur z-10">
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Hospital</TableHead>
                    <TableHead>Actor</TableHead>
                    <TableHead>Action</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Detail</TableHead>
                    <TableHead>IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-xs">
                        <div>{ago(l.createdAt)}</div>
                        <div className="text-muted-foreground">{absTime(l.createdAt)}</div>
                      </TableCell>
                      <TableCell className="text-xs">
                        {l.hospital?.name ? (
                          <span className="inline-flex items-center gap-1">
                            <Building2 className="h-3 w-3 text-muted-foreground" />
                            {l.hospital.name}
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </TableCell>
                      <TableCell className="text-xs">
                        {l.actor ? (
                          <div>
                            <div className="font-medium">{l.actor.name}</div>
                            <div className="text-muted-foreground">{l.actor.email}</div>
                          </div>
                        ) : <span className="text-muted-foreground">system</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-[10px] font-mono">{l.action}</Badge>
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {l.target ? (l.target.length > 14 ? l.target.slice(0, 12) + "…" : l.target) : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-[280px] truncate" title={l.detail ?? ""}>
                        {l.detail ?? "—"}
                      </TableCell>
                      <TableCell className="text-xs font-mono text-muted-foreground">
                        {l.ip ?? "—"}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <EmptyState
              icon={<FileBarChart className="h-6 w-6" />}
              title="No audit events match"
              description="Try clearing the hospital filter or the action search."
            />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── AI usage tab ────────────────────────────────────────────────────────────
function AiUsageTab() {
  const [data, setData] = React.useState<{ runs: AiRun[]; aggregate: AiAggregate } | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [hospitals, setHospitals] = React.useState<{ id: string; name: string }[]>([]);
  const [hospitalFilter, setHospitalFilter] = React.useState<string>("all");
  const [agentFilter, setAgentFilter] = React.useState<string>("all");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [runsRes, hospRes] = await Promise.all([
        api<{ runs: AiRun[]; aggregate: AiAggregate }>("/api/ai/runs?limit=200"),
        api<{ hospitals: Hospital[] }>("/api/hospitals").catch(() => ({ hospitals: [] as Hospital[] })),
      ]);
      setData(runsRes);
      setHospitals(hospRes.hospitals.map((h) => ({ id: h.id, name: h.name })));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load AI usage");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const filtered = React.useMemo(() => {
    if (!data) return [];
    return data.runs.filter((r) => {
      if (hospitalFilter !== "all" && r.hospitalId !== hospitalFilter) return false;
      if (agentFilter !== "all" && r.agentType !== agentFilter) return false;
      return true;
    });
  }, [data, hospitalFilter, agentFilter]);

  // Per-hospital aggregate (computed client-side from filtered runs)
  const byHospital = React.useMemo(() => {
    const map = new Map<string, { name: string; calls: number; tokens: number; fallbacks: number }>();
    for (const r of filtered) {
      const h = hospitals.find((x) => x.id === r.hospitalId);
      const key = r.hospitalId;
      if (!map.has(key)) map.set(key, { name: h?.name ?? "Unknown", calls: 0, tokens: 0, fallbacks: 0 });
      const e = map.get(key)!;
      e.calls += 1;
      e.tokens += r.tokensIn + r.tokensOut;
      if (r.fallbackUsed) e.fallbacks += 1;
    }
    return Array.from(map.values()).sort((a, b) => b.calls - a.calls);
  }, [filtered, hospitals]);

  const fallbackRate = data && data.aggregate.totalCalls > 0
    ? (data.aggregate.fallbacks / data.aggregate.totalCalls) * 100
    : 0;
  const overFallbackThreshold = fallbackRate > 10;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">AI usage (cross-tenant)</h2>
        <p className="text-xs text-muted-foreground">
          The cross-tenant AI billing view. Every call is logged with prompt ref, tokens, latency, and outcome.
        </p>
      </div>

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
        </div>
      ) : data ? (
        <>
          {/* Aggregate KPI cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <KpiCard
              icon={<Activity className="h-4 w-4" />}
              label="Total calls"
              value={fmt(data.aggregate.totalCalls)}
            />
            <KpiCard
              icon={<Coins className="h-4 w-4" />}
              label="Total tokens"
              value={fmt(data.aggregate.totalTokens)}
            />
            <KpiCard
              icon={<AlertTriangle className="h-4 w-4" />}
              label="Fallback rate"
              value={`${fallbackRate.toFixed(1)}%`}
              tint={overFallbackThreshold ? "rose" : undefined}
              sub={`${fmt(data.aggregate.fallbacks)} fallbacks`}
            />
            <KpiCard
              icon={<Cpu className="h-4 w-4" />}
              label="Distinct agents"
              value={fmt(Object.keys(data.aggregate.byAgent).length)}
            />
          </div>

          {overFallbackThreshold && (
            <Alert variant="destructive">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>High fallback rate</AlertTitle>
              <AlertDescription>
                {fallbackRate.toFixed(1)}% of AI calls are falling back to rule-based outputs. Investigate
                provider availability or API keys in your deployment env.
              </AlertDescription>
            </Alert>
          )}

          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Filter className="h-3 w-3" /> Hospital
              </Label>
              <Select value={hospitalFilter} onValueChange={setHospitalFilter}>
                <SelectTrigger className="w-full max-w-[200px] h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All hospitals</SelectItem>
                  {hospitals.map((h) => (
                    <SelectItem key={h.id} value={h.id}>{h.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Label className="text-xs text-muted-foreground flex items-center gap-1">
                <Bot className="h-3 w-3" /> Agent
              </Label>
              <Select value={agentFilter} onValueChange={setAgentFilter}>
                <SelectTrigger className="w-full max-w-[200px] h-8"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All agents</SelectItem>
                  {Object.entries(AGENT_META).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* By-hospital breakdown */}
          {byHospital.length > 0 && (
            <Card className="glass">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-primary" /> By hospital
                </CardTitle>
                <CardDescription>Aggregate of the filtered run set.</CardDescription>
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Hospital</TableHead>
                      <TableHead className="text-right">Calls</TableHead>
                      <TableHead className="text-right">Tokens</TableHead>
                      <TableHead className="text-right">Fallbacks</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {byHospital.map((h) => (
                      <TableRow key={h.name}>
                        <TableCell className="font-medium">
                          <span className="inline-flex items-center gap-2">
                            <Building2 className="h-3 w-3 text-muted-foreground" />
                            {h.name}
                          </span>
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(h.calls)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(h.tokens)}</TableCell>
                        <TableCell className="text-right tabular-nums">{fmt(h.fallbacks)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {/* Runs table */}
          <Card className="glass">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Sparkles className="h-4 w-4 text-primary" /> Run log
              </CardTitle>
              <CardDescription>{filtered.length} runs match the current filters.</CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {filtered.length > 0 ? (
                <div className="max-h-[60vh] overflow-y-auto fancy-scroll">
                  <Table>
                    <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur z-10">
                      <TableRow>
                        <TableHead>When</TableHead>
                        <TableHead>Hospital</TableHead>
                        <TableHead>Agent</TableHead>
                        <TableHead>Outcome</TableHead>
                        <TableHead className="text-right">Tokens</TableHead>
                        <TableHead className="text-right">Latency</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((r) => {
                        const meta = AGENT_META[r.agentType] ?? { label: r.agentType, color: "#64748b" };
                        const h = hospitals.find((x) => x.id === r.hospitalId);
                        return (
                          <TableRow key={r.id}>
                            <TableCell className="text-xs">
                              <div>{ago(r.createdAt)}</div>
                              <div className="text-muted-foreground">{absTime(r.createdAt)}</div>
                            </TableCell>
                            <TableCell className="text-xs">
                              {h ? (
                                <span className="inline-flex items-center gap-1">
                                  <Building2 className="h-3 w-3 text-muted-foreground" />
                                  {h.name}
                                </span>
                              ) : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell>
                              <span className="inline-flex items-center gap-1.5 text-xs">
                                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: meta.color }} />
                                {meta.label}
                              </span>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <Badge variant="outline" className={cn("text-[10px]", OUTCOME_CLS[r.outcome] ?? "")}>
                                  {r.outcome.replace(/_/g, " ").toLowerCase()}
                                </Badge>
                                {r.fallbackUsed && (
                                  <Badge variant="outline" className="text-[10px] bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30">
                                    fallback
                                  </Badge>
                                )}
                              </div>
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-xs">
                              {fmt(r.tokensIn + r.tokensOut)}
                            </TableCell>
                            <TableCell className="text-right tabular-nums text-xs">
                              {fmt(r.latencyMs)}ms
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              ) : (
                <EmptyState
                  icon={<Bot className="h-6 w-6" />}
                  title="No AI runs match"
                  description="Try clearing the hospital or agent filters."
                />
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

// ── Small shared components ─────────────────────────────────────────────────
function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card/50 p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon} {label}
      </div>
      <div className="text-lg font-semibold mt-1 tabular-nums">{value}</div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm mt-0.5">{value}</div>
    </div>
  );
}

function KpiCard({ icon, label, value, sub, tint }: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  tint?: "rose";
}) {
  return (
    <Card className={cn(
      "glass",
      tint === "rose" && "border-rose-500/40 bg-rose-500/5",
    )}>
      <CardContent className="pt-5 pb-5">
        <div className={cn(
          "inline-flex items-center justify-center h-8 w-8 rounded-md mb-2",
          tint === "rose" ? "bg-rose-500/15 text-rose-600 dark:text-rose-400" : "bg-primary/10 text-primary",
        )}>
          {icon}
        </div>
        <div className={cn(
          "text-2xl font-semibold tabular-nums",
          tint === "rose" && "text-rose-600 dark:text-rose-400",
        )}>
          {value}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">{label}</div>
        {sub && <div className="text-[11px] text-muted-foreground mt-0.5">{sub}</div>}
      </CardContent>
    </Card>
  );
}

function EmptyState({ icon, title, description, action }: {
  icon: React.ReactNode;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="text-center py-12 px-4">
      <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-muted text-muted-foreground mb-3">
        {icon}
      </div>
      <p className="text-sm font-medium">{title}</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}
