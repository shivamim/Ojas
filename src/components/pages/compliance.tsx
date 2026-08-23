"use client";

import * as React from "react";
import { MarketingHeader } from "@/components/marketing-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import {
  ShieldCheck, Clock, AlertTriangle, FileText, Scale, HeartPulse,
  CheckCircle2, ArrowRight, Gavel, Timer, FileWarning,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { AppFooter } from "@/components/app-shell";

// ── Regulatory clocks ────────────────────────────────────────────────────────
interface RegulatoryClock {
  id: string;
  regulation: string;
  title: string;
  description: string;
  sla: string;
  countdown: string;
  fields: string[];
  icon: React.ComponentType<{ className?: string }>;
  tone: string;
  positioning: string;
}

const CLOCKS: RegulatoryClock[] = [
  {
    id: "dpdp", regulation: "DPDP 2023", title: "72-hour breach notification",
    description: "When a personal data breach is detected, the Data Protection Board must be notified within 72 hours, and affected data principals must be informed without undue delay.",
    sla: "72 hours from detection",
    countdown: "detectedAt + 72h",
    fields: ["BreachNotification.slaDeadline", "BreachNotification.dpbNotifiedAt", "BreachNotification.notifiedAt", "BreachNotification.affectedCount"],
    icon: AlertTriangle, tone: "border-red-500/40 bg-red-500/5",
    positioning: "Ojas stores breach templates + a documented trigger process. The slaDeadline clock starts at detection. The /api/dpdp/breach-clock endpoint tracks the countdown.",
  },
  {
    id: "irdai-preauth", regulation: "IRDAI 2024 Master Circular", title: "1-hour cashless pre-auth",
    description: "Insurers must approve or query a cashless pre-authorization request within 1 hour. The hospital becomes liable for extra charges if the SLA is missed.",
    sla: "1 hour from submission",
    countdown: "submittedAt + 1h",
    fields: ["NhcxClaim.preAuthDeadlineAt", "NhcxClaim.preAuthRespondedAt", "NhcxClaim.preAuthBreached"],
    icon: Timer, tone: "border-amber-500/40 bg-amber-500/5",
    positioning: "The /api/cron/nhcx-sla-check cron runs every 15 min, atomically flips preAuthBreached=true when the deadline passes, and audits the breach. Only flips on a real state change (idempotent).",
  },
  {
    id: "irdai-final", regulation: "IRDAI 2024 Master Circular", title: "3-hour final authorization",
    description: "After discharge, the final claim authorization must be issued within 3 hours. Insurer is liable for extra hospital charges if the 3-hour window is missed.",
    sla: "3 hours from claim submission",
    countdown: "submittedAt + 3h",
    fields: ["NhcxClaim.finalAuthDeadlineAt", "NhcxClaim.finalAuthRespondedAt", "NhcxClaim.finalAuthBreached"],
    icon: Gavel, tone: "border-amber-500/40 bg-amber-500/5",
    positioning: "Same cron checks finalAuthDeadlineAt. SLA breaches are audited as NHCX_FINAL_AUTH_SLA_BREACH. Breached claims are visible on the NHCX dashboard.",
  },
  {
    id: "dpdp-request", regulation: "DPDP 2023", title: "30-day data principal request",
    description: "Data principal requests for ACCESS or CORRECTION must be fulfilled within 30 days. ERASURE and GRIEVANCE have no statutory SLA but are tracked.",
    sla: "30 days from request",
    countdown: "requestedAt + 30d",
    fields: ["DpdpRequest.slaDeadline", "DpdpRequest.resolvedAt", "DpdpRequest.status"],
    icon: FileText, tone: "border-blue-500/40 bg-blue-500/5",
    positioning: "Every DPDP request (ACCESS/CORRECTION/ERASURE/GRIEVANCE) is tracked with a slaDeadline. The /api/dpdp/request endpoint manages the lifecycle. ERASURE triggers patient soft-delete + audit.",
  },
];

const POSITIONING = [
  {
    icon: HeartPulse, title: "NABH readiness", tone: "border-violet-500/40 bg-violet-500/5",
    positioning: "NABH readiness, evidence, and corrective-action management. NOT accreditation. A record existing does not mean compliant. Evidence has explicit states: NOT_ASSESSED, GAP, PARTIAL, EVIDENCE_PENDING, SUBMITTED, VERIFIED, EXPIRED, REQUIRES_REVIEW.",
    points: [
      "Standard → Requirement → Evidence → Verification → Gap → Corrective Action → Owner → Due Date → Resolution",
      "Evidence sources: AUTO_GENERATED, MANUAL, HOSPITAL_ATTESTED, EXTERNALLY_VERIFIED",
      "Core standards require 100% for accreditation — surfaced on the NABH dashboard",
      "Readiness score is derived from real evidence states, never an arbitrary percentage",
    ],
  },
  {
    icon: Scale, title: "DPDP Rules 2025", tone: "border-red-500/40 bg-red-500/5",
    positioning: "DPDP-aligned consent + breach management. Purpose-specific, revocable consent. 72-hour breach notification clock. Data principal requests (ACCESS/CORRECTION/ERASURE/GRIEVANCE).",
    points: [
      "ConsentRecord: one active consent per purpose per patient (whatsapp_monitoring, ai_triage, data_sharing_hospital, etc.)",
      "Revocation affects the corresponding future processing path",
      "ConsentVersion with SHA-256 hash proves what text was shown at consent time",
      "PII encrypted AES-256-GCM; mobileHash for deterministic lookup (no decryption for search)",
    ],
  },
  {
    icon: ShieldCheck, title: "IRDAI cashless SLA", tone: "border-amber-500/40 bg-amber-500/5",
    positioning: "IRDAI 2024 Master Circular SLAs are clocks that start the moment a real event happens — not abstract compliance text. Ojas tracks + audits every breach.",
    points: [
      "Pre-auth: 1-hour SLA from submission (preAuthDeadlineAt)",
      "Final auth: 3-hour SLA from claim submission (finalAuthDeadlineAt)",
      "Cron checks every 15 min; atomically flips the breached flag + audits",
      "Breached claims visible on the NHCX dashboard for hospital follow-up",
    ],
  },
];

export function CompliancePage() {
  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5">
      <MarketingHeader />

      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        {/* Hero */}
        <div className="text-center mb-10 sm:mb-12">
          <div className="inline-flex items-center gap-1.5 text-eyebrow text-primary mb-3">
            <ShieldCheck className="h-3.5 w-3.5" />
            COMPLIANCE
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
            Regulatory clocks that actually run.
          </h1>
          <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            The DPDP 72-hour breach window, the IRDAI 3-hour cashless discharge SLA, and the DPDP 30-day data-principal request are not abstract compliance text — they are clocks that start the moment a real event happens. Ojas tracks, audits, and surfaces every one.
          </p>
        </div>

        {/* Positioning banner */}
        <Card className="mb-10 border-primary/20 bg-primary/5">
          <CardContent className="p-5">
            <div className="flex items-start gap-3">
              <FileWarning className="h-5 w-5 text-primary flex-shrink-0 mt-0.5" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                <span className="font-semibold text-foreground">Honest positioning:</span> Ojas is a readiness + operations platform. It does not certify NABH accreditation, does not adjudicate PM-JAY claims, and does not replace official NHA/IRDAI/DPB systems. It orchestrates the hospital side and tracks the clocks that those regulations mandate.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Regulatory clocks */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-12">
          {CLOCKS.map((clock) => (
            <Card key={clock.id} className={cn("border", clock.tone, "elevate-2 hover:-translate-y-0.5 transition-transform")}>
              <CardHeader className="pb-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-start gap-2.5 min-w-0">
                    <div className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-background/60">
                      <clock.icon className="h-4.5 w-4.5" />
                    </div>
                    <div className="min-w-0">
                      <Badge variant="outline" className="text-[9px] uppercase tracking-wider mb-1">{clock.regulation}</Badge>
                      <CardTitle className="text-sm font-semibold leading-tight">{clock.title}</CardTitle>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground flex-shrink-0">
                    <Clock className="h-3 w-3" /> {clock.sla}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <CardDescription className="text-xs leading-relaxed">{clock.description}</CardDescription>
                <div className="rounded-md bg-background/60 border p-2.5">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5 flex items-center gap-1">
                    <Timer className="h-3 w-3" /> Countdown
                  </div>
                  <code className="text-[11px] font-mono text-primary">{clock.countdown}</code>
                </div>
                <div>
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">Tracked fields</div>
                  <div className="flex flex-wrap gap-1">
                    {clock.fields.map((f) => (
                      <code key={f} className="text-[10px] font-mono bg-muted px-1.5 py-0.5 rounded">{f}</code>
                    ))}
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed border-t pt-2">{clock.positioning}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Positioning cards */}
        <div className="space-y-4">
          {POSITIONING.map((p) => (
            <Card key={p.title} className={cn("border", p.tone)}>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <p.icon className="h-4 w-4" /> {p.title}
                </CardTitle>
                <CardDescription className="text-xs leading-relaxed">{p.positioning}</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {p.points.map((pt, i) => (
                    <li key={i} className="flex items-start gap-2 text-xs">
                      <CheckCircle2 className="h-3.5 w-3.5 text-primary/70 flex-shrink-0 mt-0.5" />
                      <span className="text-muted-foreground leading-relaxed">{pt}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Footer */}
        <div className="mt-10 text-center">
          <p className="text-xs text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Full details in <code className="bg-muted px-1 py-0.5 rounded">docs/INCIDENT_RESPONSE.md</code> (DPDP breach flow), <code className="bg-muted px-1 py-0.5 rounded">docs/NHA_NHCX_PMJAY_GO_LIVE.md</code> (IRDAI SLA), and <code className="bg-muted px-1 py-0.5 rounded">docs/PRODUCTION_READINESS.md</code> (NABH positioning). See the <a href="/?view=changelog" className="text-primary underline">changelog</a> for the hardening timeline.
          </p>
        </div>
      </main>
      <AppFooter />
    </div>
  );
}
