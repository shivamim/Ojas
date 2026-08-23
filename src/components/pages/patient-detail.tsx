"use client";

import * as React from "react";
import { MotionConfig, motion } from "framer-motion";
import { toast } from "sonner";
import {
  ArrowLeft, Stethoscope, Calendar, Phone, ShieldCheck,
  ClipboardList, ShieldAlert, AlertCircle,
} from "lucide-react";

import { api, useAuth } from "@/lib/auth-context";
import { navigate } from "@/lib/router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Tooltip as UITooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";

import type { PatientDetail, PatientDetailResponse, PatientStatus } from "./patient-detail/types";
import { STATUS_OPTIONS } from "./patient-detail/types";
import {
  statusBadgeClass, statusLabel, abs, absDate, ago, recoveryDay,
} from "./patient-detail/helpers";
import { InfoLine } from "./patient-detail/shared";
import { RiskGauge } from "@/components/risk-gauge";
import {
  DetailSkeleton, NotFoundView, ReadmitDialog, RiskAssessmentDialog,
} from "./patient-detail/dialogs";
import { OverviewTab } from "./patient-detail/tabs/overview";
import { CheckinsTab } from "./patient-detail/tabs/checkins";
import { EscalationsTab } from "./patient-detail/tabs/escalations";
import { MedicationsTab } from "./patient-detail/tabs/medications";
import { MilestonesTab } from "./patient-detail/tabs/milestones";
import { ChecklistTab } from "./patient-detail/tabs/checklist";
import { TimelineTab } from "./patient-detail/tabs/timeline";

// Re-export ReadmitDialog so the existing `import { ReadmitDialog } from
// "@/components/pages/patient-detail"` (used by patients.tsx) keeps working.
export { ReadmitDialog } from "./patient-detail/dialogs";

// ── Page ────────────────────────────────────────────────────────────────────
export function PatientDetailPage({ patientId }: { patientId: string }) {
  const [data, setData] = React.useState<PatientDetail | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [notFound, setNotFound] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    setNotFound(false);
    try {
      const r = await api<PatientDetailResponse>(`/api/patients/${patientId}`);
      setData(r.patient);
    } catch (err) {
      const e = err as { status?: number; message?: string };
      if (e?.status === 404) setNotFound(true);
      else toast.error(e?.message || "Failed to load patient");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  React.useEffect(() => { load(); }, [load]);

  if (loading) return <DetailSkeleton />;
  if (notFound || !data) return <NotFoundView />;

  return <Loaded patient={data} onChange={load} />;
}

// ── Loaded view ─────────────────────────────────────────────────────────────
function Loaded({ patient, onChange }: { patient: PatientDetail; onChange: () => void }) {
  const { user } = useAuth();
  const [updating, setUpdating] = React.useState(false);
  const [readmitOpen, setReadmitOpen] = React.useState(false);
  const [riskOpen, setRiskOpen] = React.useState(false);
  const [checklistRemaining, setChecklistRemaining] = React.useState<number | null>(null);

  // Risk assessment is gated to hospital admins and coordinators
  const canAssessRisk =
    user?.role === "HOSPITAL_ADMIN" || user?.role === "COORDINATOR";

  const dayNum = recoveryDay(patient.dischargeDate);

  const answered = patient.checkins.filter((c) => c.status === "ANSWERED");
  const missed = patient.checkins.filter((c) => c.status === "MISSED");
  const openEscalations = patient.escalations.filter((e) => e.status !== "RESOLVED");

  const changeStatus = async (status: string) => {
    setUpdating(true);
    try {
      await api(`/api/patients/${patient.id}`, {
        method: "PATCH",
        body: JSON.stringify({ status }),
      });
      toast.success(`Status updated to ${statusLabel(status as PatientStatus)}`);
      onChange();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update status");
    } finally {
      setUpdating(false);
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-6">
        {/* Back */}
        <button
          onClick={() => navigate("patients")}
          className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" /> Back to patients
        </button>

        {/* Header card */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="glass-strong">
            <CardContent className="p-5 md:p-6">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                {/* Identity */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h1 className="text-2xl font-semibold tracking-tight">{patient.fullName}</h1>
                    <Badge variant="outline" className={statusBadgeClass(patient.status)}>
                      {statusLabel(patient.status)}
                    </Badge>
                    {patient.dpdpaConsent && (
                      <UITooltip>
                        <TooltipTrigger asChild>
                          <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                            <ShieldCheck className="h-3 w-3" /> DPDPA consent
                          </Badge>
                        </TooltipTrigger>
                        <TooltipContent>
                          Consent recorded {abs(patient.consentAt)}
                        </TooltipContent>
                      </UITooltip>
                    )}
                  </div>
                  <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-x-6 gap-y-2 text-sm">
                    <InfoLine label="Age / Gender" value={`${patient.age}y · ${patient.gender || "—"}`} />
                    <InfoLine label="Mobile" value={
                      <span className="inline-flex items-center gap-1.5 tabular-nums">
                        <Phone className="h-3 w-3" /> {patient.mobileMasked}
                      </span>
                    } />
                    <InfoLine label="Surgery" value={
                      <span className="inline-flex items-center gap-1.5">
                        <Stethoscope className="h-3 w-3" /> {patient.surgeryType}
                      </span>
                    } />
                    <InfoLine label="Comorbidities" value={patient.comorbidities || "None"} />
                    <InfoLine label="Surgery date" value={
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="h-3 w-3" /> {absDate(patient.surgeryDate)}
                      </span>
                    } />
                    <InfoLine label="Discharge date" value={
                      <span className="inline-flex items-center gap-1.5">
                        <Calendar className="h-3 w-3" /> {absDate(patient.dischargeDate)}
                      </span>
                    } />
                    <InfoLine label="Recovery day" value={
                      <span className="font-medium text-primary">Day {dayNum}</span>
                    } />
                    <InfoLine label="Enrolled" value={ago(patient.createdAt)} />
                  </div>
                </div>

                {/* Risk Gauge */}
                {patient.riskScore != null && patient.riskScore > 0 && patient.riskLevel && (
                  <div className="hidden lg:flex flex-col items-center justify-center lg:w-44">
                    <RiskGauge
                      score={patient.riskScore}
                      level={patient.riskLevel as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"}
                      size={140}
                    />
                    {patient.riskAssessedAt && (
                      <p className="text-[10px] text-muted-foreground mt-1">{ago(patient.riskAssessedAt)}</p>
                    )}
                  </div>
                )}

                {/* Status change + discharge summary */}
                <div className="flex flex-col gap-2 lg:w-56">
                  <Label className="text-xs text-muted-foreground">Change status</Label>
                  <Select
                    value={patient.status}
                    onValueChange={changeStatus}
                    disabled={updating}
                  >
                    <SelectTrigger className="w-full" aria-label="Patient status">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    variant="outline"
                    size="sm"
                    className="mt-1"
                    onClick={() => navigate("discharge-summary", { patientId: patient.id })}
                  >
                    <ClipboardList className="h-4 w-4" /> Discharge summary
                  </Button>
                  {canAssessRisk && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-1 border-primary/40 text-primary hover:bg-primary/10 hover:text-primary"
                      onClick={() => setRiskOpen(true)}
                    >
                      <ShieldAlert className="h-4 w-4" /> Risk assessment
                    </Button>
                  )}
                  {patient.status === "READMITTED" ? (
                    <Badge
                      variant="outline"
                      className="risk-critical justify-center py-1.5 gap-1.5"
                      aria-label="Patient is currently readmitted"
                    >
                      <AlertCircle className="h-3.5 w-3.5" /> Readmitted
                    </Badge>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-1 border-rose-500/40 text-rose-700 dark:text-rose-300 hover:bg-rose-500/10 hover:text-rose-700 dark:hover:text-rose-200"
                      onClick={() => setReadmitOpen(true)}
                    >
                      <AlertCircle className="h-4 w-4" /> Mark as readmitted
                    </Button>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.section>

        {/* Tabs */}
        <Tabs defaultValue="overview">
          <TabsList className="w-full sm:w-auto overflow-x-auto fancy-scroll">
            <TabsTrigger value="overview">Overview</TabsTrigger>
            <TabsTrigger value="checkins">
              Check-ins <Badge variant="secondary" className="ml-1.5">{patient.checkins.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="escalations">
              Escalations <Badge variant="secondary" className="ml-1.5">{patient.escalations.length}</Badge>
            </TabsTrigger>
            <TabsTrigger value="medications">Medications</TabsTrigger>
            <TabsTrigger value="milestones">Milestones</TabsTrigger>
            <TabsTrigger value="checklist">
              Checklist
              {checklistRemaining != null && checklistRemaining > 0 && (
                <Badge variant="secondary" className="ml-1.5">{checklistRemaining}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="timeline">Timeline</TabsTrigger>
          </TabsList>

          {/* Overview */}
          <TabsContent value="overview" className="mt-4">
            <OverviewTab
              patientId={patient.id}
              answeredCount={answered.length}
              scheduledCount={patient.checkins.length}
              missedCount={missed.length}
              openEscalations={openEscalations.length}
              recoveryDay={dayNum}
            />
          </TabsContent>

          {/* Check-ins */}
          <TabsContent value="checkins" className="mt-4">
            <CheckinsTab patient={patient} onChange={onChange} />
          </TabsContent>

          {/* Escalations */}
          <TabsContent value="escalations" className="mt-4">
            <EscalationsTab patient={patient} />
          </TabsContent>

          {/* Medications */}
          <TabsContent value="medications" className="mt-4">
            <MedicationsTab patientId={patient.id} />
          </TabsContent>

          {/* Milestones */}
          <TabsContent value="milestones" className="mt-4">
            <MilestonesTab patientId={patient.id} />
          </TabsContent>

          {/* Checklist */}
          <TabsContent value="checklist" className="mt-4">
            <ChecklistTab
              patientId={patient.id}
              onSummaryChange={setChecklistRemaining}
            />
          </TabsContent>

          {/* Timeline */}
          <TabsContent value="timeline" className="mt-4">
            <TimelineTab events={patient.timelineEvents} patientId={patient.id} />
          </TabsContent>
        </Tabs>

        {/* Readmit dialog */}
        <ReadmitDialog
          patientId={patient.id}
          patientName={patient.fullName}
          open={readmitOpen}
          onOpenChange={setReadmitOpen}
          onDone={onChange}
        />

        {/* Risk assessment dialog (HOSPITAL_ADMIN + COORDINATOR only) */}
        {canAssessRisk && (
          <RiskAssessmentDialog
            patientId={patient.id}
            patientName={patient.fullName}
            open={riskOpen}
            onOpenChange={setRiskOpen}
            onDone={onChange}
          />
        )}
      </div>
    </MotionConfig>
  );
}
