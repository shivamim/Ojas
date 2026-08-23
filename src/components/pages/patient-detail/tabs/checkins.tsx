"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { parseISO } from "date-fns";
import {
  PhoneCall, Activity, Thermometer, MessageSquare, ClipboardList,
  Sparkles, AlertTriangle, CheckCircle2, ChevronRight, Loader2,
} from "lucide-react";

import { api } from "@/lib/auth-context";
import { navigate } from "@/lib/router";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Slider } from "@/components/ui/slider";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

import type { Checkin, PatientDetail, TriageResponse } from "../types";
import { absDate, ago, checkinStatusBadge, riskBadgeClass } from "../helpers";
import { Field } from "../shared";

// ── Check-ins tab ───────────────────────────────────────────────────────────
export function CheckinsTab({ patient, onChange }: { patient: PatientDetail; onChange: () => void }) {
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [activeCheckin, setActiveCheckin] = React.useState<Checkin | null>(null);
  const [triageResult, setTriageResult] = React.useState<TriageResponse | null>(null);

  const openLogDialog = (c: Checkin) => {
    setActiveCheckin(c);
    setTriageResult(null);
    setDialogOpen(true);
  };

  const onLogged = (result: TriageResponse) => {
    setTriageResult(result);
    onChange(); // refresh underlying patient data
  };

  if (patient.checkins.length === 0) {
    return (
      <Card className="glass">
        <CardContent className="p-10 text-center">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
            <PhoneCall className="h-7 w-7 text-muted-foreground" />
          </div>
          <h3 className="font-semibold">No check-ins scheduled</h3>
          <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
            Check-ins are scheduled automatically at enrollment based on your
            hospital&apos;s recovery window and cadence.
          </p>
        </CardContent>
      </Card>
    );
  }

  // Newest first
  const sorted = [...patient.checkins].sort(
    (a, b) => parseISO(b.scheduledFor).getTime() - parseISO(a.scheduledFor).getTime()
  );

  return (
    <>
      <Card className="glass">
        <CardContent className="p-0">
          <div className="divide-y divide-border">
            {sorted.map((c) => (
              <CheckinRow key={c.id} checkin={c} onLog={() => openLogDialog(c)} />
            ))}
          </div>
        </CardContent>
      </Card>

      {activeCheckin && (
        <LogResponseDialog
          open={dialogOpen}
          onOpenChange={(o) => {
            setDialogOpen(o);
            if (!o) { setActiveCheckin(null); setTriageResult(null); }
          }}
          checkin={activeCheckin}
          patientName={patient.fullName}
          triageResult={triageResult}
          onLogged={onLogged}
        />
      )}
    </>
  );
}

function CheckinRow({ checkin: c, onLog }: { checkin: Checkin; onLog: () => void }) {
  const risk = c.aiRiskLevel;
  return (
    <div className="p-4 flex flex-col gap-3 md:flex-row md:items-start md:gap-5">
      <div className="md:w-44 flex-shrink-0">
        <div className="text-sm font-medium">{absDate(c.scheduledFor)}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{ago(c.scheduledFor)}</div>
        <Badge variant="outline" className={cn("mt-2", checkinStatusBadge(c.status))}>
          {c.status.charAt(0) + c.status.slice(1).toLowerCase()}
        </Badge>
      </div>

      <div className="flex-1 min-w-0 grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
        <Field icon={Activity} label="Pain" value={c.painLevel != null ? `${c.painLevel}/10` : "—"} />
        <Field icon={Thermometer} label="Temp" value={c.temperature != null ? `${c.temperature}°C` : "—"} />
        <Field icon={MessageSquare} label="Symptoms" value={c.symptomsText || "—"} truncate />
        <Field icon={ClipboardList} label="Notes" value={c.freeText || "—"} truncate />
      </div>

      <div className="flex flex-col items-start md:items-end gap-2 md:w-44 flex-shrink-0">
        {risk ? (
          <TooltipProvider>
            <UITooltip>
              <TooltipTrigger asChild>
                <Badge className={riskBadgeClass(risk)}>
                  <Sparkles className="h-3 w-3" /> AI: {risk}
                </Badge>
              </TooltipTrigger>
              <TooltipContent className="max-w-xs text-left whitespace-pre-wrap">
                {c.aiRationale || "AI rationale unavailable."}
              </TooltipContent>
            </UITooltip>
          </TooltipProvider>
        ) : (
          <span className="text-xs text-muted-foreground">No AI triage yet</span>
        )}
        {c.status === "SCHEDULED" && (
          <Button size="sm" variant="outline" onClick={onLog}>
            <PhoneCall className="h-3.5 w-3.5" /> Log response
          </Button>
        )}
      </div>
    </div>
  );
}

// ── Log response dialog ─────────────────────────────────────────────────────
function LogResponseDialog({
  open, onOpenChange, checkin, patientName, triageResult, onLogged,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  checkin: Checkin;
  patientName: string;
  triageResult: TriageResponse | null;
  onLogged: (r: TriageResponse) => void;
}) {
  const [pain, setPain] = React.useState<number>(0);
  const [temperature, setTemperature] = React.useState<string>("");
  const [symptoms, setSymptoms] = React.useState<string>("");
  const [freeText, setFreeText] = React.useState<string>("");
  const [submitting, setSubmitting] = React.useState(false);

  // Reset state when the dialog is freshly opened for a different checkin.
  React.useEffect(() => {
    if (open) {
      setPain(0);
      setTemperature("");
      setSymptoms("");
      setFreeText("");
    }
  }, [open, checkin.id]);

  const submit = async () => {
    setSubmitting(true);
    try {
      const tempNum = temperature.trim() ? parseFloat(temperature) : undefined;
      if (tempNum !== undefined && (Number.isNaN(tempNum) || tempNum < 30 || tempNum > 45)) {
        toast.error("Temperature must be between 30 and 45 °C");
        setSubmitting(false);
        return;
      }
      const body: Record<string, unknown> = {
        checkinId: checkin.id,
        painLevel: pain,
      };
      if (tempNum !== undefined) body.temperature = tempNum;
      if (symptoms.trim()) body.symptomsText = symptoms.trim();
      if (freeText.trim()) body.freeText = freeText.trim();

      const r = await api<TriageResponse>("/api/checkins", {
        method: "POST",
        body: JSON.stringify(body),
      });
      onLogged(r);
      if (r.fallbackUsed) {
        toast("AI provider unavailable — fallback triage applied.", {
          description: "Risk label is rule-based; review manually.",
        });
      } else {
        toast.success(`AI triage complete: ${r.triage.riskLevel} risk`);
      }
      if (r.escalation) {
        toast.warning(`Escalation created (${r.escalation.severity})`, {
          description: "A coordinator must confirm this AI-proposed escalation.",
        });
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to record check-in");
    } finally {
      setSubmitting(false);
    }
  };

  const painColor = pain >= 8 ? "text-rose-600" : pain >= 5 ? "text-amber-600" : "text-primary";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto fancy-scroll">
        <DialogHeader>
          <DialogTitle>Log patient response</DialogTitle>
          <DialogDescription>
            {patientName} · scheduled {absDate(checkin.scheduledFor)}. Recording
            the patient&apos;s reply triggers the AI Triage Agent and Escalation Orchestrator.
          </DialogDescription>
        </DialogHeader>

        {triageResult ? (
          <TriageResultView result={triageResult} onDone={() => onOpenChange(false)} />
        ) : (
          <div className="space-y-5">
            {/* Pain slider */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="pain">Pain level (0-10)</Label>
                <span className={cn("text-2xl font-bold tabular-nums", painColor)}>{pain}</span>
              </div>
              <Slider
                id="pain"
                min={0} max={10} step={1}
                value={[pain]}
                onValueChange={(v) => setPain(v[0])}
                aria-label="Pain level"
              />
              <div className="flex justify-between text-[10px] text-muted-foreground">
                <span>0 — None</span>
                <span>5 — Moderate</span>
                <span>10 — Worst imaginable</span>
              </div>
            </div>

            {/* Temperature */}
            <div className="space-y-1.5">
              <Label htmlFor="temp">Temperature (°C)</Label>
              <Input
                id="temp"
                type="number"
                inputMode="decimal"
                step="0.1"
                min={30}
                max={45}
                placeholder="e.g. 37.2"
                value={temperature}
                onChange={(e) => setTemperature(e.target.value)}
              />
            </div>

            {/* Symptoms */}
            <div className="space-y-1.5">
              <Label htmlFor="symptoms">Symptoms</Label>
              <Textarea
                id="symptoms"
                placeholder="e.g. mild swelling at incision site, no fever"
                value={symptoms}
                onChange={(e) => setSymptoms(e.target.value)}
                rows={2}
              />
            </div>

            {/* Free text */}
            <div className="space-y-1.5">
              <Label htmlFor="free">Patient notes (free text)</Label>
              <Textarea
                id="free"
                placeholder="Anything the patient said in their own words…"
                value={freeText}
                onChange={(e) => setFreeText(e.target.value)}
                rows={3}
              />
            </div>

            <Alert>
              <Sparkles className="h-4 w-4" />
              <AlertTitle>AI is decision support, not a diagnosis.</AlertTitle>
              <AlertDescription>
                Above-LOW risk requires coordinator confirmation before becoming
                an active escalation.
              </AlertDescription>
            </Alert>
          </div>
        )}

        {!triageResult && (
          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={submitting} className="glow-primary">
              {submitting ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Triaging…</>
              ) : (
                <>Submit response</>
              )}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

function TriageResultView({ result, onDone }: { result: TriageResponse; onDone: () => void }) {
  const r = result.triage;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-4"
    >
      <div className="flex items-center gap-3">
        <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center", riskBadgeClass(r.riskLevel))}>
          <Sparkles className="h-6 w-6" />
        </div>
        <div>
          <div className="text-sm text-muted-foreground">AI Triage result</div>
          <div className="text-xl font-semibold">{r.riskLevel} risk</div>
        </div>
      </div>

      {result.fallbackUsed && (
        <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Fallback triage used</AlertTitle>
          <AlertDescription>
            The AI provider was unavailable. A rule-based fallback produced this
            risk label. Review the inputs manually before acting.
          </AlertDescription>
        </Alert>
      )}

      <div className="space-y-1.5">
        <div className="text-xs uppercase tracking-wider text-muted-foreground">Rationale</div>
        <p className="text-sm leading-relaxed">{r.rationale}</p>
      </div>

      {r.recommendedAction && (
        <div className="space-y-1.5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Recommended action</div>
          <p className="text-sm leading-relaxed">{r.recommendedAction}</p>
        </div>
      )}

      {r.redFlags && r.redFlags.length > 0 && (
        <div className="space-y-1.5">
          <div className="text-xs uppercase tracking-wider text-muted-foreground">Red flags</div>
          <ul className="text-sm space-y-1 list-disc pl-5">
            {r.redFlags.map((f, i) => <li key={i}>{f}</li>)}
          </ul>
        </div>
      )}

      {result.escalation ? (
        <Alert className="border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-200">
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Escalation created · {result.escalation.severity}</AlertTitle>
          <AlertDescription>
            AI proposed this escalation. A coordinator must confirm it before it
            becomes active. {result.escalation.reason}
          </AlertDescription>
        </Alert>
      ) : (
        <Alert className="border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200">
          <CheckCircle2 className="h-4 w-4" />
          <AlertTitle>No escalation</AlertTitle>
          <AlertDescription>
            Risk is LOW — no escalation was created.
          </AlertDescription>
        </Alert>
      )}

      <div className="flex gap-2 justify-end pt-2">
        <Button variant="outline" onClick={onDone}>Close</Button>
        {result.escalation && (
          <Button onClick={() => navigate("escalations", { escalationId: result.escalation!.id })}>
            Open escalation <ChevronRight className="h-4 w-4" />
          </Button>
        )}
      </div>
    </motion.div>
  );
}
