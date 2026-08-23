"use client";

import * as React from "react";
import { MotionConfig, motion } from "framer-motion";
import { toast } from "sonner";
import { format } from "date-fns";
import {
  UserPlus, ChevronRight, ChevronLeft, Check, ShieldCheck,
  Loader2, PartyPopper, Stethoscope, AlertCircle, User as UserIcon,
} from "lucide-react";

import { api } from "@/lib/auth-context";
import { navigate } from "@/lib/router";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";

// ── Wizard shape ────────────────────────────────────────────────────────────
interface FormState {
  fullName: string;
  age: string;
  gender: string;
  mobile: string;
  surgeryType: string;
  surgeryTypeOther: string;
  surgeryDate: string;
  dischargeDate: string;
  comorbidities: string[];
  dpdpaConsent: boolean;
  whatsappConsent: boolean;
  aiTriageConsent: boolean;
  dataSharingConsent: boolean;
}

const SURGERY_TYPES = [
  "Coronary Bypass",
  "Total Knee Replacement",
  "Hip Replacement",
  "Cholecystectomy",
  "Appendectomy",
  "Caesarean Section",
  "Prostatectomy",
  "Hernia Repair",
  "Cataract",
];

const COMORBIDITY_OPTIONS = [
  "Hypertension", "Diabetes", "Cardiac", "Respiratory", "Renal", "None",
];

const STEPS = ["Patient basics", "Surgery & discharge", "Consent", "Review"] as const;

const INITIAL: FormState = {
  fullName: "", age: "", gender: "", mobile: "",
  surgeryType: "", surgeryTypeOther: "", surgeryDate: "", dischargeDate: "",
  comorbidities: [], dpdpaConsent: false, whatsappConsent: false, aiTriageConsent: false, dataSharingConsent: false,
};

// ── Page ────────────────────────────────────────────────────────────────────
export function EnrollPage() {
  const [step, setStep] = React.useState<0 | 1 | 2 | 3>(0);
  const [form, setForm] = React.useState<FormState>(INITIAL);
  const [submitting, setSubmitting] = React.useState(false);
  const [success, setSuccess] = React.useState<{ patientId: string; name: string; checkins: number } | null>(null);

  const set = <K extends keyof FormState>(k: K, v: FormState[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  const reset = () => {
    setForm(INITIAL);
    setStep(0);
    setSuccess(null);
  };

  // ── Step validation ────────────────────────────────────────────────────
  const stepErrors = (s: number): Record<string, string> => {
    const errs: Record<string, string> = {};
    if (s === 0) {
      if (!form.fullName.trim() || form.fullName.trim().length < 2) errs.fullName = "Patient name is required.";
      const ageN = Number(form.age);
      if (!form.age || Number.isNaN(ageN) || ageN < 0 || ageN > 130) errs.age = "Enter a valid age (0-130).";
      if (!form.gender) errs.gender = "Select a gender.";
      const cleaned = form.mobile.replace(/[\s-]/g, "");
      if (!form.mobile) errs.mobile = "Mobile number is required.";
      else if (!/^\+?91?\d{10}$/.test(cleaned) && !/^\d{10}$/.test(cleaned.replace(/^\+?91/, "")))
        errs.mobile = "Enter a valid 10-digit Indian mobile (with optional +91).";
    }
    if (s === 1) {
      if (!form.surgeryType) errs.surgeryType = "Select the surgery type.";
      if (form.surgeryType === "Other" && form.surgeryTypeOther.trim().length < 2)
        errs.surgeryTypeOther = "Specify the surgery type.";
      if (!form.surgeryDate) errs.surgeryDate = "Surgery date is required.";
      if (!form.dischargeDate) errs.dischargeDate = "Discharge date is required.";
      if (form.surgeryDate && form.dischargeDate &&
          new Date(form.dischargeDate) < new Date(form.surgeryDate))
        errs.dischargeDate = "Discharge date must be on or after the surgery date.";
      if (form.comorbidities.length === 0) errs.comorbidities = "Select at least one option.";
      if (form.comorbidities.includes("None") && form.comorbidities.length > 1)
        errs.comorbidities = "Select 'None' alone, or remove it when other conditions apply.";
    }
    if (s === 2) {
      if (!form.whatsappConsent) errs.whatsappConsent = "WhatsApp monitoring consent is required.";
      if (!form.aiTriageConsent) errs.aiTriageConsent = "AI triage consent is required.";
      if (!form.dataSharingConsent) errs.dataSharingConsent = "Data sharing consent is required.";
    }
    return errs;
  };

  const [errors, setErrors] = React.useState<Record<string, string>>({});
  const [touched, setTouched] = React.useState(false);

  const validateAndNext = () => {
    const e = stepErrors(step);
    setErrors(e);
    setTouched(true);
    if (Object.keys(e).length === 0) {
      setStep((s) => Math.min(3, s + 1) as 0 | 1 | 2 | 3);
      setTouched(false);
      setErrors({});
    }
  };

  const back = () => {
    setStep((s) => Math.max(0, s - 1) as 0 | 1 | 2 | 3);
    setTouched(false);
    setErrors({});
  };

  // ── Submit ─────────────────────────────────────────────────────────────
  const submit = async () => {
    // Re-run all step validations before submit (defensive).
    for (let i = 0; i < 3; i++) {
      const e = stepErrors(i);
      if (Object.keys(e).length > 0) {
        setStep(i as 0 | 1 | 2 | 3);
        setErrors(e);
        setTouched(true);
        toast.error("Please complete all required fields before submitting.");
        return;
      }
    }
    setSubmitting(true);
    try {
      const surgeryType = form.surgeryType === "Other" ? form.surgeryTypeOther.trim() : form.surgeryType;
      const comorbidities = form.comorbidities.includes("None")
        ? "None"
        : form.comorbidities.join(", ");
      const body = {
        fullName: form.fullName.trim(),
        age: Number(form.age),
        gender: form.gender,
        // Normalise: store as +91XXXXXXXXXX
        mobile: form.mobile.trim().startsWith("+")
          ? form.mobile.trim()
          : `+91${form.mobile.trim().replace(/^0+/, "")}`,
        surgeryType,
        surgeryDate: form.surgeryDate,
        dischargeDate: form.dischargeDate,
        comorbidities,
        dpdpaConsent: form.whatsappConsent && form.aiTriageConsent && form.dataSharingConsent,
        whatsappConsent: form.whatsappConsent,
        aiTriageConsent: form.aiTriageConsent,
        dataSharingConsent: form.dataSharingConsent,
      };
      type EnrollResp = { patient: { id: string; fullName: string }; checkinsScheduled: number };
      const r = await api<EnrollResp>("/api/patients", {
        method: "POST",
        body: JSON.stringify(body),
      });
      setSuccess({ patientId: r.patient.id, name: r.patient.fullName, checkins: r.checkinsScheduled });
      toast.success(`Enrolled ${r.patient.fullName}. ${r.checkinsScheduled} check-ins scheduled.`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Failed to enroll patient";
      toast.error(msg);
      // Stay on review step (per spec).
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return <SuccessView success={success} onAnother={reset} />;
  }

  return (
    <MotionConfig reducedMotion="user">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Enroll patient</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Capture the patient&apos;s basics, surgery, and DPDPA consent. Check-ins are scheduled automatically.
            </p>
          </div>
          <Button variant="ghost" onClick={() => navigate("patients")}>
            Cancel
          </Button>
        </div>

        {/* Progress indicator */}
        <ProgressIndicator step={step} />

        {/* Step card */}
        <Card className="glass-strong">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <StepNumber n={step + 1} total={4} />
              {STEPS[step]}
            </CardTitle>
            <CardDescription>
              {step === 0 && "Tell us about the patient."}
              {step === 1 && "Surgery details and recovery starting point."}
              {step === 2 && "Consent under the Digital Personal Data Protection Act 2023."}
              {step === 3 && "Review everything before submitting to the system."}
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {step === 0 && (
              <Step1 form={form} set={set} errors={touched ? errors : {}} />
            )}
            {step === 1 && (
              <Step2 form={form} set={set} errors={touched ? errors : {}} />
            )}
            {step === 2 && (
              <Step3 form={form} set={set} errors={touched ? errors : {}} />
            )}
            {step === 3 && (
              <Step4 form={form} />
            )}
          </CardContent>
        </Card>

        {/* Nav buttons */}
        <div className="flex items-center justify-between gap-3">
          <Button variant="outline" onClick={back} disabled={step === 0 || submitting}>
            <ChevronLeft className="h-4 w-4" /> Back
          </Button>
          {step < 3 ? (
            <Button onClick={validateAndNext} className="glow-primary">
              Next <ChevronRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button onClick={submit} disabled={submitting} className="glow-primary">
              {submitting ? (
                <><Loader2 className="h-4 w-4 animate-spin" /> Enrolling…</>
              ) : (
                <><UserPlus className="h-4 w-4" /> Submit enrollment</>
              )}
            </Button>
          )}
        </div>
      </div>
    </MotionConfig>
  );
}

// ── Progress ────────────────────────────────────────────────────────────────
function ProgressIndicator({ step }: { step: number }) {
  return (
    <div className="flex items-center gap-2">
      {STEPS.map((label, i) => (
        <React.Fragment key={label}>
          <div className={cn(
            "flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border transition-colors",
            i < step
              ? "bg-primary/10 text-primary border-primary/30"
              : i === step
                ? "bg-primary text-primary-foreground border-primary glow-primary"
                : "bg-card text-muted-foreground border-border"
          )}>
            {i < step ? <Check className="h-3 w-3" /> : <span className="tabular-nums">{i + 1}</span>}
            <span className="hidden sm:inline">{label}</span>
          </div>
          {i < STEPS.length - 1 && (
            <div className={cn("h-px flex-1 min-w-[8px]", i < step ? "bg-primary/40" : "bg-border")} />
          )}
        </React.Fragment>
      ))}
    </div>
  );
}

function StepNumber({ n, total }: { n: number; total: number }) {
  return (
    <span className="inline-flex items-center justify-center h-6 px-2 rounded-md bg-primary/10 text-primary text-xs font-semibold tabular-nums">
      {n} of {total}
    </span>
  );
}

// ── Step 1 ──────────────────────────────────────────────────────────────────
function Step1({
  form, set, errors,
}: {
  form: FormState;
  set: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  errors: Record<string, string>;
}) {
  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="fullName">Full name <span className="text-destructive">*</span></Label>
        <Input
          id="fullName"
          value={form.fullName}
          onChange={(e) => set("fullName", e.target.value)}
          placeholder="e.g. Anjali Verma"
          aria-invalid={!!errors.fullName}
        />
        {errors.fullName && <FieldErr msg={errors.fullName} />}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="age">Age <span className="text-destructive">*</span></Label>
          <Input
            id="age"
            type="number"
            min={0}
            max={130}
            value={form.age}
            onChange={(e) => set("age", e.target.value)}
            placeholder="e.g. 54"
            aria-invalid={!!errors.age}
          />
          {errors.age && <FieldErr msg={errors.age} />}
        </div>
        <div className="space-y-1.5">
          <Label>Gender <span className="text-destructive">*</span></Label>
          <RadioGroup
            value={form.gender}
            onValueChange={(v) => set("gender", v)}
            className="grid grid-cols-3 gap-2"
          >
            {["Male", "Female", "Other"].map((g) => (
              <label
                key={g}
                htmlFor={`gender-${g}`}
                className={cn(
                  "flex items-center justify-center gap-2 h-9 rounded-md border cursor-pointer text-sm transition-colors",
                  form.gender === g
                    ? "border-primary bg-primary/10 text-primary"
                    : "border-border hover:bg-muted"
                )}
              >
                <RadioGroupItem id={`gender-${g}`} value={g} className="sr-only" />
                {g}
              </label>
            ))}
          </RadioGroup>
          {errors.gender && <FieldErr msg={errors.gender} />}
        </div>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="mobile">Mobile number <span className="text-destructive">*</span></Label>
        <div className="flex">
          <span className="inline-flex items-center px-3 rounded-l-md border border-r-0 border-input bg-muted text-sm text-muted-foreground">
            +91
          </span>
          <Input
            id="mobile"
            type="tel"
            inputMode="numeric"
            className="rounded-l-none"
            value={form.mobile}
            onChange={(e) => set("mobile", e.target.value)}
            placeholder="9876543210"
            aria-invalid={!!errors.mobile}
          />
        </div>
        {errors.mobile
          ? <FieldErr msg={errors.mobile} />
          : <p className="text-xs text-muted-foreground">10-digit Indian mobile. We&apos;ll send WhatsApp check-ins to this number.</p>}
      </div>

      <Alert className="bg-muted/40">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <AlertTitle>PII is encrypted at rest</AlertTitle>
        <AlertDescription>
          The mobile number is stored AES-256-GCM encrypted with a deterministic
          lookup hash for inbound message matching — never in plaintext.
        </AlertDescription>
      </Alert>
    </>
  );
}

// ── Step 2 ──────────────────────────────────────────────────────────────────
function Step2({
  form, set, errors,
}: {
  form: FormState;
  set: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  errors: Record<string, string>;
}) {
  const toggleComorbid = (c: string) => {
    set("comorbidities",
      form.comorbidities.includes(c)
        ? form.comorbidities.filter((x) => x !== c)
        : [...form.comorbidities, c]
    );
  };

  return (
    <>
      <div className="space-y-1.5">
        <Label htmlFor="surgeryType">Surgery type <span className="text-destructive">*</span></Label>
        <Select
          value={form.surgeryType}
          onValueChange={(v) => set("surgeryType", v)}
        >
          <SelectTrigger id="surgeryType" className="w-full" aria-invalid={!!errors.surgeryType}>
            <SelectValue placeholder="Select surgery type" />
          </SelectTrigger>
          <SelectContent>
            {SURGERY_TYPES.map((s) => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            <SelectItem value="Other">Other</SelectItem>
          </SelectContent>
        </Select>
        {errors.surgeryType && <FieldErr msg={errors.surgeryType} />}
      </div>

      {form.surgeryType === "Other" && (
        <div className="space-y-1.5">
          <Label htmlFor="surgeryTypeOther">Specify surgery <span className="text-destructive">*</span></Label>
          <Input
            id="surgeryTypeOther"
            value={form.surgeryTypeOther}
            onChange={(e) => set("surgeryTypeOther", e.target.value)}
            placeholder="e.g. Laparoscopic myomectomy"
            aria-invalid={!!errors.surgeryTypeOther}
          />
          {errors.surgeryTypeOther && <FieldErr msg={errors.surgeryTypeOther} />}
        </div>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1.5">
          <Label htmlFor="surgeryDate">Surgery date <span className="text-destructive">*</span></Label>
          <Input
            id="surgeryDate"
            type="date"
            max={format(new Date(), "yyyy-MM-dd")}
            value={form.surgeryDate}
            onChange={(e) => set("surgeryDate", e.target.value)}
            aria-invalid={!!errors.surgeryDate}
          />
          {errors.surgeryDate && <FieldErr msg={errors.surgeryDate} />}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="dischargeDate">Discharge date <span className="text-destructive">*</span></Label>
          <Input
            id="dischargeDate"
            type="date"
            min={form.surgeryDate || undefined}
            max={format(new Date(), "yyyy-MM-dd")}
            value={form.dischargeDate}
            onChange={(e) => set("dischargeDate", e.target.value)}
            aria-invalid={!!errors.dischargeDate}
          />
          {errors.dischargeDate && <FieldErr msg={errors.dischargeDate} />}
        </div>
      </div>

      <div className="space-y-2">
        <Label>Comorbidities <span className="text-destructive">*</span></Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          {COMORBIDITY_OPTIONS.map((c) => {
            const checked = form.comorbidities.includes(c);
            return (
              <label
                key={c}
                htmlFor={`comorbid-${c}`}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 rounded-md border cursor-pointer text-sm transition-colors",
                  checked ? "border-primary bg-primary/10 text-primary" : "border-border hover:bg-muted"
                )}
              >
                <Checkbox
                  id={`comorbid-${c}`}
                  checked={checked}
                  onCheckedChange={() => toggleComorbid(c)}
                />
                {c}
              </label>
            );
          })}
        </div>
        {errors.comorbidities && <FieldErr msg={errors.comorbidities} />}
      </div>
    </>
  );
}

// ── Step 3 — Consent ────────────────────────────────────────────────────────
function Step3({
  form, set, errors,
}: {
  form: FormState;
  set: <K extends keyof FormState>(k: K, v: FormState[K]) => void;
  errors: Record<string, string>;
}) {
  return (
    <div className="space-y-4">
      <Alert className="border-primary/30 bg-primary/5">
        <ShieldCheck className="h-4 w-4 text-primary" />
        <AlertTitle>DPDPA 2023 consent</AlertTitle>
        <AlertDescription>
          Required under the Digital Personal Data Protection Act 2023 for any
          post-discharge monitoring involving personal data. All three consents
          must be obtained before enrollment.
        </AlertDescription>
      </Alert>

      {/* WhatsApp monitoring consent */}
      <label
        htmlFor="whatsapp-consent"
        className={cn(
          "flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors",
          form.whatsappConsent
            ? "border-primary bg-primary/10"
            : "border-border hover:bg-muted",
          errors.whatsappConsent && "border-destructive"
        )}
      >
        <Checkbox
          id="whatsapp-consent"
          checked={form.whatsappConsent}
          onCheckedChange={(v) => set("whatsappConsent", v === true)}
          className="mt-0.5"
        />
        <div className="text-sm">
          <div className="font-medium">WhatsApp monitoring consent</div>
          <div className="text-muted-foreground mt-0.5">
            I consent to receiving health check-in messages via WhatsApp for post-discharge monitoring.
          </div>
        </div>
      </label>
      {errors.whatsappConsent && <FieldErr msg={errors.whatsappConsent} />}

      {/* AI triage consent */}
      <label
        htmlFor="ai-triage-consent"
        className={cn(
          "flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors",
          form.aiTriageConsent
            ? "border-primary bg-primary/10"
            : "border-border hover:bg-muted",
          errors.aiTriageConsent && "border-destructive"
        )}
      >
        <Checkbox
          id="ai-triage-consent"
          checked={form.aiTriageConsent}
          onCheckedChange={(v) => set("aiTriageConsent", v === true)}
          className="mt-0.5"
        />
        <div className="text-sm">
          <div className="font-medium">AI triage consent</div>
          <div className="text-muted-foreground mt-0.5">
            I consent to AI-assisted analysis of my health responses for risk assessment.
          </div>
        </div>
      </label>
      {errors.aiTriageConsent && <FieldErr msg={errors.aiTriageConsent} />}

      {/* Data sharing with hospital consent */}
      <label
        htmlFor="data-sharing-consent"
        className={cn(
          "flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-colors",
          form.dataSharingConsent
            ? "border-primary bg-primary/10"
            : "border-border hover:bg-muted",
          errors.dataSharingConsent && "border-destructive"
        )}
      >
        <Checkbox
          id="data-sharing-consent"
          checked={form.dataSharingConsent}
          onCheckedChange={(v) => set("dataSharingConsent", v === true)}
          className="mt-0.5"
        />
        <div className="text-sm">
          <div className="font-medium">Data sharing with hospital consent</div>
          <div className="text-muted-foreground mt-0.5">
            I consent to sharing my health monitoring data with my treating hospital.
          </div>
        </div>
      </label>
      {errors.dataSharingConsent && <FieldErr msg={errors.dataSharingConsent} />}
    </div>
  );
}

// ── Step 4 — Review ─────────────────────────────────────────────────────────
function Step4({ form }: { form: FormState }) {
  const surgeryType = form.surgeryType === "Other" ? form.surgeryTypeOther : form.surgeryType;
  const comorbidities = form.comorbidities.length === 0
    ? "—"
    : form.comorbidities.includes("None")
      ? "None"
      : form.comorbidities.join(", ");
  return (
    <div className="space-y-4">
      <ReviewSection icon={UserIcon} title="Patient basics">
        <ReviewRow label="Full name" value={form.fullName} />
        <ReviewRow label="Age / gender" value={`${form.age}y · ${form.gender || "—"}`} />
        <ReviewRow label="Mobile" value={`+91 ${form.mobile}`} />
      </ReviewSection>
      <ReviewSection icon={Stethoscope} title="Surgery & discharge">
        <ReviewRow label="Surgery type" value={surgeryType || "—"} />
        <ReviewRow label="Surgery date" value={form.surgeryDate ? format(new Date(form.surgeryDate), "d MMM yyyy") : "—"} />
        <ReviewRow label="Discharge date" value={form.dischargeDate ? format(new Date(form.dischargeDate), "d MMM yyyy") : "—"} />
        <ReviewRow label="Comorbidities" value={comorbidities} />
      </ReviewSection>
      <ReviewSection icon={ShieldCheck} title="Consent">
        <ReviewRow
          label="WhatsApp monitoring"
          value={form.whatsappConsent
            ? <Badge className="bg-primary/15 text-primary border-primary/30">Obtained</Badge>
            : <Badge variant="outline">Not yet</Badge>}
        />
        <ReviewRow
          label="AI triage"
          value={form.aiTriageConsent
            ? <Badge className="bg-primary/15 text-primary border-primary/30">Obtained</Badge>
            : <Badge variant="outline">Not yet</Badge>}
        />
        <ReviewRow
          label="Data sharing with hospital"
          value={form.dataSharingConsent
            ? <Badge className="bg-primary/15 text-primary border-primary/30">Obtained</Badge>
            : <Badge variant="outline">Not yet</Badge>}
        />
      </ReviewSection>
      <Alert>
        <AlertCircle className="h-4 w-4" />
        <AlertTitle>What happens next</AlertTitle>
        <AlertDescription>
          Submitting creates the patient record, stores mobile encrypted, captures
          the consent timestamp, and schedules check-ins at 10 AM local for each
          day of the recovery window (default 14 days, configurable per hospital).
        </AlertDescription>
      </Alert>
    </div>
  );
}

function ReviewSection({
  icon: Icon, title, children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-border p-4 space-y-2 bg-muted/20">
      <div className="flex items-center gap-2 text-sm font-semibold">
        <Icon className="h-4 w-4 text-primary" /> {title}
      </div>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function ReviewRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 text-sm">
      <span className="text-muted-foreground flex-shrink-0">{label}</span>
      <span className="text-right font-medium break-words">{value}</span>
    </div>
  );
}

function FieldErr({ msg }: { msg: string }) {
  return <p className="text-xs text-destructive flex items-center gap-1 mt-1">
    <AlertCircle className="h-3 w-3" /> {msg}
  </p>;
}

// ── Success ─────────────────────────────────────────────────────────────────
function SuccessView({
  success, onAnother,
}: {
  success: { patientId: string; name: string; checkins: number };
  onAnother: () => void;
}) {
  return (
    <MotionConfig reducedMotion="user">
      <div className="max-w-xl mx-auto">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.35 }}
        >
          <Card className="glass-strong border-primary/30">
            <CardContent className="p-8 text-center space-y-4">
              <div className="mx-auto h-16 w-16 rounded-2xl bg-primary/15 flex items-center justify-center">
                <PartyPopper className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h2 className="text-xl font-semibold">Patient enrolled</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  <span className="font-medium text-foreground">{success.name}</span> is now in the
                  post-discharge care pathway.
                </p>
              </div>
              <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium">
                <Check className="h-4 w-4" /> {success.checkins} check-ins scheduled
              </div>
              <div className="flex flex-col sm:flex-row gap-2 pt-2 justify-center">
                <Button onClick={() => navigate("patient-detail", { patientId: success.patientId })} className="glow-primary">
                  View patient <ChevronRight className="h-4 w-4" />
                </Button>
                <Button variant="outline" onClick={onAnother}>
                  <UserPlus className="h-4 w-4" /> Enroll another
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </MotionConfig>
  );
}
