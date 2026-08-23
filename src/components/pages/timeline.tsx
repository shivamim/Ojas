"use client";

import * as React from "react";
import { MotionConfig, motion } from "framer-motion";
import { toast } from "sonner";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import {
  Clock, Search, User, CheckSquare, AlertTriangle, Bot,
  Shield, Settings, Mail, Loader2, ClipboardList, Filter,
} from "lucide-react";

import { api, useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

// ── Types matching /api/audit ───────────────────────────────────────────────
interface AuditLog {
  id: string;
  hospitalId: string | null;
  actorId: string | null;
  actor: { name: string; email: string } | null;
  action: string;
  target: string | null;
  detail: string | null;
  ip: string | null;
  createdAt: string;
  hospital: { name: string } | null;
}

interface AuditResponse { logs: AuditLog[] }

// ── Action categorisation ───────────────────────────────────────────────────
type Category = "auth" | "patient" | "checkin" | "escalation" | "ai" | "hospital" | "settings" | "invite" | "other";

function categorise(action: string): Category {
  const a = action.toLowerCase();
  if (a.startsWith("auth.")) return "auth";
  if (a.startsWith("patient.")) return "patient";
  if (a.startsWith("checkin.")) return "checkin";
  if (a.startsWith("escalation.")) return "escalation";
  if (a.startsWith("ai.")) return "ai";
  if (a.startsWith("hospital.")) return "hospital";
  if (a.startsWith("settings.")) return "settings";
  if (a.startsWith("invite.")) return "invite";
  return "other";
}

function categoryMeta(c: Category): { Icon: React.ComponentType<{ className?: string }>; cls: string; label: string } {
  switch (c) {
    case "auth":       return { Icon: User, cls: "bg-primary/15 text-primary", label: "Auth" };
    case "patient":    return { Icon: User, cls: "bg-primary/15 text-primary", label: "Patient" };
    case "checkin":    return { Icon: CheckSquare, cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", label: "Check-in" };
    case "escalation": return { Icon: AlertTriangle, cls: "risk-high", label: "Escalation" };
    case "ai":         return { Icon: Bot, cls: "bg-primary/15 text-primary", label: "AI" };
    case "hospital":   return { Icon: Shield, cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300", label: "Hospital" };
    case "settings":   return { Icon: Settings, cls: "bg-muted text-muted-foreground", label: "Settings" };
    case "invite":     return { Icon: Mail, cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300", label: "Invite" };
    default:           return { Icon: ClipboardList, cls: "bg-muted text-muted-foreground", label: "Other" };
  }
}

function actionLabel(action: string): string {
  // "patient.enroll" → "Patient · enroll"
  const [ns, verb] = action.split(".");
  if (!verb) return action;
  return `${ns.charAt(0).toUpperCase()}${ns.slice(1)} · ${verb.replace(/_/g, " ")}`;
}

function absTime(iso: string): string {
  try { return format(parseISO(iso), "d MMM yyyy · h:mm a"); } catch { return iso; }
}

function ago(iso: string): string {
  try { return formatDistanceToNow(parseISO(iso), { addSuffix: true }); } catch { return "—"; }
}

// ── Page ────────────────────────────────────────────────────────────────────
export function TimelinePage() {
  const { user } = useAuth();
  const isSuperadmin = user?.role === "SUPER_ADMIN";
  const [logs, setLogs] = React.useState<AuditLog[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [filter, setFilter] = React.useState<"all" | Category>("all");
  const [search, setSearch] = React.useState("");

  React.useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const r = await api<AuditResponse>("/api/audit?limit=100");
        setLogs(r.logs);
      } catch (err) {
        toast.error(err instanceof Error ? err.message : "Failed to load audit log");
        setLogs([]);
      } finally {
        setLoading(false);
      }
    })();
  }, []);

  const filtered = React.useMemo(() => {
    if (!logs) return [];
    let list = logs;
    if (filter !== "all") list = list.filter((l) => categorise(l.action) === filter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((l) =>
        l.action.toLowerCase().includes(q) ||
        (l.actor?.name || "").toLowerCase().includes(q) ||
        (l.actor?.email || "").toLowerCase().includes(q) ||
        (l.detail || "").toLowerCase().includes(q) ||
        (l.target || "").toLowerCase().includes(q) ||
        (l.hospital?.name || "").toLowerCase().includes(q)
      );
    }
    return list;
  }, [logs, filter, search]);

  const categoryCounts = React.useMemo(() => {
    const c: Record<string, number> = {};
    (logs || []).forEach((l) => {
      const k = categorise(l.action);
      c[k] = (c[k] || 0) + 1;
    });
    return c;
  }, [logs]);

  const FILTERS: { value: "all" | Category; label: string }[] = [
    { value: "all", label: "All" },
    { value: "auth", label: "Auth" },
    { value: "patient", label: "Patients" },
    { value: "checkin", label: "Check-ins" },
    { value: "escalation", label: "Escalations" },
    { value: "ai", label: "AI" },
    { value: "settings", label: "Settings" },
    { value: "invite", label: "Invites" },
    { value: "hospital", label: "Hospitals" },
  ];

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-6">
        {/* Header */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Activity timeline</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Cross-patient audit log. Every coordinator action, AI run, and
            escalation is recorded for compliance.
          </p>
        </motion.section>

        {/* Search + filter */}
        <section className="space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by action, actor, target, or detail…"
              className="pl-9"
              aria-label="Search audit log"
            />
          </div>

          {/* Mobile: select dropdown for category filter */}
          <div className="md:hidden">
            <Select value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
              <SelectTrigger className="w-full" aria-label="Filter by category">
                <Filter className="h-4 w-4 mr-2" />
                <SelectValue placeholder="All categories" />
              </SelectTrigger>
              <SelectContent>
                {FILTERS.map((f) => (
                  <SelectItem key={f.value} value={f.value}>
                    {f.label}
                    {f.value !== "all" && categoryCounts[f.value] ? ` (${categoryCounts[f.value]})` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Desktop: tabs */}
          <div className="hidden md:block">
            <Tabs value={filter} onValueChange={(v) => setFilter(v as typeof filter)}>
              <TabsList className="overflow-x-auto fancy-scroll h-auto flex-wrap">
                {FILTERS.map((f) => (
                  <TabsTrigger key={f.value} value={f.value} className="gap-1.5">
                    {f.label}
                    {f.value !== "all" && categoryCounts[f.value] ? (
                      <Badge variant="secondary" className="text-[10px] h-4 px-1.5">
                        {categoryCounts[f.value]}
                      </Badge>
                    ) : null}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
          </div>
        </section>

        {/* List */}
        <Card className="glass">
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4 text-primary" />
              {filtered.length} {filtered.length === 1 ? "event" : "events"}
            </CardTitle>
            <CardDescription>
              {filter === "all"
                ? "Showing all recent activity in scope of your hospital."
                : `Filtered to: ${FILTERS.find((f) => f.value === filter)?.label}.`}
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            <div className="max-h-[70vh] overflow-y-auto fancy-scroll">
              {loading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />)}
                </div>
              ) : filtered.length === 0 ? (
                <EmptyState search={search} />
              ) : (
                <ol className="relative border-l border-border ml-6 p-4 space-y-4">
                  {filtered.map((log, i) => {
                    const cat = categorise(log.action);
                    const meta = categoryMeta(cat);
                    return (
                      <motion.li
                        key={log.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: Math.min(i * 0.02, 0.3) }}
                        className="ml-5"
                      >
                        <span className={cn(
                          "absolute -left-[13px] flex items-center justify-center h-6 w-6 rounded-full ring-4 ring-background",
                          meta.cls
                        )}>
                          <meta.Icon className="h-3 w-3" />
                        </span>
                        <div className="rounded-lg border border-border p-3 hover:bg-muted/40 transition-colors">
                          <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
                            <div className="min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <Badge variant="outline" className={cn("text-[10px]", meta.cls)}>
                                  {meta.label}
                                </Badge>
                                <span className="font-medium text-sm">{actionLabel(log.action)}</span>
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                By {log.actor?.name || "system"}
                                {log.actor?.email ? <span className="hidden sm:inline"> · {log.actor.email}</span> : null}
                              </div>
                            </div>
                            <div className="text-xs text-muted-foreground sm:text-right flex-shrink-0">
                              <div>{ago(log.createdAt)}</div>
                              <div className="hidden sm:block text-[10px]">{absTime(log.createdAt)}</div>
                            </div>
                          </div>
                          {log.detail && (
                            <p className="text-sm text-muted-foreground mt-2 break-words">{log.detail}</p>
                          )}
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-2 text-[11px] text-muted-foreground">
                            {log.target && <span>Target: <code className="font-mono">{log.target.slice(0, 12)}{log.target.length > 12 ? "…" : ""}</code></span>}
                            {isSuperadmin && log.hospital?.name && (
                              <span className="inline-flex items-center gap-1">
                                <Shield className="h-3 w-3" /> {log.hospital.name}
                              </span>
                            )}
                            {log.ip && <span>IP: {log.ip}</span>}
                          </div>
                        </div>
                      </motion.li>
                    );
                  })}
                </ol>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Loading guard parity (kept import alive for skeleton swaps) */}
        {loading && <span className="sr-only"><Loader2 className="h-4 w-4" /> Loading</span>}
      </div>
    </MotionConfig>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────────
function EmptyState({ search }: { search: string }) {
  return (
    <div className="p-10 text-center">
      <div className="mx-auto h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
        <Clock className="h-7 w-7 text-muted-foreground" />
      </div>
      <h3 className="font-semibold">No activity</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
        {search.trim()
          ? "No audit events match your search. Try a different keyword or clear the filter."
          : "No audit events have been recorded in your scope yet."}
      </p>
    </div>
  );
}
