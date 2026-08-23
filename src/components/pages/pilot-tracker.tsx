// Ojas — P1.7 Clinical Validation Tracker page.
// "Before selling to hospital #2, prove the workflow works."
// Surfaces live pilot study metrics (readmission, response, adherence,
// escalation severity, time-to-coordinator-response) against the pre-Ojas
// baseline that the hospital admin enters manually.
"use client";

import * as React from "react";
import { MotionConfig, motion } from "framer-motion";
import { toast } from "sonner";
import {
  FlaskConical, RefreshCw, FileDown, TrendingDown, Activity,
  Clock, AlertTriangle, Users, CalendarDays, Pencil, Loader2,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip,
  XAxis, YAxis, Cell,
} from "recharts";

import { api } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

// ── Types matching /api/pilot/metrics contract ──────────────────────────────
interface PilotStudy {
  id: string;
  hospitalId: string;
  startDate: string;
  endDate: string | null;
  patientCount: number;
  controlCount: number;
  status: string;
  readmissionRateWithOjas: number | null;
  readmissionRateWithoutOjas: number | null;
  medicationAdherenceRate: number | null;
  patientSatisfactionScore: number | null;
  responseRate: number | null;
  escalationCount: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

interface PilotMetrics {
  enrolledPatients: number;
  readmissionRate: number | null;
  medicationAdherenceRate: number | null;
  responseRate: number | null;
  escalationCountBySeverity: {
    LOW: number;
    MEDIUM: number;
    HIGH: number;
    CRITICAL: number;
  };
  timeToCoordinatorResponseMs: number | null;
  daysElapsed: number;
  totalEscalations: number;
  activeMedications: number;
  checkinsAnswered: number;
  checkinsScheduled: number;
}

interface PilotResponse {
  pilot: PilotStudy;
  metrics: PilotMetrics;
}

const EMERALD = "oklch(0.62 0.14 165)";
const AMBER = "oklch(0.78 0.14 75)";
const ROSE = "oklch(0.58 0.22 25)";
const MUTED = "oklch(0.65 0.02 250)";

function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function formatDuration(ms: number | null): string {
  if (ms === null) return "—";
  if (ms < 60_000) return `${Math.round(ms / 1000)}s`;
  if (ms < 3_600_000) return `${Math.round(ms / 60_000)} min`;
  return `${(ms / 3_600_000).toFixed(1)} h`;
}

function statusBadge(status: string) {
  const cls = {
    ACTIVE: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
    COMPLETED: "bg-primary/15 text-primary border-primary/30",
    SUSPENDED: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  }[status] || "bg-muted text-muted-foreground border-border";
  return (
    <Badge className={cn(cls, "hover:opacity-90")}>
      {status.replace("_", " ").toLowerCase()}
    </Badge>
  );
}

// ── PDF Export ────────────────────────────────────────────────────────────────
function exportPilotPdf(data: PilotResponse | null): void {
  if (!data) {
    toast.error("No data to export");
    return;
  }

  const w = window.open("", "_blank");
  if (!w) return;

  const p = data.pilot;
  const m = data.metrics;
  const sev = m.escalationCountBySeverity;

  const outcomeRows = [
    { label: "Readmission rate (with Ojas)", value: m.readmissionRate !== null ? `${m.readmissionRate}%` : "—", tone: m.readmissionRate !== null && m.readmissionRate <= 10 ? "#16a34a" : "#d97706" },
    { label: "Readmission rate (pre-Ojas)", value: p.readmissionRateWithoutOjas !== null ? `${p.readmissionRateWithoutOjas}%` : "—", tone: "#666" },
    { label: "Medication adherence rate", value: m.medicationAdherenceRate !== null ? `${m.medicationAdherenceRate}%` : "—", tone: m.medicationAdherenceRate !== null && m.medicationAdherenceRate >= 80 ? "#16a34a" : "#d97706" },
    { label: "Patient response rate", value: m.responseRate !== null ? `${m.responseRate}%` : "—", tone: m.responseRate !== null && m.responseRate >= 70 ? "#16a34a" : "#d97706" },
    { label: "Avg time-to-response", value: formatDuration(m.timeToCoordinatorResponseMs), tone: m.timeToCoordinatorResponseMs !== null && m.timeToCoordinatorResponseMs <= 3_600_000 ? "#16a34a" : "#d97706" },
  ].map((r) => `
    <tr>
      <td style="padding:6px 10px;border:1px solid #ddd;">${r.label}</td>
      <td style="padding:6px 10px;border:1px solid #ddd;text-align:center;font-weight:600;color:${r.tone};">${r.value}</td>
    </tr>`).join("");

  const escalationRows = [
    { severity: "Low", count: sev.LOW, color: "#888" },
    { severity: "Medium", count: sev.MEDIUM, color: "#d97706" },
    { severity: "High", count: sev.HIGH, color: "#dc2626" },
    { severity: "Critical", count: sev.CRITICAL, color: "#991b1b" },
  ].map((r) => `
    <tr>
      <td style="padding:6px 10px;border:1px solid #ddd;">${r.severity}</td>
      <td style="padding:6px 10px;border:1px solid #ddd;text-align:center;color:${r.color};font-weight:600;">${r.count}</td>
    </tr>`).join("");

  w.document.write(`<!DOCTYPE html><html><head><title>Pilot Outcome Report — ${formatDate(p.startDate)}</title>
<style>
  body{font-family:system-ui,-apple-system,sans-serif;margin:32px;color:#111;background:#fff;}
  h1{font-size:20px;margin:0 0 4px;}
  h2{font-size:15px;margin:20px 0 8px;color:#555;}
  .meta{font-size:12px;color:#666;margin-bottom:16px;}
  .kpi{display:inline-block;padding:8px 16px;border-radius:8px;margin-right:12px;margin-bottom:8px;background:#f0fdf4;border:1px solid #bbf7d0;}
  .kpi-label{font-size:10px;text-transform:uppercase;letter-spacing:.05em;color:#666;}
  .kpi-value{font-size:22px;font-weight:700;}
  table{border-collapse:collapse;width:100%;margin-bottom:16px;font-size:12px;}
  th{background:#f5f5f5;padding:6px 10px;border:1px solid #ddd;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.04em;}
  .status-badge{display:inline-block;padding:2px 8px;border-radius:4px;font-size:10px;font-weight:600;text-transform:uppercase;}
  @media print{body{margin:16px;}h1{font-size:16px;}}
</style></head><body>
<h1>Clinical Validation — Pilot Outcome Report</h1>
<div class="meta">
  Start: ${formatDate(p.startDate)} ·
  ${p.endDate ? `End: ${formatDate(p.endDate)} ·` : ""} 
  ${m.daysElapsed} days elapsed ·
  Status: <span class="status-badge" style="background:${p.status === "ACTIVE" ? "#dcfce7" : p.status === "COMPLETED" ? "#dbeafe" : "#fef3c7"};">${p.status.toLowerCase()}</span>
</div>

<div style="margin-bottom:20px;">
  <div class="kpi"><div class="kpi-label">Patients Enrolled</div><div class="kpi-value">${m.enrolledPatients}</div></div>
  <div class="kpi"><div class="kpi-label">Total Escalations</div><div class="kpi-value">${m.totalEscalations}</div></div>
  <div class="kpi"><div class="kpi-label">Active Medications</div><div class="kpi-value">${m.activeMedications}</div></div>
  <div class="kpi"><div class="kpi-label">Check-ins Answered</div><div class="kpi-value">${m.checkinsAnswered} / ${m.checkinsScheduled}</div></div>
</div>

<h2>Outcome Metrics</h2>
<table>
  <tr><th>Metric</th><th>Value</th></tr>
  ${outcomeRows}
</table>

<h2>Escalations by Severity</h2>
<table>
  <tr><th>Severity</th><th>Count</th></tr>
  ${escalationRows}
</table>

<div style="margin-top:24px;font-size:10px;color:#999;border-top:1px solid #eee;padding-top:8px;">
  Auto-generated by Ojas Post-Discharge Care Platform · ${new Date().toISOString()}
</div>
</body></html>`);
  w.document.close();
  w.print();
}

// ── Page ────────────────────────────────────────────────────────────────────
export function PilotTrackerPage() {
  const [data, setData] = React.useState<PilotResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [editOpen, setEditOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<PilotResponse>("/api/pilot/metrics");
      setData(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load pilot metrics");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const escalationChartData = React.useMemo(() => {
    if (!data) return [];
    const s = data.metrics.escalationCountBySeverity;
    return [
      { severity: "Low", count: s.LOW, color: MUTED },
      { severity: "Medium", count: s.MEDIUM, color: AMBER },
      { severity: "High", count: s.HIGH, color: ROSE },
      { severity: "Critical", count: s.CRITICAL, color: ROSE },
    ];
  }, [data]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-6">
        {/* Header */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        >
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight flex items-center gap-2">
              <FlaskConical className="h-6 w-6 text-primary" />
              Clinical validation tracker
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Pilot study outcomes, computed live from real patient records. Use this to prove the workflow before scaling.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4 mr-1.5", loading && "animate-spin")} />
              Refresh
            </Button>
            <Button
              size="sm"
              onClick={() => exportPilotPdf(data)}
            >
              <FileDown className="h-4 w-4 mr-1.5" />
              Export report
            </Button>
          </div>
        </motion.section>

        {/* Pilot study card */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.06 }}
        >
          <Card className="glass">
            <CardHeader className="border-b border-border">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-base">
                    <FlaskConical className="h-4 w-4 text-primary" />
                    Pilot study
                  </CardTitle>
                  <CardDescription className="mt-1">
                    One per hospital. Auto-created on first view — set the start date to when the pilot actually began (via direct DB edit for v1).
                  </CardDescription>
                </div>
                {data && statusBadge(data.pilot.status)}
              </div>
            </CardHeader>
            <CardContent className="p-4">
              {loading ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-16 w-full" />
                  ))}
                </div>
              ) : data ? (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <PilotStat
                    icon={CalendarDays}
                    label="Start date"
                    value={formatDate(data.pilot.startDate)}
                  />
                  <PilotStat
                    icon={Clock}
                    label="Days elapsed"
                    value={String(data.metrics.daysElapsed)}
                  />
                  <PilotStat
                    icon={Users}
                    label="Patients enrolled"
                    value={String(data.metrics.enrolledPatients)}
                    helper={`since ${formatDate(data.pilot.startDate).split(",")[0]}`}
                  />
                  <PilotStat
                    icon={Activity}
                    label="Escalations"
                    value={String(data.metrics.totalEscalations)}
                    helper={`${data.metrics.checkinsAnswered}/${data.metrics.checkinsScheduled} check-ins answered`}
                  />
                </div>
              ) : (
                <div className="text-sm text-muted-foreground">No pilot data available.</div>
              )}
            </CardContent>
          </Card>
        </motion.section>

        {/* Metrics grid — 4 outcome cards */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.12 }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <OutcomeCard
              icon={TrendingDown}
              label="Readmission rate (with Ojas)"
              value={data?.metrics.readmissionRate}
              suffix="%"
              loading={loading}
              tone={
                data?.metrics.readmissionRate === null || data?.metrics.readmissionRate === undefined ? "neutral"
                : data?.metrics.readmissionRate <= 10 ? "good"
                : data?.metrics.readmissionRate <= 18 ? "warn" : "bad"
              }
              helper={`vs ${data?.pilot.readmissionRateWithoutOjas ?? "—"}% pre-Ojas`}
              action={
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-[11px] text-muted-foreground"
                  onClick={() => setEditOpen(true)}
                  disabled={!data}
                >
                  <Pencil className="h-3 w-3 mr-1" />
                  Edit baseline
                </Button>
              }
            />
            <OutcomeCard
              icon={TrendingDown}
              label="Readmission rate (pre-Ojas)"
              value={data?.pilot.readmissionRateWithoutOjas}
              suffix="%"
              loading={loading}
              tone="neutral"
              helper="Hospital-admin entered baseline"
            />
            <OutcomeCard
              icon={Activity}
              label="Patient response rate"
              value={data?.metrics.responseRate}
              suffix="%"
              loading={loading}
              tone={
                data?.metrics.responseRate === null || data?.metrics.responseRate === undefined ? "neutral"
                : data?.metrics.responseRate >= 70 ? "good"
                : data?.metrics.responseRate >= 50 ? "warn" : "bad"
              }
              helper={`${data?.metrics.checkinsAnswered ?? 0}/${data?.metrics.checkinsScheduled ?? 0} check-ins`}
            />
            <OutcomeCard
              icon={Clock}
              label="Avg time-to-response"
              value={data?.metrics.timeToCoordinatorResponseMs === null ? null : data?.metrics.timeToCoordinatorResponseMs}
              formatter={formatDuration}
              loading={loading}
              tone={
                data?.metrics.timeToCoordinatorResponseMs == null ? "neutral"
                : data?.metrics.timeToCoordinatorResponseMs <= 3_600_000 ? "good"
                : data?.metrics.timeToCoordinatorResponseMs <= 24 * 3_600_000 ? "warn" : "bad"
              }
              helper="escalation acknowledgedAt − createdAt"
            />
          </div>
        </motion.section>

        {/* Escalation severity chart */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.18 }}
        >
          <Card className="glass">
            <CardHeader className="border-b border-border">
              <CardTitle className="flex items-center gap-2 text-base">
                <AlertTriangle className="h-4 w-4 text-primary" />
                Escalations by severity
              </CardTitle>
              <CardDescription>
                Since pilot start. Critical escalations should be a small share of the total.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              {loading ? (
                <Skeleton className="h-64 w-full" />
              ) : !data || data.metrics.totalEscalations === 0 ? (
                <div className="flex flex-col items-center justify-center text-center py-16">
                  <AlertTriangle className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">No escalations since the pilot started</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">
                    Escalations will appear here once Ojas triages a check-in as needing coordinator attention.
                  </p>
                </div>
              ) : (
                <div className="h-64 w-full fancy-scroll">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={escalationChartData}
                      margin={{ top: 8, right: 16, bottom: 4, left: -16 }}
                    >
                      <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.62 0.14 165 / 0.12)" />
                      <XAxis
                        dataKey="severity"
                        tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                        tickLine={false}
                        axisLine={false}
                        width={36}
                      />
                      <Tooltip
                        cursor={{ fill: "oklch(0.62 0.14 165 / 0.06)" }}
                        contentStyle={{
                          background: "var(--popover)",
                          border: "1px solid var(--border)",
                          borderRadius: 8,
                          fontSize: 12,
                        }}
                        labelStyle={{ fontSize: 11, color: "var(--muted-foreground)" }}
                        formatter={(v: number) => [v, "Escalations"]}
                      />
                      <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                        {escalationChartData.map((entry, i) => (
                          <Cell key={i} fill={entry.color} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.section>

        {/* Edit baseline dialog */}
        <EditBaselineDialog
          open={editOpen}
          onOpenChange={setEditOpen}
          current={data?.pilot.readmissionRateWithoutOjas ?? null}
          onSaved={() => { load(); }}
        />
      </div>
    </MotionConfig>
  );
}

// ── Pilot stat cell ─────────────────────────────────────────────────────────
function PilotStat({
  icon: Icon, label, value, helper,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  helper?: string;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
      </div>
      <div className="text-sm font-semibold">{value}</div>
      {helper && <div className="text-[10px] text-muted-foreground mt-0.5">{helper}</div>}
    </div>
  );
}

// ── Outcome card ────────────────────────────────────────────────────────────
function OutcomeCard({
  icon: Icon, label, value, suffix, helper, loading, tone = "neutral",
  formatter, action,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: number | null | undefined;
  suffix?: string;
  helper?: string;
  loading: boolean;
  tone?: "neutral" | "good" | "warn" | "bad";
  formatter?: (v: number) => string;
  action?: React.ReactNode;
}) {
  const toneClass = {
    neutral: "bg-muted/60 text-foreground",
    good: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
    warn: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
    bad: "bg-rose-500/10 text-rose-600 dark:text-rose-400",
  }[tone];
  return (
    <Card className="glass h-full">
      <CardContent className="p-4 md:p-5 flex flex-col h-full">
        <div className="flex items-center justify-between mb-2">
          <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
            {label}
          </span>
          <span className={cn("flex items-center justify-center h-7 w-7 rounded-md", toneClass)}>
            <Icon className="h-3.5 w-3.5" />
          </span>
        </div>
        {loading ? (
          <Skeleton className="h-9 w-24" />
        ) : value === null || value === undefined ? (
          <Badge variant="outline" className="text-muted-foreground bg-muted/50 self-start">
            Not yet available
          </Badge>
        ) : (
          <div className="flex items-baseline gap-1">
            <span
              className={cn(
                "text-3xl font-semibold tabular-nums",
                tone === "good" && "text-emerald-600 dark:text-emerald-400",
                tone === "warn" && "text-amber-600 dark:text-amber-400",
                tone === "bad" && "text-rose-600 dark:text-rose-400",
              )}
            >
              {formatter ? formatter(value) : value}
            </span>
            {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
          </div>
        )}
        {helper && (
          <p className="text-[11px] text-muted-foreground mt-2 leading-relaxed">{helper}</p>
        )}
        {action && <div className="mt-auto pt-2 -mb-1">{action}</div>}
      </CardContent>
    </Card>
  );
}

// ── Edit baseline dialog ────────────────────────────────────────────────────
function EditBaselineDialog({
  open, onOpenChange, current, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  current: number | null;
  onSaved: () => void;
}) {
  const [value, setValue] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  React.useEffect(() => {
    if (open) {
      setValue(current !== null ? String(current) : "");
    }
  }, [open, current]);

  const handleSave = async () => {
    const parsed = parseFloat(value);
    if (isNaN(parsed) || parsed < 0 || parsed > 100) {
      toast.error("Enter a number between 0 and 100");
      return;
    }
    setSaving(true);
    try {
      await api("/api/pilot/metrics", {
        method: "PATCH",
        body: JSON.stringify({ readmissionRateWithoutOjas: parsed }),
      });
      toast.success("Pre-Ojas baseline updated", {
        description: `Readmission rate without Ojas: ${parsed}%`,
      });
      onOpenChange(false);
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update baseline");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pencil className="h-4 w-4 text-primary" />
            Edit pre-Ojas baseline
          </DialogTitle>
          <DialogDescription>
            Enter your hospital&apos;s historical readmission rate before adopting Ojas.
            This is the comparison point for the &quot;with Ojas&quot; rate above.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <div className="space-y-1.5">
            <Label htmlFor="baseline-rate">Pre-Ojas readmission rate (%)</Label>
            <Input
              id="baseline-rate"
              type="number"
              step="0.1"
              min="0"
              max="100"
              placeholder="e.g. 18"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              disabled={saving}
              autoFocus
            />
            <p className="text-[11px] text-muted-foreground">
              Typical Indian hospital readmission rates for post-surgical patients range 12–25%.
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving || !value}>
            {saving ? <Loader2 className="h-4 w-4 mr-1.5 animate-spin" /> : null}
            Save baseline
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
