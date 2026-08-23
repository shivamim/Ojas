"use client";

import * as React from "react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth-context";
import { navigate } from "@/lib/router";
import { OJAS_BRAND } from "@/lib/brand";
import { AppFooter } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  ArrowRight, Brain, MessageSquare, FileText, Loader2,
  Sparkles, FlaskConical, Copy, CheckCircle2, Stethoscope,
} from "lucide-react";
import { MarketingHeader } from "@/components/marketing-header";

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const DEMO_EMAIL = "hospitaladmin@ojas.care";
// DEMO_PASSWORD is fetched at runtime from /api/demo-credentials (gated to
// non-production + DEMO_MODE) so the literal never ships in the client bundle.

type DemoCreds = { email: string; password: string; role: string } | null;

function isValidEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export function LoginPage() {
  const { login } = useAuth();
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [errors, setErrors] = React.useState<{ email?: string; password?: string }>({});
  const [submitting, setSubmitting] = React.useState(false);
  const [seeding, setSeeding] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [demoCreds, setDemoCreds] = React.useState<DemoCreds>(null);
  const [demoLoading, setDemoLoading] = React.useState(false);

  // Fetch demo credentials from the gated server endpoint (never hardcoded
  // in the client bundle). The endpoint 404s in production or when DEMO_MODE
  // is unset, so the hint simply doesn't render.
  React.useEffect(() => {
    if (!DEMO_MODE) return;
    let cancelled = false;
    setDemoLoading(true);
    fetch("/api/demo-credentials", { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => { if (!cancelled) setDemoCreds(data); })
      .catch(() => { if (!cancelled) setDemoCreds(null); })
      .finally(() => { if (!cancelled) setDemoLoading(false); });
    return () => { cancelled = true; };
  }, []);

  const demoPassword = demoCreds?.password ?? "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: typeof errors = {};
    if (!email.trim()) nextErrors.email = "Email is required";
    else if (!isValidEmail(email.trim())) nextErrors.email = "Enter a valid email address";
    if (!password) nextErrors.password = "Password is required";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSubmitting(true);
    try {
      const res = await login(email.trim(), password);
      if (!res.ok) {
        // P1 (UX): translate generic 500s into an actionable message. The
        // most common cause of a 500 on login in a sandbox/dev environment
        // is the database being unreachable — telling the user "Invalid
        // email or password" would be wrong (we never checked), and showing
        // "Internal server error" gives no guidance. Map it to a clear
        // service-unavailable message.
        if (res.status === 500) {
          toast.error("Service temporarily unavailable. Please retry in a moment.", {
            description: "The server could not complete the request. If this persists, contact your hospital admin.",
          });
        } else if (res.status === 429) {
          toast.error("Too many login attempts. Please wait a minute and try again.");
        } else if (res.status === 401) {
          toast.error("Invalid email or password", {
            description: "Check your credentials or contact your admin for access.",
          });
        } else {
          toast.error(res.error || "Login failed");
        }
        return;
      }
      toast.success("Signed in");
      // page.tsx reads the updated user from useAuth() and redirects to
      // dashboard (or superadmin) on the next render via RedirectToApp.
    } catch (err) {
      // Network failure (server unreachable) — distinct from a 500 response.
      toast.error("Cannot reach the server. Check your connection and retry.", {
        description: err instanceof Error ? undefined : undefined,
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      const res = await fetch("/api/seed", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({}),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(data.error || "Seed failed");
        return;
      }
      toast.success("Demo data seeded", {
        description: `Sign in with ${DEMO_EMAIL} / ${demoPassword}`,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Seed failed";
      toast.error(msg);
    } finally {
      setSeeding(false);
    }
  };

  const fillDemo = () => {
    setEmail(demoCreds?.email ?? DEMO_EMAIL);
    setPassword(demoPassword);
    setErrors({});
  };

  const copyCreds = async () => {
    if (!demoCreds) return;
    try {
      await navigator.clipboard.writeText(`${demoCreds.email} / ${demoPassword}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // clipboard not available — silently ignore
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-gradient-to-br from-primary/5 via-background to-accent/5">
      <MarketingHeader showCta={false} />
      <div className="flex-1 grid lg:grid-cols-2">
        {/* Left panel — aurora with brand */}
        <aside className="aurora-bg grid-pattern relative hidden lg:flex flex-col justify-between p-10 xl:p-14">

          <div className="max-w-md">
            <h2 className="text-3xl xl:text-4xl font-semibold tracking-tight leading-tight">
              {OJAS_BRAND.tagline}.
            </h2>
            <p className="text-muted-foreground mt-3 leading-relaxed">
              Scheduled WhatsApp check-ins, AI-triaged risk, and a prioritized coordinator worklist —
              built for Indian hospitals.
            </p>
            <div className="mt-8 space-y-3.5">
              {[
                { icon: Brain, label: "AI-triaged risk on every check-in" },
                { icon: MessageSquare, label: "WhatsApp check-ins in Hindi, English, Hinglish" },
                { icon: FileText, label: "NABH-aligned reports, audit-logged" },
              ].map((b) => (
                <div key={b.label} className="flex items-center gap-3">
                  <div className="h-9 w-9 rounded-lg bg-primary/10 text-primary flex items-center justify-center flex-shrink-0">
                    <b.icon className="h-5 w-5" />
                  </div>
                  <span className="text-sm font-medium text-foreground/90">{b.label}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="text-xs text-muted-foreground">
            © {new Date().getFullYear()} {OJAS_BRAND.name} · {OJAS_BRAND.location}
          </div>
        </aside>

        {/* Right panel — form */}
        <main className="flex flex-col">
          <div className="flex-1 flex items-center justify-center p-4 md:p-8">
            <div className="w-full max-w-md">
              <div className="lg:hidden flex justify-center mb-4">
                <div className="h-14 w-14 rounded-2xl bg-primary/10 text-primary flex items-center justify-center">
                  <Stethoscope className="h-7 w-7" />
                </div>
              </div>

              <div className="mb-7">
                <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Sign in</h1>
                <p className="text-muted-foreground text-sm mt-1.5">
                  Welcome back. Use your hospital credentials.
                </p>
              </div>

              <Card className="glass border-border/50 shadow-lg">
                <CardContent className="p-6">
                  <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                    <div className="space-y-1.5">
                      <Label htmlFor="email">Email</Label>
                      <Input
                        id="email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); if (errors.email) setErrors((p) => ({ ...p, email: undefined })); }}
                        placeholder="you@hospital.in"
                        aria-invalid={!!errors.email}
                        disabled={submitting}
                      />
                      {errors.email && <p className="text-xs text-destructive">{errors.email}</p>}
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <Label htmlFor="password">Password</Label>
                        <button
                          type="button"
                          onClick={() => navigate("forgot")}
                          className="text-xs text-primary hover:underline"
                        >
                          Forgot password?
                        </button>
                      </div>
                      <Input
                        id="password"
                        type="password"
                        autoComplete="current-password"
                        value={password}
                        onChange={(e) => { setPassword(e.target.value); if (errors.password) setErrors((p) => ({ ...p, password: undefined })); }}
                        placeholder="••••••••"
                        aria-invalid={!!errors.password}
                        disabled={submitting}
                      />
                      {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
                    </div>

                    <Button type="submit" className="w-full group" disabled={submitting}>
                      {submitting ? (
                        <>
                          <Loader2 className="h-4 w-4 animate-spin" /> Signing in…
                        </>
                      ) : (
                        <>
                          Sign in <ArrowRight className="h-4 w-4 group-hover:translate-x-0.5 transition-transform" />
                        </>
                      )}
                    </Button>
                  </form>

                  {DEMO_MODE && demoCreds && (
                  <div className="mt-5 pt-5 border-t border-border">
                    <Alert className="bg-accent/20 border-accent/40">
                      <FlaskConical className="h-4 w-4 text-accent-foreground" />
                      <AlertTitle className="flex items-center gap-2">
                        Demo access
                        <Badge variant="outline" className="text-[10px]">Dev-only</Badge>
                      </AlertTitle>
                      <AlertDescription className="mt-1">
                        <div className="text-xs leading-relaxed">
                          Try Ojas with a pre-seeded demo hospital. Use the credentials below, or seed
                          the demo data first if it isn&apos;t ready.
                        </div>
                        <div className="mt-2.5 rounded-md bg-background/60 border border-border p-2.5 text-xs font-mono">
                          <div className="flex items-center justify-between gap-2">
                            <span className="truncate">{demoCreds.email}</span>
                          </div>
                          <div className="flex items-center justify-between gap-2 mt-1">
                            <span className="truncate">{demoPassword}</span>
                            <button
                              type="button"
                              onClick={copyCreds}
                              className="text-muted-foreground hover:text-foreground"
                              aria-label="Copy credentials"
                            >
                              {copied ? <CheckCircle2 className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
                            </button>
                          </div>
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1.5">
                          Role: <span className="font-medium text-foreground">{demoCreds.role}</span>
                        </div>
                        <div className="flex flex-wrap gap-2 mt-3">
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={fillDemo}
                            disabled={submitting || seeding}
                          >
                            Fill credentials
                          </Button>
                          <Button
                            type="button"
                            size="sm"
                            variant="secondary"
                            onClick={handleSeed}
                            disabled={seeding}
                          >
                            {seeding ? (
                              <><Loader2 className="h-3.5 w-3.5 animate-spin" /> Seeding…</>
                            ) : (
                              <><Sparkles className="h-3.5 w-3.5" /> Seed demo data</>
                            )}
                          </Button>
                        </div>
                      </AlertDescription>
                    </Alert>
                  </div>
                  )}
                  {DEMO_MODE && !demoCreds && demoLoading && (
                    <div className="mt-5 pt-5 border-t border-border text-xs text-muted-foreground text-center">
                      Loading demo credentials…
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="lg:hidden mt-6 flex flex-wrap justify-center gap-4 text-xs text-muted-foreground">
                <span className="flex items-center gap-1.5"><Brain className="h-3.5 w-3.5 text-primary" /> AI risk triage</span>
                <span className="flex items-center gap-1.5"><MessageSquare className="h-3.5 w-3.5 text-primary" /> WhatsApp check-ins</span>
                <span className="flex items-center gap-1.5"><FileText className="h-3.5 w-3.5 text-primary" /> NABH reports</span>
              </div>

              <div className="text-center mt-5 text-xs text-muted-foreground">
                New hospital?{" "}
                <a
                  href={`mailto:${OJAS_BRAND.email}?subject=Start with Ojas`}
                  className="text-primary hover:underline"
                >
                  Contact us
                </a>{" "}
                to get set up.
              </div>
            </div>
          </div>
        </main>
      </div>
      <AppFooter />
    </div>
  );
}
