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
  ArrowRight, Loader2, Mail, ArrowLeft, Info,
  CheckCircle2, AlertCircle,
} from "lucide-react";
import { MarketingHeader } from "@/components/marketing-header";

function isValidEmail(e: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export function ForgotPasswordPage() {
  const [email, setEmail] = React.useState("");
  const [error, setError] = React.useState<string | undefined>();
  const [submitting, setSubmitting] = React.useState(false);
  const [submitted, setSubmitted] = React.useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) {
      setError("Email is required");
      return;
    }
    if (!isValidEmail(email.trim())) {
      setError("Enter a valid email address");
      return;
    }
    setError(undefined);
    setSubmitting(true);
    try {
      // Honest no-op: this dev build does not have email sending wired.
      // We don't reveal whether the email exists; we always show the same
      // confirmation. The reset link would normally be generated server-side.
      await new Promise((r) => setTimeout(r, 450));
      setSubmitted(true);
      toast.success("Reset request received", {
        description: "If an account exists, a reset link has been sent.",
      });
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
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Forgot your password?</h1>
            <p className="text-muted-foreground text-sm mt-1.5">
              Enter your work email and we&apos;ll send a reset link if an account exists.
            </p>
          </div>

          <Card className="glass">
            <CardContent className="p-6">
              {submitted ? (
                <div className="space-y-4">
                  <div className="flex justify-center">
                    <div className="h-12 w-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
                      <CheckCircle2 className="h-6 w-6" />
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="font-medium">Check your inbox</div>
                    <p className="text-sm text-muted-foreground mt-1.5 leading-relaxed">
                      If an account exists for <span className="font-medium text-foreground">{email}</span>,
                      a reset link has been sent.
                    </p>
                  </div>
                  <Alert className="bg-accent/20 border-accent/40">
                    <Info className="h-4 w-4 text-accent-foreground" />
                    <AlertTitle>Dev build note</AlertTitle>
                    <AlertDescription>
                      Email sending is not wired in this sandbox. To reset your password, please
                      contact your hospital admin, who can issue you a fresh invite from
                      Settings → Users.
                    </AlertDescription>
                  </Alert>
                  <Button className="w-full" variant="outline" onClick={() => navigate("login")}>
                    <ArrowLeft className="h-4 w-4" /> Back to sign in
                  </Button>
                </div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4" noValidate>
                  <div className="space-y-1.5">
                    <Label htmlFor="email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="email"
                        type="email"
                        autoComplete="email"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); if (error) setError(undefined); }}
                        placeholder="you@hospital.in"
                        className="pl-9"
                        aria-invalid={!!error}
                        disabled={submitting}
                      />
                    </div>
                    {error && (
                      <p className="text-xs text-destructive flex items-center gap-1">
                        <AlertCircle className="h-3 w-3" /> {error}
                      </p>
                    )}
                  </div>

                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? (
                      <><Loader2 className="h-4 w-4 animate-spin" /> Sending…</>
                    ) : (
                      <>Send reset link <ArrowRight className="h-4 w-4" /></>
                    )}
                  </Button>

                  <Button type="button" className="w-full" variant="ghost" onClick={() => navigate("login")}>
                    <ArrowLeft className="h-4 w-4" /> Back to sign in
                  </Button>
                </form>
              )}

              <div className="mt-5 pt-5 border-t border-border text-xs text-muted-foreground leading-relaxed">
                <div className="flex items-start gap-2">
                  <Info className="h-4 w-4 text-muted-foreground flex-shrink-0 mt-0.5" />
                  <span>
                    For your security, we don&apos;t reveal whether an email is registered. If you
                    don&apos;t receive a link, contact your hospital admin.
                  </span>
                </div>
              </div>
            </CardContent>
          </Card>

          <div className="text-center mt-5 text-xs text-muted-foreground">
            <Badge variant="outline" className="text-[10px]">DPDPA 2023 · No PII leakage</Badge>
          </div>

          <div className="text-center mt-3 text-xs text-muted-foreground">
            Need help?{" "}
            <a
              href={`mailto:${OJAS_BRAND.email}?subject=Password reset help`}
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
