"use client";

// Ojas — Escalations worklist. This is the human-in-the-loop gate: every
// AI-proposed escalation above LOW sits here as OPEN until a coordinator
// confirms or overrides. The Care Coach agent (real LLM) drafts a response
// plan on demand. Fallbacks are honestly labeled.
import * as React from "react";
import { MotionConfig, motion } from "framer-motion";
import { toast } from "sonner";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import {
  AlertTriangle, Sparkles, Stethoscope, User, Clock, Loader2,
  CheckCircle2, ShieldAlert, Bot, ArrowLeft, ChevronRight,
  ClipboardList, Activity, Thermometer, MessageSquare, ListChecks,
  HelpCircle, PhoneCall, FileText, UserCheck, ArrowRightLeft,
} from "lucide-react";

import { api, useAuth, type OjasUser } from "@/lib/auth-context";
import { navigate } from "@/lib/router";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from "@/components/ui/sheet";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

// ── Types matching the escalations API ──────────────────────────────────────
type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type EscalationStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED";

interface Escalation {
  id: string;
  hospitalId: string;
  patientId: string;
  checkinId: string | null;
  severity: Severity;
  status: EscalationStatus;
  reason: string;
  aiProposed: boolean;
  aiConfidence: number | null;
  aiRationale: string | null;
  assignedToId: string | null;
  resolution: string | null;
  createdAt: string;
  updatedAt: string;
  acknowledgedAt: string | null;
  resolvedAt: string | null;
  type: "ESCALATION" | "GRIEVANCE" | null;
  patient: { id: string; fullName: string; surgeryType: string; age: number };
}

interface EscalationsResponse { escalations: Escalation[] }

interface CoachOutput {
  summary: string;
  suggestedSteps: string[];
  questionsToAskPatient: string[];
  whenToEscalateToPhysician: string;
  disclaimer: string;
}
interface CoachResponse {
  coach: CoachOutput;
  fallbackUsed: boolean;
  runId: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const SEVERITY_ORDER: Record<Severity, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };

function severityClass(s: Severity): string {
  switch (s) {
    case "CRITICAL": return "risk-critical";
    case "HIGH":     return "risk-high";
    case "MEDIUM":   return "risk-medium";
    case "LOW":      return "risk-low";
  }
}

function severityLabel(s: Severity): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

function statusClass(s: EscalationStatus): string {
  switch (s) {
    case "OPEN":        return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
    case "IN_PROGRESS": return "bg-primary/15 text-primary border-primary/30";
    case "RESOLVED":    return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
  }
}

function statusLabel(s: EscalationStatus): string {
  return s === "IN_PROGRESS" ? "In progress" : s.charAt(0) + s.slice(1).toLowerCase();
}

function ago(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return formatDistanceToNow(parseISO(iso), { addSuffix: true }); } catch { return "—"; }
}

function absTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return format(parseISO(iso), "d MMM yyyy · h:mm a"); } catch { return "—"; }
}

function confidencePct(c: number | null | undefined): string {
  if (c == null) return "—";
  return `${Math.round(c * 100)}%`;
}

function truncate(s: string | null | undefined, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}

function fmtDuration(from: string, to: string): string {
  try {
    const ms = parseISO(to).getTime() - parseISO(from).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m`;
    const hrs = Math.floor(mins / 60);
    const remMins = mins % 60;
    if (hrs < 24) return `${hrs}h ${remMins}m`;
    const days = Math.floor(hrs / 24);
    const remHrs = hrs % 24;
    return `${days}d ${remHrs}h`;
  } catch {
    return "—";
  }
}

// ── Page ────────────────────────────────────────────────────────────────────
export function EscalationsPage({ escalationId }: { escalationId?: string }) {
  const { user } = useAuth();
  const [data, setData] = React.useState<Escalation[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [statusFilter, setStatusFilter] = React.useState<"ALL" | EscalationStatus>("ALL");
  const [severityFilter, setSeverityFilter] = React.useState<"ALL" | Severity>("ALL");
  const [selectedId, setSelectedId] = React.useState<string | null>(escalationId ?? null);
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const [lastUpdated, setLastUpdated] = React.useState<Date | null>(null);
  const [autoRefresh, setAutoRefresh] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<EscalationsResponse>("/api/escalations/_");
      setData(r.escalations);
      setLastUpdated(new Date());
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load escalations");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  // Auto-refresh every 30s when autoRefresh is on
  React.useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      // Silent refresh — don't toggle loading state
      api<EscalationsResponse>("/api/escalations/_")
        .then((r) => { setData(r.escalations); setLastUpdated(new Date()); })
        .catch(() => {});
    }, 30000);
    return () => clearInterval(interval);
  }, [autoRefresh]);

  // Auto-select escalationId on mount if provided
  React.useEffect(() => {
    if (escalationId) setSelectedId(escalationId);
  }, [escalationId]);

  const filtered = React.useMemo(() => {
    return data
      .filter((e) => statusFilter === "ALL" || e.status === statusFilter)
      .filter((e) => severityFilter === "ALL" || e.severity === severityFilter)
      .sort((a, b) => {
        const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
        if (s !== 0) return s;
        return parseISO(b.createdAt).getTime() - parseISO(a.createdAt).getTime();
      });
  }, [data, statusFilter, severityFilter]);

  const openCount = data.filter((e) => e.status !== "RESOLVED").length;
  const criticalCount = data.filter((e) => e.severity === "CRITICAL" && e.status !== "RESOLVED").length;

  const selected = filtered.find((e) => e.id === selectedId) || data.find((e) => e.id === selectedId) || null;

  const onSelect = (id: string) => {
    setSelectedId(id);
    setMobileOpen(true);
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-6">
        {/* Header */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col md:flex-row md:items-end md:justify-between gap-4"
        >
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight flex items-center gap-2">
              <AlertTriangle className="h-6 w-6 text-primary" />
              Escalations
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {loading ? "Loading…" : (
                <>
                  <span className="font-medium text-foreground">{openCount}</span> open
                  {" · "}
                  <span className="font-medium text-rose-600 dark:text-rose-400">{criticalCount}</span> critical
                  {lastUpdated && (
                    <span className="ml-2 text-xs text-muted-foreground/70">
                      · updated {lastUpdated.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                    </span>
                  )}
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                <SelectItem value="OPEN">Open</SelectItem>
                <SelectItem value="IN_PROGRESS">In progress</SelectItem>
                <SelectItem value="RESOLVED">Resolved</SelectItem>
              </SelectContent>
            </Select>
            <Select value={severityFilter} onValueChange={(v) => setSeverityFilter(v as typeof severityFilter)}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue placeholder="Severity" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All severities</SelectItem>
                <SelectItem value="CRITICAL">Critical</SelectItem>
                <SelectItem value="HIGH">High</SelectItem>
                <SelectItem value="MEDIUM">Medium</SelectItem>
                <SelectItem value="LOW">Low</SelectItem>
              </SelectContent>
            </Select>
            <button
              onClick={() => setAutoRefresh((v) => !v)}
              className={`flex items-center gap-1.5 h-9 px-3 rounded-lg border text-xs font-medium transition-colors ${
                autoRefresh
                  ? "border-primary/30 bg-primary/5 text-primary"
                  : "border-border text-muted-foreground hover:bg-muted/50"
              }`}
              title={autoRefresh ? "Auto-refresh every 30s — click to pause" : "Auto-refresh paused — click to resume"}
            >
              <span className={`flex h-1.5 w-1.5 rounded-full ${autoRefresh ? "bg-primary animate-pulse" : "bg-muted-foreground"}`} />
              {autoRefresh ? "Live" : "Paused"}
            </button>
          </div>
        </motion.section>

        {/* Two-pane layout (desktop) / list + Sheet (mobile) */}
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_1.4fr] gap-4 lg:gap-6">
          {/* List */}
          <div>
            {loading ? (
              <ListSkeleton />
            ) : filtered.length === 0 ? (
              <EmptyState />
            ) : (
              <Card className="glass">
                <CardHeader className="pb-3">
                  <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                    <ClipboardList className="h-4 w-4" />
                    {filtered.length} {filtered.length === 1 ? "escalation" : "escalations"}
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-0">
                  <div className="max-h-[70vh] overflow-y-auto fancy-scroll divide-y divide-border">
                    {filtered.map((e) => (
                      <EscalationRow
                        key={e.id}
                        e={e}
                        active={e.id === selectedId}
                        onClick={() => onSelect(e.id)}
                      />
                    ))}
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Detail (desktop) */}
          <div className="hidden lg:block">
            {selected ? (
              <DetailPanel escalation={selected} user={user} onChanged={load} />
            ) : (
              <Card className="glass h-full">
                <CardContent className="p-10 flex flex-col items-center justify-center text-center h-full">
                  <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
                    <AlertTriangle className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="font-medium">Select an escalation</h3>
                  <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                    Pick an item from the list to review the AI proposal and confirm, override, or resolve.
                  </p>
                </CardContent>
              </Card>
            )}
          </div>
        </div>

        {/* Mobile detail sheet */}
        <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
          <SheetContent side="right" className="w-full sm:max-w-md p-0 overflow-y-auto fancy-scroll">
            <SheetHeader className="px-4 pt-4 pb-2 border-b border-border">
              <SheetTitle className="text-base">Escalation detail</SheetTitle>
              <SheetDescription className="sr-only">Review and act on this escalation</SheetDescription>
            </SheetHeader>
            {selected ? (
              <div className="p-4">
                <DetailPanel escalation={selected} user={user} onChanged={load} inSheet />
              </div>
            ) : (
              <div className="p-10 text-center text-sm text-muted-foreground">
                No escalation selected.
              </div>
            )}
          </SheetContent>
        </Sheet>
      </div>
    </MotionConfig>
  );
}

// ── List row ────────────────────────────────────────────────────────────────
function EscalationRow({ e, active, onClick }: {
  e: Escalation;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className={cn(
        "w-full text-left p-4 transition-colors hover:bg-accent/40",
        active && "bg-primary/5",
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium truncate">{e.patient.fullName}</span>
            {e.type === "GRIEVANCE" && (
              <Badge variant="outline" className="text-[10px] px-1.5 py-0">Grievance</Badge>
            )}
            {e.aiProposed && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-0.5 rounded bg-primary/15 text-primary border border-primary/30">
                    <Sparkles className="h-3 w-3" /> AI
                  </span>
                </TooltipTrigger>
                <TooltipContent>AI proposed — coordinator confirmation required</TooltipContent>
              </Tooltip>
            )}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
            <Stethoscope className="h-3 w-3" />
            {e.patient.surgeryType}
          </div>
          <div className="text-xs text-muted-foreground mt-1.5 line-clamp-2">
            {e.reason}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <Badge variant="outline" className={severityClass(e.severity)}>
            {severityLabel(e.severity)}
          </Badge>
          <Badge variant="outline" className={statusClass(e.status)}>
            {statusLabel(e.status)}
          </Badge>
          <span className="text-[10px] text-muted-foreground flex items-center gap-1">
            <Clock className="h-3 w-3" /> {ago(e.createdAt)}
          </span>
        </div>
      </div>
    </button>
  );
}

// ── Detail panel ────────────────────────────────────────────────────────────
function DetailPanel({ escalation, user, onChanged, inSheet }: {
  escalation: Escalation;
  user: OjasUser | null;
  onChanged: () => void;
  inSheet?: boolean;
}) {
  const [acting, setActing] = React.useState(false);
  const [overrideSeverity, setOverrideSeverity] = React.useState<Severity>(escalation.severity);
  const [resolveOpen, setResolveOpen] = React.useState(false);
  const [resolutionText, setResolutionText] = React.useState("");
  const [coach, setCoach] = React.useState<CoachResponse | null>(null);
  const [coachLoading, setCoachLoading] = React.useState(false);
  const [handoffOpen, setHandoffOpen] = React.useState(false);
  const [teamMembers, setTeamMembers] = React.useState<{ id: string; name: string; role: string }[]>([]);
  const [handoffTarget, setHandoffTarget] = React.useState<string>("");
  const [handoffNote, setHandoffNote] = React.useState("");

  const patch = async (body: Record<string, unknown>, successMsg: string) => {
    setActing(true);
    try {
      await api(`/api/escalations/${escalation.id}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      toast.success(successMsg);
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Action failed");
    } finally {
      setActing(false);
    }
  };

  const confirmAndOpen = () => patch({ status: "IN_PROGRESS" }, "Escalation confirmed and opened");
  const applyOverride = () => {
    if (overrideSeverity === escalation.severity) {
      toast("Pick a different severity to override.", { description: "Current severity is already " + severityLabel(escalation.severity) });
      return;
    }
    patch({ severity: overrideSeverity, status: "IN_PROGRESS" }, `Severity overridden to ${severityLabel(overrideSeverity)}`);
  };
  const assignToMe = () => patch({ assignedToId: user?.id ?? null }, "Assigned to you");
  const doResolve = async () => {
    if (!resolutionText.trim()) {
      toast.error("Please enter a resolution note");
      return;
    }
    await patch({ status: "RESOLVED", resolution: resolutionText.trim() }, "Escalation resolved");
    setResolveOpen(false);
    setResolutionText("");
  };

  const openHandoff = async () => {
    setHandoffOpen(true);
    try {
      const r = await api<{ workload: { user: { id: string; name: string; role: string }; openEscalations: number }[] }>("/api/team");
      setTeamMembers(r.workload.map((w) => ({ id: w.user.id, name: w.user.name, role: w.user.role })));
    } catch {
      toast.error("Could not load team members");
    }
  };

  const doHandoff = async () => {
    if (!handoffTarget) {
      toast.error("Select a team member to hand off to");
      return;
    }
    setActing(true);
    try {
      await api(`/api/escalations/${escalation.id}/handoff`, {
        method: "POST",
        body: JSON.stringify({ assignToId: handoffTarget, note: handoffNote || undefined }),
      });
      toast.success("Escalation handed off");
      setHandoffOpen(false);
      setHandoffTarget("");
      setHandoffNote("");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Handoff failed");
    } finally {
      setActing(false);
    }
  };

  const runCoach = async () => {
    setCoachLoading(true);
    try {
      const r = await api<CoachResponse>(`/api/escalations/${escalation.id}`, { method: "POST" });
      setCoach(r);
      if (r.fallbackUsed) {
        toast("AI provider unavailable — fallback draft shown.", { description: "Review manually." });
      } else {
        toast.success("Care Coach draft ready");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Care Coach failed");
    } finally {
      setCoachLoading(false);
    }
  };

  const isMine = escalation.assignedToId === user?.id;
  const showGate = escalation.status === "OPEN" && escalation.aiProposed;

  return (
    <Card className={cn("glass", !inSheet && "h-full")}>
      <CardContent className="p-5 md:p-6 space-y-5">
        {/* Header */}
        <div className="flex flex-col gap-3">
          <button
            onClick={() => navigate("patient-detail", { patientId: escalation.patientId })}
            className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors self-start"
          >
            <ArrowLeft className="h-3 w-3" /> Patient record
          </button>
          <div className="flex items-start justify-between gap-3 flex-wrap">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">{escalation.patient.fullName}</h2>
              <p className="text-sm text-muted-foreground flex items-center gap-1.5 mt-0.5">
                <Stethoscope className="h-3.5 w-3.5" />
                {escalation.patient.surgeryType} · {escalation.patient.age}y
              </p>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline" className={severityClass(escalation.severity)}>
                {severityLabel(escalation.severity)}
              </Badge>
              <Badge variant="outline" className={statusClass(escalation.status)}>
                {statusLabel(escalation.status)}
              </Badge>
            </div>
          </div>
        </div>

        {/* Reason */}
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Reason</div>
          <p className="text-sm leading-relaxed">{escalation.reason}</p>
        </div>

        {/* AI provenance */}
        {escalation.aiProposed && (
          <Alert className="border-primary/30 bg-primary/5">
            <Sparkles className="h-4 w-4 text-primary" />
            <AlertTitle className="text-sm">AI-proposed escalation</AlertTitle>
            <AlertDescription className="text-xs space-y-1">
              <div className="flex items-center gap-2">
                <span>Confidence: <span className="font-medium">{confidencePct(escalation.aiConfidence)}</span></span>
              </div>
              {escalation.aiRationale && (
                <div className="mt-1 italic text-muted-foreground">"{escalation.aiRationale}"</div>
              )}
            </AlertDescription>
          </Alert>
        )}

        {/* Metadata grid */}
        <div className="grid grid-cols-2 gap-3 text-xs">
          <Meta icon={Clock} label="Created" value={absTime(escalation.createdAt)} sub={ago(escalation.createdAt)} />
          <Meta icon={Activity} label="Last update" value={absTime(escalation.updatedAt)} />
          {escalation.acknowledgedAt && (
            <Meta icon={UserCheck} label="Acknowledged" value={fmtDuration(escalation.createdAt, escalation.acknowledgedAt)} sub={absTime(escalation.acknowledgedAt)} />
          )}
          {escalation.resolvedAt && (
            <Meta icon={CheckCircle2} label="Resolved" value={fmtDuration(escalation.createdAt, escalation.resolvedAt)} sub={absTime(escalation.resolvedAt)} />
          )}
          <Meta icon={UserCheck} label="Assigned to" value={escalation.assignedToId ? (isMine ? "You" : "Coordinator") : "Unassigned"} />
          <Meta icon={FileText} label="Check-in" value={escalation.checkinId ? "Linked" : "Manual"} />
          {escalation.type === "GRIEVANCE" && (
            <Meta icon={ShieldAlert} label="Type" value="Grievance" />
          )}
        </div>

        {/* Human-in-the-loop gate */}
        {showGate && (
          <Alert className="border-amber-500/50 bg-amber-500/10">
            <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertTitle className="text-sm text-amber-800 dark:text-amber-200">
              AI-proposed escalation — confirm or override
            </AlertTitle>
            <AlertDescription className="text-xs text-amber-800/90 dark:text-amber-200/90">
              This escalation was proposed by the AI Escalation Orchestrator. Nothing happens until you act.
            </AlertDescription>
            <div className="mt-3 flex flex-col sm:flex-row gap-2">
              <Button size="sm" onClick={confirmAndOpen} disabled={acting} className="bg-primary text-primary-foreground hover:bg-primary/90">
                {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                Confirm &amp; open
              </Button>
              <div className="flex items-center gap-2">
                <Select value={overrideSeverity} onValueChange={(v) => setOverrideSeverity(v as Severity)}>
                  <SelectTrigger className="w-[130px] h-8">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="LOW">Low</SelectItem>
                    <SelectItem value="MEDIUM">Medium</SelectItem>
                    <SelectItem value="HIGH">High</SelectItem>
                    <SelectItem value="CRITICAL">Critical</SelectItem>
                  </SelectContent>
                </Select>
                <Button size="sm" variant="outline" onClick={applyOverride} disabled={acting}>
                  Override severity
                </Button>
              </div>
            </div>
          </Alert>
        )}

        {/* In-progress actions */}
        {escalation.status === "IN_PROGRESS" && (
          <div className="rounded-lg border border-border bg-background/60 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Activity className="h-4 w-4 text-primary" />
              Coordinator actions
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              {!isMine && (
                <Button size="sm" variant="outline" onClick={assignToMe} disabled={acting}>
                  {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <User className="h-4 w-4" />}
                  Assign to me
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={openHandoff} disabled={acting}>
                <ArrowRightLeft className="h-4 w-4" />
                Hand off
              </Button>
              <Button size="sm" onClick={() => setResolveOpen(true)} disabled={acting} className="bg-emerald-600 text-white hover:bg-emerald-700">
                <CheckCircle2 className="h-4 w-4" /> Resolve
              </Button>
            </div>
            {isMine && (
              <div className="text-xs text-muted-foreground flex items-center gap-1.5">
                <UserCheck className="h-3 w-3 text-primary" /> Assigned to you
              </div>
            )}
          </div>
        )}

        {/* Resolved view */}
        {escalation.status === "RESOLVED" && escalation.resolution && (
          <Alert className="border-emerald-500/40 bg-emerald-500/10">
            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
            <AlertTitle className="text-sm">Resolved</AlertTitle>
            <AlertDescription className="text-xs">
              <p>{escalation.resolution}</p>
              <p className="text-[10px] text-muted-foreground mt-1">{absTime(escalation.updatedAt)}</p>
            </AlertDescription>
          </Alert>
        )}

        {/* Care Coach panel */}
        <div className="pt-2 border-t border-border">
          <div className="flex items-center justify-between gap-2 mb-3">
            <div>
              <div className="text-sm font-medium flex items-center gap-1.5">
                <Bot className="h-4 w-4 text-primary" />
                Care Coach
              </div>
              <p className="text-[11px] text-muted-foreground">AI-drafted response plan for this escalation.</p>
            </div>
            <Button size="sm" variant="outline" onClick={runCoach} disabled={coachLoading}>
              {coachLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
              {coach ? "Re-draft" : "Draft response plan"}
            </Button>
          </div>

          {coachLoading && <CoachSkeleton />}

          {coach && !coachLoading && (
            <CoachResult coach={coach} />
          )}
        </div>
      </CardContent>

      {/* Resolve dialog */}
      <Dialog open={resolveOpen} onOpenChange={setResolveOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Resolve escalation</DialogTitle>
            <DialogDescription>
              Add a resolution note. This will mark the escalation as resolved and create a timeline event.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <Label htmlFor="resolution" className="text-xs">Resolution note</Label>
            <Textarea
              id="resolution"
              value={resolutionText}
              onChange={(e) => setResolutionText(e.target.value)}
              placeholder="e.g. Called patient, symptoms improving, pain controlled. No physician escalation needed."
              rows={4}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResolveOpen(false)}>Cancel</Button>
            <Button onClick={doResolve} disabled={acting || !resolutionText.trim()} className="bg-emerald-600 text-white hover:bg-emerald-700">
              {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
              Resolve
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Hand off dialog */}
      <Dialog open={handoffOpen} onOpenChange={setHandoffOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ArrowRightLeft className="h-4 w-4 text-primary" />
              Hand off escalation
            </DialogTitle>
            <DialogDescription>
              Transfer this escalation to another team member. They will be notified and the assignment will update immediately.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs font-medium mb-1.5 block">Assign to</Label>
              <Select value={handoffTarget} onValueChange={setHandoffTarget}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select team member" />
                </SelectTrigger>
                <SelectContent>
                  {teamMembers.filter((m) => m.id !== user?.id).map((m) => (
                    <SelectItem key={m.id} value={m.id}>
                      {m.name} · {m.role.replace("_", " ").toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-medium mb-1.5 block">Note (optional)</Label>
              <Textarea
                value={handoffNote}
                onChange={(e) => setHandoffNote(e.target.value)}
                placeholder="Context for the next coordinator…"
                rows={3}
                className="resize-none"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setHandoffOpen(false)}>Cancel</Button>
            <Button onClick={doHandoff} disabled={acting || !handoffTarget}>
              {acting ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRightLeft className="h-4 w-4" />}
              Hand off
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}

// ── Coach result card ───────────────────────────────────────────────────────
function CoachResult({ coach }: { coach: CoachResponse }) {
  const o = coach.coach;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-3"
    >
      {coach.fallbackUsed && (
        <Alert className="border-amber-500/50 bg-amber-500/10">
          <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <AlertTitle className="text-xs text-amber-800 dark:text-amber-200">FALLBACK — provider unavailable</AlertTitle>
          <AlertDescription className="text-[11px] text-amber-800/90 dark:text-amber-200/90">
            AI provider unavailable — this is a FALLBACK draft. Review manually.
          </AlertDescription>
        </Alert>
      )}

      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
        <div className="flex items-start gap-2">
          <Sparkles className="h-4 w-4 text-primary mt-0.5 flex-shrink-0" />
          <p className="text-sm leading-relaxed">{o.summary}</p>
        </div>

        {o.suggestedSteps.length > 0 && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
              <ListChecks className="h-3.5 w-3.5" /> Suggested steps
            </div>
            <ul className="space-y-1">
              {o.suggestedSteps.map((s, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <span className="flex-shrink-0 mt-0.5 h-4 w-4 rounded-full bg-primary/20 text-primary text-[10px] font-semibold flex items-center justify-center">{i + 1}</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {o.questionsToAskPatient.length > 0 && (
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1.5">
              <HelpCircle className="h-3.5 w-3.5" /> Questions to ask patient
            </div>
            <ul className="space-y-1">
              {o.questionsToAskPatient.map((q, i) => (
                <li key={i} className="text-sm flex items-start gap-2">
                  <PhoneCall className="h-3.5 w-3.5 text-muted-foreground mt-0.5 flex-shrink-0" />
                  <span>{q}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5">
            <ShieldAlert className="h-3.5 w-3.5" /> Escalate to physician when
          </div>
          <p className="text-sm">{o.whenToEscalateToPhysician}</p>
        </div>

        <div className="pt-2 border-t border-primary/20">
          <p className="text-[11px] italic text-muted-foreground flex items-center gap-1.5">
            <Sparkles className="h-3 w-3" />
            {o.disclaimer || "AI decision support — not a diagnosis. Confirm clinical decisions with the treating physician."}
          </p>
        </div>
      </div>
    </motion.div>
  );
}

// ── Small pieces ────────────────────────────────────────────────────────────
function Meta({ icon: Icon, label, value, sub }: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  sub?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-background/40 p-2.5">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className="text-xs font-medium mt-0.5">{value}</div>
      {sub && <div className="text-[10px] text-muted-foreground mt-0.5">{sub}</div>}
    </div>
  );
}

function CoachSkeleton() {
  return (
    <div className="space-y-2">
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-5/6" />
      <Skeleton className="h-16 w-full rounded-lg" />
    </div>
  );
}

function ListSkeleton() {
  return (
    <Card className="glass">
      <CardContent className="p-4 space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center justify-between gap-3 border-b border-border pb-3 last:border-0">
            <div className="space-y-1.5 flex-1">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-3 w-20" />
              <Skeleton className="h-3 w-48" />
            </div>
            <div className="flex flex-col gap-1.5 items-end">
              <Skeleton className="h-5 w-16 rounded-full" />
              <Skeleton className="h-5 w-16 rounded-full" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function EmptyState() {
  return (
    <Card className="glass">
      <CardContent className="p-10 flex flex-col items-center justify-center text-center">
        <div className="h-12 w-12 rounded-full bg-emerald-500/15 flex items-center justify-center mb-3">
          <CheckCircle2 className="h-6 w-6 text-emerald-600 dark:text-emerald-400" />
        </div>
        <h3 className="font-medium">No escalations</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">
          Patients are recovering well. AI-triaged check-ins will surface here automatically when action is needed.
        </p>
      </CardContent>
    </Card>
  );
}
