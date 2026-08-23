"use client";

// Ojas — Check-ins console. Coordinators log patient responses here; each
// recorded response triggers the real Triage Agent + Escalation Orchestrator
// (real LLM). The Conversational Agent (real LLM) can interpret a free-text
// WhatsApp reply into structured data. Fallbacks are honestly labeled.
import * as React from "react";
import { MotionConfig, motion } from "framer-motion";
import { toast } from "sonner";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import {
  CheckSquare, Stethoscope, Clock, Loader2, Sparkles, Bot,
  AlertTriangle, CheckCircle2, Thermometer, Activity, MessageSquare,
  Search, PhoneCall, ShieldAlert, ArrowRight, Send, ListChecks,
  HelpCircle, Pill, X, XCircle,
} from "lucide-react";

import { api } from "@/lib/auth-context";
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
import { Slider } from "@/components/ui/slider";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

// ── Types matching the check-ins API ────────────────────────────────────────
type CheckinStatus = "SCHEDULED" | "SENT" | "ANSWERED" | "MISSED";
type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

interface Checkin {
  id: string;
  hospitalId: string;
  patientId: string;
  scheduledFor: string;
  sentAt: string | null;
  answeredAt: string | null;
  status: CheckinStatus;
  painLevel: number | null;
  temperature: number | null;
  symptomsText: string | null;
  freeText: string | null;
  aiRiskScore: number | null;
  aiRiskLevel: RiskLevel | null;
  aiRationale: string | null;
  aiRunId: string | null;
  createdAt: string;
  updatedAt: string;
  patient: { id: string; fullName: string; surgeryType: string; age: number };
}

interface CheckinsResponse { checkins: Checkin[] }

interface TriageOutput {
  riskLevel: RiskLevel;
  confidence: number;
  rationale: string;
  recommendedAction?: string;
  redFlags?: string[];
}
interface EscalationLite {
  id: string;
  severity: RiskLevel;
  status: "OPEN" | "IN_PROGRESS" | "RESOLVED";
  reason: string;
}
interface TriageResponse {
  checkin: Checkin;
  triage: TriageOutput;
  fallbackUsed: boolean;
  escalation: EscalationLite | null;
}

interface ConversationalOutput {
  interpretedPainLevel: number | null;
  interpretedTemperature: number | null;
  interpretedSymptoms: string[];
  needsClarification: boolean;
  clarificationQuestion: string | null;
  summary: string;
}
interface ConversationalResponse {
  interpretation: ConversationalOutput;
  fallbackUsed: boolean;
  runId: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function statusClass(s: CheckinStatus): string {
  switch (s) {
    case "SCHEDULED": return "bg-muted text-muted-foreground border-border";
    case "SENT":      return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
    case "ANSWERED":  return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
    case "MISSED":    return "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30";
  }
}

function statusLabel(s: CheckinStatus): string {
  return s.charAt(0) + s.slice(1).toLowerCase();
}

function riskClass(r: RiskLevel | null | undefined): string {
  switch (r) {
    case "LOW":      return "risk-low";
    case "MEDIUM":   return "risk-medium";
    case "HIGH":     return "risk-high";
    case "CRITICAL": return "risk-critical";
    default:         return "bg-muted text-muted-foreground";
  }
}

function ago(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return formatDistanceToNow(parseISO(iso), { addSuffix: true }); } catch { return "—"; }
}

function absTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return format(parseISO(iso), "d MMM yyyy · h:mm a"); } catch { return "—"; }
}

function isDueToday(iso: string): boolean {
  try {
    const t = parseISO(iso).getTime();
    const now = Date.now();
    return Math.abs(t - now) <= 24 * 3600 * 1000;
  } catch {
    return false;
  }
}

function painColor(p: number): string {
  if (p <= 3) return "text-emerald-600 dark:text-emerald-400";
  if (p <= 6) return "text-amber-600 dark:text-amber-400";
  return "text-rose-600 dark:text-rose-400";
}

// ── Page ────────────────────────────────────────────────────────────────────
export function CheckinsPage() {
  const [data, setData] = React.useState<Checkin[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [statusFilter, setStatusFilter] = React.useState<"ALL" | CheckinStatus>("ALL");
  const [search, setSearch] = React.useState("");
  const [tab, setTab] = React.useState<"due" | "all">("due");

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<CheckinsResponse>("/api/checkins");
      setData(r.checkins);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load check-ins");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const filtered = React.useMemo(() => {
    let list = data;
    if (tab === "due") list = list.filter((c) => c.status === "SCHEDULED" && isDueToday(c.scheduledFor));
    if (statusFilter !== "ALL") list = list.filter((c) => c.status === statusFilter);
    const q = search.trim().toLowerCase();
    if (q) {
      list = list.filter((c) =>
        c.patient.fullName.toLowerCase().includes(q) ||
        c.patient.surgeryType.toLowerCase().includes(q)
      );
    }
    return list;
  }, [data, tab, statusFilter, search]);

  const dueTodayCount = data.filter((c) => c.status === "SCHEDULED" && isDueToday(c.scheduledFor)).length;

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
              <CheckSquare className="h-6 w-6 text-primary" />
              Check-ins
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {loading ? "Loading…" : (
                <>
                  <span className="font-medium text-foreground">{dueTodayCount}</span> due today
                  {" · "}
                  <span className="font-medium text-foreground">{data.length}</span> total
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="h-4 w-4 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <Input
                placeholder="Search patient or surgery…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 w-[220px] h-9"
              />
            </div>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="w-[140px] h-9">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All statuses</SelectItem>
                <SelectItem value="SCHEDULED">Scheduled</SelectItem>
                <SelectItem value="ANSWERED">Answered</SelectItem>
                <SelectItem value="MISSED">Missed</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </motion.section>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={(v) => setTab(v as "due" | "all")}>
          <TabsList>
            <TabsTrigger value="due">
              Due today
              {dueTodayCount > 0 && (
                <Badge variant="secondary" className="ml-2 h-5 px-1.5 text-[10px]">{dueTodayCount}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="all">All</TabsTrigger>
          </TabsList>
        </Tabs>

        {/* List */}
        {loading ? (
          <ListSkeleton />
        ) : filtered.length === 0 ? (
          <EmptyState tab={tab} />
        ) : (
          <Card className="glass">
            <CardContent className="p-0">
              <div className="divide-y divide-border">
                {filtered.map((c) => (
                  <CheckinRow key={c.id} c={c} onChanged={load} />
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </MotionConfig>
  );
}

// ── Row ─────────────────────────────────────────────────────────────────────
function CheckinRow({ c, onChanged }: { c: Checkin; onChanged: () => void }) {
  const [logOpen, setLogOpen] = React.useState(false);
  const [convOpen, setConvOpen] = React.useState(false);
  const [dispatching, setDispatching] = React.useState(false);

  const dispatch = async () => {
    setDispatching(true);
    try {
      const r = await api<{ note?: string }>(`/api/checkins/${c.id}/dispatch`, { method: "POST" });
      toast.success("Check-in dispatched", { description: r.note || "Sent to patient" });
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Dispatch failed");
    } finally {
      setDispatching(false);
    }
  };

  return (
    <>
      <div className="p-4 flex flex-col sm:flex-row sm:items-center gap-3 hover:bg-accent/30 transition-colors">
        {/* Patient */}
        <button
          onClick={() => navigate("patient-detail", { patientId: c.patientId })}
          className="flex-1 min-w-0 text-left"
        >
          <div className="flex items-center gap-2">
            <span className="font-medium truncate">{c.patient.fullName}</span>
            <Badge variant="outline" className={statusClass(c.status)}>
              {statusLabel(c.status)}
            </Badge>
          </div>
          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1.5">
            <Stethoscope className="h-3 w-3" />
            {c.patient.surgeryType} · {c.patient.age}y
          </div>
          <div className="text-[11px] text-muted-foreground mt-1 flex items-center gap-1.5">
            <Clock className="h-3 w-3" />
            Scheduled {absTime(c.scheduledFor)} ({ago(c.scheduledFor)})
            {c.answeredAt && <span className="ml-1">· answered {ago(c.answeredAt)}</span>}
          </div>
        </button>

        {/* Right: risk + actions */}
        <div className="flex items-center gap-2 flex-wrap">
          {c.status === "ANSWERED" && c.aiRiskLevel && (
            <Tooltip>
              <TooltipTrigger asChild>
                <Badge variant="outline" className={riskClass(c.aiRiskLevel)}>
                  <Sparkles className="h-3 w-3" /> {c.aiRiskLevel.toLowerCase()} risk
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs">
                <p className="text-xs">{c.aiRationale || "AI triage rationale unavailable."}</p>
              </TooltipContent>
            </Tooltip>
          )}
          {c.status === "ANSWERED" && c.painLevel != null && (
            <Badge variant="outline" className="bg-muted text-muted-foreground">
              Pain <span className={cn("font-semibold ml-1", painColor(c.painLevel))}>{c.painLevel}/10</span>
            </Badge>
          )}
          {c.status === "ANSWERED" && c.temperature != null && (
            <Badge variant="outline" className="bg-muted text-muted-foreground">
              <Thermometer className="h-3 w-3" /> {c.temperature.toFixed(1)}°C
            </Badge>
          )}

          {c.status === "SCHEDULED" && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={dispatch} disabled={dispatching}>
                {dispatching ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Send now
              </Button>
              <Button size="sm" variant="outline" onClick={() => setConvOpen(true)}>
                <MessageSquare className="h-4 w-4" /> Interpret
              </Button>
              <Button size="sm" onClick={() => setLogOpen(true)} className="bg-primary text-primary-foreground hover:bg-primary/90">
                <PhoneCall className="h-4 w-4" /> Log response
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Log-response dialog */}
      <LogResponseDialog
        open={logOpen}
        onOpenChange={setLogOpen}
        checkin={c}
        onChanged={onChanged}
      />

      {/* Conversational agent dialog */}
      <ConversationalDialog
        open={convOpen}
        onOpenChange={setConvOpen}
        checkin={c}
      />
    </>
  );
}

// ── Log-response dialog ─────────────────────────────────────────────────────
function LogResponseDialog({ open, onOpenChange, checkin, onChanged }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  checkin: Checkin;
  onChanged: () => void;
}) {
  const [pain, setPain] = React.useState(2);
  const [temp, setTemp] = React.useState<string>("");
  const [symptoms, setSymptoms] = React.useState("");
  const [freeText, setFreeText] = React.useState("");
  const [medsTaken, setMedsTaken] = React.useState<boolean | null>(null);
  const [medsNote, setMedsNote] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<TriageResponse | null>(null);

  // Reset form when reopened
  React.useEffect(() => {
    if (open) {
      setPain(2);
      setTemp("");
      setSymptoms("");
      setFreeText("");
      setMedsTaken(null);
      setMedsNote("");
      setResult(null);
    }
  }, [open, checkin.id]);

  const submit = async () => {
    setSubmitting(true);
    try {
      const tempNum = temp.trim() ? parseFloat(temp) : undefined;
      if (tempNum != null && (tempNum < 30 || tempNum > 45)) {
        toast.error("Temperature must be between 30 and 45 °C");
        setSubmitting(false);
        return;
      }
      const r = await api<TriageResponse>("/api/checkins", {
        method: "POST",
        body: JSON.stringify({
          checkinId: checkin.id,
          painLevel: pain,
          temperature: tempNum,
          symptomsText: symptoms.trim() || undefined,
          freeText: freeText.trim() || undefined,
          medsTaken: medsTaken, // boolean | null
          medsNote: medsNote.trim() || undefined,
        }),
      });
      setResult(r);
      if (r.fallbackUsed) {
        toast("AI provider unavailable — fallback triage applied.", { description: "Review the result manually." });
      } else {
        toast.success(`AI triage complete — ${r.triage.riskLevel.toLowerCase()} risk`);
      }
      if (r.escalation) {
        toast(`Escalation created (${r.escalation.severity.toLowerCase()})`, {
          description: "Open the Escalations page to confirm or override.",
        });
      }
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to submit response");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setResult(null); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto fancy-scroll">
        <DialogHeader>
          <DialogTitle>Log check-in response</DialogTitle>
          <DialogDescription>
            {checkin.patient.fullName} · {checkin.patient.surgeryType} · scheduled {absTime(checkin.scheduledFor)}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <TriageResultView result={result} />
        ) : (
          <div className="space-y-4 py-2">
            {/* Pain */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="text-xs">Pain level (0–10)</Label>
                <span className={cn("text-sm font-semibold", painColor(pain))}>{pain}</span>
              </div>
              <Slider
                value={[pain]}
                min={0}
                max={10}
                step={1}
                onValueChange={(v) => setPain(v[0])}
              />
              <div className="flex justify-between text-[10px] text-muted-foreground mt-1">
                <span>0 · No pain</span>
                <span>10 · Worst imaginable</span>
              </div>
            </div>

            {/* Temperature */}
            <div>
              <Label htmlFor="temp" className="text-xs">Temperature (°C)</Label>
              <Input
                id="temp"
                type="number"
                inputMode="decimal"
                step="0.1"
                min={30}
                max={45}
                placeholder="e.g. 37.2"
                value={temp}
                onChange={(e) => setTemp(e.target.value)}
                className="mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Leave blank if not measured.</p>
            </div>

            {/* Symptoms */}
            <div>
              <Label htmlFor="symptoms" className="text-xs">Symptoms (comma-separated)</Label>
              <Input
                id="symptoms"
                placeholder="e.g. swelling, mild fever, redness around wound"
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
                className="mt-1"
              />
            </div>

            {/* Free text */}
            <div>
              <Label htmlFor="free" className="text-xs">Patient notes (free text)</Label>
              <Textarea
                id="free"
                placeholder="Anything the patient shared verbally or over WhatsApp…"
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                rows={3}
                className="mt-1"
              />
            </div>

            {/* Medication adherence */}
            <div className="rounded-lg border border-border bg-background/40 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <Label className="text-xs flex items-center gap-1.5">
                  <Pill className="h-3.5 w-3.5 text-primary" />
                  Did the patient take their medications?
                </Label>
                {medsTaken !== null && (
                  <button
                    type="button"
                    onClick={() => setMedsTaken(null)}
                    className="text-[10px] text-muted-foreground hover:text-foreground flex items-center gap-0.5"
                    aria-label="Clear medication response"
                  >
                    <X className="h-3 w-3" /> Clear
                  </button>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setMedsTaken(true)}
                  className={cn(
                    "h-9 rounded-md border text-sm font-medium transition-colors flex items-center justify-center gap-1.5",
                    medsTaken === true
                      ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/40"
                      : "bg-background border-border text-muted-foreground hover:bg-emerald-500/10 hover:text-emerald-700 dark:hover:text-emerald-300"
                  )}
                >
                  <CheckCircle2 className="h-4 w-4" /> Yes
                </button>
                <button
                  type="button"
                  onClick={() => setMedsTaken(false)}
                  className={cn(
                    "h-9 rounded-md border text-sm font-medium transition-colors flex items-center justify-center gap-1.5",
                    medsTaken === false
                      ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/40"
                      : "bg-background border-border text-muted-foreground hover:bg-rose-500/10 hover:text-rose-700 dark:hover:text-rose-300"
                  )}
                >
                  <XCircle className="h-4 w-4" /> No
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground">
                No active medications on file for this patient.
              </p>
              <div>
                <Label htmlFor="meds-note" className="text-[11px] text-muted-foreground">
                  Medication note (optional)
                </Label>
                <Input
                  id="meds-note"
                  placeholder="e.g. Forgot evening dose, took with food"
                  value={medsNote}
                  onChange={(e) => setMedsNote(e.target.value)}
                  className="mt-1 h-8 text-xs"
                />
              </div>
            </div>

            <Alert className="border-primary/30 bg-primary/5">
              <Sparkles className="h-4 w-4 text-primary" />
              <AlertTitle className="text-xs">Real AI triage on submit</AlertTitle>
              <AlertDescription className="text-[11px]">
                Submitting runs the Triage Agent and Escalation Orchestrator (real LLM calls). Above-LOW risk creates an escalation that requires your confirmation before anything happens.
              </AlertDescription>
            </Alert>
          </div>
        )}

        <DialogFooter>
          {result ? (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
              {result.escalation && (
                <Button onClick={() => navigate("escalations", { escalationId: result.escalation!.id })} className="bg-primary text-primary-foreground hover:bg-primary/90">
                  Open escalation <ArrowRight className="h-4 w-4" />
                </Button>
              )}
            </>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={submit} disabled={submitting} className="bg-primary text-primary-foreground hover:bg-primary/90">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                Submit &amp; run AI triage
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Triage result card ──────────────────────────────────────────────────────
function TriageResultView({ result }: { result: TriageResponse }) {
  const t = result.triage;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-3 py-1"
    >
      {result.fallbackUsed && (
        <Alert className="border-amber-500/50 bg-amber-500/10">
          <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <AlertTitle className="text-xs text-amber-800 dark:text-amber-200">FALLBACK — provider unavailable</AlertTitle>
          <AlertDescription className="text-[11px] text-amber-800/90 dark:text-amber-200/90">
            AI provider was unavailable. A rule-based fallback triage was applied — review manually.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex items-center gap-2">
        <Badge variant="outline" className={riskClass(t.riskLevel)}>
          <Sparkles className="h-3 w-3" /> {t.riskLevel.toLowerCase()} risk
        </Badge>
        <span className="text-xs text-muted-foreground">
          confidence {Math.round(t.confidence * 100)}%
        </span>
      </div>

      <div>
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1">Rationale</div>
        <p className="text-sm leading-relaxed">{t.rationale}</p>
      </div>

      {t.recommendedAction && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5">
            <ListChecks className="h-3.5 w-3.5" /> Recommended action
          </div>
          <p className="text-sm">{t.recommendedAction}</p>
        </div>
      )}

      {t.redFlags && t.redFlags.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground mb-1 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> Red flags
          </div>
          <ul className="space-y-1">
            {t.redFlags.map((r, i) => (
              <li key={i} className="text-sm flex items-start gap-2">
                <span className="flex-shrink-0 mt-1.5 h-1.5 w-1.5 rounded-full bg-rose-500" />
                <span>{r}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.escalation ? (
        <Alert className="border-rose-500/40 bg-rose-500/10">
          <AlertTriangle className="h-4 w-4 text-rose-600 dark:text-rose-400" />
          <AlertTitle className="text-xs">Escalation created — confirmation required</AlertTitle>
          <AlertDescription className="text-[11px] space-y-1">
            <div>Severity: <span className="font-medium">{result.escalation.severity}</span></div>
            <div className="italic text-muted-foreground">"{result.escalation.reason}"</div>
            <div className="text-[10px] text-muted-foreground mt-1">
              Open the Escalations page to confirm or override this AI proposal.
            </div>
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="border-emerald-500/40 bg-emerald-500/10">
          <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
          <AlertTitle className="text-xs">No escalation needed</AlertTitle>
          <AlertDescription className="text-[11px]">
            Triage assessed this response as LOW risk — no escalation was created.
          </AlertDescription>
        </Alert>
      )}

      <p className="text-[11px] italic text-muted-foreground flex items-center gap-1.5 pt-1">
        <Sparkles className="h-3 w-3" />
        AI decision support — not a diagnosis. Confirm clinical decisions with the treating physician.
      </p>
    </motion.div>
  );
}

// ── Conversational agent dialog ─────────────────────────────────────────────
function ConversationalDialog({ open, onOpenChange, checkin }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  checkin: Checkin;
}) {
  const [question, setQuestion] = React.useState("How is your pain today, and do you have any fever or discomfort?");
  const [reply, setReply] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);
  const [result, setResult] = React.useState<ConversationalResponse | null>(null);

  React.useEffect(() => {
    if (open) {
      setReply("");
      setResult(null);
    }
  }, [open, checkin.id]);

  const submit = async () => {
    if (!reply.trim()) {
      toast.error("Paste a patient reply first");
      return;
    }
    setSubmitting(true);
    try {
      const r = await api<ConversationalResponse>("/api/ai/conversational", {
        method: "POST",
        body: JSON.stringify({
          patientId: checkin.patientId,
          questionAsked: question,
          patientReply: reply,
        }),
      });
      setResult(r);
      if (r.fallbackUsed) {
        toast("AI provider unavailable — fallback interpretation shown.", { description: "Review the raw reply manually." });
      } else {
        toast.success("Interpretation ready");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Interpretation failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { onOpenChange(v); if (!v) setResult(null); }}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto fancy-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquare className="h-4 w-4 text-primary" />
            Interpret free-text reply
          </DialogTitle>
          <DialogDescription>
            {checkin.patient.fullName} · {checkin.patient.surgeryType}. The Conversational Agent (real LLM) interprets WhatsApp-style replies into structured check-in data.
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <ConversationalResult result={result} />
        ) : (
          <div className="space-y-3 py-2">
            <div>
              <Label htmlFor="q" className="text-xs">Question asked</Label>
              <Textarea
                id="q"
                value={question}
                onChange={(e) => setQuestion(e.target.value)}
                rows={2}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="r" className="text-xs">Patient reply (paste from WhatsApp)</Label>
              <Textarea
                id="r"
                placeholder="e.g. 'Dard thoda kam hai, subah se 100.4 fever tha, ab normal. Davai le li.'"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                rows={4}
                className="mt-1"
              />
              <p className="text-[10px] text-muted-foreground mt-1">Hinglish and regional phrasing is supported.</p>
            </div>
            <Alert className="border-primary/30 bg-primary/5">
              <Bot className="h-4 w-4 text-primary" />
              <AlertTitle className="text-xs">Real LLM call</AlertTitle>
              <AlertDescription className="text-[11px]">
                The interpretation is produced by the Conversational Agent via a real LLM call. Fallbacks are honestly labeled if the provider is unavailable.
              </AlertDescription>
            </Alert>
          </div>
        )}

        <DialogFooter>
          {result ? (
            <Button variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
          ) : (
            <>
              <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
              <Button onClick={submit} disabled={submitting} className="bg-primary text-primary-foreground hover:bg-primary/90">
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Interpret reply
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ConversationalResult({ result }: { result: ConversationalResponse }) {
  const o = result.interpretation;
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
      className="space-y-3 py-1"
    >
      {result.fallbackUsed && (
        <Alert className="border-amber-500/50 bg-amber-500/10">
          <ShieldAlert className="h-4 w-4 text-amber-600 dark:text-amber-400" />
          <AlertTitle className="text-xs text-amber-800 dark:text-amber-200">FALLBACK — provider unavailable</AlertTitle>
          <AlertDescription className="text-[11px] text-amber-800/90 dark:text-amber-200/90">
            AI provider was unavailable. The raw reply is preserved for manual review.
          </AlertDescription>
        </Alert>
      )}

      <div className="rounded-lg border border-primary/30 bg-primary/5 p-4 space-y-3">
        <p className="text-sm leading-relaxed">{o.summary}</p>

        <div className="grid grid-cols-3 gap-3 text-xs">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Pain</div>
            <div className="text-sm font-medium mt-0.5">
              {o.interpretedPainLevel != null ? (
                <span className={painColor(o.interpretedPainLevel)}>{o.interpretedPainLevel}/10</span>
              ) : "—"}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Temperature</div>
            <div className="text-sm font-medium mt-0.5 flex items-center gap-1">
              {o.interpretedTemperature != null ? (
                <><Thermometer className="h-3 w-3" /> {o.interpretedTemperature.toFixed(1)}°C</>
              ) : "—"}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground">Symptoms</div>
            <div className="text-sm font-medium mt-0.5">
              {o.interpretedSymptoms.length > 0 ? o.interpretedSymptoms.join(", ") : "—"}
            </div>
          </div>
        </div>

        {o.needsClarification && o.clarificationQuestion && (
          <Alert className="border-amber-500/40 bg-amber-500/10">
            <HelpCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
            <AlertTitle className="text-xs">Clarification needed</AlertTitle>
            <AlertDescription className="text-[11px]">{o.clarificationQuestion}</AlertDescription>
          </Alert>
        )}

        <p className="text-[11px] italic text-muted-foreground flex items-center gap-1.5 pt-1">
          <Sparkles className="h-3 w-3" />
          AI decision support — not a diagnosis. Confirm clinical decisions with the treating physician.
        </p>
      </div>
    </motion.div>
  );
}

// ── Skeletons / empty ───────────────────────────────────────────────────────
function ListSkeleton() {
  return (
    <Card className="glass">
      <CardContent className="p-0 divide-y divide-border">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="p-4 flex items-center justify-between gap-3">
            <div className="space-y-1.5 flex-1">
              <Skeleton className="h-4 w-40" />
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-3 w-56" />
            </div>
            <div className="flex gap-2">
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-8 w-28" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function EmptyState({ tab }: { tab: "due" | "all" }) {
  return (
    <Card className="glass">
      <CardContent className="p-10 flex flex-col items-center justify-center text-center">
        <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
          <CheckCircle2 className="h-6 w-6 text-primary" />
        </div>
        <h3 className="font-medium">
          {tab === "due" ? "Nothing due today" : "No check-ins found"}
        </h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-xs">
          {tab === "due"
            ? "All scheduled check-ins for the next 24 hours have been answered. Patients are staying engaged."
            : "Adjust the filters above, or enroll a new patient to generate a check-in schedule."}
        </p>
      </CardContent>
    </Card>
  );
}
