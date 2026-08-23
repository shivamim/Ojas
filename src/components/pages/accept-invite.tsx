"use client";

import * as React from "react";
import { toast } from "sonner";
import { navigate } from "@/lib/router";
import { OJAS_BRAND } from "@/lib/brand";
import { AppFooter } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  ArrowRight, Loader2, ShieldCheck, UserCircle2, Lock,
  AlertCircle, CheckCircle2,
} from "lucide-react";
import { MarketingHeader } from "@/components/marketing-header";

function passwordStrength(p: string): { score: number; label: string } {
  let score = 0;
  if (p.length >= 8) score++;
  if (p.length >= 12) score++;
  if (/[A-Z]/.test(p) && /[a-z]/.test(p)) score++;
  if (/[0-9]/.test(p)) score++;
  if (/[^A-Za-z0-9]/.test(p)) score++;
  const labels = ["Too short", "Weak", "Fair", "Good", "Strong", "Strong"];
  return { score, label: labels[score] };
}

export function AcceptInvitePage({ token }: { token?: string }) {
  const [name, setName] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [errors, setErrors] = React.useState<{ name?: string; password?: string; confirm?: string }>({});
  const [submitting, setSubmitting] = React.useState(false);

  const strength = passwordStrength(password);
  const hasToken = !!token && token.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const nextErrors: typeof errors = {};
    if (!name.trim()) nextErrors.name = "Name is required";
    else if (name.trim().length < 2) nextErrors.name = "Name is too short";
    if (!password) nextErrors.password = "Password is required";
    else if (password.length < 8) nextErrors.password = "Password must be at least 8 characters";
    if (confirm !== password) nextErrors.confirm = "Passwords don't match";
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length) return;

    setSubmitting(true);
    try {
      const res = await fetch("/api/auth/accept-invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ token, name: name.trim(), password }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const msg = data.error || "Could not accept invite";
        toast.error(msg);
        return;
      }
      toast.success("Account created", {
        description: "You're signed in — taking you to your dashboard.",
      });
      // Server set the session cookie; page.tsx will pick up the user via
      // the next auth refresh. Trigger a navigation to dashboard.
      setTimeout(() => navigate("dashboard"), 300);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Could not accept invite";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col aurora-bg">
      <MarketingHeader showCta={false} />
      <main className="flex-1 flex items-center justify-center p-4 md:p-8 py-12">
        <div className="w-full max-w-md">

          <div className="mb-6 text-center">
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Accept your invitation</h1>
            <p className="text-muted-foreground text-sm mt-1.5">
              Set your name and password to join your hospital&apos;s care team.
            </p>
          </div>

          {!hasToken && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Missing invite token</AlertTitle>
              <AlertDescription>
                The invite link is incomplete. Please use the full link from your email invitation,
                or ask your hospital admin to resend it.
              </AlertDescription>
            </Alert>
          )}

          <Card className={hasToken ? "glass" : "glass opacity-90"}>
            <CardContent className="p-6">
              <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                <div className="space-y-1.5">
                  <Label htmlFor="name">Full name</Label>
                  <div className="relative">
                    <UserCircle2 className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="name"
                      type="text"
                      autoComplete="name"
                      value={name}
                      onChange={(e) => { setName(e.target.value); if (errors.name) setErrors((p) => ({ ...p, name: undefined })); }}
                      placeholder="Dr. Priya Singh"
                      className="pl-9"
                      aria-invalid={!!errors.name}
                      disabled={submitting || !hasToken}
                    />
                  </div>
                  {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="password">Password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type="password"
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => { setPassword(e.target.value); if (errors.password) setErrors((p) => ({ ...p, password: undefined })); }}
                      placeholder="At least 8 characters"
                      className="pl-9"
                      aria-invalid={!!errors.password}
                      disabled={submitting || !hasToken}
                    />
                  </div>
                  {errors.password && <p className="text-xs text-destructive">{errors.password}</p>}
                  {password.length > 0 && (
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex-1 grid grid-cols-5 gap-1">
                        {[0, 1, 2, 3, 4].map((i) => (
                          <div
                            key={i}
                            className={
                              "h-1 rounded-full transition-colors " +
                              (i < strength.score
                                ? strength.score <= 1
                                  ? "bg-destructive/70"
                                  : strength.score <= 2
                                    ? "bg-amber-500/70"
                                    : "bg-primary"
                                : "bg-muted")
                            }
                          />
                        ))}
                      </div>
                      <span className="text-[11px] text-muted-foreground w-12 text-right">{strength.label}</span>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="confirm">Confirm password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirm"
                      type="password"
                      autoComplete="new-password"
                      value={confirm}
                      onChange={(e) => { setConfirm(e.target.value); if (errors.confirm) setErrors((p) => ({ ...p, confirm: undefined })); }}
                      placeholder="Re-enter password"
                      className="pl-9"
                      aria-invalid={!!errors.confirm}
                      disabled={submitting || !hasToken}
                    />
                  </div>
                  {errors.confirm && <p className="text-xs text-destructive">{errors.confirm}</p>}
                  {confirm.length > 0 && confirm === password && (
                    <div className="flex items-center gap-1.5 text-xs text-primary">
                      <CheckCircle2 className="h-3.5 w-3.5" /> Passwords match
                    </div>
                  )}
                </div>

                <Button type="submit" className="w-full" disabled={submitting || !hasToken}>
                  {submitting ? (
                    <><Loader2 className="h-4 w-4 animate-spin" /> Creating account…</>
                  ) : (
                    <>Create account <ArrowRight className="h-4 w-4" /></>
                  )}
                </Button>
              </form>

              <div className="mt-5 pt-5 border-t border-border flex items-start gap-2 text-xs text-muted-foreground">
                <ShieldCheck className="h-4 w-4 text-primary flex-shrink-0 mt-0.5" />
                <span>
                  By accepting this invite, your session is set with an httpOnly cookie and
                  audit-logged. PII you access is hospital-scoped and encrypted at rest.
                </span>
              </div>
            </CardContent>
          </Card>

          <div className="text-center mt-5 text-xs text-muted-foreground">
            <Badge variant="outline" className="text-[10px]">AI is decision support, not a diagnosis</Badge>
          </div>

          <div className="text-center mt-3 text-xs text-muted-foreground">
            Need help?{" "}
            <a
              href={`mailto:${OJAS_BRAND.email}?subject=Invite help`}
              className="text-primary hover:underline"
            >
              {OJAS_BRAND.email}
            </a>
          </div>
        </div>
      </main>
      <AppFooter />
    </div>
  );
}
