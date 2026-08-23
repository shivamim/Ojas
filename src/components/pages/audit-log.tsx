"use client";

// Ojas — hospital-scoped Audit Log viewer.
//
// Lists every authenticated action recorded by the platform, scoped to the
// signed-in user's hospital (the /api/audit endpoint auto-scopes by
// hospitalId unless the user is a SUPER_ADMIN). Supports filtering by action,
// actor, target, and date range, plus cursor-based "load more" pagination and
// CSV export for compliance archival.
//
// UX states covered: loading skeletons, error (DB unreachable), empty (no
// matches), and partial-load-more. Color-codes actions by category so an
// auditor can scan a busy table by visual band.
import * as React from "react";
import { toast } from "sonner";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import {
  ScrollText, RefreshCw, Loader2, Download, Filter, X,
  Activity, Users, Crown, Clock, ServerCrash, Search, ExternalLink,
  Share2, ShieldOff, Link2,
} from "lucide-react";

import { api } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { navigate } from "@/lib/router";

import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

// ── Types ───────────────────────────────────────────────────────────────────
interface AuditLog {
  id: string;
  hospitalId: string | null;
  actorId: string | null;
  action: string;
  target: string | null;
  detail: string | null;
  ip: string | null;
  createdAt: string;
  actor: { name: string; email: string } | null;
  hospital: { name: string } | null;
}

interface AuditResponse {
  logs: AuditLog[];
  hasMore: boolean;
  nextCursor: string | null;
  count: number;
}

interface Filters {
  action: string;
  actor: string;
  target: string;
  from: string; // YYYY-MM-DD (native date input value)
  to: string;   // YYYY-MM-DD
}

const EMPTY_FILTERS: Filters = { action: "", actor: "", target: "", from: "", to: "" };

// ── Helpers ─────────────────────────────────────────────────────────────────

/** "5 minutes ago" — relative time, falls back to "—" on bad input. */
function ago(iso: string): string {
  try { return formatDistanceToNow(parseISO(iso), { addSuffix: true }); } catch { return "—"; }
}

/** Absolute timestamp — "4 Mar 2026 · 14:32:11". */
function absTime(iso: string): string {
  try { return format(parseISO(iso), "d MMM yyyy · HH:mm:ss"); } catch { return iso; }
}

/**
 * Color-code an audit action by its top-level category. The full action
 * string (e.g. "auth.login", "timeline.share.create") is matched — the
 * `timeline.share.*` family gets cyan, while other `timeline.*` actions
 * fall through to muted.
 *
 *   auth.*        → blue
 *   patient.*     → emerald
 *   consent.*     → violet
 *   billing.*     → amber
 *   escalation.*  → red
 *   timeline.share.* → cyan
 *   whatsapp.*    → slate
 *   (other)       → muted
 */
function actionTone(action: string): string {
  const a = action.toLowerCase();
  if (a.startsWith("timeline.share")) {
    return "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-300";
  }
  const cat = a.split(".")[0] ?? "";
  switch (cat) {
    case "auth":       return "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-300";
    case "patient":    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
    case "consent":    return "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-300";
    case "billing":    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
    case "escalation": return "border-rose-500/30 bg-rose-500/10 text-rose-700 dark:text-rose-300";
    case "whatsapp":   return "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300";
    case "timeline":   return "border-slate-500/30 bg-slate-500/10 text-slate-700 dark:text-slate-300";
    default:           return "border-border bg-muted text-muted-foreground";
  }
}

/** RFC-4180 CSV cell escape — wrap in quotes if needed, double internal quotes. */
function csvEscape(value: string | null | undefined): string {
  if (value == null) return "";
  const s = String(value);
  if (/[",\n\r]/.test(s)) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

/**
 * Heuristic: does the actor input look like an exact user id (cuid)?
 * If so, we send it as `actorId` for an exact server-side match; otherwise
 * we leave it for client-side name/email filtering.
 */
function isIdLike(s: string): boolean {
  const trimmed = s.trim();
  if (trimmed.length < 16) return false;
  return /^[a-z0-9_]+$/i.test(trimmed);
}

function truncate(s: string | null, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

/** Detect if an audit target looks like a patient resource id (cuid).
 *  Patient-related actions store the patient id as the target. We detect
 *  this heuristically: cuid format (24+ lowercase alphanumerics) AND the
 *  action is one that operates on a patient. */
function isPatientTarget(action: string, target: string | null): boolean {
  if (!target) return false;
  // Patient-related actions — their target is a patient id.
  const patientActions = [
    "patient.", "consent.", "checkin", "escalation.", "medication.",
    "enrollment", "timeline.share", "family_update", "family.whatsapp",
    "discharge", "milestone", "follow_up", "risk_stratification",
  ];
  const a = action.toLowerCase();
  const isPatientAction = patientActions.some((p) => a.includes(p));
  // CUID format: 24+ lowercase alphanumerics (cuid v2 uses c + base36).
  const looksLikeCuid = /^c[a-z0-9]{20,}$/i.test(target) || /^[a-z0-9]{24,}$/i.test(target);
  return isPatientAction && looksLikeCuid;
}

/** Today's date as YYYY-MM-DD (for the export filename). */
function todayISODate(): string {
  return new Date().toISOString().slice(0, 10);
}

// ── Page ────────────────────────────────────────────────────────────────────
export function AuditLogPage() {
  // Input state (form fields — only promoted to appliedFilters on Apply)
  const [actionInput, setActionInput] = React.useState("");
  const [actorInput, setActorInput] = React.useState("");
  const [targetInput, setTargetInput] = React.useState("");
  const [fromInput, setFromInput] = React.useState("");
  const [toInput, setToInput] = React.useState("");

  // Applied filters (drive the fetch). Updated only when Apply is clicked so
  // typing in a filter input doesn't re-fire the API on every keystroke.
  const [appliedFilters, setAppliedFilters] = React.useState<Filters>(EMPTY_FILTERS);

  // Mobile filter collapse — desktop is always expanded.
  const [filtersOpenMobile, setFiltersOpenMobile] = React.useState(false);

  // Data state
  const [logs, setLogs] = React.useState<AuditLog[]>([]);
  const [hasMore, setHasMore] = React.useState(false);
  const [nextCursor, setNextCursor] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);          // initial / refresh
  const [loadingMore, setLoadingMore] = React.useState(false);  // load-more only
  const [error, setError] = React.useState<string | null>(null);

  // Keyboard-navigation state: j/k moves the selection, Enter follows the
  // patient link if the selected row's target is a patient id.
  const [selectedIdx, setSelectedIdx] = React.useState<number>(-1);

  /** Build the /api/audit URL for a given filter set + optional cursor. */
  const buildQuery = React.useCallback((filters: Filters, cursor?: string | null): string => {
    const params = new URLSearchParams();
    params.set("limit", "100");
    if (filters.action) params.set("action", filters.action.trim());
    // Actor: if the input is an exact id, send actorId for a server-side
    // exact match. Otherwise leave it out — we filter client-side on
    // actor.name / actor.email after the fetch.
    if (filters.actor && isIdLike(filters.actor)) {
      params.set("actorId", filters.actor.trim());
    }
    if (filters.target) params.set("target", filters.target.trim());
    // Convert YYYY-MM-DD (native date input) to ISO 8601 with explicit
    // UTC bounds: from = start of day, to = end of day.
    if (filters.from) params.set("from", new Date(filters.from + "T00:00:00.000Z").toISOString());
    if (filters.to)   params.set("to",   new Date(filters.to   + "T23:59:59.999Z").toISOString());
    if (cursor) params.set("cursor", cursor);
    return `/api/audit?${params.toString()}`;
  }, []);

  /** Initial / refresh load — replaces the log list. */
  const load = React.useCallback(async (filters: Filters) => {
    setLoading(true);
    setError(null);
    try {
      const res = await api<AuditResponse>(buildQuery(filters));
      setLogs(res.logs);
      setHasMore(res.hasMore);
      setNextCursor(res.nextCursor);
    } catch (err) {
      // Any failure (auth, DB unreachable in sandbox, network) → error state.
      // The UI shows a single amber notice; the underlying message is logged.
      const msg = err instanceof Error ? err.message : "Failed to load audit logs";
      setError(msg);
      setLogs([]);
      setHasMore(false);
      setNextCursor(null);
    } finally {
      setLoading(false);
    }
  }, [buildQuery]);

  // Initial mount load + reload whenever applied filters change.
  React.useEffect(() => {
    void load(appliedFilters);
  }, [load, appliedFilters]);

  /** Load the next page (append). Disabled while a load-more is in flight. */
  const loadMore = React.useCallback(async () => {
    if (!hasMore || !nextCursor || loadingMore) return;
    setLoadingMore(true);
    try {
      const res = await api<AuditResponse>(buildQuery(appliedFilters, nextCursor));
      // Append — never replace. Cursor pagination guarantees no overlap.
      setLogs((prev) => [...prev, ...res.logs]);
      setHasMore(res.hasMore);
      setNextCursor(res.nextCursor);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load more events");
    } finally {
      setLoadingMore(false);
    }
  }, [appliedFilters, buildQuery, hasMore, nextCursor, loadingMore]);

  // ── Filter handlers ────────────────────────────────────────────────────────
  const handleApply = () => {
    setAppliedFilters({
      action: actionInput.trim(),
      actor: actorInput.trim(),
      target: targetInput.trim(),
      from: fromInput,
      to: toInput,
    });
    setFiltersOpenMobile(false);
  };

  const handleClear = () => {
    setActionInput("");
    setActorInput("");
    setTargetInput("");
    setFromInput("");
    setToInput("");
    setAppliedFilters(EMPTY_FILTERS);
  };

  const handleRefresh = () => {
    void load(appliedFilters);
    toast.success("Audit log refreshed");
  };

  const handleRetry = () => {
    void load(appliedFilters);
  };

  const handleExportCSV = () => {
    if (visibleLogs.length === 0) {
      toast.error("Nothing to export — no audit events loaded");
      return;
    }
    const header = ["time", "actor", "action", "target", "detail", "ip"];
    const rows = visibleLogs.map((l) => [
      l.createdAt,
      l.actor ? `${l.actor.name} <${l.actor.email}>` : "system",
      l.action,
      l.target ?? "",
      l.detail ?? "",
      l.ip ?? "",
    ].map(csvEscape).join(","));
    const csv = [header.join(","), ...rows].join("\n");
    // BOM prefix so Excel opens UTF-8 correctly.
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `ojas-audit-log-${todayISODate()}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success(`Exported ${visibleLogs.length} events to CSV`);
  };

  // ── Derived data ───────────────────────────────────────────────────────────

  /**
   * Client-side actor filter: when the actor input is a name/email fragment
   * (not an id), filter the loaded logs locally. When it IS an id, the
   * server already filtered, so we return all loaded logs unchanged.
   */
  const visibleLogs = React.useMemo(() => {
    const f = appliedFilters.actor;
    if (!f || isIdLike(f)) return logs;
    const q = f.toLowerCase();
    return logs.filter((l) => {
      const name = l.actor?.name ?? "";
      const email = l.actor?.email ?? "";
      return name.toLowerCase().includes(q) || email.toLowerCase().includes(q);
    });
  }, [logs, appliedFilters.actor]);

  /** Mini-stats strip — computed from the currently-visible (filtered) logs. */
  const stats = React.useMemo(() => {
    const total = visibleLogs.length;
    // Treat null actorId as a single "system" actor for the unique count.
    const actorKeys = new Set<string>();
    for (const l of visibleLogs) actorKeys.add(l.actorId ?? "system");
    const uniqueActors = actorKeys.size;

    // Most common action (full string, e.g. "auth.login"). Ties broken by
    // first-seen order (Object insertion order is preserved in JS).
    const actionCounts: Record<string, number> = {};
    let topAction = "—";
    let topCount = 0;
    for (const l of visibleLogs) {
      const a = l.action;
      actionCounts[a] = (actionCounts[a] ?? 0) + 1;
      if (actionCounts[a] > topCount) {
        topAction = a;
        topCount = actionCounts[a];
      }
    }

    // Events in the last 24h (from now).
    const now = Date.now();
    const last24h = visibleLogs.filter(
      (l) => now - new Date(l.createdAt).getTime() < 24 * 60 * 60 * 1000
    ).length;

    return { total, uniqueActors, topAction, topCount, last24h };
  }, [visibleLogs]);

  const hasActiveFilters = (
    appliedFilters.action || appliedFilters.actor ||
    appliedFilters.target || appliedFilters.from || appliedFilters.to
  );

  // ── Keyboard shortcuts: j/k to move selection, Enter to follow patient link ─
  // Only active when the table is visible, no input is focused, and there are
  // rows to navigate. Ignores modifier keys (Ctrl/Cmd/Meta/Alt) so browser
  // shortcuts still work.
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = (document.activeElement?.tagName ?? "").toLowerCase();
      if (tag === "input" || tag === "textarea" || tag === "select") return;
      if (error || loading || visibleLogs.length === 0) return;

      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setSelectedIdx((i) => Math.min(i + 1, visibleLogs.length - 1));
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setSelectedIdx((i) => Math.max(i - 1, 0));
      } else if (e.key === "Enter") {
        const selected = visibleLogs[selectedIdx];
        if (selected && isPatientTarget(selected.action, selected.target)) {
          e.preventDefault();
          navigate("patient-detail", { patientId: selected.target! });
        }
      } else if (e.key === "Escape") {
        setSelectedIdx(-1);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [visibleLogs, selectedIdx, error, loading]);

  // Reset selection when the filter results change.
  React.useEffect(() => {
    setSelectedIdx(-1);
  }, [appliedFilters]);

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6">
      {/* Header */}
      <header className="flex flex-col md:flex-row md:items-end md:justify-between gap-4">
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight flex items-center gap-2">
            <ScrollText className="h-6 w-6 text-primary" />
              Audit log
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Every authenticated action, in order. Filter by action, actor, target, or date range. Hospital-scoped.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={handleRefresh} disabled={loading}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Refresh
            </Button>
            <Button variant="default" size="sm" onClick={handleExportCSV} disabled={loading || visibleLogs.length === 0}>
              <Download className="h-4 w-4" />
              Export CSV
            </Button>
          </div>
        </header>

        {/* Recent shares summary widget — quick entry point to the share-revocation workflow */}
        <RecentSharesWidget />

        {/* Filter presets — quick-click chips for common audit queries */}
        <FilterPresets
          onPreset={(filters) => {
            setActionInput(filters.action);
            setActorInput(filters.actor);
            setTargetInput(filters.target);
            setFromInput(filters.from);
            setToInput(filters.to);
            setAppliedFilters(filters);
            setFiltersOpenMobile(false);
          }}
          activeFilters={appliedFilters}
        />

        {/* Filter bar */}
        <Card className="glass">
          <CardContent className="p-4 space-y-3">
            {/* Mobile expand/collapse toggle */}
            <div className="flex items-center justify-between md:hidden">
              <button
                type="button"
                onClick={() => setFiltersOpenMobile((v) => !v)}
                className="inline-flex items-center gap-2 text-sm font-medium text-foreground"
              >
                <Filter className="h-4 w-4" />
                Filters
                {hasActiveFilters && (
                  <Badge variant="secondary" className="text-[10px] px-1.5 py-0">active</Badge>
                )}
              </button>
              <button
                type="button"
                onClick={() => setFiltersOpenMobile((v) => !v)}
                className="text-muted-foreground hover:text-foreground transition-colors"
                aria-label={filtersOpenMobile ? "Collapse filters" : "Expand filters"}
              >
                {filtersOpenMobile ? <X className="h-4 w-4" /> : <Filter className="h-4 w-4" />}
              </button>
            </div>

            {/* Filter inputs — always visible on desktop, collapsible on mobile */}
            <div className={cn("grid gap-3 md:flex md:flex-wrap md:items-end", !filtersOpenMobile && "hidden md:flex")}>
              <div className="grid gap-1.5 md:w-56">
                <Label htmlFor="audit-filter-action" className="text-xs text-muted-foreground">Action</Label>
                <Input
                  id="audit-filter-action"
                  placeholder="e.g. auth, patient, consent, billing"
                  value={actionInput}
                  onChange={(e) => setActionInput(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="grid gap-1.5 md:w-56">
                <Label htmlFor="audit-filter-actor" className="text-xs text-muted-foreground">Actor</Label>
                <Input
                  id="audit-filter-actor"
                  placeholder="name, email, or actor id"
                  value={actorInput}
                  onChange={(e) => setActorInput(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="grid gap-1.5 md:w-56">
                <Label htmlFor="audit-filter-target" className="text-xs text-muted-foreground">Target</Label>
                <Input
                  id="audit-filter-target"
                  placeholder="patient id or resource id"
                  value={targetInput}
                  onChange={(e) => setTargetInput(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="grid gap-1.5 md:w-40">
                <Label htmlFor="audit-filter-from" className="text-xs text-muted-foreground">From</Label>
                <Input
                  id="audit-filter-from"
                  type="date"
                  value={fromInput}
                  onChange={(e) => setFromInput(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="grid gap-1.5 md:w-40">
                <Label htmlFor="audit-filter-to" className="text-xs text-muted-foreground">To</Label>
                <Input
                  id="audit-filter-to"
                  type="date"
                  value={toInput}
                  onChange={(e) => setToInput(e.target.value)}
                  className="h-9"
                />
              </div>
              <div className="flex items-center gap-2 md:ml-auto">
                <Button size="sm" onClick={handleApply}>
                  <Search className="h-4 w-4" />
                  Apply filters
                </Button>
                <Button size="sm" variant="ghost" onClick={handleClear} disabled={!hasActiveFilters && !actionInput && !actorInput && !targetInput && !fromInput && !toInput}>
                  Clear
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Stats strip */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatCard
            icon={<Activity className="h-4 w-4" />}
            label="Total events"
            value={stats.total.toLocaleString("en-IN")}
            hint="on this page"
            tone="border-blue-500/30 bg-blue-500/5"
          />
          <StatCard
            icon={<Users className="h-4 w-4" />}
            label="Unique actors"
            value={stats.uniqueActors.toLocaleString("en-IN")}
            hint="distinct users + system"
            tone="border-emerald-500/30 bg-emerald-500/5"
          />
          <StatCard
            icon={<Crown className="h-4 w-4" />}
            label="Most common action"
            value={stats.topAction}
            hint={stats.topCount > 0 ? `${stats.topCount} events` : "—"}
            tone="border-violet-500/30 bg-violet-500/5"
            mono
          />
          <StatCard
            icon={<Clock className="h-4 w-4" />}
            label="Events in last 24h"
            value={stats.last24h.toLocaleString("en-IN")}
            hint="rolling window"
            tone="border-amber-500/30 bg-amber-500/5"
          />
        </section>

        {/* Main panel: error / loading / empty / table */}
        <Card>
          <CardContent className="p-0">
            {/* Error state */}
            {error && !loading && (
              <div className="p-6">
                <div className="rounded-lg border border-amber-500/40 bg-amber-500/10 px-4 py-5 flex items-start gap-3">
                  <div className="flex items-center justify-center h-9 w-9 rounded-full bg-amber-500/20 text-amber-700 dark:text-amber-300 flex-shrink-0">
                    <ServerCrash className="h-5 w-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-amber-900 dark:text-amber-200">
                      Audit log unavailable — the database could not be reached. Retry in a moment.
                    </div>
                    <div className="text-xs text-amber-800/80 dark:text-amber-300/70 mt-1">
                      The Ojas sandbox has no PostgreSQL instance; in production this indicates a transient connection issue.
                    </div>
                    <Button size="sm" variant="outline" className="mt-3" onClick={handleRetry}>
                      <RefreshCw className="h-4 w-4" />
                      Retry
                    </Button>
                  </div>
                </div>
              </div>
            )}

            {/* Loading skeleton (initial load only) */}
            {!error && loading && (
              <div className="p-4 space-y-2">
                {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            )}

            {/* Empty state */}
            {!error && !loading && visibleLogs.length === 0 && (
              <div className="text-center py-16 px-4">
                <div className="inline-flex items-center justify-center h-14 w-14 rounded-full bg-muted text-muted-foreground mb-4">
                  <ScrollText className="h-7 w-7" />
                </div>
                <p className="text-base font-medium">No audit events match your filters</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                  Try widening the date range, clearing the action filter, or removing the actor / target constraint.
                </p>
                <Button size="sm" variant="outline" className="mt-4" onClick={handleClear} disabled={!hasActiveFilters}>
                  <X className="h-4 w-4" />
                  Clear filters
                </Button>
              </div>
            )}

            {/* Results table */}
            {!error && !loading && visibleLogs.length > 0 && (
              <>
                <div className="px-4 pt-4 pb-2 flex items-center justify-between text-xs text-muted-foreground">
                  <div>
                    Showing <span className="font-medium text-foreground tabular-nums">{visibleLogs.length.toLocaleString("en-IN")}</span>
                    {" "}event{visibleLogs.length === 1 ? "" : "s"}
                    {hasActiveFilters && <span> · filtered</span>}
                  </div>
                  <div className="flex items-center gap-3">
                    {/* Keyboard shortcuts hint */}
                    <span className="hidden sm:flex items-center gap-1.5 text-[10px] text-muted-foreground/70">
                      <kbd className="px-1 py-0.5 rounded border border-border bg-muted font-mono text-[9px]">j</kbd>
                      <kbd className="px-1 py-0.5 rounded border border-border bg-muted font-mono text-[9px]">k</kbd>
                      navigate
                      <kbd className="px-1 py-0.5 rounded border border-border bg-muted font-mono text-[9px] ml-1">↵</kbd>
                      open patient
                    </span>
                    {hasMore && <div className="text-[11px]">More available — load more below</div>}
                  </div>
                </div>
                <div className="max-h-[60vh] overflow-y-auto fancy-scroll border-t border-border">
                  <Table>
                    <TableHeader className="sticky top-0 bg-muted/80 backdrop-blur z-10">
                      <TableRow>
                        <TableHead className="min-w-[180px]">Time</TableHead>
                        <TableHead className="min-w-[180px]">Actor</TableHead>
                        <TableHead className="min-w-[140px]">Action</TableHead>
                        <TableHead className="min-w-[140px]">Target</TableHead>
                        <TableHead className="min-w-[220px]">Detail</TableHead>
                        <TableHead className="min-w-[120px]">IP</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {visibleLogs.map((l, idx) => (
                        <TableRow
                          key={l.id}
                          className={cn(
                            "cursor-pointer transition-colors",
                            idx === selectedIdx && "bg-primary/10 ring-1 ring-inset ring-primary/30",
                          )}
                          onClick={() => setSelectedIdx(idx)}
                        >
                          <TableCell className="text-xs">
                            <div className="font-medium text-foreground">{ago(l.createdAt)}</div>
                            <div className="text-muted-foreground tabular-nums">{absTime(l.createdAt)}</div>
                          </TableCell>
                          <TableCell className="text-xs">
                            {l.actor ? (
                              <div>
                                <div className="font-medium text-foreground">{l.actor.name}</div>
                                <div className="text-muted-foreground">{l.actor.email}</div>
                              </div>
                            ) : (
                              <span className="text-muted-foreground italic">system</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge
                              variant="outline"
                              className={cn("text-[10px] font-mono", actionTone(l.action))}
                              title={l.action}
                            >
                              {l.action}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">
                            {l.target ? (
                              isPatientTarget(l.action, l.target) ? (
                                <button
                                  type="button"
                                  onClick={() => navigate("patient-detail", { patientId: l.target! })}
                                  className="inline-flex items-center gap-1 text-primary hover:text-primary/80 hover:underline transition-colors"
                                  title={`Open patient ${l.target}`}
                                >
                                  {truncate(l.target, 14)}
                                  <ExternalLink className="h-2.5 w-2.5 flex-shrink-0" />
                                </button>
                              ) : (
                                truncate(l.target, 18)
                              )
                            ) : (
                              "—"
                            )}
                          </TableCell>
                          <TableCell
                            className="text-xs text-muted-foreground max-w-[280px] truncate"
                            title={l.detail ?? ""}
                          >
                            {l.detail ?? "—"}
                          </TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground tabular-nums">
                            {l.ip ?? "—"}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            )}
          </CardContent>
        </Card>

        {/* Load more */}
        {!error && !loading && hasMore && visibleLogs.length > 0 && (
          <div className="flex justify-center pt-2">
            <Button variant="outline" onClick={loadMore} disabled={loadingMore}>
              {loadingMore ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {loadingMore ? "Loading…" : "Load more"}
            </Button>
          </div>
        )}
    </div>
  );
}

// ── Small presentational helpers ─────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  hint,
  tone,
  mono,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
  tone?: string;
  mono?: boolean;
}) {
  return (
    <Card className={cn("overflow-hidden transition-transform hover:-translate-y-0.5", tone)}>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
            {label}
          </div>
          <div className="text-muted-foreground">{icon}</div>
        </div>
        <div className={cn("mt-2 text-xl font-semibold tabular-nums truncate", mono && "font-mono text-base")}>
          {value}
        </div>
        {hint && <div className="mt-0.5 text-[11px] text-muted-foreground truncate">{hint}</div>}
      </CardContent>
    </Card>
  );
}

// ── Recent shares widget ────────────────────────────────────────────────────
// Summary card at the top of the audit-log page showing active + revoked share
// counts for the last 7 days, with a deep-link to the most-recently-shared
// patient's timeline (where the manage-shares panel lives). Gives auditors a
// quick entry point into the share-revocation workflow.
interface ShareListItem {
  id: string;
  patientId: string;
  audience: string;
  expiresAt: string;
  accessedAt: string | null;
  createdAt: string;
  active: boolean;
  revokedAt: string | null;
  revokedBy: string | null;
  patient?: { fullName?: string; surgeryType?: string } | null;
}

function RecentSharesWidget() {
  const [shares, setShares] = React.useState<ShareListItem[] | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const res = await fetch("/api/timeline/share", { credentials: "include" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { shares: ShareListItem[] };
        if (!cancelled) { setShares(data.shares ?? []); setLoading(false); }
      } catch {
        if (!cancelled) { setShares(null); setLoading(false); }
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <Card className="glass">
        <CardContent className="p-4">
          <div className="flex items-center gap-2 mb-2">
            <Share2 className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Recent timeline shares</span>
          </div>
          <Skeleton className="h-8 w-full" />
        </CardContent>
      </Card>
    );
  }

  if (!shares) {
    // Non-fatal: the share API is unreachable (sandbox: no DB). Hide the widget
    // rather than showing an error — the audit log table below still works.
    return null;
  }

  const now = Date.now();
  const sevenDaysAgo = now - 7 * 86400000;
  const recent = shares.filter((s) => new Date(s.createdAt).getTime() >= sevenDaysAgo);
  const activeCount = recent.filter((s) => s.active).length;
  const revokedCount = recent.filter((s) => !s.active).length;
  const accessedCount = recent.filter((s) => s.accessedAt).length;

  // Most recently created active share — deep-link to that patient.
  const mostRecent = shares
    .filter((s) => s.active)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())[0];

  return (
    <Card className="glass border-primary/20">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Share2 className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Recent timeline shares</span>
            <Badge variant="outline" className="text-[9px] uppercase tracking-wider">
              last 7d
            </Badge>
          </div>
          {mostRecent && (
            <Button
              variant="ghost"
              size="sm"
              className="text-xs gap-1.5"
              onClick={() => navigate("patient-detail", { patientId: mostRecent.patientId })}
            >
              <Link2 className="h-3 w-3" />
              Latest share →
            </Button>
          )}
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-2.5">
            <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-emerald-700 dark:text-emerald-400">
              <Share2 className="h-2.5 w-2.5" /> Active
            </div>
            <div className="text-xl font-bold tabular-nums text-emerald-700 dark:text-emerald-400 mt-0.5">{activeCount}</div>
          </div>
          <div className="rounded-lg bg-amber-500/5 border border-amber-500/20 p-2.5">
            <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-amber-700 dark:text-amber-400">
              <ShieldOff className="h-2.5 w-2.5" /> Revoked
            </div>
            <div className="text-xl font-bold tabular-nums text-amber-700 dark:text-amber-400 mt-0.5">{revokedCount}</div>
          </div>
          <div className="rounded-lg bg-primary/5 border border-primary/20 p-2.5">
            <div className="flex items-center gap-1.5 text-[9px] uppercase tracking-wider text-primary">
              <ExternalLink className="h-2.5 w-2.5" /> Accessed
            </div>
            <div className="text-xl font-bold tabular-nums text-primary mt-0.5">{accessedCount}</div>
          </div>
        </div>
        {mostRecent && (
          <div className="mt-3 pt-2 border-t border-border flex items-center gap-2 text-[10px] text-muted-foreground">
            <Clock className="h-3 w-3" />
            <span>
              Latest: created {formatDistanceToNow(parseISO(mostRecent.createdAt), { addSuffix: true })} · audience {mostRecent.audience.toLowerCase()}
            </span>
          </div>
        )}
        {shares.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">
            No timeline shares recorded yet.
          </p>
        )}
      </CardContent>
    </Card>
  );
}

// ── Filter presets — quick-click chips for common audit queries ─────────────
// Each preset sets multiple filter fields at once + immediately applies them,
// so an auditor can start a common investigation with one click instead of
// typing into each filter field.
const PRESETS: Array<{
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  filters: Filters;
  tone: string;
}> = [
  {
    id: "today",
    label: "Today",
    icon: Clock,
    filters: { ...EMPTY_FILTERS, from: todayISODate(), to: todayISODate() },
    tone: "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20",
  },
  {
    id: "7d",
    label: "Last 7d",
    icon: Clock,
    filters: { ...EMPTY_FILTERS, from: new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10) },
    tone: "border-primary/30 bg-primary/10 text-primary hover:bg-primary/20",
  },
  {
    id: "auth",
    label: "Auth events",
    icon: Crown,
    filters: { ...EMPTY_FILTERS, action: "auth" },
    tone: "border-blue-500/30 bg-blue-500/10 text-blue-700 dark:text-blue-400 hover:bg-blue-500/20",
  },
  {
    id: "patient",
    label: "Patient access",
    icon: Users,
    filters: { ...EMPTY_FILTERS, action: "patient" },
    tone: "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 hover:bg-emerald-500/20",
  },
  {
    id: "share",
    label: "Share activity",
    icon: Share2,
    filters: { ...EMPTY_FILTERS, action: "timeline.share" },
    tone: "border-cyan-500/30 bg-cyan-500/10 text-cyan-700 dark:text-cyan-400 hover:bg-cyan-500/20",
  },
  {
    id: "consent",
    label: "Consent",
    icon: ShieldOff,
    filters: { ...EMPTY_FILTERS, action: "consent" },
    tone: "border-violet-500/30 bg-violet-500/10 text-violet-700 dark:text-violet-400 hover:bg-violet-500/20",
  },
  {
    id: "billing",
    label: "Billing",
    icon: Activity,
    filters: { ...EMPTY_FILTERS, action: "billing" },
    tone: "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-400 hover:bg-amber-500/20",
  },
];

function FilterPresets({
  onPreset,
  activeFilters,
}: {
  onPreset: (filters: Filters) => void;
  activeFilters: Filters;
}) {
  // Determine which preset is currently active by comparing filters.
  const activeId = PRESETS.find((p) =>
    p.filters.action === activeFilters.action &&
    p.filters.from === activeFilters.from &&
    p.filters.to === activeFilters.to &&
    p.filters.actor === activeFilters.actor &&
    p.filters.target === activeFilters.target
  )?.id;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        <Filter className="h-3 w-3" /> Presets
      </span>
      {PRESETS.map((preset) => {
        const Icon = preset.icon;
        const isActive = activeId === preset.id;
        return (
          <button
            key={preset.id}
            type="button"
            onClick={() => onPreset(preset.filters)}
            className={cn(
              "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium border transition-all hover:-translate-y-0.5",
              preset.tone,
              isActive && "ring-1 ring-inset ring-primary/40"
            )}
            aria-pressed={isActive}
          >
            <Icon className="h-2.5 w-2.5" />
            {preset.label}
          </button>
        );
      })}
    </div>
  );
}
