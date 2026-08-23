"use client";

import * as React from "react";
import { motion, MotionConfig } from "framer-motion";
import { navigate } from "@/lib/router";
import { MarketingHeader } from "@/components/marketing-header";
import { AppFooter } from "@/components/app-shell";
import { OJAS_BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  ArrowRight, CheckCircle2, X, Sparkles, Bot, ShieldCheck, Lock,
  MessageSquare, Database, CreditCard,
} from "lucide-react";

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: "easeOut" as const } },
};

const PLAN_TIERS = [
  {
    id: "PILOT", name: "Pilot", price: "Free for 30 days",
    sub: "Up to 25 active patients · no card required",
    popular: false,
    features: [
      "Up to 25 active patients",
      "All 6 AI agents (real LLM calls)",
      "WhatsApp check-in scheduling",
      "Family Recovery Companion (P0.2)",
      "Escalation worklist + SLA tracking",
      "NABH Entry Level evidence binder",
      "Email digest",
    ],
    notIncluded: ["Custom check-in cadence", "SSO", "Dedicated CSM"],
  },
  {
    id: "GROWTH", name: "Growth", price: "₹14,999/mo",
    sub: "Up to 500 active patients",
    popular: true,
    features: [
      "Up to 500 active patients",
      "Unlimited AI triage (Groq + Bedrock fallback)",
      "Conversational agent (Hinglish + 6 languages)",
      "Care coach agent",
      "Insights agent (weekly digest)",
      "Family Companion + Timeline Share",
      "Custom check-in cadence",
      "DPDP Lite (consent versioning, breach clock)",
      "Priority support",
    ],
    notIncluded: ["SSO / SAML", "Dedicated CSM"],
  },
  {
    id: "ENTERPRISE", name: "Enterprise", price: "Custom",
    sub: "Up to 5,000 active patients",
    popular: false,
    features: [
      "Up to 5,000 active patients",
      "All AI agents, uncapped",
      "SSO / SAML",
      "Dedicated CSM",
      "On-premise option",
      "HMS integration adapter (CSV / HL7 / FHIR)",
      "99.9% SLA with AI provider fallback",
    ],
    notIncluded: [],
  },
] as const;

const FAQS = [
  {
    q: "Is the AI real?",
    a: "Yes. Every AI agent (Triage, Conversational, Care Coach, Escalation Orchestrator, Insights) makes a real LLM call against the patient's structured check-in data, and the full reasoning trace is logged to an audit row. If the model is unavailable, a rule-based fallback runs and is honestly labeled FALLBACK in the outcome — it is never silently passed off as AI. Every AI output is decision support for the care team, not a diagnosis.",
  },
  {
    q: "How does multi-tenancy work?",
    a: "Each hospital is a tenant with its own hospital_id. Every database query is scoped by hospital_id at the repository layer, and the auth context enforces it server-side. User records, patients, check-ins, escalations, AI runs, and audit logs are all tenant-scoped. PII (patient names, mobile numbers) is encrypted at rest with AES-256-GCM and only a non-reversible lookup hash is queryable.",
  },
  {
    q: "Is WhatsApp included?",
    a: "The platform is WhatsApp-template-ready: the message log schema, scheduling logic, and HMAC-verified inbound webhook path are all built. You supply your own WhatsApp Business Cloud API credentials (phone_number_id, access_token, app secret) in hospital settings, and outbound check-ins go out through your account. The sandbox demo runs without WhatsApp — check-ins are simulated so you can see the full flow.",
  },
  {
    q: "Can I change plans?",
    a: "Yes, instantly. New hospitals start on a 30-day Pilot (up to 25 patients, no card required). A hospital admin can self-serve upgrade from Pilot → Growth (₹14,999/mo, 500 patients) or talk to us about Enterprise (5,000+ patients, SSO, dedicated CSM). Pilot auto-suspends after 30 days if not converted — we never auto-charge.",
  },
  {
    q: "What about data security?",
    a: "PII (mobile numbers) is encrypted at rest with AES-256-GCM. Sessions are httpOnly cookies with signed JWTs, refreshed on a rotation schedule with reuse detection — if a stolen refresh token is replayed, the session family is revoked. Every auth event is audit-logged with IP and user-agent. The seed endpoint that creates demo data is hard-blocked in production. AI prompts never include raw PII.",
  },
];

export function PricingPage() {
  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen flex flex-col aurora-bg">
        <MarketingHeader />
        <main className="flex-1">
          {/* Header */}
          <section className="grid-pattern">
            <div className="max-w-[1400px] mx-auto px-4 md:px-8 pt-16 pb-10 md:pt-24 md:pb-14 text-center">
              <motion.div
                variants={fadeUp}
                initial="hidden"
                animate="show"
                transition={{ duration: 0.5 }}
              >
                <Badge variant="outline" className="mb-4 gap-1.5">
                  <CreditCard className="h-3.5 w-3.5 text-primary" /> Pricing in INR · no per-seat fees
                </Badge>
                <h1 className="text-4xl md:text-5xl font-semibold tracking-tight leading-tight">
                  Start free for 30 days. Scale when ready.
                </h1>
                <p className="text-muted-foreground text-base md:text-lg mt-4 max-w-2xl mx-auto leading-relaxed">
                  Pilot tier is free for 30 days with up to 25 patients. No card required. Upgrade to Growth
                  (₹14,999/mo, 500 patients) or Enterprise (custom, 5,000 patients) any time.
                </p>
              </motion.div>
            </div>
          </section>

          {/* Plan cards */}
          <section className="pb-10">
            <div className="max-w-[1400px] mx-auto px-4 md:px-8">
              <div className="grid md:grid-cols-3 gap-5 md:gap-6">
                {PLAN_TIERS.map((p, i) => (
                  <motion.div
                    key={p.id}
                    variants={fadeUp}
                    initial="hidden"
                    whileInView="show"
                    viewport={{ once: true, margin: "-60px" }}
                    transition={{ delay: i * 0.08 }}
                  >
                    <Card
                      className={cn(
                        "h-full relative",
                        p.popular ? "border-primary glow-primary" : "hover:border-primary/40 transition-colors"
                      )}
                    >
                      {p.popular && (
                        <Badge className="absolute -top-2.5 left-1/2 -translate-x-1/2">Most popular</Badge>
                      )}
                      <CardContent className="p-6 flex flex-col h-full">
                        <div className="text-sm font-semibold">{p.name}</div>
                        <div className="text-3xl font-semibold tracking-tight mt-2">{p.price}</div>
                        <div className="text-xs text-muted-foreground mt-1">{p.sub}</div>

                        <Button
                          className="w-full mt-5"
                          variant={p.popular ? "default" : "outline"}
                          onClick={() => navigate("login")}
                        >
                          {p.id === "ENTERPRISE" ? "Talk to us" : p.id === "PILOT" ? "Start free pilot" : "Sign in to start"} <ArrowRight className="h-4 w-4" />
                        </Button>

                        <div className="mt-6 space-y-2 text-sm">
                          {p.features.map((f) => (
                            <div key={f} className="flex items-start gap-2">
                              <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                              <span className="text-foreground/90">{f}</span>
                            </div>
                          ))}
                          {p.notIncluded.map((f) => (
                            <div key={f} className="flex items-start gap-2 opacity-60">
                              <X className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                              <span className="text-muted-foreground line-through">{f}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </motion.div>
                ))}
              </div>
            </div>
          </section>

          {/* Plan comparison summary */}
          <section className="py-10">
            <div className="max-w-[1400px] mx-auto px-4 md:px-8">
              <motion.div
                variants={fadeUp}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-60px" }}
              >
                <Card className="bg-card/40">
                  <CardContent className="p-6 md:p-8">
                    <div className="grid md:grid-cols-4 gap-6">
                      <div>
                        <Bot className="h-5 w-5 text-primary mb-2" />
                        <div className="font-medium text-sm">Real AI agents</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Triage, Conversational, Care Coach, Escalation, Insights — every plan with AI
                          enabled gets real LLM calls.
                        </div>
                      </div>
                      <div>
                        <MessageSquare className="h-5 w-5 text-primary mb-2" />
                        <div className="font-medium text-sm">WhatsApp-template ready</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Bring your own Cloud API creds. The check-in scheduling and message log are built.
                        </div>
                      </div>
                      <div>
                        <Database className="h-5 w-5 text-primary mb-2" />
                        <div className="font-medium text-sm">Multi-tenant by design</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          hospital_id-scoped queries, AES-256-GCM PII encryption, audit-logged access.
                        </div>
                      </div>
                      <div>
                        <ShieldCheck className="h-5 w-5 text-primary mb-2" />
                        <div className="font-medium text-sm">DPDP Rules 2025-ready</div>
                        <div className="text-xs text-muted-foreground mt-1">
                          Versioned consent, 72-hour breach protocol, NABH-aligned reports. Honest fallback labeling.
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </section>

          {/* FAQ */}
          <section className="py-14 md:py-20 bg-card/40 border-y border-border">
            <div className="max-w-3xl mx-auto px-4 md:px-8">
              <motion.div
                variants={fadeUp}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-60px" }}
                className="text-center mb-8"
              >
                <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-primary mb-3">
                  <Sparkles className="h-3.5 w-3.5" /> FAQ
                </div>
                <h2 className="text-3xl md:text-4xl font-semibold tracking-tight">Straight answers.</h2>
              </motion.div>

              <Accordion type="single" collapsible className="w-full">
                {FAQS.map((f, i) => (
                  <AccordionItem key={i} value={`item-${i}`}>
                    <AccordionTrigger className="text-left text-base font-medium">
                      {f.q}
                    </AccordionTrigger>
                    <AccordionContent className="text-sm text-muted-foreground leading-relaxed">
                      {f.a}
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </section>

          {/* CTA */}
          <section className="py-16 md:py-20">
            <div className="max-w-[1400px] mx-auto px-4 md:px-8">
              <motion.div
                variants={fadeUp}
                initial="hidden"
                whileInView="show"
                viewport={{ once: true, margin: "-60px" }}
              >
                <Card className="border-primary/30 glow-primary bg-card/60">
                  <CardContent className="p-8 md:p-12 text-center">
                    <h3 className="text-2xl md:text-3xl font-semibold tracking-tight">
                      Try Ojas with your team.
                    </h3>
                    <p className="text-muted-foreground text-sm md:text-base mt-3 max-w-xl mx-auto">
                      Sign in with the demo credentials, or book a walkthrough with the team.
                    </p>
                    <div className="flex flex-wrap items-center justify-center gap-3 mt-6">
                      <Button size="lg" onClick={() => navigate("login")}>
                        Sign in <ArrowRight className="h-4 w-4" />
                      </Button>
                      <Button size="lg" variant="outline" asChild>
                        <a href={`mailto:${OJAS_BRAND.email}?subject=Book a demo of Ojas`}>
                          Book a demo
                        </a>
                      </Button>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-x-5 gap-y-1 mt-6 text-xs text-muted-foreground">
                      <span className="flex items-center gap-1.5"><Lock className="h-3.5 w-3.5 text-primary" /> AES-256-GCM PII</span>
                      <span className="flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5 text-primary" /> DPDP Rules 2025</span>
                      <span className="flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5 text-primary" /> Real LLM calls</span>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </div>
          </section>
        </main>
        <AppFooter />
      </div>
    </MotionConfig>
  );
}
