"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  AlertCircle, AlertTriangle, ShieldCheck, ShieldAlert, Activity,
  RefreshCw, CheckCircle2, ClipboardList, Loader2, ArrowLeft,
} from "lucide-react";

import { api } from "@/lib/auth-context";
import { navigate } from "@/lib/router";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

import type { RiskAssessmentResponse } from "./types";
import { riskBadgeClass } from "./helpers";

// ── Skeleton + not found ────────────────────────────────────────────────────
export function DetailSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-5 w-40" />
      <Card className="glass-strong">
        <CardContent className="p-6 space-y-4">
          <Skeleton className="h-8 w-64" />
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} className="h-12" />)}
          </div>
        </CardContent>
      </Card>
      <Skeleton className="h-10 w-full max-w-md" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-48" />)}
      </div>
    </div>
  );
}

export function NotFoundView() {
  return (
    <Card className="glass">
      <CardContent className="p-10 text-center">
        <div className="mx-auto h-14 w-14 rounded-2xl bg-rose-500/10 flex items-center justify-center mb-3">
          <AlertTriangle className="h-7 w-7 text-rose-600 dark:text-rose-300" />
        </div>
        <h3 className="text-lg font-semibold">Patient not found</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
          This patient may have been removed, or you don&apos;t have access to their records.
        </p>
        <Button onClick={() => navigate("patients")} className="mt-5">
          <ArrowLeft className="h-4 w-4" /> Back to patients
        </Button>
      </CardContent>
    </Card>
  );
}

// ── Readmit dialog (shared: also used by the patient list) ──────────────────
export function ReadmitDialog({
  patientId,
  patientName,
  open,
  onOpenChange,
  onDone,
}: {
  patientId: string;
  patientName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}) {
  const [reason, setReason] = React.useState("");
  const [days, setDays] = React.useState(14);
  const [submitting, setSubmitting] = React.useState(false);

  // Reset transient state when the dialog closes so reopening starts fresh.
  React.useEffect(() => {
    if (!open) {
      setReason("");
      setDays(14);
      setSubmitting(false);
    }
  }, [open]);

  const submit = async () => {
    setSubmitting(true);
    try {
      const r = await api<{ message: string; newCheckinsScheduled: number }>(
        `/api/patients/${patientId}/readmit`,
        {
          method: "POST",
          body: JSON.stringify({
            reason: reason.trim() || undefined,
            newRecoveryDays: days,
          }),
        }
      );
      toast.success(r.message, {
        description: `${r.newCheckinsScheduled} new check-ins scheduled.`,
      });
      onOpenChange(false);
      onDone?.();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to mark patient as readmitted"
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto fancy-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-rose-500" />
            Mark {patientName} as readmitted
          </DialogTitle>
          <DialogDescription>
            This will reset the patient&apos;s recovery window and schedule a fresh
            set of check-ins starting today.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="readmit-reason">Reason for readmission (optional)</Label>
            <Textarea
              id="readmit-reason"
              placeholder="e.g. wound infection, persistent fever, uncontrolled pain…"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="readmit-days">New recovery window (days)</Label>
            <Input
              id="readmit-days"
              type="number"
              inputMode="numeric"
              min={1}
              max={90}
              step={1}
              value={days}
              onChange={(e) =>
                setDays(
                  Math.max(1, Math.min(90, Number(e.target.value) || 14))
                )
              }
            />
            <p className="text-xs text-muted-foreground">
              Daily check-ins will be scheduled for this many days starting today.
            </p>
          </div>

          <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Heads up</AlertTitle>
            <AlertDescription>
              This will mark the patient as readmitted, reset their discharge date
              to today, and generate a new check-in schedule for the recovery
              window. This action is logged in the audit trail.
            </AlertDescription>
          </Alert>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={submit}
            disabled={submitting}
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Marking…
              </>
              ) : (
                <>
                  <AlertCircle className="h-4 w-4" /> Mark as readmitted
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
}

// ── Risk assessment dialog ──────────────────────────────────────────────────
// Calls /api/patients/[id]/risk-stratification on open and shows the AI
// risk-stratification result. Honours fallbackUsed by surfacing an amber
// banner so the coordinator knows to review manually.
export function RiskAssessmentDialog({
  patientId,
  patientName,
  open,
  onOpenChange,
  onDone,
}: {
  patientId: string;
  patientName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDone?: () => void;
}) {
  const [result, setResult] = React.useState<RiskAssessmentResponse | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const run = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await api<RiskAssessmentResponse>(
        `/api/patients/${patientId}/risk-stratification`,
        { method: "POST", body: JSON.stringify({}) }
      );
      setResult(r);
      onDone?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to run risk assessment";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [patientId, onDone]);

  // Auto-trigger when dialog opens. Reset transient state on close so
  // reopening starts fresh.
  React.useEffect(() => {
    if (open) {
      setResult(null);
      setError(null);
      setLoading(true);
      // Fire-and-forget; run() handles its own loading state.
      run();
      return () => {};
    }
    // Defer reset so the close animation can finish.
    const t = setTimeout(() => {
      setResult(null);
      setError(null);
      setLoading(false);
    }, 200);
    return () => clearTimeout(t);
  }, [open, run]);

  const assessment = result?.assessment;
  const riskLevel = assessment?.riskLevel;
  const score = assessment?.riskScore ?? 0;
  const confidencePct =
    assessment ? Math.round(assessment.confidence * 100) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto fancy-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldAlert className="h-5 w-5 text-primary" />
            Risk assessment · {patientName}
          </DialogTitle>
          <DialogDescription>
            AI-predicted 30-day readmission risk based on patient demographics, surgery type, and comorbidities.
          </DialogDescription>
        </DialogHeader>

        {/* Loading state */}
        {loading && !assessment && (
          <div className="flex flex-col items-center justify-center py-14 text-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary mb-3" />
            <p className="text-sm font-medium">Running AI risk assessment…</p>
            <p className="text-xs text-muted-foreground mt-1">
              This usually takes a few seconds.
            </p>
          </div>
        )}

        {/* Error state */}
        {error && !loading && !assessment && (
          <Alert variant="default" className="border-rose-500/40 bg-rose-500/10 text-rose-800 dark:text-rose-200">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Assessment failed</AlertTitle>
            <AlertDescription>
              {error} You can retry, or proceed with manual clinical judgement.
            </AlertDescription>
          </Alert>
        )}

        {/* Result */}
        {assessment && (
          <div className="space-y-4">
            {/* Fallback banner */}
            {result?.fallbackUsed && (
              <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200">
                <AlertTriangle className="h-4 w-4" />
                <AlertTitle>Provider was unavailable — fallback used</AlertTitle>
                <AlertDescription>
                  AI provider was unavailable — this is a <strong>FALLBACK</strong>{" "}
                  assessment using rule-based heuristics. Review manually.
                </AlertDescription>
              </Alert>
            )}

            {/* Risk level badge + score */}
            <div className="rounded-lg border border-border bg-card/40 p-4 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Risk level
                  </div>
                  <Badge
                    className={cn(
                      "mt-1 text-sm font-semibold uppercase tracking-wider px-3 py-1.5",
                      riskBadgeClass(riskLevel)
                    )}
                  >
                    {riskLevel ?? "—"}
                  </Badge>
                </div>
                <div className="text-right">
                  <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                    Confidence
                  </div>
                  <div className="text-lg font-semibold tabular-nums">
                    {confidencePct !== null ? `${confidencePct}%` : "—"}
                  </div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-muted-foreground">Risk score</span>
                  <span className="font-semibold tabular-nums">
                    {score}<span className="text-muted-foreground font-normal">/100</span>
                  </span>
                </div>
                <Progress
                  value={score}
                  className={cn(
                    "h-2",
                    score >= 75 ? "[&>div]:bg-rose-500"
                    : score >= 50 ? "[&>div]:bg-amber-500"
                    : "[&>div]:bg-emerald-500"
                  )}
                />
              </div>
            </div>

            {/* Risk + protective factors in a 2-col grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {/* Risk factors */}
              <div className="rounded-lg border border-rose-500/30 bg-rose-500/5 p-3">
                <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold uppercase tracking-wider text-rose-700 dark:text-rose-300">
                  <AlertTriangle className="h-3.5 w-3.5" /> Risk factors
                </div>
                {assessment.riskFactors.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">None identified.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {assessment.riskFactors.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-rose-500/15 text-rose-600 dark:text-rose-400 mt-0.5 flex-shrink-0">
                          <AlertCircle className="h-2.5 w-2.5" />
                        </span>
                        <span className="leading-snug">{f}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Protective factors */}
              <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/5 p-3">
                <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-300">
                  <ShieldCheck className="h-3.5 w-3.5" /> Protective factors
                </div>
                {assessment.protectiveFactors.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">None identified.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {assessment.protectiveFactors.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm">
                        <span className="inline-flex items-center justify-center h-4 w-4 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 mt-0.5 flex-shrink-0">
                          <CheckCircle2 className="h-2.5 w-2.5" />
                        </span>
                        <span className="leading-snug">{f}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {/* Recommended actions (checkbox-style, read-only) */}
            <div className="rounded-lg border border-border bg-card/40 p-3">
              <div className="flex items-center gap-1.5 mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                <ClipboardList className="h-3.5 w-3.5" /> Recommended actions
              </div>
              {assessment.recommendedActions.length === 0 ? (
                <p className="text-xs text-muted-foreground italic">No specific actions recommended.</p>
              ) : (
                <ul className="space-y-2">
                  {assessment.recommendedActions.map((a, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm">
                      <Checkbox
                        checked={false}
                        disabled
                        className="mt-0.5 pointer-events-none"
                        aria-hidden
                      />
                      <span className="leading-snug">{a}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* Monitoring frequency (highlighted) */}
            <div className="rounded-lg border border-primary/30 bg-primary/5 p-3 flex items-start gap-3">
              <span className="flex items-center justify-center h-8 w-8 rounded-md bg-primary/15 text-primary flex-shrink-0">
                <Activity className="h-4 w-4" />
              </span>
              <div className="flex-1 min-w-0">
                <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                  Recommended monitoring frequency
                </div>
                <div className="text-sm font-medium mt-0.5">
                  {assessment.monitoringFrequency || "—"}
                </div>
              </div>
            </div>

            {/* Disclaimer (prominent, amber-tinted) */}
            <Alert className="border-amber-500/40 bg-amber-500/10 text-amber-800 dark:text-amber-200">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Disclaimer</AlertTitle>
              <AlertDescription>
                {assessment.disclaimer || "AI decision support — not a diagnosis."}
              </AlertDescription>
            </Alert>
          </div>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Close
          </Button>
          <Button
            variant="default"
            onClick={run}
            disabled={loading}
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Re-running…
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" /> Re-run assessment
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
