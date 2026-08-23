"use client";

// Ojas — Billing page (hospital admin). Shows current plan, usage meters,
// plan tiers with upgrade/downgrade confirm dialog, real Razorpay checkout,
// live integration status, and honest empty states for invoices.
import * as React from "react";
import { MotionConfig } from "framer-motion";
import { toast } from "sonner";
import {
  CreditCard, Loader2, Check, Sparkles, AlertTriangle, Receipt,
  Activity, Users, Zap, ShieldCheck, TrendingUp, Crown, ArrowUpRight,
  ArrowDownRight, CheckCircle2, FileText, Calendar,
} from "lucide-react";

import { api } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ── Types matching /api/billing ─────────────────────────────────────────────
interface PlanTier {
  id: "PILOT" | "GROWTH" | "ENTERPRISE";
  name: string;
  price: string;
  popular?: boolean;
  patientLimit: number;
  aiEnabled: boolean;
  features: string[];
  notIncluded?: string[];
}

interface Subscription {
  id: string;
  planTier: "PILOT" | "GROWTH" | "ENTERPRISE";
  patientLimit: number;
  aiEnabled: boolean;
  status: string;
  currentPeriodEnd: string | null;
}

interface Usage {
  patientsUsed: number;
  patientsLimit: number;
  aiCallsThisMonth: number;
  aiCallsLimit: number;
}

interface BillingResponse {
  plans: PlanTier[];
  current?: {
    planTier: "PILOT" | "GROWTH" | "ENTERPRISE" | "STARTER"; // STARTER is legacy
    subscription: Subscription | null;
    usage: Usage;
  };
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const PLAN_BADGE: Record<string, string> = {
  PILOT: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  STARTER: "bg-muted text-muted-foreground border-border",
  GROWTH: "bg-primary/15 text-primary border-primary/30",
  ENTERPRISE: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
};

function pct(used: number, limit: number): number {
  if (limit <= 0) return 100;
  return Math.min(100, Math.round((used / limit) * 100));
}

function fmt(n: number): string {
  return new Intl.NumberFormat("en-IN").format(n);
}

// ── Page ────────────────────────────────────────────────────────────────────
export function BillingPage() {
  const [data, setData] = React.useState<BillingResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [pendingTier, setPendingTier] = React.useState<PlanTier | null>(null);
  const [changing, setChanging] = React.useState(false);
  // Live integration status (Connected / Not configured) from /api/integrations/status.
  const [integrations, setIntegrations] = React.useState<{
    whatsapp?: { configured: boolean; status: string };
    razorpay?: { configured: boolean; status: string };
    sentry?: { configured: boolean; status: string };
  }>({});
  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/integrations/status", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setIntegrations(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<BillingResponse>("/api/billing");
      setData(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load billing");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const confirmChange = async () => {
    if (!pendingTier) return;
    setChanging(true);
    try {
      if (pendingTier.id === "ENTERPRISE") {
        // Enterprise is a custom plan — direct to sales.
        window.location.href = `mailto:hello@ojas.care?subject=Enterprise%20plan%20enquiry&body=Hospital%20ID%3A%20${encodeURIComponent(data?.current?.planTier ?? "")}`;
        toast.success("Opening your email client to contact sales about Enterprise.");
        setPendingTier(null);
        return;
      }
      if (pendingTier.id === "PILOT") {
        // PILOT is free — activate directly via the billing route.
        await api("/api/billing", { method: "POST", body: JSON.stringify({ planTier: "PILOT" }) });
        toast.success(`Switched to ${pendingTier.name}`);
        setPendingTier(null);
        await load();
        return;
      }
      // GROWTH (paid) — real Razorpay checkout flow.
      await startRazorpayCheckout(pendingTier.id as "GROWTH");
      setPendingTier(null);
      await load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change plan");
    } finally {
      setChanging(false);
    }
  };

  // ── Razorpay Checkout (real) ───────────────────────────────────────────────
  // 1. Create an order server-side (POST /api/billing/checkout).
  // 2. Open the Razorpay Checkout modal with the order id + key id.
  // 3. On payment success, POST /api/billing/verify for server-side signature
  //    verification + subscription activation.
  const startRazorpayCheckout = async (planTier: "GROWTH") => {
    const orderRes = await fetch("/api/billing/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ planTier }),
    });
    const order = await orderRes.json().catch(() => ({}));
    if (!orderRes.ok) {
      throw new Error(order.error || `Checkout failed (HTTP ${orderRes.status})`);
    }
    // Lazily load the Razorpay Web Checkout script.
    await loadRazorpayScript();
    const options = {
      key: order.keyId,
      amount: order.amount,
      currency: order.currency,
      name: "Ojas",
      description: `${planTier} plan — monthly`,
      order_id: order.orderId,
      prefill: { name: order.hospitalName },
      theme: { color: "#0f766e" },
      handler: async (response: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
        try {
          const verifyRes = await fetch("/api/billing/verify", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
              orderId: response.razorpay_order_id,
              paymentId: response.razorpay_payment_id,
              signature: response.razorpay_signature,
              planTier,
            }),
          });
          const data = await verifyRes.json().catch(() => ({}));
          if (!verifyRes.ok) {
            throw new Error(data.error || "Payment verification failed");
          }
          toast.success(`Payment verified — switched to ${planTier}`);
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Payment verification failed");
        }
      },
      modal: {
        ondismiss: () => {
          toast.error("Payment cancelled — no changes made.");
        },
      },
    };
    const rzp = new (window as unknown as { Razorpay: new (opts: unknown) => { open: () => void } }).Razorpay(options);
    rzp.open();
  };

  function loadRazorpayScript(): Promise<void> {
    return new Promise((resolve, reject) => {
      if ((window as unknown as { Razorpay?: unknown }).Razorpay) { resolve(); return; }
      const script = document.createElement("script");
      script.src = "https://checkout.razorpay.com/v1/checkout.js";
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error("Failed to load Razorpay checkout. Check your network."));
      document.body.appendChild(script);
    });
  }

  if (loading) return <BillingSkeleton />;

  const plans = data?.plans ?? [];
  const current = data?.current;
  const currentTier = current?.planTier ?? "PILOT";
  const usage = current?.usage;
  const subscription = current?.subscription;
  const overPatients = usage ? usage.patientsUsed > usage.patientsLimit : false;
  const overAi = usage ? usage.aiCallsThisMonth > usage.aiCallsLimit : false;

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-6">
        {/* Header */}
        <div>
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight flex items-center gap-2">
            <CreditCard className="h-6 w-6 text-primary" /> Billing
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Plan tier, live usage metering, and honest placeholders for payment + invoices.
          </p>
        </div>

        {/* Over-limit warning */}
        {(overPatients || overAi) && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Over plan limit</AlertTitle>
            <AlertDescription>
              {overPatients && `You're using ${usage!.patientsUsed} of ${usage!.patientsLimit} patient slots. `}
              {overAi && `You've consumed ${usage!.aiCallsThisMonth} of ${usage!.aiCallsLimit} AI calls this month. `}
              Upgrade your plan to avoid disruption to check-in scheduling and AI triage.
            </AlertDescription>
          </Alert>
        )}

        {/* Current plan + Usage */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          {/* Current plan card */}
          <Card className="glass lg:col-span-1">
            <CardHeader>
              <CardDescription>Current plan</CardDescription>
              <CardTitle className="flex items-center gap-2 text-2xl">
                <Badge className={cn("text-xs uppercase tracking-wider", PLAN_BADGE[currentTier])}>
                  {plans.find((p) => p.id === currentTier)?.name ?? currentTier}
                </Badge>
                {subscription?.status === "active" && (
                  <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                    <CheckCircle2 className="h-3 w-3" /> Active
                  </Badge>
                )}
              </CardTitle>
              <CardDescription>
                {subscription?.currentPeriodEnd
                  ? `Renews ${new Date(subscription.currentPeriodEnd).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}`
                  : "No renewal date set"}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Patient limit</span>
                <span className="font-medium">{subscription?.patientLimit ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">AI enabled</span>
                <span className="font-medium">{subscription?.aiEnabled ? "Yes" : "No"}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Status</span>
                <span className="font-medium capitalize">{subscription?.status ?? "—"}</span>
              </div>
            </CardContent>
          </Card>

          {/* Usage meters */}
          <Card className="glass lg:col-span-2">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <TrendingUp className="h-5 w-5 text-primary" /> Live usage this month
              </CardTitle>
              <CardDescription>
                Metered from real database rows + AI agent run logs. Resets on the 1st of each month.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              {usage ? (
                <>
                  <UsageBar
                    icon={<Users className="h-4 w-4" />}
                    label="Patient slots"
                    used={usage.patientsUsed}
                    limit={usage.patientsLimit}
                    over={overPatients}
                  />
                  <UsageBar
                    icon={<Zap className="h-4 w-4" />}
                    label="AI calls this month"
                    used={usage.aiCallsThisMonth}
                    limit={usage.aiCallsLimit}
                    over={overAi}
                  />
                </>
              ) : (
                <p className="text-sm text-muted-foreground">Usage unavailable for this account.</p>
              )}
              <Alert className="border-primary/30 bg-primary/5">
                <Activity className="h-4 w-4 text-primary" />
                <AlertDescription className="text-xs">
                  <strong>How metering works:</strong> AI usage is metered from real logged agent runs
                  (<code className="font-mono text-[11px]">ai_agent_runs</code>). Patient counts are live from the database —
                  not cached, not estimated.
                </AlertDescription>
              </Alert>
            </CardContent>
          </Card>
        </div>

        {/* Plan tiers */}
        <div>
          <h2 className="text-lg font-semibold tracking-tight mb-3">Plan tiers</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {plans.map((plan) => {
              const isCurrent = plan.id === currentTier;
              // Rough tier ordering for upgrade/downgrade labels
              const order = { PILOT: 0, STARTER: 0, GROWTH: 1, ENTERPRISE: 2 } as const;
              const isUpgrade = order[plan.id] > order[currentTier];
              const isDowngrade = order[plan.id] < order[currentTier];
              return (
                <Card
                  key={plan.id}
                  className={cn(
                    "relative flex flex-col transition-all",
                    plan.popular && !isCurrent && "border-primary/40 ring-1 ring-primary/30",
                    isCurrent && "border-primary ring-1 ring-primary/40 glow-primary",
                  )}
                >
                  {plan.popular && (
                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                      <Badge className="bg-primary text-primary-foreground text-[10px] uppercase tracking-wider">
                        <Sparkles className="h-3 w-3" /> Popular
                      </Badge>
                    </div>
                  )}
                  {isCurrent && (
                    <div className="absolute -top-2.5 left-1/2 -translate-x-1/2">
                      <Badge className="bg-emerald-500 text-white text-[10px] uppercase tracking-wider">
                        <Check className="h-3 w-3" /> Current
                      </Badge>
                    </div>
                  )}
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-xl">
                      {plan.id === "ENTERPRISE" ? <Crown className="h-5 w-5 text-amber-600" /> : null}
                      {plan.name}
                    </CardTitle>
                    <CardDescription className="text-2xl font-semibold text-foreground">
                      {plan.price}
                    </CardDescription>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-3">
                    <ul className="space-y-2">
                      {plan.features.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm">
                          <Check className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                          <span>{f}</span>
                        </li>
                      ))}
                      {plan.notIncluded?.map((f) => (
                        <li key={f} className="flex items-start gap-2 text-sm text-muted-foreground">
                          <span className="inline-flex h-4 w-4 shrink-0 mt-0.5 text-muted-foreground/60">—</span>
                          <span className="line-through">{f}</span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                  <CardFooter>
                    {isCurrent ? (
                      <Button variant="outline" className="w-full" disabled>
                        <Check className="h-4 w-4" /> Current plan
                      </Button>
                    ) : isUpgrade ? (
                      <Button className="w-full glow-primary" onClick={() => setPendingTier(plan)}>
                        <ArrowUpRight className="h-4 w-4" /> Upgrade to {plan.name}
                      </Button>
                    ) : (
                      <Button variant="outline" className="w-full" onClick={() => setPendingTier(plan)}>
                        <ArrowDownRight className="h-4 w-4" /> Downgrade to {plan.name}
                      </Button>
                    )}
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Payment method (Razorpay live status) */}
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <CreditCard className="h-5 w-5 text-primary" /> Payment method
            </CardTitle>
            <CardDescription>How plan changes are charged — Razorpay (India).</CardDescription>
          </CardHeader>
          <CardContent>
            <Alert className={integrations.razorpay?.configured ? "border-emerald-500/30 bg-emerald-500/5" : "border-amber-500/30 bg-amber-500/5"}>
              <ShieldCheck className={integrations.razorpay?.configured ? "h-4 w-4 text-emerald-600 dark:text-emerald-400" : "h-4 w-4 text-amber-600 dark:text-amber-400"} />
              <AlertTitle>{integrations.razorpay?.configured ? "Razorpay is connected" : "Razorpay requires live API keys"}</AlertTitle>
              <AlertDescription className="text-xs leading-relaxed">
                {integrations.razorpay?.configured
                  ? <>Plan upgrades open the real Razorpay checkout modal; payment is verified server-side (<code className="font-mono text-[11px]">/api/billing/verify</code>) and the HMAC-verified webhook (<code className="font-mono text-[11px]">/api/billing/webhook</code>) drives the Subscription lifecycle (success / failure / renewal / cancellation).</>
                  : <>Set <code className="font-mono text-[11px]">RAZORPAY_KEY_ID</code>, <code className="font-mono text-[11px]">RAZORPAY_KEY_SECRET</code>, and <code className="font-mono text-[11px]">RAZORPAY_WEBHOOK_SECRET</code> in the environment to enable checkout. Once configured, upgrades open the Razorpay checkout modal and the webhook reconciles <code className="font-mono text-[11px]">payment.captured</code> / <code className="font-mono text-[11px]">subscription.charged</code> events to the <code className="font-mono text-[11px]">Subscription</code> row.</>}
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Invoices (empty state) */}
        <Card className="glass">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-lg">
              <Receipt className="h-5 w-5 text-primary" /> Invoices
            </CardTitle>
            <CardDescription>Generated monthly once Razorpay payments are live.</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="text-center py-10 px-4">
              <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-muted text-muted-foreground mb-3">
                <FileText className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium">No invoices yet</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto flex items-center justify-center gap-1">
                <Calendar className="h-3 w-3" />
                Invoices are generated on the 1st of each month.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Confirm change dialog */}
        <AlertDialog open={!!pendingTier} onOpenChange={(o) => !o && setPendingTier(null)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {pendingTier && (["PILOT", "STARTER", "GROWTH", "ENTERPRISE"].indexOf(pendingTier.id) >
                  ["PILOT", "STARTER", "GROWTH", "ENTERPRISE"].indexOf(currentTier)
                    ? `Upgrade to ${pendingTier.name}?`
                    : `Downgrade to ${pendingTier.name}?`)}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {pendingTier && (
                  <>
                    You&apos;re switching to the <strong>{pendingTier.name}</strong> plan
                    ({pendingTier.price}).
                    {pendingTier.id === "PILOT" && " PILOT is free — it activates immediately and your patient limit drops to 25 for the 30-day pilot."}
                    {pendingTier.id === "GROWTH" && " You&apos;ll be charged ₹14,999/mo via Razorpay. The checkout modal opens next; your subscription activates after payment is verified."}
                    {pendingTier.id === "ENTERPRISE" && " Enterprise is a custom plan — we&apos;ll open your email client to start the conversation with sales."}
                  </>
                )}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={changing}>Cancel</AlertDialogCancel>
              <AlertDialogAction
                onClick={(e) => { e.preventDefault(); void confirmChange(); }}
                disabled={changing}
                className="glow-primary"
              >
                {changing ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Confirm change
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </MotionConfig>
  );
}

function UsageBar({ icon, label, used, limit, over }: {
  icon: React.ReactNode;
  label: string;
  used: number;
  limit: number;
  over: boolean;
}) {
  const p = pct(used, limit);
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-sm">
        <span className="flex items-center gap-2 text-muted-foreground">
          {icon} {label}
        </span>
        <span className={cn("font-medium tabular-nums", over && "text-rose-600 dark:text-rose-400")}>
          {fmt(used)} <span className="text-muted-foreground">/ {fmt(limit)}</span>
        </span>
      </div>
      <Progress
        value={p}
        className={cn("h-2.5", over && "[&_[data-slot=progress-indicator]]:bg-rose-500")}
      />
      <div className="flex items-center justify-between text-xs text-muted-foreground">
        <span>{p}% used</span>
        {over ? (
        <span className="text-rose-600 dark:text-rose-400 flex items-center gap-1">
          <AlertTriangle className="h-3 w-3" /> Over limit
        </span>
      ) : (
        <span>{fmt(Math.max(0, limit - used))} remaining</span>
      )}
      </div>
    </div>
  );
}

function BillingSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-8 w-40" />
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-48 lg:col-span-2 w-full" />
      </div>
      <Skeleton className="h-8 w-40" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>
      <Skeleton className="h-32 w-full" />
      <Skeleton className="h-40 w-full" />
    </div>
  );
}
