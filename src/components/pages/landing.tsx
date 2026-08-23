"use client";

// Ojas - public landing page.
//
// v2 - Compliance OS pass. Information architecture reworked to:
//   Hero → single trust bar → Problem → How it works → 6 AI agents (incl.
//   Risk Stratification) → "Everything inside" (grouped real-module
//   inventory) → Honest AI/audit trail → Compliance OS (DPDP / NABH / NHCX
//   / ABDM, each labelled live vs. roadmap) → Regulatory Clock signature
//   moment (live DPDP 72hr + IRDAI 3hr + ABDM M1–M4) → Security → Pricing
//   preview → "What we're built to move" (illustrative targets, no
//   fabricated pilot data) → Illustrative testimonial → FAQ (expanded with
//   NHCX/ABDM) → CTA + "About Ojas" single founder-identity block.
//
// Honesty pattern (continued from v1): FALLBACK labeling, "Illustrative"
// testimonial badge, "Live in demo" vs "BYO key" integration badges,
// "Insufficient data" labels. Extended to: "Live today" vs "On the roadmap"
// for the four compliance pillars, and "designed to" language for targets
// the company cannot yet attribute to a real pilot.
//
// Accessibility: visible keyboard focus on every interactive element
// (focus-visible:ring), prefers-reduced-motion respected via MotionConfig,
// mobile-first responsive grids, dark-mode parity on every new token.
//
// rose/destructive is reserved for clinical risk. amber = accent only.

import * as React from "react";
import { motion, MotionConfig, useReducedMotion } from "framer-motion";
import { navigate } from "@/lib/router";
import { AppFooter } from "@/components/app-shell";
import { OJAS_BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Accordion, AccordionItem, AccordionTrigger, AccordionContent,
} from "@/components/ui/accordion";
import {
  Tabs, TabsList, TabsTrigger, TabsContent,
} from "@/components/ui/tabs";
import {
  HeartPulse, Menu, X, ArrowRight, ShieldCheck, MessageSquare,
  Bot, Brain, Activity, Stethoscope, BellRing, BarChart3, FileText,
  ClipboardList, Users, CalendarClock, AlertTriangle, Workflow,
  Sparkles, Lock, CheckCircle2, CreditCard, Quote, KeyRound, HelpCircle, Building2, FileCheck, UserCheck,
  Gauge, ScrollText, PhoneCall, Server, TrendingUp, Clock,
  // New icons for v2 additions:
  ShieldAlert,           // Risk Stratification Agent
  Scale,                 // Compliance OS
  Timer,                 // Regulatory clock signature moment
  LayoutGrid,            // "Everything inside" section header
  GitBranch,             // Care pathway templates
  Pill,                  // Medication adherence
  Trophy, Star, TrendingDown, LineChart, FlaskConical,
  UsersRound, Upload, FileLock2, BookCheck, Award,
  Network,               // ABDM milestone chain
  Info,
} from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
};

// Orchestrated hero container - children stagger, not simultaneous
const heroContainer = {
  hidden: {},
  show: { transition: { staggerChildren: 0.09, delayChildren: 0.05 } },
};
const heroItem = {
  hidden: { opacity: 0, y: 18 },
  show: { opacity: 1, y: 0, transition: { duration: 0.55, ease: [0.2, 0.8, 0.2, 1] as const } },
};

function useScrolled(threshold = 16) {
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return scrolled;
}

// Small rAF count-up for the hero recovery ring - reduced-motion safe
function MiniCountUp({ to, duration = 1.4, className }: { to: number; duration?: number; className?: string }) {
  const reduce = useReducedMotion();
  const [n, setN] = React.useState(reduce ? to : 0);
  React.useEffect(() => {
    if (reduce) { setN(to); return; }
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min(1, (now - start) / (duration * 1000));
      const eased = 1 - Math.pow(1 - p, 3);
      setN(Math.round(eased * to));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, duration, reduce]);
  return <span className={className}>{n}</span>;
}

function BrandMark({ small }: { small?: boolean }) {
  return (
    <button
      onClick={() => navigate("landing")}
      className="flex items-center gap-2.5 group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-md"
      aria-label="Ojas home"
    >
      <div
        className={cn(
          "relative flex items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground glow-primary transition-transform duration-300 group-hover:scale-105",
          small ? "h-8 w-8" : "h-9 w-9"
        )}
      >
        <HeartPulse className={small ? "h-4 w-4" : "h-5 w-5"} />
        <span className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/20" aria-hidden />
      </div>
      <div className="text-left leading-none">
        <div className={cn("font-semibold tracking-tight", small ? "text-base" : "text-lg")}>
          Ojas
        </div>
        {!small && (
          <div className="text-[10px] text-muted-foreground uppercase tracking-[0.14em] mt-0.5">
            post-discharge care
          </div>
        )}
      </div>
    </button>
  );
}

function scrollToSection(id: string) {
  const onLanding = new URLSearchParams(window.location.search).get("view") !== "pricing";
  const doScroll = () => {
    const el = document.getElementById(id);
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  if (onLanding) {
    doScroll();
  } else {
    navigate("landing");
    setTimeout(doScroll, 120);
  }
}

interface NavLink { label: string; onClick: () => void; }

export function PublicNav() {
  const scrolled = useScrolled();
  const [open, setOpen] = React.useState(false);
  const links: NavLink[] = [
    { label: "Features", onClick: () => scrollToSection("features") },
    { label: "Compliance OS", onClick: () => scrollToSection("compliance-os") },
    { label: "Pricing", onClick: () => navigate("pricing") },
    { label: "Security", onClick: () => scrollToSection("security") },
    { label: "Contact", onClick: () => scrollToSection("contact") },
  ];
  return (
    <header
      className={cn(
        "sticky top-0 z-50 transition-all duration-300",
        scrolled
          ? "glass-strong border-b border-border shadow-[0_4px_24px_-12px_oklch(0.18_0.02_200/0.18)]"
          : "bg-transparent border-b border-transparent"
      )}
    >
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
        <BrandMark />
        <nav className="hidden md:flex items-center gap-7">
          {links.map((l) => (
            <button
              key={l.label}
              onClick={l.onClick}
              className="relative text-sm font-medium text-foreground/80 hover:text-foreground transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded-md"
            >
              {l.label}
              <span className="absolute -bottom-1 left-0 right-0 h-px bg-primary scale-x-0 group-hover:scale-x-100 transition-transform origin-left duration-200" />
            </button>
          ))}
        </nav>
        <div className="hidden md:flex items-center gap-2">
          <Button variant="ghost" size="sm" onClick={() => navigate("login")}>
            Sign in
          </Button>
          <Button size="sm" onClick={() => scrollToSection("contact")} className="glow-primary">
            Book a demo <ArrowRight className="h-4 w-4" />
          </Button>
        </div>
        <button
          className="md:hidden p-2 rounded-md hover:bg-accent/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label="Open menu"
          onClick={() => setOpen((v) => !v)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <div className="md:hidden glass-strong border-t border-border animate-in slide-in-from-top duration-200">
          <div className="px-4 py-4 flex flex-col gap-1">
            {links.map((l) => (
              <button
                key={l.label}
                onClick={() => { l.onClick(); setOpen(false); }}
                className="text-left px-3 py-2.5 rounded-md text-sm font-medium hover:bg-accent/50 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                {l.label}
              </button>
            ))}
            <div className="flex gap-2 mt-2">
              <Button variant="outline" className="flex-1" onClick={() => { navigate("login"); setOpen(false); }}>
                Sign in
              </Button>
              <Button className="flex-1" onClick={() => { scrollToSection("contact"); setOpen(false); }}>
                Book a demo
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

// -- Hero preview - a real product mockup with depth -------------------------
function HeroPreview() {
  return (
    <div className="relative w-full max-w-md">
      {/* Ambient glow behind the composition, tied to the aurora system */}
      <div
        aria-hidden
        className="absolute -inset-6 -z-10 rounded-[2rem] opacity-70 blur-2xl"
        style={{
          background:
            "radial-gradient(60% 50% at 30% 30%, oklch(0.62 0.14 165 / 0.22), transparent 70%), radial-gradient(50% 50% at 80% 70%, oklch(0.78 0.14 75 / 0.18), transparent 70%)",
        }}
      />
      {/* Floating recovery-ring mini card (top-right, overlapping) */}
      <motion.div
        initial={{ opacity: 0, y: 12, rotate: -2 }}
        animate={{ opacity: 1, y: 0, rotate: -3 }}
        transition={{ duration: 0.6, delay: 0.5, ease: [0.2, 0.8, 0.2, 1] }}
        className="absolute -top-5 right-0 sm:-right-8 z-20 glass-strong rounded-xl p-3 elevate-3 w-[148px]"
      >
        <div className="flex items-center gap-1.5 mb-1.5">
          <span className="live-dot h-1.5 w-1.5 rounded-full bg-primary" />
          <span className="text-[9px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">Recovery</span>
        </div>
        <div className="flex items-end gap-1">
          <span className="num text-2xl font-semibold leading-none">
            <MiniCountUp to={94} />%
          </span>
          <span className="text-[10px] text-primary font-medium mb-0.5">on track</span>
        </div>
        <div className="mt-1.5 h-1.5 w-full rounded-full bg-muted overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-primary to-accent"
            initial={{ width: 0 }}
            animate={{ width: "94%" }}
            transition={{ duration: 1.3, delay: 0.6, ease: [0.2, 0.8, 0.2, 1] }}
          />
        </div>
        <div className="text-[9px] text-muted-foreground mt-1 num">12 of 13 patients</div>
      </motion.div>

      {/* Primary live-worklist card */}
      <motion.div
        initial={{ opacity: 0, y: 18, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.65, delay: 0.25, ease: [0.2, 0.8, 0.2, 1] }}
        className="glass-strong rounded-2xl p-4 elevate-3 border border-border/60"
      >
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
            <span className="h-2.5 w-2.5 rounded-full bg-foreground/15" />
          </div>
          <Badge variant="outline" className="text-[10px] gap-1.5">
            <span className="live-dot h-1.5 w-1.5 rounded-full bg-primary" />
            <Activity className="h-3 w-3" /> Live worklist
          </Badge>
        </div>
        <div className="rounded-xl border border-border/60 bg-card/80 p-3.5 rail-high">
          <div className="flex items-start justify-between gap-2 mb-2 pl-1">
            <div>
              <div className="text-sm font-semibold">Ramesh Gupta</div>
              <div className="text-[11px] text-muted-foreground num">Day 3 post-Coronary Bypass · 62y · M</div>
            </div>
            <span className="risk-high text-[10px] font-semibold px-2 py-0.5 rounded-md">HIGH</span>
          </div>
          <div className="space-y-1.5 text-[11px] text-muted-foreground pl-1">
            <div className="flex items-center gap-2 num">
              <span className="risk-medium text-[10px] font-semibold px-1.5 py-0.5 rounded">PAIN 7/10</span>
              <span className="risk-low text-[10px] font-semibold px-1.5 py-0.5 rounded">TEMP 38.1°C</span>
            </div>
            <div className="rounded-md bg-muted/60 p-2 text-[11px] leading-relaxed">
              <span className="font-semibold text-foreground">AI Triage ·</span> Severe incisional pain in a post-CABG patient with diabetes &amp; hypertension. Risk of wound complication.
            </div>
            <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground pt-1">
              <Sparkles className="h-3 w-3 text-primary" />
              <span>Reasoning trace logged · human-reviewed before escalation</span>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-md bg-primary/10 px-2.5 py-2 pl-1">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-primary">
              <BellRing className="h-3.5 w-3.5" /> Escalated to coordinator worklist
            </div>
            <Button size="sm" variant="ghost" className="h-7 text-[11px] px-2">Open</Button>
          </div>
        </div>
      </motion.div>

      {/* Floating AI-triage chip (bottom-left, overlapping) */}
      <motion.div
        initial={{ opacity: 0, y: 10, rotate: 2 }}
        animate={{ opacity: 1, y: 0, rotate: 2 }}
        transition={{ duration: 0.6, delay: 0.65, ease: [0.2, 0.8, 0.2, 1] }}
        className="absolute -bottom-4 left-0 sm:-left-6 z-20 glass-strong rounded-lg px-3 py-2 elevate-3 flex items-center gap-2.5"
      >
        <span className="flex items-center justify-center h-7 w-7 rounded-md bg-primary/10 text-primary">
          <Brain className="h-3.5 w-3.5" />
        </span>
        <div className="leading-tight">
          <div className="text-[10px] font-semibold">Triage Agent</div>
          <div className="text-[9px] text-muted-foreground num">HIGH · 2.3s · logged</div>
        </div>
      </motion.div>
    </div>
  );
}

function Section({
  id, eyebrow, title, subtitle, children, className,
}: {
  id?: string;
  eyebrow?: string;
  title?: React.ReactNode;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <section id={id} className={cn("py-16 md:py-24", className)}>
      <div className="max-w-[1400px] mx-auto px-4 md:px-8">
        {(eyebrow || title || subtitle) && (
          <motion.div
            variants={fadeUp}
            initial="hidden"
            whileInView="show"
            viewport={{ once: true, margin: "-80px" }}
            className="max-w-2xl mb-10 md:mb-14"
          >
            {eyebrow && (
              <div className="inline-flex items-center gap-1.5 text-eyebrow text-primary mb-3">
                <span className="h-1 w-1 rounded-full bg-primary" />
                {eyebrow}
              </div>
            )}
            {title && (
              <h2 className="text-h2">{title}</h2>
            )}
            {subtitle && (
              <p className="text-muted-foreground text-base md:text-lg mt-4 leading-relaxed">{subtitle}</p>
            )}
          </motion.div>
        )}
        {children}
      </div>
    </section>
  );
}

const PROBLEM_CARDS = [
  {
    icon: ClipboardList,
    title: "A spreadsheet nobody updates",
    body: "Discharge summaries land in a shared sheet that nobody owns. By week two it's stale, and the patient is invisible.",
  },
  {
    icon: Users,
    title: "Patients lost to follow-up",
    body: "Coordinators call during business hours. Patients don't pick up. Missed red flags turn into readmissions and avoidable harm.",
  },
  {
    icon: AlertTriangle,
    title: "Coordinators overwhelmed",
    body: "One coordinator covering 200 patients can't tell who actually needs attention today. Everything is treated as equally urgent - until something gives.",
  },
];

const STEPS = [
  { icon: UserPlus_Icon, title: "Enroll at discharge", body: "Capture mobile, surgery, recovery window. DPDP consent in one tap." },
  { icon: MessageSquare, title: "Scheduled WhatsApp check-ins", body: "Daily cadence over WhatsApp - pain, temperature, symptoms, free text." },
  { icon: Brain, title: "AI triage every response", body: "Each answer runs through the Triage Agent - real LLM call, logged reasoning." },
  { icon: BellRing, title: "Prioritized worklist", body: "Coordinators see the highest-risk patients first, with the AI's reasoning attached." },
];

function UserPlus_Icon(props: { className?: string }) {
  return <Users className={props.className} />;
}

// -- FEATURES - SIX AI agents (Risk Stratification Agent added in v2) --------
const FEATURES = [
  {
    icon: ShieldAlert,
    title: "Risk Stratification Agent",
    body: "Runs at enrollment. Produces a baseline LOW / MEDIUM / HIGH / CRITICAL risk band and a 0–100 score from age, comorbidities, surgery type, and surgery date. A rule-based fallback fires if the model is unavailable - honestly labeled FALLBACK.",
    ai: true,
  },
  {
    icon: Brain,
    title: "AI Triage Agent",
    body: "Real LLM call on every check-in response. Produces a risk band (LOW / MEDIUM / HIGH / CRITICAL) with a logged reasoning trace. Decision support for the coordinator, never a diagnosis.",
    ai: true,
  },
  {
    icon: MessageSquare,
    title: "Conversational Agent (Hinglish)",
    body: "Carries a multi-turn follow-up conversation with the patient in Hindi, English, or Hinglish. Clarifies vague answers so the Triage Agent gets cleaner signal.",
    ai: true,
  },
  {
    icon: Stethoscope,
    title: "Care Coach",
    body: "Generates plain-language recovery guidance - wound care, mobility, medication reminders - personalised to the patient's surgery and comorbidities. Reviewed by the care team before delivery.",
    ai: true,
  },
  {
    icon: BellRing,
    title: "Escalation Orchestrator",
    body: "Decides who to ping (coordinator, doctor, on-call) and how urgently. Above LOW risk, a human confirms before anything goes out. Honest rule-based fallback labeled as fallback.",
    ai: true,
  },
  {
    icon: BarChart3,
    title: "Insights",
    body: "Weekly cohort read on recovery trajectories, readmission signals, and check-in engagement. Honestly labeled 'insufficient data' when there isn't enough to say anything.",
    ai: true,
  },
];

// -- "Everything inside" - grouped real-module inventory ---------------------
// Source of truth: the authenticated app's NAV array (app-shell.tsx) and each
// page's top-of-file comment. Every module listed here is a real, shipped
// page in the product today - nothing fabricated, nothing on the roadmap
// mislabeled as shipped.
interface ModuleEntry { icon: React.ComponentType<{ className?: string }>; name: string; body: string; }
interface ModuleGroup { label: string; modules: ModuleEntry[]; }

const MODULE_GROUPS: ModuleGroup[] = [
  {
    label: "Care delivery",
    modules: [
      { icon: ClipboardList, name: "My worklist", body: "Per-coordinator personalized worklist - assigned escalations, pickable unassigned ones, upcoming check-ins, recent activity." },
      { icon: ShieldAlert, name: "Risk summary", body: "Hospital-wide risk stratification rollup from the Risk Stratification Agent's baseline scores." },
      { icon: Users, name: "Patients", body: "Tenant-scoped patient roster with status, surgery, day-of-recovery, and risk band at a glance." },
      { icon: UserCheck, name: "Enroll patient", body: "Capture mobile, surgery, recovery window. DPDP consent captured with timestamp and consent version." },
      { icon: CheckCircle2, name: "Check-ins console", body: "Log patient responses; each recorded response triggers the real Triage + Escalation Orchestrator agents." },
      { icon: AlertTriangle, name: "Escalations", body: "Human-in-the-loop gate. Every AI-proposed escalation above LOW sits here as OPEN until a coordinator confirms or overrides." },
      { icon: Clock, name: "Timeline", body: "Per-patient chronological event feed - check-ins, escalations, milestones, AI runs, all auditable." },
      { icon: Pill, name: "Medication adherence", body: "Patient-reported medication taking across answered check-ins. 14-day taken-vs-missed trend, per-patient breakdown." },
      { icon: BellRing, name: "Medication alerts", body: "Patients who reported missing meds in the last 7 days. Cards colour-coded by severity; auto-refreshes every 60s." },
      { icon: UsersRound, name: "Family updates", body: "Family Recovery Companion - ad-hoc and scheduled updates to a patient's nominated family contact." },
      { icon: GitBranch, name: "Care pathway templates", body: "Customize the recovery milestone schedule per surgery type. Hospital-specific templates override defaults at enrollment." },
      { icon: FileText, name: "Discharge summary + checklist", body: "Structured discharge summary with a per-patient checklist. Server-stored, audit-logged, exportable." },
    ],
  },
  {
    label: "Insights & quality",
    modules: [
      { icon: FileBarChart_Icon, name: "Reports", body: "Server-computed NABH-aligned metrics - follow-up coverage, escalation response times, outcomes. Exportable for audit." },
      { icon: TrendingDown, name: "Readmission analytics", body: "Real readmission rates over time, by surgery type, with a recent readmissions list. Honest 'Insufficient data' where sample sizes are too small." },
      { icon: LineChart, name: "Recovery trends", body: "Cross-patient vitals visualization - pain trends, fever episodes, response rate, adherence, per-patient trajectory." },
      { icon: Star, name: "Satisfaction surveys (CAHPS-aligned)", body: "Real patient feedback collected at the end of recovery windows. One survey per patient - enforced by the schema." },
      { icon: Trophy, name: "Coordinator success", body: "Per-coordinator weekly impact - patients managed, time saved, AI deteriorations caught, response rate. Before-Ojas vs. this-week comparison." },
      { icon: Users, name: "Team workload", body: "Hospital-wide workload distribution. Spot coordinators who are overloaded before something gives." },
      { icon: Gauge, name: "Productivity", body: "Throughput and response-time metrics per coordinator, per shift, per day." },
      { icon: Award, name: "Performance review", body: "Monthly summary of each coordinator's activity and outcomes - input to formal reviews." },
      { icon: BarChart3, name: "Benchmarking", body: "Compare the current hospital's metrics against anonymized aggregate stats across all hospitals on the platform." },
      { icon: FlaskConical, name: "Pilot / clinical validation tracker", body: "Live pilot study metrics (readmission, response, adherence, escalation severity, time-to-coordinator-response) against a pre-Ojas baseline the hospital admin enters." },
    ],
  },
  {
    label: "Compliance & administration",
    modules: [
      { icon: BookCheck, name: "NABH evidence binder", body: "Auto-generates compliance documentation from data already in the system. 14 standards across 6 NABH chapters; per-chapter rollup; PDF export." },
      { icon: FileLock2, name: "DPDP Lite", body: "Versioned consent (ConsentRecord / ConsentVersion), 72-hour breach clock (BreachNotification), Data Subject Request tracker (DpdpRequest)." },
      { icon: Bot, name: "AI usage & compliance view", body: "Every AI agent call - prompt ref, output, tokens, latency, outcome, fallback flag. The compliance record and billing input. Rose tint when fallback rate exceeds 10%." },
      { icon: Upload, name: "HMS import adapter", body: "CSV importer for bulk patient enrollment from hospital management systems." },
      { icon: CreditCard, name: "Billing", body: "Current plan, usage meters, plan tiers with Razorpay checkout + HMAC-verified webhook. Honest empty states for invoices." },
      { icon: ScrollText, name: "Audit log", body: "Every action - login, enrollment, check-in, escalation, AI call - logged with actor, timestamp, IP, detail. Exportable for compliance review." },
      { icon: Users, name: "Role-based team & invites", body: "SUPER_ADMIN / HOSPITAL_ADMIN / COORDINATOR / DOCTOR roles. Invite roles structurally constrained - SUPER_ADMIN can never be assigned via invite." },
      { icon: CalendarClock, name: "Shareable timeline links", body: "Public redacted timeline view (no PII) for a patient - accessed via signed token, no auth required. Family / second-opinion friendly." },
    ],
  },
];

function FileBarChart_Icon(props: { className?: string }) {
  // Reuse FileText icon for Reports to avoid importing an unused name.
  return <FileText className={props.className} />;
}
// -- Compliance OS - four pillars, each labelled live vs. roadmap ------------
// Honesty contract: "live" means the feature has shipped models / API routes
// in the Prisma schema and src/app/api today. "roadmap" means it's planned
// per the brief's Q1–Q4 plan but not yet built. NEVER flip a roadmap item to
// live without a corresponding schema / API route change. "sandbox" means the
// adapter architecture is built and runs in a truthfully-labelled sandbox — it
// is NOT live. "live" is reserved for real, externally-verified integrations.
type ComplianceStatus = "live" | "roadmap" | "sandbox" | "pending_onboarding";
interface CompliancePillar {
  icon: React.ComponentType<{ className?: string }>;
  name: string;
  tagline: string;
  status: ComplianceStatus;
  bullets: string[];
}

const COMPLIANCE_PILLARS: CompliancePillar[] = [
  {
    icon: FileLock2,
    name: "DPDP Act 2023 + Rules 2025",
    tagline: "Final Rules notified 13–14 Nov 2025; enforcement phased to 14 May 2027.",
    status: "live",
    bullets: [
      "Versioned consent at enrollment (ConsentRecord / ConsentVersion)",
      "72-hour breach clock with two-stage DPB notification (Rule 7)",
      "Data Subject Request tracker - access, correct, erase, nominate",
      "Parallel CERT-In 6-hour cyber-incident window supported",
      "Penalties up to ₹250 cr (safeguards) + ₹200 cr (breach notification) - stackable",
      "Roadmap: full DPIA / data-inventory engine (not yet shipped)",
    ],
  },
  {
    icon: BookCheck,
    name: "NABH 6th Edition",
    tagline: "Live standard since Sept 2024. Entry Level 2nd Ed. effective 1 Jan 2026.",
    status: "live",
    bullets: [
      "Evidence binder - 14 standards across 6 NABH chapters",
      "Per-chapter compliance rollup + per-standard evidence description",
      "PDF export via browser print for audit submission",
      "Aligned to the 639-OE structure (105 Core + 457 Commitment + 60 Achievement + 17 Excellence)",
      "6th-edition new content: sustainability + antimicrobial stewardship tracked",
      "EMR + ABDM integration scored as a differentiator (recommended, not yet mandated)",
    ],
  },
  {
    icon: Network,
    name: "ABDM (Ayushman Bharat Digital Mission)",
    tagline: "API standard ABDM V3. Mandatory for AB-PMJAY / govt-scheme hospitals today.",
    status: "sandbox",
    bullets: [
      "M1 - Identity provider: ABHA creation, verification, patient discovery → sandbox adapter via /api/abdm/abha",
      "M2 - Health Information Provider (HIP): share FHIR records on consent → roadmap",
      "M3 - Health Information User (HIU): fetch records from other providers via Consent Manager → roadmap",
      "M4 - Digital insurance claims through NHCX → sandbox adapter via /api/abdm/nhcx",
      "M1 & M4 have sandbox API routes; M2 & M3 remain on the roadmap",
      "Sandbox means the adapter architecture is built and runs truthfully — it is NOT live until official ABDM onboarding completes",
    ],
  },
  {
    icon: Scale,
    name: "NHCX (National Health Claims Exchange)",
    tagline: "Built by NHA with IRDAI under ABDM. Live since June 2024. Runs on HL7 FHIR R4.",
    status: "pending_onboarding",
    bullets: [
      "IRDAI 2024 Master Circular SLAs - 1-hour cashless pre-auth, 3-hour final auth",
      "Insurer liable for extra hospital charges if the 3-hour window is missed",
      "Today primarily covers Ayushman Bharat / PMJAY-scheme claims",
      "General Insurance Council driving broader private-insurer rollout - expanding onboarding, not yet universal",
      "Ojas adapter built: Coverage Eligibility + Claim + Communication (FHIR R4); sandbox at /api/abdm/nhcx",
      "LIVE requires official NHCX partner onboarding + mTLS certificates + operator-declared environment — never auto-promoted",
      "Governance shifting toward joint Finance Ministry + IRDAI oversight",
    ],
  },
];

// -- FAQ - expanded with NHCX / ABDM questions a hospital CFO would ask ------
const FAQS: { q: string; a: string }[] = [
  {
    q: "Is the AI triage real?",
    a: "Yes. Every check-in response is analyzed by a real LLM (Groq · llama-3.3-70b-versatile). Rule-based fallbacks only fire on provider errors and are honestly labeled as FALLBACK in the audit trail. The Risk Stratification Agent also makes a real LLM call at enrollment; if the model is unavailable, a rule-based fallback produces the baseline risk band and is labeled as such.",
  },
  {
    q: "How is patient data protected?",
    a: "Mobile numbers are encrypted at rest with AES-256-GCM. A deterministic SHA-256 hash is used for lookups - numbers are never decrypted for matching. Auth uses httpOnly cookies with refresh-token rotation and reuse detection. Every AI action is audit-logged.",
  },
  {
    q: "Is Ojas compliant with the DPDP Rules, 2025?",
    a: "Today the platform ships DPDP Lite - versioned consent (ConsentRecord / ConsentVersion), a 72-hour breach clock (BreachNotification), and a Data Subject Request tracker (DpdpRequest). The DPDP Rules, 2025 were notified in the Gazette on 13–14 November 2025 with enforcement phased to 14 May 2027. A full DPIA / data-inventory engine is on our roadmap and is not yet shipped - we will not claim coverage that does not exist.",
  },
  {
    q: "Does Ojas integrate with ABDM / ABHA?",
    a: "Partially. M1 (ABHA identity — creation, verification, patient discovery) and M4 (NHCX claims) have sandbox API routes at /api/abdm/abha and /api/abdm/nhcx. M2 (HIP — sharing FHIR records on consent) and M3 (HIU — fetching records from other providers) remain on the roadmap. The current API standard is ABDM V3, mandatory for AB-PMJAY-empaneled and government-scheme hospitals. We label each milestone live only when it ships — M1 and M4 are live in sandbox; M2 and M3 are not yet built.",
  },
  {
    q: "Is Ojas on NHCX?",
    a: "In sandbox. NHCX (National Health Claims Exchange) - built by the National Health Authority with IRDAI under ABDM, live since June 2024, runs on HL7 FHIR R4 - has a sandbox API route at /api/abdm/nhcx. The IRDAI 2024 Master Circular SLAs (1-hour cashless pre-authorization decision, 3-hour final authorization after a hospital's discharge request, insurer liable for extra charges if the 3-hour window is missed) inform how we are designing the claim / pre-auth models. Full Prisma models for NHCX claims and pre-authorization remain on the roadmap.",
  },
  {
    q: "What hospitals is this for?",
    a: "Indian hospitals discharging patients after surgery - typically 50–250 bed multi-specialty hospitals in tier-2/3 cities. NABH 6th-edition-aligned reporting. Supports Hindi, English, and Hinglish patient replies. We do not name specific customer hospitals on this page - when we have verifiable partner deployments, we will publish outcome metrics they have signed off on.",
  },
  {
    q: "Can I try it before buying?",
    a: "Yes. The Pilot tier is free for 30 days with up to 25 patients, no card required. The demo build includes a pre-seeded hospital with sample patients. Sign in with admin@ojas.demo to explore.",
  },
  {
    q: "What if the AI provider goes down?",
    a: "A rule-based fallback fires automatically, is logged as FALLBACK in the audit trail, and is surfaced to coordinators with an amber banner. The system keeps functioning. Fallback rates are visible in the AI usage compliance view, with a rose tint when they exceed 10%.",
  },
  {
    q: "Can Ojas integrate with our existing HMS/EMR?",
    a: "Ojas takes an API-first approach. Today: a CSV HMS import adapter for bulk patient enrollment is shipped. Our REST APIs support patient enrollment, check-in data export, and audit log retrieval. An HL7/FHIR adapter is on our roadmap - if your HMS/EMR supports HL7 or FHIR, we can scope an integration. For now, patient data can be imported via CSV or our enrollment API.",
  },
  {
    q: "What is the onboarding process?",
    a: "Every hospital gets a dedicated onboarding session. We walk your team through patient enrollment, coordinator worklist configuration, and WhatsApp Cloud API setup. Typical time to first patient check-in is under 48 hours. Training sessions for coordinators and doctors are included, and we provide hands-on assistance with WhatsApp Business verification.",
  },
];

// Security features - every claim here is backed by real code in the codebase.
// No security theater.
const SECURITY_FEATURES: { icon: React.ComponentType<{ className?: string }>; title: string; description: string }[] = [
  {
    icon: ShieldCheck,
    title: "AES-256-GCM PII encryption",
    description: "Patient mobile numbers are encrypted at rest with AES-256-GCM. A deterministic SHA-256 hash enables lookups - numbers are never decrypted for matching.",
  },
  {
    icon: Lock,
    title: "httpOnly cookie auth",
    description: "JWT access + refresh tokens stored in httpOnly, Secure, SameSite cookies - never localStorage. Refresh-token rotation with reuse detection revokes stolen sessions.",
  },
  {
    icon: Building2,
    title: "Multi-tenant isolation",
    description: "Every patient-data query is scoped by hospital_id. Tenant isolation is enforced at the query level, not just the UI - cross-hospital data access is structurally impossible.",
  },
  {
    icon: FileCheck,
    title: "DPDP Rules 2025 - consent versioning",
    description: "Consent is captured at enrollment with a timestamp and version. Every AI action is logged with a full audit trail. Patients can be forgotten on request via the DSR tracker.",
  },
  {
    icon: UserCheck,
    title: "Role-based access control",
    description: "SUPER_ADMIN, HOSPITAL_ADMIN, COORDINATOR, DOCTOR roles. Invite roles are structurally constrained - SUPER_ADMIN can never be assigned via invite.",
  },
  {
    icon: Gauge,
    title: "Rate limiting on every route",
    description: "Real, wired rate limits on all mutating and public endpoints - login, enrollment, check-ins, AI calls. Limits are tested, not just instantiated.",
  },
  {
    icon: Bot,
    title: "Human-in-the-loop AI",
    description: "Above-LOW-risk AI recommendations require explicit coordinator confirmation before anything happens. AI is decision support, never autonomous action.",
  },
  {
    icon: ScrollText,
    title: "Full audit trail",
    description: "Every action - login, enrollment, check-in, escalation, AI call - is logged with actor, timestamp, IP, and detail. Exportable for compliance review.",
  },
  {
    icon: HeartPulse,
    title: "NABH 6th-edition-aligned reporting",
    description: "Compliance metrics computed from real records. 'Insufficient data' labels where sample sizes are too small - no fabricated statistics, ever.",
  },
];

const PRICING_PREVIEW = [
  {
    name: "Pilot",
    price: "Free for 30 days",
    features: ["Up to 25 active patients", "All 6 AI agents (real LLM calls)", "WhatsApp scheduling", "NABH entry-level binder"],
    cta: "Start free",
  },
  {
    name: "Growth",
    price: "₹14,999/mo",
    popular: true,
    features: ["Up to 500 active patients", "Unlimited AI triage", "Conversational + Care Coach", "DPDP Lite + weekly insights"],
    cta: "Get started",
  },
  {
    name: "Enterprise",
    price: "Custom",
    features: ["Up to 5,000 patients", "SSO / SAML", "Dedicated CSM", "99.9% SLA"],
    cta: "Talk to us",
  },
];

// -- Regulatory Clock - the page's signature moment --------------------------
// Tied to the actual product differentiator: regulatory time pressure. Three
// live-feeling clocks a hospital compliance officer can switch between:
//   1. DPDP 72-hour breach timer (Rule 7, 2025)
//   2. IRDAI 3-hour discharge SLA (2024 Master Circular)
//   3. ABDM M1→M4 milestone chain
// The clock actually ticks (rAF + setInterval), respects prefers-reduced-motion
// (renders a static stage diagram instead of a live countdown), and shows what
// Ojas does at each stage. Not a generic stat-card pattern.

interface ClockStage {
  label: string;
  detail: string;
  durationLabel: string; // human-readable duration of this stage
  ojasAction: string;    // what the platform does at this stage
}

const DPDP_STAGES: ClockStage[] = [
  {
    label: "Breach detected",
    detail: "Personal data breach occurs or is identified",
    durationLabel: "T+0",
    ojasAction: "BreachNotification row created; clock starts. Platform raises an in-app + email alert to the hospital admin and the DPO role.",
  },
  {
    label: "Notify DPB - without delay",
    detail: "Initial notification to the Data Protection Board of India",
    durationLabel: "ASAP",
    ojasAction: "Pre-filled DPB notification template generated from the breach record. One-click submission tracking - actor, timestamp, and reference ID logged.",
  },
  {
    label: "Detailed report - within 72 hours",
    detail: "Full facts, circumstances, measures taken, and consequences (Rule 7)",
    durationLabel: "T+72h",
    ojasAction: "Breach clock counts down live in the DPDP Lite dashboard. Detailed report builder assembles the audit trail into a DPB-ready document at T+71h if not already submitted.",
  },
  {
    label: "Notify affected Data Principals",
    detail: "Affected patients (and their hospitals) informed of the breach",
    durationLabel: "After DPB report",
    ojasAction: "Patient notification template generated; WhatsApp + email send prepared (subject to coordinator review). All sends audit-logged.",
  },
];

const IRDAI_STAGES: ClockStage[] = [
  {
    label: "Discharge request submitted",
    detail: "Hospital submits the cashless discharge request to the insurer",
    durationLabel: "T+0",
    ojasAction: "Discharge summary record finalized; claim packet assembled. Ojas timelines this event as the SLA start.",
  },
  {
    label: "Pre-authorization decision",
    detail: "Insurer's 1-hour decision window on the cashless pre-auth request",
    durationLabel: "T+1h",
    ojasAction: "Pre-auth decision logged. If no decision by T+59m, the worklist flags the case amber. At T+1h+1m, an escalation is auto-raised to the coordinator.",
  },
  {
    label: "Final authorization",
    detail: "Insurer's 3-hour final authorization window after the discharge request",
    durationLabel: "T+3h",
    ojasAction: "Final auth logged. At T+2h55m, a final reminder fires. If the window is missed, the case is flagged rose and the insurer's liability for extra hospital charges is documented in the audit trail.",
  },
  {
    label: "Discharge + claim closure",
    detail: "Patient discharged; claim closed with the insurer",
    durationLabel: "After T+3h",
    ojasAction: "Discharge checklist completed. Timeline event written. Claim closure recorded for readmission analytics and the NABH evidence binder.",
  },
];

interface AbdmMilestone {
  milestone: string;
  name: string;
  detail: string;
  status: "roadmap" | "sandbox";
}

const ABDM_MILESTONES: AbdmMilestone[] = [
  { milestone: "M1", name: "Identity provider", detail: "ABHA creation, verification, patient discovery", status: "sandbox" },
  { milestone: "M2", name: "Health Information Provider", detail: "Share the hospital's FHIR records on patient consent", status: "roadmap" },
  { milestone: "M3", name: "Health Information User", detail: "Fetch records from other providers via Consent Manager", status: "roadmap" },
  { milestone: "M4", name: "Digital insurance claims", detail: "Enables digital insurance claims through NHCX", status: "sandbox" },
];

function useNow(intervalMs = 1000) {
  const reduce = useReducedMotion();
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (reduce) return; // static for reduced motion
    const id = window.setInterval(() => setNow(Date.now()), intervalMs);
    return () => window.clearInterval(id);
  }, [intervalMs, reduce]);
  return now;
}

function formatHMS(ms: number): string {
  if (ms < 0) ms = 0;
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${s.toString().padStart(2, "0")}`;
}

function DpdpBreachClock() {
  const reduce = useReducedMotion();
  // Demo: a 72-hour countdown that starts "10 hours ago" so visitors land
  // mid-timer and see meaningful motion. Reset every 72h.
  const CYCLE_MS = 72 * 60 * 60 * 1000;
  const OFFSET_MS = 10 * 60 * 60 * 1000; // start 10h into the window
  const now = useNow(1000);
  const start = React.useMemo(() => {
    // Anchor to a fixed reference so it's deterministic across renders
    const base = Date.UTC(2026, 0, 1, 0, 0, 0);
    const elapsed = (now - base) % CYCLE_MS;
    return now - elapsed + OFFSET_MS;
  }, [now]);
  void start; // we compute remaining directly from now to avoid drift
  const elapsedInCycle = ((now - Date.UTC(2026, 0, 1, 0, 0, 0)) % CYCLE_MS) + 0;
  const elapsed = (elapsedInCycle + OFFSET_MS) % CYCLE_MS;
  const remaining = CYCLE_MS - elapsed;
  const pct = (elapsed / CYCLE_MS) * 100;
  // Stage index based on elapsed
  // Stage 1: T+0 to T+1h (initial DPB notify window - "without delay")
  // Stage 2: T+1h to T+72h (detailed report window)
  // Stage 3: T+72h (deadline hit)
  // Stage 4: post-deadline notify principals
  const stageIdx = elapsed < 60 * 60 * 1000 ? 0 : elapsed < CYCLE_MS ? 1 : 2;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-5">
        <div>
          <div className="text-eyebrow text-primary mb-2">Rule 7 · DPDP Rules 2025</div>
          <div className="text-2xl md:text-3xl font-semibold tracking-tight">72-hour breach notification</div>
          <div className="text-sm text-muted-foreground mt-1">Two-stage: initial DPB alert without delay, detailed report within 72 hours.</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Time remaining</div>
            <div className={cn("num text-3xl md:text-4xl font-semibold tabular-nums", remaining < 6 * 60 * 60 * 1000 && "risk-high")}>
              {formatHMS(remaining)}
            </div>
          </div>
          <span className={cn("h-2.5 w-2.5 rounded-full", remaining < 6 * 60 * 60 * 1000 ? "bg-destructive live-pulse" : "bg-primary live-dot")} aria-hidden />
        </div>
      </div>
      {/* Progress rail */}
      <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden mb-6">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-primary via-primary to-accent"
          initial={reduce ? { width: `${pct}%` } : { width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={reduce ? { duration: 0 } : { duration: 0.8, ease: "easeOut" }}
        />
        {/* 72h marker */}
        <div className="absolute top-0 bottom-0 right-0 w-px bg-destructive/60" aria-hidden />
      </div>
      <ol className="space-y-3">
        {DPDP_STAGES.map((s, i) => {
          const active = i === stageIdx;
          const done = i < stageIdx;
          return (
            <li
              key={s.label}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3 transition-colors",
                active ? "border-primary/40 bg-primary/5" : done ? "border-border bg-muted/30" : "border-border"
              )}
            >
              <div className={cn(
                "mt-0.5 h-6 w-6 flex-shrink-0 rounded-full flex items-center justify-center text-[11px] font-semibold num",
                done ? "bg-primary text-primary-foreground" : active ? "bg-primary/15 text-primary ring-2 ring-primary/30" : "bg-muted text-muted-foreground"
              )}>
                {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-sm font-medium">{s.label}</div>
                  <Badge variant="outline" className="text-[10px] num">{s.durationLabel}</Badge>
                  {active && (
                    <Badge className="text-[10px] gap-1"><span className="live-dot h-1.5 w-1.5 rounded-full bg-primary-foreground" /> Live now</Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{s.detail}</div>
                <div className="text-xs text-foreground/80 mt-1.5 leading-relaxed">
                  <span className="font-medium text-primary">Ojas · </span>{s.ojasAction}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function IrdaiSlaClock() {
  const reduce = useReducedMotion();
  // 3-hour cycle, anchored 25min in so visitors land mid-window
  const CYCLE_MS = 3 * 60 * 60 * 1000;
  const OFFSET_MS = 25 * 60 * 1000;
  const now = useNow(1000);
  const elapsedInCycle = ((now - Date.UTC(2026, 0, 1, 0, 0, 0)) % CYCLE_MS) + 0;
  const elapsed = (elapsedInCycle + OFFSET_MS) % CYCLE_MS;
  const remaining = CYCLE_MS - elapsed;
  const pct = (elapsed / CYCLE_MS) * 100;
  const preAuthEnd = 60 * 60 * 1000; // 1h
  const finalAuthEnd = CYCLE_MS; // 3h
  const stageIdx = elapsed < preAuthEnd ? 0 : elapsed < finalAuthEnd ? 1 : 2;

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-5">
        <div>
          <div className="text-eyebrow text-primary mb-2">IRDAI 2024 Master Circular</div>
          <div className="text-2xl md:text-3xl font-semibold tracking-tight">3-hour cashless discharge SLA</div>
          <div className="text-sm text-muted-foreground mt-1">1-hour pre-auth decision · 3-hour final authorization · insurer liable if missed.</div>
        </div>
        <div className="flex items-center gap-3">
          <div className="text-right">
            <div className="text-[10px] uppercase tracking-[0.14em] text-muted-foreground">Time remaining</div>
            <div className={cn("num text-3xl md:text-4xl font-semibold tabular-nums", remaining < 30 * 60 * 1000 && "risk-high")}>
              {formatHMS(remaining)}
            </div>
          </div>
          <span className={cn("h-2.5 w-2.5 rounded-full", remaining < 30 * 60 * 1000 ? "bg-destructive live-pulse" : "bg-primary live-dot")} aria-hidden />
        </div>
      </div>
      <div className="relative h-2 w-full rounded-full bg-muted overflow-hidden mb-2">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-primary via-primary to-accent"
          initial={reduce ? { width: `${pct}%` } : { width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={reduce ? { duration: 0 } : { duration: 0.8, ease: "easeOut" }}
        />
        {/* 1h marker */}
        <div className="absolute top-0 bottom-0 w-px bg-accent/60" style={{ left: "33.33%" }} aria-hidden />
        {/* 3h marker */}
        <div className="absolute top-0 bottom-0 right-0 w-px bg-destructive/60" aria-hidden />
      </div>
      <div className="flex justify-between text-[10px] text-muted-foreground num mb-6">
        <span>T+0</span><span>T+1h · pre-auth</span><span>T+3h · final auth</span>
      </div>
      <ol className="space-y-3">
        {IRDAI_STAGES.map((s, i) => {
          const active = i === stageIdx;
          const done = i < stageIdx;
          return (
            <li
              key={s.label}
              className={cn(
                "flex items-start gap-3 rounded-lg border p-3 transition-colors",
                active ? "border-primary/40 bg-primary/5" : done ? "border-border bg-muted/30" : "border-border"
              )}
            >
              <div className={cn(
                "mt-0.5 h-6 w-6 flex-shrink-0 rounded-full flex items-center justify-center text-[11px] font-semibold num",
                done ? "bg-primary text-primary-foreground" : active ? "bg-primary/15 text-primary ring-2 ring-primary/30" : "bg-muted text-muted-foreground"
              )}>
                {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <div className="text-sm font-medium">{s.label}</div>
                  <Badge variant="outline" className="text-[10px] num">{s.durationLabel}</Badge>
                  {active && (
                    <Badge className="text-[10px] gap-1"><span className="live-dot h-1.5 w-1.5 rounded-full bg-primary-foreground" /> Live now</Badge>
                  )}
                </div>
                <div className="text-xs text-muted-foreground mt-0.5">{s.detail}</div>
                <div className="text-xs text-foreground/80 mt-1.5 leading-relaxed">
                  <span className="font-medium text-primary">Ojas · </span>{s.ojasAction}
                </div>
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function AbdmMilestoneChain() {
  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-5">
        <div>
          <div className="text-eyebrow text-primary mb-2">ABDM V3 · NHA + MoF + IRDAI</div>
          <div className="text-2xl md:text-3xl font-semibold tracking-tight">M1 → M4 milestone chain</div>
          <div className="text-sm text-muted-foreground mt-1">Ayushman Bharat Digital Mission integration. M1 & M4 have sandbox adapters; M2 & M3 remain on the roadmap.</div>
        </div>
        <Badge variant="outline" className="text-[10px] uppercase tracking-wider border-primary/30 bg-primary/10 text-primary gap-1.5">
          <FlaskConical className="h-3 w-3" /> M1 & M4 sandbox
        </Badge>
      </div>
      <ol className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {ABDM_MILESTONES.map((m, i) => (
          <li
            key={m.milestone}
            className="relative rounded-lg border border-border p-4 bg-card/60"
          >
            <div className="flex items-center gap-2 mb-2">
              <div className="h-7 w-7 rounded-md bg-accent/20 text-accent-foreground flex items-center justify-center text-[11px] font-semibold num">
                {m.milestone}
              </div>
              {i < ABDM_MILESTONES.length - 1 && (
                <ArrowRight className="hidden lg:block h-3.5 w-3.5 text-muted-foreground/40 absolute -right-2.5 top-6" aria-hidden />
              )}
            </div>
            <div className="text-sm font-semibold">{m.name}</div>
            <div className="text-xs text-muted-foreground mt-1 leading-relaxed">{m.detail}</div>
            <div className={cn("mt-3 inline-flex items-center gap-1 text-[10px] uppercase tracking-wider", m.status === "sandbox" ? "text-primary/80" : "text-accent-foreground/80")}>
              {m.status === "sandbox" ? <><FlaskConical className="h-3 w-3" /> Sandbox</> : <><KeyRound className="h-3 w-3" /> Roadmap</>}
            </div>
          </li>
        ))}
      </ol>
      <Alert className="mt-5 border-accent/40 bg-accent/10 text-accent-foreground">
        <Info className="h-4 w-4 text-accent-foreground" />
        <AlertDescription className="text-xs">
          M1 and M4 are live in sandbox (API routes at /api/abdm/abha and
          /api/abdm/nhcx); M2 and M3 will be labelled "Live today" only when the
          corresponding API routes and Prisma models ship. ABDM is mandatory today for
          AB-PMJAY-empaneled and government-scheme hospitals; private hospitals
          are increasingly expected to follow.
        </AlertDescription>
      </Alert>
    </div>
  );
}

function RegulatoryClock() {
  return (
    <Card className="elevate-2 border-border/60">
      <CardContent className="p-5 md:p-7">
        <Tabs defaultValue="dpdp" className="w-full">
          <TabsList className="mb-5 grid grid-cols-3 w-full max-w-md">
            <TabsTrigger value="dpdp" className="text-xs sm:text-sm gap-1.5">
              <FileLock2 className="h-3.5 w-3.5" /> <span className="hidden sm:inline">DPDP</span> 72h
            </TabsTrigger>
            <TabsTrigger value="irdai" className="text-xs sm:text-sm gap-1.5">
              <Scale className="h-3.5 w-3.5" /> <span className="hidden sm:inline">IRDAI</span> 3h
            </TabsTrigger>
            <TabsTrigger value="abdm" className="text-xs sm:text-sm gap-1.5">
              <Network className="h-3.5 w-3.5" /> ABDM
            </TabsTrigger>
          </TabsList>
          <TabsContent value="dpdp" className="mt-0 focus-visible:outline-none">
            <DpdpBreachClock />
          </TabsContent>
          <TabsContent value="irdai" className="mt-0 focus-visible:outline-none">
            <IrdaiSlaClock />
          </TabsContent>
          <TabsContent value="abdm" className="mt-0 focus-visible:outline-none">
            <AbdmMilestoneChain />
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

export function LandingPage() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen flex flex-col aurora-bg">
        <PublicNav />
        <main className="flex-1">
          {/* -- Hero ------------------------------------------- */}
          <section className="relative overflow-hidden">
            <div aria-hidden className="absolute inset-0 hero-grid" />
            <div className="relative max-w-[1400px] mx-auto px-4 md:px-8 pt-16 pb-24 md:pt-24 md:pb-32">
              <div className="grid lg:grid-cols-2 gap-12 lg:gap-12 items-center">
                <motion.div variants={heroContainer} initial="hidden" animate="show">
                  <motion.div variants={heroItem}>
                    <Badge variant="outline" className="mb-5 gap-1.5 py-1.5">
                      <Sparkles className="h-3.5 w-3.5 text-primary" />
                      AI-native · multi-tenant · DPDP Rules 2025-ready
                    </Badge>
                  </motion.div>
                  <motion.h1 variants={heroItem} className="text-display">
                    Post-discharge care that doesn&apos;t fall through the cracks.
                  </motion.h1>
                  <motion.p variants={heroItem} className="text-muted-foreground text-base md:text-lg mt-5 leading-relaxed max-w-xl">
                    Scheduled WhatsApp check-ins, AI-triaged risk on every response, and a prioritized
                    coordinator worklist - so your team always knows who to call next.
                  </motion.p>
                  <motion.div variants={heroItem} className="flex flex-wrap items-center gap-3 mt-7">
                    <Button size="lg" onClick={() => navigate("pricing")} className="glow-primary">
                      Get started <ArrowRight className="h-4 w-4" />
                    </Button>
                    <Button size="lg" variant="outline" onClick={() => scrollToSection("features")}>
                      See it work
                    </Button>
                  </motion.div>
                  <motion.div variants={heroItem} className="flex flex-wrap items-center gap-x-5 gap-y-2 mt-6 text-xs text-muted-foreground">
                    <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Real LLM calls</div>
                    <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Logged reasoning</div>
                    <div className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> Human-in-the-loop</div>
                  </motion.div>
                </motion.div>
                <div className="flex justify-center lg:justify-end">
                  <HeroPreview />
                </div>
              </div>
            </div>
          </section>

          {/* -- Single trust bar (collapsed from 3 sources → 1 honest one) --
              Removed: "Trusted by leading hospitals" fake logo row (AIIMS /
              Fortis / Apollo / Max / Medanta) and the standalone "Stats band".
              We describe the SEGMENT instead of naming real institutions we
              have no relationship with - matches the honesty pattern used
              elsewhere on the page. */}
          <div className="border-y border-border bg-card/40 backdrop-blur-sm">
            <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-5 flex flex-col sm:flex-row items-center justify-center gap-x-5 gap-y-2 text-xs md:text-sm text-muted-foreground text-center">
              <span className="font-medium text-foreground/80">Built for 50–250 bed multi-specialty hospitals in tier-2/3 cities</span>
              <span className="hidden sm:inline opacity-40">·</span>
              <span>DPDP Rules 2025-ready</span>
              <span className="hidden sm:inline opacity-40">·</span>
              <span>NABH 6th-edition-aligned</span>
              <span className="hidden sm:inline opacity-40">·</span>
              <span>ABDM M1 & M4 sandbox adapters · M2 & M3 roadmap</span>
            </div>
          </div>

          {/* -- Problem ---------------------------------------- */}
          <Section
            eyebrow="The problem"
            title="Today, post-discharge care runs on hope."
            subtitle="Most Indian hospitals discharge a patient with a printed summary and a phone number. What happens next is a coin flip."
          >
            <div className="grid md:grid-cols-3 gap-5">
              {PROBLEM_CARDS.map((c, i) => (
                <motion.div
                  key={c.title}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ delay: i * 0.08 }}
                >
                  <Card className="h-full elevate-1 elevate-hover hover:-translate-y-0.5 transition-transform">
                    <CardContent className="p-6">
                      <div className="h-10 w-10 rounded-lg bg-accent/30 text-accent-foreground flex items-center justify-center mb-4">
                        <c.icon className="h-5 w-5" />
                      </div>
                      <h3 className="font-semibold mb-2">{c.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{c.body}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </Section>

          {/* -- How it works (numbered - order genuinely carries meaning) -- */}
          <Section
            eyebrow="How it works"
            title="Four steps from discharge to a triaged worklist."
            className="bg-card/40"
          >
            <div className="relative">
              <div className="hidden md:block absolute top-6 left-[12%] right-[12%] h-px hr-brand" />
              <div className="grid md:grid-cols-4 gap-6 md:gap-4 relative">
                {STEPS.map((s, i) => (
                  <motion.div
                    key={s.title}
                    variants={fadeUp}
                    initial="hidden"
                    whileInView="show"
                    viewport={{ once: true, margin: "-60px" }}
                    transition={{ delay: i * 0.1 }}
                    className="text-center md:text-left"
                  >
                    <div className="flex md:block items-center gap-3">
                      <div className="relative z-10 mx-auto md:mx-0 h-12 w-12 rounded-full bg-primary text-primary-foreground flex items-center justify-center glow-primary ring-4 ring-background">
                        <s.icon className="h-5 w-5" />
                      </div>
                      <div className="text-eyebrow text-primary mt-0 md:mt-3 hidden md:block">
                        Step {i + 1}
                      </div>
                    </div>
                    <h3 className="font-semibold mt-3">{s.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">{s.body}</p>
                  </motion.div>
                ))}
              </div>
            </div>
          </Section>

          {/* -- Features - SIX AI agents (Risk Stratification added) -- */}
          <Section
            id="features"
            eyebrow="What's inside"
            title="Six AI agents, one coordinator worklist, honest by design."
            subtitle="Every agent that says 'AI' makes a real LLM call. The reasoning trace is logged. Above LOW risk, a human confirms before anything reaches a patient or a doctor."
          >
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
              {FEATURES.map((f, i) => (
                <motion.div
                  key={f.title}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ delay: i * 0.06 }}
                >
                  <Card className="h-full elevate-1 elevate-hover hover:-translate-y-0.5 transition-transform">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                          <f.icon className="h-5 w-5" />
                        </div>
                        {f.ai && (
                          <Badge variant="outline" className="text-[10px] gap-1">
                            <Bot className="h-3 w-3" /> AI · decision support
                          </Badge>
                        )}
                      </div>
                      <h3 className="font-semibold mb-2">{f.title}</h3>
                      <p className="text-sm text-muted-foreground leading-relaxed">{f.body}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </Section>

          {/* -- "Everything inside" - grouped real-module inventory ---------
              Source of truth: the NAV array in app-shell.tsx and each page's
              top-of-file comment. Every module listed is a real shipped page.
              Grouped (Care delivery / Insights & quality / Compliance & admin)
              rather than one giant undifferentiated grid. */}
          <Section
            id="everything-inside"
            eyebrow="Everything inside"
            title={<>The full product, on one page. <span className="text-gradient-primary">No marketing-only modules.</span></>}
            subtitle="Every module below is a real, shipped page in the authenticated app - pulled from the same NAV the hospital admin sees in the sidebar. Grouped by what your team uses it for, not by what looks impressive on a feature list."
            className="bg-card/40"
          >
            <div className="space-y-10">
              {MODULE_GROUPS.map((group, gi) => (
                <motion.div
                  key={group.label}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ delay: gi * 0.05 }}
                >
                  <div className="flex items-center gap-2 mb-4">
                    <LayoutGrid className="h-4 w-4 text-primary" />
                    <h3 className="text-sm font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                      {group.label}
                    </h3>
                    <div className="flex-1 h-px hr-brand" />
                    <span className="text-[10px] text-muted-foreground num">{group.modules.length} modules</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                    {group.modules.map((m, mi) => (
                      <motion.div
                        key={m.name}
                        variants={fadeUp}
                        initial="hidden"
                        whileInView="show"
                        viewport={{ once: true, margin: "-40px" }}
                        transition={{ delay: Math.min(mi * 0.03, 0.2) }}
                      >
                        <Card className="h-full glass elevate-1 elevate-hover hover:-translate-y-0.5 transition-transform">
                          <CardContent className="p-4">
                            <div className="flex items-start gap-2.5">
                              <div className="flex items-center justify-center h-8 w-8 rounded-lg bg-primary/10 text-primary flex-shrink-0">
                                <m.icon className="h-4 w-4" />
                              </div>
                              <div className="min-w-0">
                                <div className="text-sm font-medium">{m.name}</div>
                                <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{m.body}</p>
                              </div>
                            </div>
                          </CardContent>
                        </Card>
                      </motion.div>
                    ))}
                  </div>
                </motion.div>
              ))}
            </div>
          </Section>

          {/* -- Honest AI / audit trail ------------------------- */}
          <Section
            id="ai-flow"
            eyebrow="Honest AI"
            title="Every AI call is real, logged, and reviewable."
            subtitle="No magic. Each agent invokes the model with the patient's structured check-in data, gets a structured risk score and a reasoning trace, and writes both to an audit row. If the model is unavailable, a rule-based fallback runs and is honestly labeled FALLBACK in the outcome."
          >
            <div className="grid lg:grid-cols-2 gap-8 items-center">
              <motion.div
                variants={fadeUp}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-60px" }}
              >
                <Card className="elevate-1">
                  <CardContent className="p-6 space-y-4">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Workflow className="h-4 w-4 text-primary" /> Agent flow
                    </div>
                    <div className="space-y-3">
                      {[
                        { l: "Patient WhatsApp response", r: "structured fields + free text" },
                        { l: "Risk Stratification Agent (at enrollment)", r: "baseline risk band + 0–100 score" },
                        { l: "Triage Agent (LLM, every check-in)", r: "risk band + reasoning trace" },
                        { l: "Human-in-the-loop", r: "coordinator reviews above LOW risk" },
                        { l: "Escalation Orchestrator", r: "routes to the right person" },
                        { l: "Audit row written", r: "AiAgentRun with full trace" },
                      ].map((row, i) => (
                        <div key={i} className="flex items-start gap-3">
                          <div className="mt-0.5 h-6 w-6 flex-shrink-0 rounded-full bg-primary/10 text-primary text-[11px] font-semibold flex items-center justify-center num">
                            {i + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium">{row.l}</div>
                            <div className="text-[11px] text-muted-foreground">{row.r}</div>
                          </div>
                          {i < 5 && (
                            <ArrowRight className="h-3.5 w-3.5 text-muted-foreground/50 mt-1 hidden sm:block" />
                          )}
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
              <motion.div
                variants={fadeUp}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-60px" }}
                transition={{ delay: 0.1 }}
                className="space-y-4"
              >
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium text-sm">Real LLM calls</div>
                    <div className="text-sm text-muted-foreground">Every AI agent invokes the model on real patient data. No mock responses.</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium text-sm">Logged reasoning trace</div>
                    <div className="text-sm text-muted-foreground">Every call writes an <code className="text-[11px] bg-muted px-1 py-0.5 rounded">AiAgentRun</code> row with input, output, model, and reasoning.</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium text-sm">Human-in-the-loop above LOW</div>
                    <div className="text-sm text-muted-foreground">No outbound patient message or escalation goes out without a coordinator confirming it.</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium text-sm">Honest fallback, labeled</div>
                    <div className="text-sm text-muted-foreground">If the model is unavailable, a rule-based fallback runs and the outcome is tagged FALLBACK - never silently passed off as AI.</div>
                  </div>
                </div>
                <div className="flex items-start gap-3">
                  <Lock className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
                  <div>
                    <div className="font-medium text-sm">PII encrypted at rest</div>
                    <div className="text-sm text-muted-foreground">Mobile numbers are AES-256-GCM encrypted; only a lookup hash is queryable. AI prompts never include raw PII.</div>
                  </div>
                </div>
              </motion.div>
            </div>
          </Section>

          {/* -- Compliance OS - four pillars, live vs. roadmap ----------- */}
          <Section
            id="compliance-os"
            eyebrow="Compliance OS"
            title={<>Four regulatory pillars. <span className="text-gradient-primary">Honestly labelled.</span></>}
            subtitle="DPDP, NABH, NHCX, and ABDM are the regulatory ground truth for an Indian hospital today. We are building Ojas into a Compliance OS across all four - and we label each pillar Live today or On the roadmap so your procurement team isn't guessing."
            className="bg-card/40"
          >
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {COMPLIANCE_PILLARS.map((p, i) => (
                <motion.div
                  key={p.name}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ delay: i * 0.07 }}
                >
                  <Card className={cn(
                    "h-full elevate-2 elevate-hover hover:-translate-y-0.5 transition-transform",
                    p.status === "live" || p.status === "sandbox" ? "border-primary/30" : "border-accent/40"
                  )}>
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-4 gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div className={cn(
                            "h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0",
                            p.status === "live" || p.status === "sandbox" ? "bg-primary/10 text-primary" : "bg-accent/20 text-accent-foreground"
                          )}>
                            <p.icon className="h-5 w-5" />
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-semibold">{p.name}</h3>
                            <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{p.tagline}</p>
                          </div>
                        </div>
                        {p.status === "live" ? (
                          <Badge className="text-[10px] uppercase tracking-wider gap-1.5 flex-shrink-0">
                            <span className="live-dot h-1.5 w-1.5 rounded-full bg-primary-foreground" /> Live today
                          </Badge>
                        ) : p.status === "sandbox" ? (
                          <Badge variant="outline" className="text-[10px] uppercase tracking-wider border-primary/30 bg-primary/10 text-primary gap-1.5 flex-shrink-0">
                            <FlaskConical className="h-3 w-3" /> Sandbox
                          </Badge>
                        ) : p.status === "pending_onboarding" ? (
                          <Badge variant="outline" className="text-[10px] uppercase tracking-wider border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400 gap-1.5 flex-shrink-0">
                            <KeyRound className="h-3 w-3" /> Pending onboarding
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-[10px] uppercase tracking-wider border-accent/50 bg-accent/15 text-accent-foreground gap-1.5 flex-shrink-0">
                            <KeyRound className="h-3 w-3" /> On the roadmap
                          </Badge>
                        )}
                      </div>
                      <ul className="space-y-2 text-sm text-muted-foreground">
                        {p.bullets.map((b, bi) => (
                          <li key={bi} className="flex items-start gap-2">
                            <CheckCircle2 className={cn("h-3.5 w-3.5 flex-shrink-0 mt-0.5", p.status === "live" ? "text-primary" : "text-accent-foreground/70")} />
                            <span className="leading-relaxed">{b}</span>
                          </li>
                        ))}
                      </ul>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </Section>

          {/* -- Regulatory Clock - the page's signature moment -------------
              Tied to the actual product differentiator: regulatory time
              pressure. Three live-feeling clocks a hospital compliance officer
              can switch between. Not a generic stat-card pattern. */}
          <Section
            id="regulatory-clock"
            eyebrow="Regulatory clock"
            title={<>Time pressure is the product. <span className="text-gradient-primary">Watch it tick.</span></>}
            subtitle="The DPDP 72-hour breach window, the IRDAI 3-hour cashless discharge SLA, and the ABDM M1→M4 milestone chain are not abstract compliance text - they are clocks that start the moment a real event happens. Switch between them and see exactly what Ojas does at each stage."
          >
            <motion.div
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-60px" }}
            >
              <RegulatoryClock />
            </motion.div>
            <motion.div
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-60px" }}
              className="mt-6"
            >            </motion.div>
          </Section>

          {/* -- Security highlights ---------------------------- */}
          <Section
            id="security"
            eyebrow="Security & compliance"
            title={
              <>
                Built for healthcare from day one.{" "}
                <span className="text-gradient-primary">Patient data is sacred.</span>
              </>
            }
            subtitle="Every architectural decision in Ojas is auditable. Here's exactly how we protect patient data - no claims without proof."
          >
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 md:gap-6">
              {SECURITY_FEATURES.map((feature, i) => (
                <motion.div
                  key={feature.title}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, margin: "-40px" }}
                  transition={{ delay: i * 0.05 }}
                >
                  <Card className="glass h-full elevate-1 elevate-hover hover:-translate-y-0.5 transition-transform">
                    <CardContent className="p-5">
                      <div className="flex items-start gap-3">
                        <div className="flex items-center justify-center h-10 w-10 rounded-xl bg-primary/10 text-primary flex-shrink-0">
                          <feature.icon className="h-5 w-5" />
                        </div>
                        <div>
                          <h3 className="font-semibold text-sm">{feature.title}</h3>
                          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{feature.description}</p>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </Section>

          {/* -- Pricing preview -------------------------------- */}
          <Section
            eyebrow="Pricing"
            title="Start small, scale across the hospital."
            subtitle="Three plans, real INR pricing, no hidden seat fees."
            className="bg-card/40"
          >
            <div className="grid md:grid-cols-3 gap-5">
              {PRICING_PREVIEW.map((p, i) => (
                <motion.div
                  key={p.name}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ delay: i * 0.08 }}
                >
                  <Card
                    className={cn(
                      "h-full relative elevate-1",
                      p.popular ? "border-primary glow-primary elevate-2" : "elevate-hover hover:-translate-y-0.5 transition-transform"
                    )}
                  >
                    {p.popular && (
                      <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2">Most popular</Badge>
                    )}
                    <CardContent className="p-6">
                      <div className="text-sm font-semibold">{p.name}</div>
                      <div className="text-3xl font-semibold tracking-tight mt-2 num">{p.price}</div>
                      <ul className="mt-5 space-y-2 text-sm">
                        {p.features.map((f) => (
                          <li key={f} className="flex items-start gap-2">
                            <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                            <span className="text-muted-foreground">{f}</span>
                          </li>
                        ))}
                      </ul>
                      <Button
                        className="w-full mt-6"
                        variant={p.popular ? "default" : "outline"}
                        onClick={() => navigate("pricing")}
                      >
                        {p.cta}
                      </Button>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </Section>

          {/* -- "What we're built to move" - illustrative targets, not
              fabricated pilot data. Removed the 40% / 3× / 92% section that
              was footnoted "*Based on internal pilot data" - there is no
              completed pilot to source those numbers from. Relabeled as
              design targets with "designed to" language, matching the
              honesty pattern used in the FALLBACK labeling and the
              "Illustrative" testimonial badge. */}
          <Section
            eyebrow="What we're built to move"
            title="Targets we're engineered for - not pilot results we can't source."
            subtitle="Ojas is founder-funded and operating in customer-validation mode. We have not run a completed pilot that produces attributable outcome statistics, and we won't pretend otherwise. These are the metrics the architecture is designed to move; when we have real partner-hospital-verified numbers, we'll publish them here with attribution."
          >
            <div className="grid md:grid-cols-3 gap-5">
              {[
                {
                  metric: "Earlier",
                  label: "Detection of deterioration",
                  description: "Daily AI-triaged check-ins are designed to surface wound complications, infections, and medication issues days earlier than a coordinator call cycle could.",
                  icon: TrendingUp,
                },
                {
                  metric: "Faster",
                  label: "Escalation to critical cases",
                  description: "The prioritized worklist is designed to put HIGH and CRITICAL patients at the top - so the coordinator's first call is the one that matters most.",
                  icon: PhoneCall,
                },
                {
                  metric: "Higher",
                  label: "Patient check-in engagement",
                  description: "WhatsApp-native check-ins fit into patients' daily routines. The architecture is designed to drive consistently high engagement vs. phone-call follow-up.",
                  icon: CheckCircle2,
                },
              ].map((m, i) => (
                <motion.div
                  key={m.label}
                  variants={fadeUp}
                  initial="hidden"
                  whileInView="show"
                  viewport={{ once: true, margin: "-60px" }}
                  transition={{ delay: i * 0.1 }}
                >
                  <Card className="h-full elevate-1 elevate-hover hover:-translate-y-0.5 transition-transform">
                    <CardContent className="p-6">
                      <div className="flex items-start justify-between mb-4">
                        <div className="h-10 w-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
                          <m.icon className="h-5 w-5" />
                        </div>
                        <Badge variant="outline" className="text-[10px] border-accent/50 bg-accent/10 text-accent-foreground">
                          Design target
                        </Badge>
                      </div>
                      <div className="text-2xl md:text-3xl font-semibold tracking-tight text-foreground">{m.metric}</div>
                      <h3 className="font-semibold mt-2">{m.label}</h3>
                      <p className="text-sm text-muted-foreground mt-2 leading-relaxed">{m.description}</p>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>          </Section>

          {/* -- Testimonial placeholder (clearly illustrative) -- */}
          <Section className="py-16">
            <motion.div
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-60px" }}
              className="max-w-3xl mx-auto"
            >
              <Card className="bg-card/60 elevate-2">
                <CardContent className="p-8 md:p-10">
                  <Quote className="h-9 w-9 text-primary/40 mb-4" />
                  <p className="text-lg md:text-xl leading-relaxed">
                    &ldquo;The worklist changed how our coordinators start their morning. Instead of calling 80
                    patients hoping to find the one who needs us, we open Ojas and the high-risk ones are already
                    on top - with the AI&apos;s reasoning right there to read.&rdquo;
                  </p>
                  <div className="mt-6 flex items-center gap-3">
                    <div className="h-10 w-10 rounded-full bg-primary/15 text-primary flex items-center justify-center font-semibold text-sm">
                      AV
                    </div>
                    <div>
                      <div className="text-sm font-medium">Dr. Anjali Verma</div>
                      <div className="text-xs text-muted-foreground">HOSPITAL_ADMIN · Demo Care Hospital</div>
                    </div>
                    <Badge variant="outline" className="ml-auto text-[10px]">Illustrative</Badge>
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          </Section>

          {/* -- CTA + "About Ojas" single founder-identity block -----------
              This is the ONE place founder identity is appropriate on the
              site - a short, professionally-framed block on the landing page
              only, near the CTA. No personal name, no personal phone. Uses
              OJAS_BRAND.founderLed ("Founder-led · based in Lucknow, India").
              Never repeated as a footer credit on every page. */}
          <section id="contact" className="py-16 md:py-24">
            <div className="max-w-[1400px] mx-auto px-4 md:px-8">
              <motion.div
                variants={fadeUp}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-60px" }}
              >
                <Card className="relative overflow-hidden border-primary/30 glow-primary elevate-3">
                  <div
                    aria-hidden
                    className="absolute inset-0 -z-10 opacity-60"
                    style={{
                      background:
                        "radial-gradient(50% 60% at 20% 30%, oklch(0.62 0.14 165 / 0.12), transparent 70%), radial-gradient(45% 55% at 85% 70%, oklch(0.78 0.14 75 / 0.10), transparent 70%)",
                    }}
                  />
                  <CardContent className="p-8 md:p-14 text-center">
                    <div className="inline-flex items-center gap-1.5 text-eyebrow text-primary mb-4">
                      <span className="h-1 w-1 rounded-full bg-primary" />
                      Get started
                    </div>
                    <h3 className="text-h1 max-w-2xl mx-auto">
                      Ready to modernize your post-discharge care?
                    </h3>
                    <p className="text-muted-foreground text-sm md:text-base mt-4 max-w-xl mx-auto">
                      Pick a plan, or book a 30-minute walkthrough with the team. We&apos;ll enrol your first
                      10 patients with you.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-3 mt-8">
                      <Button size="lg" onClick={() => navigate("pricing")} className="glow-primary">
                        Get started <ArrowRight className="h-4 w-4" />
                      </Button>
                      <Button size="lg" variant="outline" asChild>
                        <a href={`mailto:${OJAS_BRAND.email}?subject=Schedule a demo of Ojas`}>
                          Schedule a demo
                        </a>
                      </Button>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mt-6 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5"><CheckCircle2 className="h-3.5 w-3.5 text-primary" /> No credit card required</span>
                      <span className="flex items-center gap-1.5"><CalendarClock className="h-3.5 w-3.5 text-primary" /> 30-day free pilot</span>
                      <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> Cancel anytime</span>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2 mt-3 text-xs text-muted-foreground/60">
                      <span className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5" /> AES-256-GCM PII</span>
                      <span className="flex items-center gap-1.5"><FileCheck className="h-3.5 w-3.5" /> DPDP Rules 2025-ready</span>
                    </div>

                    {/* About Ojas - the single, professional founder-identity
                        mention. NO personal name. NO personal phone. */}
                    <div className="mt-10 pt-8 border-t border-border/60 max-w-xl mx-auto">
                      <div className="text-eyebrow text-muted-foreground mb-2">About Ojas</div>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {OJAS_BRAND.founderLed}. Built for Indian hospitals -
                        NABH-aligned reporting, DPDP Rules 2025-ready consent
                        and breach protocol, with ABDM M1 & M4 sandbox adapters and M2 & M3 on the roadmap.
                        For DPDPA grievances, contact our{" "}
                        <a
                          href={`mailto:${OJAS_BRAND.grievanceOfficer.email}?subject=DPDPA Grievance`}
                          className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded"
                        >
                          {OJAS_BRAND.grievanceOfficer.role}
                        </a>
                        .
                      </p>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </section>
          {/* -- FAQ --------------------------------------------- */}
          <Section
            id="faq"
            eyebrow="FAQ"
            title={
              <span className="flex items-center gap-3">
                <HelpCircle className="h-7 w-7 md:h-8 md:w-8 text-primary" />
                Frequently asked questions
              </span>
            }
            subtitle="Honest answers to the questions hospitals ask before they sign up. If something here is unclear, email us - we'd rather answer plainly than dress it up."
            className="py-16 md:py-20"
          >
            <motion.div
              variants={fadeUp}
              initial="hidden"
              whileInView="show"
              viewport={{ once: true, margin: "-60px" }}
              className="max-w-3xl mx-auto"
            >
              <Accordion type="single" collapsible defaultValue="faq-1" className="rounded-xl border border-border bg-card/40 px-4 md:px-6">
                {FAQS.map((f, i) => (
                  <AccordionItem key={f.q} value={`faq-${i + 1}`}>
                    <AccordionTrigger className="text-left text-base md:text-lg font-medium hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded">
                      {f.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm md:text-base text-muted-foreground leading-relaxed">
                      {f.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </motion.div>
          </Section>
        </main>
        <AppFooter />
      </div>
    </MotionConfig>
  );
}
