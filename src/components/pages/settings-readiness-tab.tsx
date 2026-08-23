"use client";

import * as React from "react";
import { toast } from "sonner";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Loader2, ShieldCheck, Network, HeartPulse, Stethoscope, Server,
  MessageSquare, Cpu, Database, CheckCircle2, XCircle, AlertTriangle,
  Lock, FlaskConical, KeyRound, ArrowRight, RotateCcw, Building2, MapPin,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ── Types matching /api/integrations/readiness ────────────────────────────────
interface ChecklistItem { label: string; passed: boolean; detail?: string; }
interface IntegrationReadiness {
  integration: string;
  status: string;
  label: string;
  items: ChecklistItem[];
  passedCount: number;
  totalCount: number;
}
interface NhcxLiveGating {
  gateSandboxConfigured: boolean;
  gateSandboxVerified: boolean;
  gatePartnerOnboardingVerified: boolean;
  gateCertificatesVerified: boolean;
  gateProductionEndpointVerified: boolean;
  gateProductionConnectivityVerified: boolean;
  gateLiveApproved: boolean;
}
interface OnboardingChecklist {
  hfrVerified: boolean;
  hemLinked: boolean;
  pmjayEmpanelmentVerified: boolean;
  ojasFacilityMappingComplete: boolean;
}
interface IntegrationProfile {
  hfrId?: string | null;
  pmjayFacilityId?: string | null;
  hemStatus?: string | null;
  state?: string | null;
  district?: string | null;
  abdmMode?: string;
  abhaMode?: string;
  pmjayMode?: string;
  certificationStatus?: string;
  notes?: string | null;
}
interface ReadinessResponse {
  hospitalId: string;
  hospitalName?: string;
  integrationProfile: {
    hfrId: string | null;
    pmjayFacilityId: string | null;
    hemStatus: string | null;
    state: string | null;
    district: string | null;
    abdmMode: string;
    abhaMode: string;
    pmjayMode: string;
    nhcxMode: string;
    certificationStatus: string;
    onboardingChecklist: OnboardingChecklist;
    nhcxLiveGating: NhcxLiveGating;
  } | null;
  readiness: IntegrationReadiness[];
  overallReady: boolean;
}
interface GateResponse {
  gates: string[];
  currentGate: string | null;
  currentIndex: number;
}

const NHCX_GATES = [
  "SANDBOX_CONFIGURED", "SANDBOX_VERIFIED", "PARTNER_ONBOARDING_VERIFIED",
  "CERTIFICATES_VERIFIED", "PRODUCTION_ENDPOINT_VERIFIED",
  "PRODUCTION_CONNECTIVITY_VERIFIED", "LIVE_APPROVED", "LIVE",
] as const;

function statusTone(status: string) {
  const s = status.toUpperCase();
  if (s === "LIVE" || s === "PRODUCTION") return { badge: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", dot: "bg-emerald-500", Icon: CheckCircle2 };
  if (s === "SANDBOX" || s === "SANDBOX_VERIFIED") return { badge: "border-primary/30 bg-primary/10 text-primary", dot: "bg-primary", Icon: FlaskConical };
  if (s === "MANUAL_PORTAL") return { badge: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400", dot: "bg-blue-500", Icon: KeyRound };
  if (s.includes("PENDING") || s.includes("BLOCKED")) return { badge: "border-amber-500/50 bg-amber-500/10 text-amber-700 dark:text-amber-400", dot: "bg-amber-500", Icon: AlertTriangle };
  if (s === "READINESS_PLATFORM") return { badge: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-400", dot: "bg-violet-500", Icon: ShieldCheck };
  return { badge: "border-muted-foreground/30 bg-muted text-muted-foreground", dot: "bg-muted-foreground", Icon: XCircle };
}

const INTEGRATION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "ABHA / ABDM": HeartPulse,
  "PM-JAY": Stethoscope,
  "NHCX": Network,
  "WhatsApp": MessageSquare,
  "Infrastructure": Server,
};

function ReadinessCard({ r }: { r: IntegrationReadiness }) {
  const tone = statusTone(r.status);
  const Icon = INTEGRATION_ICONS[r.integration] ?? Cpu;
  const pct = r.totalCount > 0 ? Math.round((r.passedCount / r.totalCount) * 100) : 0;
  return (
    <Card className="h-full">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5 min-w-0">
            <div className="h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0 bg-primary/10 text-primary">
              <Icon className="h-4.5 w-4.5" />
            </div>
            <div className="min-w-0">
              <CardTitle className="text-sm font-semibold">{r.integration}</CardTitle>
              <CardDescription className="text-xs mt-0.5">{r.label}</CardDescription>
            </div>
          </div>
          <Badge variant="outline" className={cn("text-[9px] uppercase tracking-wider gap-1 flex-shrink-0", tone.badge)}>
            <tone.Icon className="h-2.5 w-2.5" />
            {r.status.replace(/_/g, " ").toLowerCase()}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="pt-0 space-y-2">
        {/* Progress bar */}
        <div className="flex items-center gap-2">
          <div className="flex-1 h-1.5 rounded-full bg-muted overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all", tone.dot)}
              style={{ width: `${pct}%` }}
            />
          </div>
          <span className="text-[10px] font-mono text-muted-foreground flex-shrink-0">{r.passedCount}/{r.totalCount}</span>
        </div>
        <ul className="space-y-1.5">
          {r.items.map((item, i) => (
            <li key={i} className="flex items-start gap-2 text-xs">
              {item.passed ? (
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 flex-shrink-0 mt-0.5" />
              ) : (
                <XCircle className="h-3.5 w-3.5 text-muted-foreground/50 flex-shrink-0 mt-0.5" />
              )}
              <div className="min-w-0">
                <span className={cn("leading-relaxed", item.passed ? "text-foreground" : "text-muted-foreground")}>
                  {item.label}
                </span>
                {item.detail && (
                  <span className="block text-[10px] text-muted-foreground/80 mt-0.5">{item.detail}</span>
                )}
              </div>
            </li>
          ))}
        </ul>
      </CardContent>
    </Card>
  );
}

function NhcxGateStepper({ gating, currentGate, onAdvance, onRollback }: {
  gating: NhcxLiveGating;
  currentGate: string | null;
  onAdvance: (gate: string) => Promise<void>;
  onRollback: (reason: string) => Promise<void>;
}) {
  const [advancing, setAdvancing] = React.useState<string | null>(null);
  const [showRollback, setShowRollback] = React.useState(false);
  const [rollbackReason, setRollbackReason] = React.useState("");
  const [rollingBack, setRollingBack] = React.useState(false);

  const gateBooleans: Record<string, boolean> = {
    SANDBOX_CONFIGURED: gating.gateSandboxConfigured,
    SANDBOX_VERIFIED: gating.gateSandboxVerified,
    PARTNER_ONBOARDING_VERIFIED: gating.gatePartnerOnboardingVerified,
    CERTIFICATES_VERIFIED: gating.gateCertificatesVerified,
    PRODUCTION_ENDPOINT_VERIFIED: gating.gateProductionEndpointVerified,
    PRODUCTION_CONNECTIVITY_VERIFIED: gating.gateProductionConnectivityVerified,
    LIVE_APPROVED: gating.gateLiveApproved,
    LIVE: gating.gateLiveApproved && currentGate === "LIVE",
  };

  const nextGate = NHCX_GATES.find((g) => !gateBooleans[g]);

  const handleAdvance = async (gate: string) => {
    setAdvancing(gate);
    try {
      await onAdvance(gate);
    } finally {
      setAdvancing(null);
    }
  };

  const handleRollback = async () => {
    if (!rollbackReason.trim()) return;
    setRollingBack(true);
    try {
      await onRollback(rollbackReason);
      setShowRollback(false);
      setRollbackReason("");
    } finally {
      setRollingBack(false);
    }
  };

  return (
    <Card className="border-primary/20">
      <CardHeader>
        <div className="flex items-start justify-between gap-3">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Lock className="h-4 w-4 text-primary" />
              NHCX live-gating
            </CardTitle>
            <CardDescription className="text-xs mt-1">
              An operator cannot flip LIVE by accident. Each gate is verified, timestamped, and audited.
              {currentGate && <> Current: <span className="font-mono font-semibold">{currentGate}</span></>}
            </CardDescription>
          </div>
          {currentGate && currentGate !== "DISABLED" && (
            <Button variant="outline" size="sm" className="text-xs gap-1.5" onClick={() => setShowRollback(!showRollback)}>
              <RotateCcw className="h-3 w-3" /> Rollback
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <ol className="space-y-2">
          {NHCX_GATES.map((gate, i) => {
            const passed = gateBooleans[gate];
            const isNext = gate === nextGate;
            return (
              <li key={gate} className="flex items-center gap-3">
                <div className={cn(
                  "flex h-7 w-7 items-center justify-center rounded-full flex-shrink-0 text-[10px] font-bold",
                  passed ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                    : isNext ? "bg-primary/15 text-primary ring-2 ring-primary/30"
                    : "bg-muted text-muted-foreground",
                )}>
                  {passed ? <CheckCircle2 className="h-3.5 w-3.5" /> : i + 1}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-mono">{gate}</span>
                    {passed && <Badge variant="outline" className="text-[9px] border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400">passed</Badge>}
                  </div>
                </div>
                {isNext && !passed && (
                  <Button size="sm" variant="outline" className="text-xs gap-1.5" disabled={advancing === gate} onClick={() => handleAdvance(gate)}>
                    {advancing === gate ? <Loader2 className="h-3 w-3 animate-spin" /> : <ArrowRight className="h-3 w-3" />}
                    Advance
                  </Button>
                )}
              </li>
            );
          })}
        </ol>
        {showRollback && (
          <div className="mt-4 p-3 rounded-lg border border-destructive/30 bg-destructive/5 space-y-2">
            <Label className="text-xs">Rollback reason (audited)</Label>
            <Textarea value={rollbackReason} onChange={(e) => setRollbackReason(e.target.value)} rows={2} placeholder="e.g. certificate expired / NHCX incident" className="text-xs" />
            <div className="flex gap-2">
              <Button size="sm" variant="destructive" className="text-xs" disabled={!rollbackReason.trim() || rollingBack} onClick={handleRollback}>
                {rollingBack ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : <RotateCcw className="h-3 w-3 mr-1" />}
                Confirm rollback
              </Button>
              <Button size="sm" variant="ghost" className="text-xs" onClick={() => setShowRollback(false)}>Cancel</Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

interface FacilityProfileData {
  hfrId: string | null;
  pmjayFacilityId: string | null;
  hemStatus: string | null;
  state: string | null;
  district: string | null;
  abdmMode: string;
  abhaMode: string;
  pmjayMode: string;
  nhcxMode: string;
  certificationStatus: string;
  notes?: string | null;
  onboardingChecklist: OnboardingChecklist;
}

function FacilityProfileEditor({ profile, onSaved }: {
  profile: FacilityProfileData | null;
  onSaved: () => void;
}) {
  const [form, setForm] = React.useState({
    hfrId: profile?.hfrId ?? "",
    pmjayFacilityId: profile?.pmjayFacilityId ?? "",
    hemStatus: profile?.hemStatus ?? "",
    state: profile?.state ?? "",
    district: profile?.district ?? "",
    hfrVerified: profile?.onboardingChecklist?.hfrVerified ?? false,
    hemLinked: profile?.onboardingChecklist?.hemLinked ?? false,
    pmjayEmpanelmentVerified: profile?.onboardingChecklist?.pmjayEmpanelmentVerified ?? false,
    ojasFacilityMappingComplete: profile?.onboardingChecklist?.ojasFacilityMappingComplete ?? false,
    notes: profile?.notes ?? "",
  });
  const [saving, setSaving] = React.useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/integrations/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || `HTTP ${r.status}`);
      }
      toast.success("Integration profile saved");
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base flex items-center gap-2">
          <Building2 className="h-4 w-4 text-primary" />
          Facility identity & onboarding
        </CardTitle>
        <CardDescription className="text-xs">
          HFR ID, PM-JAY empanelment, HEM status. These gate PM-JAY / NHCX production submission.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">HFR ID (Health Facility Registry)</Label>
            <Input value={form.hfrId} onChange={(e) => setForm({ ...form, hfrId: e.target.value })} placeholder="e.g. HFR-12345" className="text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">PM-JAY empanelment ID</Label>
            <Input value={form.pmjayFacilityId} onChange={(e) => setForm({ ...form, pmjayFacilityId: e.target.value })} placeholder="e.g. PMJAY-KA-001" className="text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">HEM status</Label>
            <Input value={form.hemStatus} onChange={(e) => setForm({ ...form, hemStatus: e.target.value })} placeholder="e.g. EMPANELLED" className="text-sm" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs flex items-center gap-1"><MapPin className="h-3 w-3" /> State / District</Label>
            <div className="flex gap-2">
              <Input value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} placeholder="State" className="text-sm" />
              <Input value={form.district} onChange={(e) => setForm({ ...form, district: e.target.value })} placeholder="District" className="text-sm" />
            </div>
          </div>
        </div>
        <div className="space-y-2 pt-2 border-t">
          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Onboarding checklist</div>
          {[
            { key: "hfrVerified", label: "HFR verified" },
            { key: "hemLinked", label: "HEM linked" },
            { key: "pmjayEmpanelmentVerified", label: "PM-JAY empanelment verified" },
            { key: "ojasFacilityMappingComplete", label: "Ojas facility mapping complete" },
          ].map((item) => (
            <div key={item.key} className="flex items-center justify-between">
              <Label className="text-xs flex items-center gap-2">
                {form[item.key as "hfrVerified"] ? (
                  <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                ) : (
                  <XCircle className="h-3.5 w-3.5 text-muted-foreground/50" />
                )}
                {item.label}
              </Label>
              <Switch
                checked={form[item.key as "hfrVerified"]}
                onCheckedChange={(v) => setForm({ ...form, [item.key]: v })}
              />
            </div>
          ))}
        </div>
        <Button onClick={handleSave} disabled={saving} className="text-sm gap-1.5">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
          Save facility profile
        </Button>
      </CardContent>
    </Card>
  );
}

export function ReadinessCenterTab() {
  const [data, setData] = React.useState<ReadinessResponse | null>(null);
  const [gate, setGate] = React.useState<GateResponse | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    try {
      const [r, g] = await Promise.all([
        fetch("/api/integrations/readiness"),
        fetch("/api/integrations/readiness/gate"),
      ]);
      if (r.ok) setData(await r.json());
      if (g.ok) setGate(await g.json());
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const handleAdvance = async (gateName: string) => {
    try {
      const r = await fetch("/api/integrations/readiness/gate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ gate: gateName }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || `HTTP ${r.status}`);
      }
      toast.success(`Advanced to ${gateName}`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Gate advance failed");
    }
  };

  const handleRollback = async (reason: string) => {
    const r = await fetch("/api/integrations/readiness/gate", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason }),
    });
    if (!r.ok) {
      const e = await r.json().catch(() => ({}));
      throw new Error(e.error || `HTTP ${r.status}`);
    }
    toast.success("NHCX rolled back to FAILED (audited)");
    await load();
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => <Skeleton key={i} className="h-48" />)}
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">Unable to load readiness data.</CardContent></Card>
    );
  }

  const totalPassed = data.readiness.reduce((acc, r) => acc + r.passedCount, 0);
  const totalItems = data.readiness.reduce((acc, r) => acc + r.totalCount, 0);

  return (
    <div className="space-y-6">
      {/* Header banner */}
      <Card className={data.overallReady ? "border-emerald-500/40 bg-emerald-500/5" : "border-amber-500/40 bg-amber-500/5"}>
        <CardContent className="p-5 flex flex-col sm:flex-row items-start sm:items-center gap-4">
          <div className={cn("h-12 w-12 rounded-xl flex items-center justify-center flex-shrink-0", data.overallReady ? "bg-emerald-500/10 text-emerald-600" : "bg-amber-500/10 text-amber-600")}>
            {data.overallReady ? <CheckCircle2 className="h-6 w-6" /> : <AlertTriangle className="h-6 w-6" />}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="font-semibold text-base">
              {data.overallReady ? "All integrations live" : "Production onboarding in progress"}
            </h3>
            <p className="text-sm text-muted-foreground mt-1">
              {totalPassed} of {totalItems} readiness checks passed across {data.readiness.length} integrations.
              {" "}
              {!data.overallReady && "Complete the pending checklist items + NHCX gates to go live."}
            </p>
          </div>
          <Badge variant="outline" className="text-xs font-mono flex-shrink-0">
            {Math.round((totalPassed / Math.max(1, totalItems)) * 100)}% readiness
          </Badge>
        </CardContent>
      </Card>

      {/* Readiness cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.readiness.map((r) => <ReadinessCard key={r.integration} r={r} />)}
      </div>

      {/* Facility profile editor + NHCX gate stepper */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {data.integrationProfile && (
          <FacilityProfileEditor profile={data.integrationProfile} onSaved={load} />
        )}
        {data.integrationProfile && (
          <NhcxGateStepper
            gating={data.integrationProfile.nhcxLiveGating}
            currentGate={gate?.currentGate ?? null}
            onAdvance={handleAdvance}
            onRollback={handleRollback}
          />
        )}
      </div>

      {/* Footer note */}
      <p className="text-xs text-muted-foreground text-center max-w-2xl mx-auto leading-relaxed">
        Every checkmark comes from a real configuration value or database state — never an arbitrary percentage.
        NHCX LIVE is double-gated: these DB gates AND an operator-declared <code className="bg-muted px-1 py-0.5 rounded">NHCX_ENVIRONMENT=LIVE</code> environment variable. See <code className="bg-muted px-1 py-0.5 rounded">docs/NHA_NHCX_PMJAY_GO_LIVE.md</code>.
      </p>
    </div>
  );
}
