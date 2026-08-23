// Ojas — Patient satisfaction survey page. Hospital admin view.
// Surfaces real patient feedback collected at the end of recovery windows
// (one survey per patient — enforced by the schema). All numbers come from
// /api/surveys. No fabricated data.
"use client";

import * as React from "react";
import { MotionConfig, motion } from "framer-motion";
import { toast } from "sonner";
import {
  Star, ClipboardList, MessageSquareQuote, ThumbsUp, ThumbsDown,
  Loader2, Plus, Sparkles, CheckCircle2, XCircle,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip,
  XAxis, YAxis,
} from "recharts";

import { api } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { navigate } from "@/lib/router";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip as UITooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

// ── Types matching /api/surveys contract ────────────────────────────────────
interface SurveyPatient {
  fullName: string;
  surgeryType: string | null;
  age: number | null;
}

interface Survey {
  id: string;
  patientId: string;
  patient: SurveyPatient;
  overallRating: number;
  careQuality: number | null;
  communication: number | null;
  responsiveness: number | null;
  wouldRecommend: boolean | null;
  freeText: string | null;
  collectedAt: string;
}

interface Aggregate {
  total: number;
  avgOverall: number | null;
  avgCare: number | null;
  avgCommunication: number | null;
  avgResponsiveness: number | null;
  recommendRate: number | null;
  distribution: { 1: number; 2: number; 3: number; 4: number; 5: number };
}

interface SurveysResponse {
  surveys: Survey[];
  aggregate: Aggregate;
}

// Patient list option shape from /api/patients
interface PatientOption {
  id: string;
  fullName: string;
  surgeryType: string | null;
  status: string;
}

// Rating palette (matches risk-* tokens):
//   1-2 stars → rose (critical), 3 stars → amber, 4-5 stars → emerald.
const RATING_BAR_COLOR: Record<number, string> = {
  1: "oklch(0.58 0.22 25)",  // rose
  2: "oklch(0.62 0.18 25)",  // warm rose
  3: "oklch(0.78 0.14 75)",  // amber
  4: "oklch(0.68 0.12 165)", // light emerald
  5: "oklch(0.62 0.14 165)", // emerald
};

// ── Page ────────────────────────────────────────────────────────────────────
export function SatisfactionPage() {
  const [data, setData] = React.useState<SurveysResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [collectOpen, setCollectOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<SurveysResponse>("/api/surveys");
      setData(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load surveys");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  // Distribution chart data (always 1..5 — fills 0s where no surveys at a rating).
  const distributionData = React.useMemo(() => {
    const d = data?.aggregate.distribution ?? { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    return [1, 2, 3, 4, 5].map((r) => ({
      rating: `${r}★`,
      count: d[r] ?? 0,
      fill: RATING_BAR_COLOR[r],
    }));
  }, [data?.aggregate.distribution]);

  // Sort surveys by collectedAt desc (the API already does this, but be defensive).
  const sortedSurveys = React.useMemo(() => {
    if (!data?.surveys) return [];
    return [...data.surveys].sort(
      (a, b) => new Date(b.collectedAt).getTime() - new Date(a.collectedAt).getTime()
    );
  }, [data?.surveys]);

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
              <Star className="h-6 w-6 text-primary" />
              Patient satisfaction
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Real feedback collected from patients at end of recovery.
            </p>
          </div>
          <Button onClick={() => setCollectOpen(true)} className="glow-primary">
            <Plus className="h-4 w-4" /> Collect survey
          </Button>
        </motion.section>

        {/* Aggregate cards */}
        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
          <AggCard
            label="Total surveys"
            value={data?.aggregate.total}
            icon={ClipboardList}
            loading={loading}
            delay={0}
          />
          <AggCard
            label="Avg overall"
            value={data?.aggregate.avgOverall}
            icon={Star}
            loading={loading}
            delay={0.04}
            suffix="/5"
            starRating={data?.aggregate.avgOverall ?? null}
          />
          <AggCard
            label="Avg care quality"
            value={data?.aggregate.avgCare}
            icon={Sparkles}
            loading={loading}
            delay={0.08}
            suffix="/5"
          />
          <AggCard
            label="Avg communication"
            value={data?.aggregate.avgCommunication}
            icon={MessageSquareQuote}
            loading={loading}
            delay={0.12}
            suffix="/5"
          />
          <AggCard
            label="Recommend rate"
            value={data?.aggregate.recommendRate}
            icon={ThumbsUp}
            loading={loading}
            delay={0.16}
            suffix="%"
          />
        </section>

        {/* Distribution chart */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.2 }}
        >
          <Card className="glass">
            <CardHeader className="border-b border-border">
              <CardTitle className="flex items-center gap-2 text-base">
                <Star className="h-4 w-4 text-primary" />
                Rating distribution
              </CardTitle>
              <CardDescription>
                Number of surveys at each overall rating (1-5 stars).
              </CardDescription>
            </CardHeader>
            <CardContent className="p-4">
              {loading ? (
                <Skeleton className="h-64 w-full" />
              ) : !data || data.aggregate.total === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 text-center">
                  <Star className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">No data yet</p>
                  <p className="text-xs text-muted-foreground/70 mt-1">Data will appear here once available</p>
                </div>
              ) : (
                <div className="h-64 w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={distributionData}
                      margin={{ top: 8, right: 12, bottom: 4, left: -16 }}
                    >
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="oklch(0.62 0.14 165 / 0.12)"
                        vertical={false}
                      />
                      <XAxis
                        dataKey="rating"
                        tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        allowDecimals={false}
                        tick={{ fontSize: 10, fill: "var(--muted-foreground)" }}
                        tickLine={false}
                        axisLine={false}
                        width={28}
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
                        formatter={(v: number) => [v, "Surveys"]}
                      />
                      <Bar dataKey="count" radius={[6, 6, 0, 0]}>
                        {distributionData.map((entry) => (
                          <Cell key={entry.rating} fill={entry.fill} />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.section>

        {/* Survey list */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.28 }}
        >
          <Card className="glass">
            <CardHeader className="border-b border-border">
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="h-4 w-4 text-primary" />
                All surveys
              </CardTitle>
              <CardDescription>
                Most recent first. Click a patient name to open their record.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : sortedSurveys.length === 0 ? (
                <EmptyState onCollect={() => setCollectOpen(true)} />
              ) : (
                <>
                  {/* Desktop: table */}
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-[28%]">Patient</TableHead>
                          <TableHead className="w-[14%]">Surgery</TableHead>
                          <TableHead className="w-[10%]">Overall</TableHead>
                          <TableHead className="w-[16%]">Sub-ratings</TableHead>
                          <TableHead className="w-[8%]">Recommend</TableHead>
                          <TableHead>Feedback</TableHead>
                          <TableHead className="w-[12%] text-right">Date</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {sortedSurveys.map((s) => (
                          <SurveyRow key={s.id} survey={s} />
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile: cards */}
                  <div className="md:hidden divide-y divide-border">
                    {sortedSurveys.map((s) => (
                      <SurveyCard key={s.id} survey={s} />
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </motion.section>
      </div>

      {/* Collect survey dialog */}
      <CollectSurveyDialog
        open={collectOpen}
        onOpenChange={setCollectOpen}
        onSubmitted={load}
      />
    </MotionConfig>
  );
}

// ── Aggregate card ──────────────────────────────────────────────────────────
function AggCard({
  label, value, icon: Icon, loading, delay, suffix, starRating,
}: {
  label: string;
  value: number | null | undefined;
  icon: React.ComponentType<{ className?: string }>;
  loading: boolean;
  delay: number;
  suffix?: string;
  starRating?: number | null;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
    >
      <Card className="glass hover:glow-primary transition-shadow h-full">
        <CardContent className="p-3 md:p-4 flex flex-col gap-1.5">
          <div className="flex items-center justify-between">
            <span className="text-[10px] md:text-[11px] font-medium text-muted-foreground uppercase tracking-wider leading-tight">
              {label}
            </span>
            <span className="flex items-center justify-center h-6 w-6 rounded-md bg-primary/10 text-primary">
              <Icon className="h-3 w-3" />
            </span>
          </div>
          {loading ? (
            <Skeleton className="h-7 w-16" />
          ) : value === null || value === undefined ? (
            <Badge variant="outline" className="text-muted-foreground bg-muted/50 w-fit">
              Insufficient data
            </Badge>
          ) : (
            <div className="flex items-baseline gap-1">
              <span className="text-xl md:text-2xl font-semibold tabular-nums">
                {value}
              </span>
              {suffix && (
                <span className="text-xs text-muted-foreground">{suffix}</span>
              )}
            </div>
          )}
          {starRating !== undefined && starRating !== null && !loading && (
            <StarRow rating={starRating} size="sm" />
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ── Star row (renders filled / empty stars for a rating) ────────────────────
function StarRow({
  rating, size = "md",
}: {
  rating: number;
  size?: "sm" | "md";
}) {
  const sz = size === "sm" ? "h-3 w-3" : "h-4 w-4";
  const rounded = Math.round(rating);
  return (
    <div className="flex items-center gap-0.5" aria-label={`${rounded} out of 5 stars`}>
      {Array.from({ length: 5 }).map((_, i) => (
        <Star
          key={i}
          className={cn(
            sz,
            i < rounded
              ? "fill-amber-400 text-amber-400"
              : "fill-transparent text-muted-foreground/40"
          )}
        />
      ))}
    </div>
  );
}

// ── Survey table row (desktop) ──────────────────────────────────────────────
function SurveyRow({ survey }: { survey: Survey }) {
  return (
    <TableRow
      className="cursor-pointer hover:bg-muted/40 transition-colors"
      onClick={() => navigate("patient-detail", { patientId: survey.patientId })}
    >
      <TableCell className="font-medium">
        {survey.patient.fullName}
        {survey.patient.age !== null && (
          <span className="text-xs text-muted-foreground ml-1.5">
            · {survey.patient.age}y
          </span>
        )}
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">
        {survey.patient.surgeryType || "—"}
      </TableCell>
      <TableCell>
        <StarRow rating={survey.overallRating} size="sm" />
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2 text-[11px] text-muted-foreground tabular-nums">
          <SubRating label="Care" value={survey.careQuality} />
          <SubRating label="Comm" value={survey.communication} />
          <SubRating label="Resp" value={survey.responsiveness} />
        </div>
      </TableCell>
      <TableCell>
        {survey.wouldRecommend === null ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : survey.wouldRecommend ? (
          <CheckCircle2 className="h-4 w-4 text-primary" />
        ) : (
          <XCircle className="h-4 w-4 text-rose-500" />
        )}
      </TableCell>
      <TableCell className="max-w-[280px]">
        {survey.freeText ? (
          <TooltipProvider delayDuration={200}>
            <UITooltip>
              <TooltipTrigger asChild>
                <span className="text-xs text-muted-foreground line-clamp-1 italic cursor-help">
                  &ldquo;{survey.freeText}&rdquo;
                </span>
              </TooltipTrigger>
              <TooltipContent side="top" className="max-w-xs">
                <p className="text-xs leading-relaxed">{survey.freeText}</p>
              </TooltipContent>
            </UITooltip>
          </TooltipProvider>
        ) : (
          <span className="text-xs text-muted-foreground italic">No comment</span>
        )}
      </TableCell>
      <TableCell className="text-right text-xs text-muted-foreground tabular-nums">
        {formatDate(survey.collectedAt)}
      </TableCell>
    </TableRow>
  );
}

function SubRating({ label, value }: { label: string; value: number | null }) {
  if (value === null) return null;
  return (
    <span className="inline-flex items-center gap-0.5">
      <span className="text-[10px] uppercase tracking-wide">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </span>
  );
}

// ── Survey card (mobile) ────────────────────────────────────────────────────
function SurveyCard({ survey }: { survey: Survey }) {
  return (
    <button
      onClick={() => navigate("patient-detail", { patientId: survey.patientId })}
      className="w-full text-left p-4 hover:bg-muted/40 transition-colors"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium truncate">{survey.patient.fullName}</div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {survey.patient.surgeryType || "Unspecified surgery"}
            {survey.patient.age !== null && ` · ${survey.patient.age}y`}
          </div>
        </div>
        <StarRow rating={survey.overallRating} size="sm" />
      </div>
      <div className="flex items-center gap-3 mt-2 flex-wrap">
        {survey.careQuality !== null && (
          <span className="text-[10px] text-muted-foreground">
            Care: <span className="text-foreground font-medium">{survey.careQuality}</span>
          </span>
        )}
        {survey.communication !== null && (
          <span className="text-[10px] text-muted-foreground">
            Comm: <span className="text-foreground font-medium">{survey.communication}</span>
          </span>
        )}
        {survey.responsiveness !== null && (
          <span className="text-[10px] text-muted-foreground">
            Resp: <span className="text-foreground font-medium">{survey.responsiveness}</span>
          </span>
        )}
        {survey.wouldRecommend !== null && (
          <span
            className={cn(
              "inline-flex items-center gap-1 text-[10px] font-medium",
              survey.wouldRecommend ? "text-primary" : "text-rose-500"
            )}
          >
            {survey.wouldRecommend ? (
              <ThumbsUp className="h-3 w-3" />
            ) : (
              <ThumbsDown className="h-3 w-3" />
            )}
            {survey.wouldRecommend ? "Recommends" : "Doesn't recommend"}
          </span>
        )}
      </div>
      {survey.freeText && (
        <p className="text-xs text-muted-foreground italic mt-2 line-clamp-2">
          &ldquo;{survey.freeText}&rdquo;
        </p>
      )}
      <div className="text-[10px] text-muted-foreground mt-2">
        {formatDate(survey.collectedAt)}
      </div>
    </button>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────────
function EmptyState({ onCollect }: { onCollect: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center mb-3">
        <Star className="h-6 w-6 text-primary" />
      </div>
      <p className="text-sm font-medium">No surveys collected yet</p>
      <p className="text-xs text-muted-foreground mt-1 max-w-sm leading-relaxed">
        Collect feedback from patients who&apos;ve completed their recovery window.
      </p>
      <Button onClick={onCollect} className="mt-4" size="sm">
        <Plus className="h-4 w-4" /> Collect survey
      </Button>
    </div>
  );
}

// ── Collect survey dialog ───────────────────────────────────────────────────
function CollectSurveyDialog({
  open, onOpenChange, onSubmitted,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmitted: () => void;
}) {
  const [patients, setPatients] = React.useState<PatientOption[]>([]);
  const [patientsLoading, setPatientsLoading] = React.useState(false);
  const [patientId, setPatientId] = React.useState<string>("");
  const [overall, setOverall] = React.useState<number>(0);
  const [care, setCare] = React.useState<number>(0);
  const [communication, setCommunication] = React.useState<number>(0);
  const [responsiveness, setResponsiveness] = React.useState<number>(0);
  const [wouldRecommend, setWouldRecommend] = React.useState<boolean>(true);
  const [freeText, setFreeText] = React.useState<string>("");
  const [submitting, setSubmitting] = React.useState(false);

  // Reset transient state on close.
  React.useEffect(() => {
    if (!open) {
      setPatientId("");
      setOverall(0);
      setCare(0);
      setCommunication(0);
      setResponsiveness(0);
      setWouldRecommend(true);
      setFreeText("");
      setSubmitting(false);
    }
  }, [open]);

  // Lazy-load patient list when the dialog opens.
  React.useEffect(() => {
    if (!open) return;
    setPatientsLoading(true);
    api<{ patients: PatientOption[] }>("/api/patients")
      .then((r) => setPatients(r.patients))
      .catch((err) => {
        toast.error(err instanceof Error ? err.message : "Failed to load patients");
      })
      .finally(() => setPatientsLoading(false));
  }, [open]);

  const canSubmit =
    patientId && overall >= 1 && overall <= 5 && !submitting;

  const submit = async () => {
    if (!patientId || overall < 1 || overall > 5) return;
    setSubmitting(true);
    try {
      await api("/api/surveys", {
        method: "POST",
        body: JSON.stringify({
          patientId,
          overallRating: overall,
          careQuality: care > 0 ? care : undefined,
          communication: communication > 0 ? communication : undefined,
          responsiveness: responsiveness > 0 ? responsiveness : undefined,
          wouldRecommend,
          freeText: freeText.trim() || undefined,
        }),
      });
      toast.success("Survey collected", {
        description: "Patient feedback recorded in the audit trail.",
      });
      onOpenChange(false);
      onSubmitted();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to collect survey");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto fancy-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardList className="h-5 w-5 text-primary" />
            Collect satisfaction survey
          </DialogTitle>
          <DialogDescription>
            Record patient feedback at the end of their recovery window. One survey per patient.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Patient select */}
          <div className="space-y-1.5">
            <Label htmlFor="survey-patient">Patient</Label>
            <Select value={patientId} onValueChange={setPatientId}>
              <SelectTrigger id="survey-patient" className="w-full">
                <SelectValue
                  placeholder={patientsLoading ? "Loading patients…" : "Select a patient"}
                />
              </SelectTrigger>
              <SelectContent>
                {patients.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.fullName}
                    {p.surgeryType ? ` · ${p.surgeryType}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {patients.length === 0 && !patientsLoading && (
              <p className="text-[11px] text-muted-foreground">
                No patients found. Enroll a patient first.
              </p>
            )}
          </div>

          {/* Overall rating */}
          <div className="space-y-1.5">
            <Label>Overall rating</Label>
            <StarPicker value={overall} onChange={setOverall} />
          </div>

          {/* Sub-ratings */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="space-y-1.5">
              <Label className="text-xs">Care quality</Label>
              <StarPicker value={care} onChange={setCare} size="sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Communication</Label>
              <StarPicker value={communication} onChange={setCommunication} size="sm" />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">Responsiveness</Label>
              <StarPicker value={responsiveness} onChange={setResponsiveness} size="sm" />
            </div>
          </div>

          {/* Would recommend */}
          <div className="flex items-center justify-between gap-3 rounded-lg border border-border p-3">
            <div className="min-w-0">
              <Label htmlFor="survey-recommend" className="text-sm font-medium">
                Would recommend
              </Label>
              <p className="text-[11px] text-muted-foreground mt-0.5">
                Would this patient recommend your hospital to others?
              </p>
            </div>
            <Switch
              id="survey-recommend"
              checked={wouldRecommend}
              onCheckedChange={setWouldRecommend}
            />
          </div>

          {/* Free text */}
          <div className="space-y-1.5">
            <Label htmlFor="survey-text">Patient comments (optional)</Label>
            <Textarea
              id="survey-text"
              placeholder="What did the patient say about their recovery experience?"
              value={freeText}
              onChange={(e) => setFreeText(e.target.value)}
              rows={3}
              maxLength={1000}
            />
            <p className="text-[11px] text-muted-foreground text-right">
              {freeText.length}/1000
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={submitting}
          >
            Cancel
          </Button>
          <Button onClick={submit} disabled={!canSubmit}>
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Saving…
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" /> Collect survey
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Star picker (interactive 1-5 stars) ────────────────────────────────────
function StarPicker({
  value, onChange, size = "md",
}: {
  value: number;
  onChange: (v: number) => void;
  size?: "sm" | "md";
}) {
  const sz = size === "sm" ? "h-5 w-5" : "h-7 w-7";
  const [hover, setHover] = React.useState<number>(0);
  const shown = hover || value;
  return (
    <div
      className="flex items-center gap-1"
      onMouseLeave={() => setHover(0)}
      role="radiogroup"
      aria-label="Star rating"
    >
      {Array.from({ length: 5 }).map((_, i) => {
        const n = i + 1;
        const active = n <= shown;
        return (
          <button
            key={n}
            type="button"
            onClick={() => onChange(n)}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(0)}
            aria-label={`${n} star${n === 1 ? "" : "s"}`}
            aria-checked={value === n}
            role="radio"
            className={cn(
              "rounded-md p-0.5 transition-transform hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "text-amber-400" : "text-muted-foreground/40"
            )}
          >
            <Star className={cn(sz, active && "fill-amber-400")} />
          </button>
        );
      })}
      {value > 0 && (
        <span className="ml-2 text-xs text-muted-foreground tabular-nums">
          {value}/5
        </span>
      )}
    </div>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────────────
function formatDate(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
