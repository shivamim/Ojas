"use client";

import * as React from "react";
import { MotionConfig, motion } from "framer-motion";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  ArrowLeft, Printer, FileText, Phone, Calendar, ShieldCheck,
  Activity, Thermometer, HeartPulse, AlertTriangle, CheckCircle2,
  Stethoscope, UserPlus, PhoneCall, Bot, Clock,
} from "lucide-react";

import { api } from "@/lib/auth-context";
import { navigate } from "@/lib/router";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// ── Types matching /api/patients/[id]/discharge contract ────────────────────
type Severity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
type EscalationStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED";

interface DischargeSummary {
  hospital: { name: string; city: string | null; nabhLevel: string | null };
  patient: {
    fullName: string;
    age: number;
    gender: string | null;
    mobileMasked: string;
    surgeryType: string;
    surgeryDate: string;
    dischargeDate: string;
    comorbidities: string | null;
    status: string;
    dpdpaConsent: boolean;
    consentAt: string | null;
    recoveryDay: number;
  };
  dischargeSummary: {
    diagnosis: string | null;
    proceduresPerformed: string | null;
    medicationsOnDischarge: string | null;
    followUpInstructions: string | null;
    conditionAtDischarge: string | null;
    dietaryInstructions: string | null;
    activityRestrictions: string | null;
    warningSigns: string | null;
    emergencyContact: string | null;
    attendingDoctorName: string | null;
  } | null;
  followUpPlans: Array<{
    id: string;
    plannedDate: string;
    mode: string;
    responsibleClinician: string | null;
    notes: string | null;
    status: string;
  }>;
  consents: Array<{
    id: string;
    purpose: string;
    grantedAt: string | null;
    revokedAt: string | null;
  }>;
  recovery: {
    totalCheckinsScheduled: number;
    checkinsAnswered: number;
    checkinsMissed: number;
    responseRate: number | null;
    avgPain: number | null;
    maxPain: number | null;
    latestPain: number | null;
    maxTemp: number | null;
    feverEpisodes: number;
  };
  escalations: {
    total: number;
    open: number;
    resolved: number;
    critical: number;
    items: Array<{
      severity: Severity;
      status: EscalationStatus;
      reason: string;
      createdAt: string;
      resolution: string | null;
    }>;
  };
  timeline: Array<{
    eventType: string;
    title: string;
    detail: string | null;
    occurredAt: string;
  }>;
  generatedAt: string;
  disclaimer: string;
}

interface DischargeResponse {
  summary: DischargeSummary;
}

// ── Page ────────────────────────────────────────────────────────────────────
export function DischargeSummaryPage({ patientId }: { patientId: string }) {
  const [data, setData] = React.useState<DischargeSummary | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const d = await api<DischargeResponse>(`/api/patients/${patientId}/discharge`);
      setData(d.summary);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to load discharge summary";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  React.useEffect(() => { load(); }, [load]);

  const handlePrint = React.useCallback(() => {
    toast("Opening print dialog — save as PDF to export");
    // give the toast a beat before the browser blocks on the print dialog
    setTimeout(() => window.print(), 350);
  }, []);

  if (loading) return <LoadingSkeleton patientId={patientId} />;
  if (error || !data) return <ErrorState message={error} patientId={patientId} />;

  const p = data.patient;
  const r = data.recovery;
  const esc = data.escalations;
  const ds = data.dischargeSummary;
  const fup = data.followUpPlans;
  const consents = data.consents;

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-6">
        {/* Print-only header — visible only when printing */}
        <div className="hidden print:block">
          <PrintHeader summary={data} />
        </div>

        {/* On-screen header — hidden in print */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 print:hidden"
        >
          <div>
            <button
              onClick={() => navigate("patient-detail", { patientId })}
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
            >
              <ArrowLeft className="h-4 w-4" /> Back to patient
            </button>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">
              Discharge summary
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              {p.fullName} · Day {p.recoveryDay} of recovery
            </p>
          </div>
          <Button onClick={handlePrint} className="glow-primary">
            <Printer className="h-4 w-4" /> Print / Save as PDF
          </Button>
        </motion.div>

        {/* Patient card */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
        >
          <Card className="glass print:shadow-none print:border">
            <CardHeader className="border-b border-border print:border-border">
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-4 w-4 text-primary" /> Patient
              </CardTitle>
            </CardHeader>
            <CardContent className="p-5 md:p-6">
              <div className="flex items-center gap-3 flex-wrap mb-4">
                <h2 className="text-xl font-semibold tracking-tight">{p.fullName}</h2>
                <Badge variant="outline" className={patientStatusBadgeClass(p.status)}>
                  {patientStatusLabel(p.status)}
                </Badge>
                {p.dpdpaConsent && (
                  <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                    <ShieldCheck className="h-3 w-3" /> DPDPA consent
                  </Badge>
                )}
              </div>
              <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-x-6 gap-y-3 text-sm">
                <InfoLine label="Age / Gender" value={`${p.age}y · ${p.gender || "—"}`} />
                <InfoLine
                  label="Mobile"
                  value={
                    <span className="inline-flex items-center gap-1.5 tabular-nums">
                      <Phone className="h-3 w-3" /> {p.mobileMasked}
                    </span>
                  }
                />
                <InfoLine
                  label="Surgery"
                  value={
                    <span className="inline-flex items-center gap-1.5">
                      <Stethoscope className="h-3 w-3" /> {p.surgeryType}
                    </span>
                  }
                />
                <InfoLine label="Comorbidities" value={p.comorbidities || "None"} />
                <InfoLine
                  label="Surgery date"
                  value={
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="h-3 w-3" /> {fmtDate(p.surgeryDate)}
                    </span>
                  }
                />
                <InfoLine
                  label="Discharge date"
                  value={
                    <span className="inline-flex items-center gap-1.5">
                      <Calendar className="h-3 w-3" /> {fmtDate(p.dischargeDate)}
                    </span>
                  }
                />
                <InfoLine
                  label="Recovery day"
                  value={<span className="font-medium text-primary">Day {p.recoveryDay}</span>}
                />
                <InfoLine
                  label="DPDPA consent"
                  value={p.consentAt ? fmtDate(p.consentAt) : "Not recorded"}
                />
              </div>
            </CardContent>
          </Card>
        </motion.section>

        {/* Recovery summary card */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.1 }}
        >
          <Card className="glass print:shadow-none print:border">
            <CardHeader className="border-b border-border">
              <CardTitle className="flex items-center gap-2">
                <HeartPulse className="h-4 w-4 text-primary" /> Recovery summary
              </CardTitle>
              <CardDescription>
                Check-in engagement, pain, and temperature trends since discharge.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 md:p-6">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-6">
                {/* Check-in stats */}
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Check-ins
                  </div>
                  <MiniStat label="Scheduled" value={r.totalCheckinsScheduled} icon={Calendar} />
                  <MiniStat
                    label="Answered"
                    value={r.checkinsAnswered}
                    icon={CheckCircle2}
                    tone="primary"
                  />
                  <MiniStat
                    label="Missed"
                    value={r.checkinsMissed}
                    icon={Clock}
                    tone={r.checkinsMissed > 0 ? "amber" : undefined}
                  />
                  <MiniStat
                    label="Response rate"
                    value={r.responseRate !== null ? `${r.responseRate}%` : "—"}
                    icon={Activity}
                  />
                </div>
                {/* Pain stats */}
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Pain (0–10)
                  </div>
                  <MiniStat
                    label="Average"
                    value={r.avgPain ?? "—"}
                    icon={Activity}
                    tone="primary"
                  />
                  <MiniStat
                    label="Maximum"
                    value={r.maxPain ?? "—"}
                    icon={AlertTriangle}
                    tone={r.maxPain !== null && r.maxPain >= 7 ? "amber" : undefined}
                  />
                  <MiniStat
                    label="Latest"
                    value={r.latestPain ?? "—"}
                    icon={HeartPulse}
                  />
                </div>
                {/* Temp stats */}
                <div className="space-y-2">
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    Temperature
                  </div>
                  <MiniStat
                    label="Maximum"
                    value={r.maxTemp !== null ? `${r.maxTemp}°C` : "—"}
                    icon={Thermometer}
                    tone={r.maxTemp !== null && r.maxTemp >= 38 ? "critical" : undefined}
                  />
                  <MiniStat
                    label="Fever episodes (≥38°C)"
                    value={r.feverEpisodes}
                    icon={AlertTriangle}
                    tone={r.feverEpisodes > 0 ? "critical" : undefined}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.section>

        {/* Discharge summary details card */}
        {ds && (
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.12 }}
          >
            <Card className="glass print:shadow-none print:border">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" /> Discharge details
                </CardTitle>
                <CardDescription>
                  Clinical summary at the time of discharge.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 md:p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3 text-sm">
                  {ds.diagnosis && <InfoLine label="Diagnosis" value={ds.diagnosis} />}
                  {ds.proceduresPerformed && <InfoLine label="Procedures performed" value={ds.proceduresPerformed} />}
                  {ds.medicationsOnDischarge && <InfoLine label="Medications on discharge" value={ds.medicationsOnDischarge} />}
                  {ds.followUpInstructions && <InfoLine label="Follow-up instructions" value={ds.followUpInstructions} />}
                  {ds.conditionAtDischarge && <InfoLine label="Condition at discharge" value={ds.conditionAtDischarge} />}
                  {ds.dietaryInstructions && <InfoLine label="Dietary instructions" value={ds.dietaryInstructions} />}
                  {ds.activityRestrictions && <InfoLine label="Activity restrictions" value={ds.activityRestrictions} />}
                  {ds.warningSigns && <InfoLine label="Warning signs" value={ds.warningSigns} />}
                  {ds.emergencyContact && <InfoLine label="Emergency contact" value={ds.emergencyContact} />}
                  {ds.attendingDoctorName && <InfoLine label="Attending doctor" value={ds.attendingDoctorName} />}
                </div>
              </CardContent>
            </Card>
          </motion.section>
        )}

        {/* Follow-up plans card */}
        {fup.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.13 }}
          >
            <Card className="glass print:shadow-none print:border">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-primary" /> Follow-up plan
                </CardTitle>
                <CardDescription>
                  {fup.length} planned follow-up {fup.length === 1 ? "visit" : "visits"}.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 md:p-6 space-y-3">
                {fup.map((plan) => (
                  <div key={plan.id} className="rounded-lg border border-border bg-card/60 p-3 print:break-inside-avoid">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <Badge variant="outline" className={cn(
                        plan.status === "COMPLETED"
                          ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                          : plan.status === "CANCELLED"
                            ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30"
                            : "bg-primary/15 text-primary border-primary/30"
                      )}>
                        {plan.status}
                      </Badge>
                      <Badge variant="outline">{plan.mode}</Badge>
                      <span className="text-[11px] text-muted-foreground ml-auto">
                        {fmtDate(plan.plannedDate)}
                      </span>
                    </div>
                    {plan.responsibleClinician && (
                      <p className="text-xs text-muted-foreground">
                        Clinician: {plan.responsibleClinician}
                      </p>
                    )}
                    {plan.notes && (
                      <p className="text-xs text-foreground mt-1">{plan.notes}</p>
                    )}
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.section>
        )}

        {/* Consents card */}
        {consents.length > 0 && (
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.14 }}
          >
            <Card className="glass print:shadow-none print:border">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4 text-primary" /> Consents
                </CardTitle>
                <CardDescription>
                  Consent records for this patient.
                </CardDescription>
              </CardHeader>
              <CardContent className="p-5 md:p-6 space-y-3">
                {consents.map((c) => (
                  <div key={c.id} className="rounded-lg border border-border bg-card/60 p-3 print:break-inside-avoid">
                    <div className="flex items-center gap-2 flex-wrap mb-1">
                      <span className="text-sm font-medium">{c.purpose}</span>
                      <Badge variant="outline" className={c.revokedAt
                        ? "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30"
                        : "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                      }>
                        {c.revokedAt ? "Revoked" : "Active"}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      {c.grantedAt && <div>Granted: {fmtDate(c.grantedAt)}</div>}
                      {c.revokedAt && <div>Revoked: {fmtDate(c.revokedAt)}</div>}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          </motion.section>
        )}

        {/* Escalations card */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.15 }}
        >
          <Card className="glass print:shadow-none print:border">
            <CardHeader className="border-b border-border">
              <CardTitle className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-primary" /> Escalations
              </CardTitle>
              <CardDescription>
                Showing {Math.min(esc.items.length, 10)} of {esc.total} recorded escalations.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 md:p-6 space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <CountTile label="Total" value={esc.total} />
                <CountTile
                  label="Open"
                  value={esc.open}
                  tone={esc.open > 0 ? "amber" : undefined}
                />
                <CountTile label="Resolved" value={esc.resolved} tone="primary" />
                <CountTile
                  label="Critical"
                  value={esc.critical}
                  tone={esc.critical > 0 ? "critical" : undefined}
                />
              </div>

              {esc.items.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-2">
                  No escalations recorded for this patient.
                </p>
              ) : (
                <ul className="space-y-2 max-h-96 overflow-y-auto fancy-scroll pr-1">
                  {esc.items.map((e, i) => (
                    <li
                      key={i}
                      className="rounded-lg border border-border bg-card/60 p-3 print:break-inside-avoid"
                    >
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-semibold uppercase tracking-wider",
                            severityBadgeClass(e.severity)
                          )}
                        >
                          {e.severity}
                        </span>
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-medium uppercase tracking-wider",
                            escalationStatusBadgeClass(e.status)
                          )}
                        >
                          {e.status.replace("_", " ").toLowerCase()}
                        </span>
                        <span className="text-[11px] text-muted-foreground ml-auto">
                          {fmtDate(e.createdAt)}
                        </span>
                      </div>
                      <p className="text-xs text-foreground line-clamp-2">{e.reason}</p>
                      {e.resolution && (
                        <p className="text-[11px] text-muted-foreground mt-1 italic">
                          Resolution: {e.resolution}
                        </p>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </motion.section>

        {/* Timeline card */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <Card className="glass print:shadow-none print:border">
            <CardHeader className="border-b border-border">
              <CardTitle className="flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" /> Care timeline
              </CardTitle>
              <CardDescription>
                Chronological record of the patient&rsquo;s care journey.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-5 md:p-6">
              {data.timeline.length === 0 ? (
                <p className="text-xs text-muted-foreground italic py-2">
                  No timeline events recorded.
                </p>
              ) : (
                <ol className="relative max-h-96 overflow-y-auto fancy-scroll pr-2 pl-1 print:max-h-none print:overflow-visible">
                  <span
                    className="absolute left-3 top-2 bottom-2 w-px bg-border"
                    aria-hidden
                  />
                  {data.timeline.map((t, i) => {
                    const { Icon, cls } = timelineIcon(t.eventType);
                    return (
                      <li
                        key={i}
                        className="relative flex gap-3 pb-4 last:pb-0 print:break-inside-avoid"
                      >
                        <span
                          className={cn(
                            "z-10 flex-shrink-0 flex items-center justify-center rounded-full h-6 w-6 ring-4 ring-card",
                            cls
                          )}
                        >
                          <Icon className="h-3 w-3" />
                        </span>
                        <div className="flex-1 min-w-0 -mt-0.5">
                          <div className="flex items-baseline justify-between gap-2 flex-wrap">
                            <p className="text-sm font-medium leading-tight">{t.title}</p>
                            <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                              {fmtDate(t.occurredAt)}
                            </span>
                          </div>
                          {t.detail && (
                            <p className="text-xs text-muted-foreground mt-0.5">{t.detail}</p>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ol>
              )}
            </CardContent>
          </Card>
        </motion.section>

        {/* Disclaimer footer */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.25 }}
          className="print:mt-4"
        >
          <Alert className="border-primary/30 bg-primary/5 print:break-inside-avoid">
            <ShieldCheck className="h-4 w-4 text-primary" />
            <AlertTitle className="text-xs">Disclaimer</AlertTitle>
            <AlertDescription className="text-xs leading-relaxed">
              {data.disclaimer}
            </AlertDescription>
          </Alert>
          <p className="text-[10px] text-muted-foreground mt-3 text-center print:text-[9px]">
            Generated on {fmtDate(data.generatedAt)} · {data.hospital.name}
            {data.hospital.city ? `, ${data.hospital.city}` : ""}
            {data.hospital.nabhLevel ? ` · ${data.hospital.nabhLevel}` : ""}
          </p>
        </motion.div>
      </div>
    </MotionConfig>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function fmtDate(s: string): string {
  try {
    return format(new Date(s), "d MMM yyyy, h:mm a");
  } catch {
    return s;
  }
}

function patientStatusBadgeClass(status: string): string {
  const s = status.toUpperCase();
  switch (s) {
    case "ENROLLED":        return "bg-primary/15 text-primary border-primary/30";
    case "ACTIVE":          return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
    case "RECOVERED":       return "bg-muted text-muted-foreground border-border";
    case "READMITTED":      return "risk-critical";
    case "LOST_TO_FOLLOWUP": return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
    default:                return "bg-secondary text-secondary-foreground border-border";
  }
}

function patientStatusLabel(status: string): string {
  if (status === "LOST_TO_FOLLOWUP") return "Lost to follow-up";
  return status.charAt(0) + status.slice(1).toLowerCase();
}

function severityBadgeClass(s: Severity): string {
  switch (s) {
    case "CRITICAL": return "risk-critical";
    case "HIGH": return "risk-high";
    case "MEDIUM": return "risk-medium";
    case "LOW": return "risk-low";
  }
}

function escalationStatusBadgeClass(s: EscalationStatus): string {
  switch (s) {
    case "OPEN": return "risk-high";
    case "IN_PROGRESS": return "risk-medium";
    case "RESOLVED": return "risk-low";
  }
}

function timelineIcon(eventType: string): {
  Icon: React.ComponentType<{ className?: string }>;
  cls: string;
} {
  const t = eventType.toUpperCase();
  if (t.includes("ENROLL")) return { Icon: UserPlus, cls: "bg-primary/15 text-primary" };
  if (t.includes("ESCALAT")) return { Icon: AlertTriangle, cls: "risk-high" };
  if (t.includes("CHECKIN") || t.includes("CHECK_IN")) {
    return { Icon: PhoneCall, cls: "bg-accent text-accent-foreground" };
  }
  if (t.includes("CALL")) return { Icon: Bot, cls: "bg-primary/15 text-primary" };
  if (t.includes("STATUS")) return { Icon: Activity, cls: "bg-secondary text-secondary-foreground" };
  if (t.includes("RESOLVE")) return { Icon: CheckCircle2, cls: "bg-primary/15 text-primary" };
  return { Icon: Activity, cls: "bg-secondary text-secondary-foreground" };
}

// ── Sub-components ──────────────────────────────────────────────────────────

function InfoLine({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm truncate">{value}</div>
    </div>
  );
}

function MiniStat({
  label, value, icon: Icon, tone,
}: {
  label: string;
  value: number | string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: "primary" | "amber" | "critical";
}) {
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border bg-card/40 p-2.5 print:border-black/20">
      <span
        className={cn(
          "flex items-center justify-center h-8 w-8 rounded-md flex-shrink-0",
          tone === "primary" && "bg-primary/10 text-primary",
          tone === "amber" && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
          tone === "critical" && "bg-rose-500/10 text-rose-600 dark:text-rose-400",
          !tone && "bg-secondary text-muted-foreground"
        )}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-[10px] uppercase tracking-wider text-muted-foreground leading-tight">
          {label}
        </div>
        <div className="text-base font-semibold tabular-nums leading-tight">{value}</div>
      </div>
    </div>
  );
}

function CountTile({
  label, value, tone,
}: {
  label: string;
  value: number;
  tone?: "primary" | "amber" | "critical";
}) {
  return (
    <div
      className={cn(
        "rounded-lg border p-3 text-center print:break-inside-avoid",
        tone === "primary" && "border-primary/30 bg-primary/5",
        tone === "amber" && "border-amber-400/40 bg-amber-50 dark:bg-amber-950/30",
        tone === "critical" && "border-rose-400/40 bg-rose-50 dark:bg-rose-950/30",
        !tone && "border-border bg-card/40"
      )}
    >
      <div
        className={cn(
          "text-2xl font-semibold tabular-nums",
          tone === "primary" && "text-primary",
          tone === "amber" && "text-amber-600 dark:text-amber-400",
          tone === "critical" && "text-rose-600 dark:text-rose-400"
        )}
      >
        {value}
      </div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground mt-0.5">
        {label}
      </div>
    </div>
  );
}

function PrintHeader({ summary }: { summary: DischargeSummary }) {
  return (
    <div className="border-b-2 border-primary pb-3 mb-6">
      <div className="flex items-start justify-between">
        <div>
          <div className="text-xl font-bold">{summary.hospital.name}</div>
          <div className="text-xs text-muted-foreground">
            {summary.hospital.city || ""}
            {summary.hospital.nabhLevel ? ` · ${summary.hospital.nabhLevel}` : ""}
          </div>
        </div>
        <div className="text-right">
          <div className="text-base font-semibold">Post-Discharge Care Summary</div>
          <div className="text-xs text-muted-foreground">
            Generated {fmtDate(summary.generatedAt)}
          </div>
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton({ patientId }: { patientId: string }) {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <button
            onClick={() => navigate("patient-detail", { patientId })}
            className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors mb-2"
          >
            <ArrowLeft className="h-4 w-4" /> Back to patient
          </button>
          <Skeleton className="h-9 w-56" />
        </div>
        <Skeleton className="h-9 w-40" />
      </div>
      <Skeleton className="h-48 w-full rounded-xl" />
      <Skeleton className="h-56 w-full rounded-xl" />
      <Skeleton className="h-72 w-full rounded-xl" />
      <Skeleton className="h-48 w-full rounded-xl" />
    </div>
  );
}

function ErrorState({
  message, patientId,
}: {
  message: string | null;
  patientId: string;
}) {
  return (
    <div className="space-y-4">
      <button
        onClick={() => navigate("patient-detail", { patientId })}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="h-4 w-4" /> Back to patient
      </button>
      <Card className="glass">
        <CardContent className="p-8 flex flex-col items-center text-center">
          <span className="flex items-center justify-center h-12 w-12 rounded-full bg-rose-500/10 text-rose-600 dark:text-rose-400 mb-3">
            <AlertTriangle className="h-6 w-6" />
          </span>
          <p className="text-sm font-medium">Couldn&rsquo;t load discharge summary</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-md">
            {message || "Patient not found or you don't have access."}
          </p>
          <Button
            variant="outline"
            size="sm"
            className="mt-4"
            onClick={() => navigate("patient-detail", { patientId })}
          >
            Back to patient <ArrowLeft className="h-3.5 w-3.5" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
