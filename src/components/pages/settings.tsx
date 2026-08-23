"use client";

// Ojas — hospital admin Settings page. Six tabs + profile card:
//   0. Profile section — compact horizontal card with user info + plan badge.
//   1. Care protocol — recovery window, check-in cadence, AI triage, WhatsApp
//      (disabled w/ tooltip — needs Cloud API creds), email digest.
//   2. Team & invites — list pending invites, revoke, invite member dialog
//      (role Select structurally constrained — SUPER_ADMIN never an option, B10).
//   3. Security — informational posture badges + change-my-password form.
//   4. Notifications — email digest, WhatsApp reports, escalation alerts, check-in reminders.
//   5. Data export — CSV export buttons for patients, check-ins, reports.
//   6. Danger zone — rose card noting hospital deletion is superadmin-only.
import * as React from "react";
import { MotionConfig } from "framer-motion";
import { toast } from "sonner";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import {
  Settings as SettingsIcon, Stethoscope, Users, Shield, AlertTriangle,
  Loader2, Save, Mail, Trash2, UserPlus, Copy, Check, Lock, KeyRound,
  Cookie, RefreshCw, FileClock, Gauge, MessageSquare, Sparkles,
  Bell, Download, FileSpreadsheet, CalendarDays, User, Building2, Crown,
  Megaphone, ClipboardCheck, Phone, Network,
} from "lucide-react";

import { api, useAuth } from "@/lib/auth-context";
import { navigate } from "@/lib/router";
import { ReadinessCenterTab } from "@/components/pages/settings-readiness-tab";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader,
  DialogTitle, DialogClose,
} from "@/components/ui/dialog";
import {
  Tooltip, TooltipContent, TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { format as fnsFormat } from "date-fns";

// ── Types matching /api/settings + /api/invites ─────────────────────────────
interface HospitalSettings {
  id: string;
  hospitalId: string;
  recoveryWindowDays: number;
  checkinCadenceHours: number;
  whatsappEnabled: boolean;
  emailDigestEnabled: boolean;
  aiTriageEnabled: boolean;
}

interface Hospital {
  id: string;
  name: string;
  planTier: "STARTER" | "GROWTH" | "ENTERPRISE";
  bedCount: number;
  nabhLevel: string | null;
  city: string | null;
  country: string;
}

interface Subscription {
  id: string;
  planTier: "STARTER" | "GROWTH" | "ENTERPRISE";
  patientLimit: number;
  aiEnabled: boolean;
  status: string;
  currentPeriodEnd: string | null;
}

interface SettingsResponse {
  hospital: Hospital;
  settings: HospitalSettings | null;
  subscription: Subscription | null;
}

interface Invite {
  id: string;
  email: string;
  role: "HOSPITAL_ADMIN" | "COORDINATOR" | "DOCTOR" | "SUPER_ADMIN";
  token: string;
  hospitalId: string;
  invitedBy: string;
  inviter: { name: string; email: string } | null;
  acceptedAt: string | null;
  expiresAt: string;
  createdAt: string;
}

interface InvitesResponse { invites: Invite[] }

interface NotificationPrefs {
  emailDailyDigest: boolean;
  whatsappDeliveryReports: boolean;
  escalationAlerts: boolean;
  checkinReminders: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const INVITE_ROLES = [
  { value: "HOSPITAL_ADMIN", label: "Hospital admin" },
  { value: "COORDINATOR", label: "Coordinator" },
  { value: "DOCTOR", label: "Doctor" },
] as const;

function roleLabel(r: string): string {
  switch (r) {
    case "HOSPITAL_ADMIN": return "Hospital admin";
    case "COORDINATOR": return "Coordinator";
    case "DOCTOR": return "Doctor";
    case "SUPER_ADMIN": return "Super admin";
    default: return r;
  }
}

function inviteStatus(inv: Invite): { label: string; cls: string } {
  if (inv.acceptedAt) return { label: "Accepted", cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" };
  if (new Date(inv.expiresAt) < new Date()) return { label: "Expired", cls: "bg-muted text-muted-foreground border-border" };
  return { label: "Pending", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" };
}

function ago(iso: string): string {
  try { return formatDistanceToNow(parseISO(iso), { addSuffix: true }); } catch { return "—"; }
}
function absTime(iso: string): string {
  try { return format(parseISO(iso), "d MMM yyyy · h:mm a"); } catch { return iso; }
}

// ── Page ────────────────────────────────────────────────────────────────────
export function SettingsPage() {
  const { user } = useAuth();
  const [data, setData] = React.useState<SettingsResponse | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<SettingsResponse>("/api/settings");
      setData(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load settings");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight flex items-center gap-2">
              <SettingsIcon className="h-6 w-6 text-primary" />
              Settings
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Care protocol, team, notifications, exports, and more for {data?.hospital.name ?? "your hospital"}.
            </p>
          </div>
          {user?.role === "SUPER_ADMIN" && (
            <Button variant="outline" size="sm" onClick={() => navigate("superadmin-hospitals")}>
              <Shield className="h-4 w-4" /> Superadmin console
            </Button>
          )}
        </div>

        {/* Profile card */}
        {loading ? (
          <Skeleton className="h-20 w-full" />
        ) : data && user ? (
          <ProfileCard user={user} hospital={data.hospital} subscription={data.subscription} />
        ) : null}

        {loading ? (
          <SettingsSkeleton />
        ) : data ? (
          <Tabs defaultValue="protocol" className="w-full">
            <TabsList className="grid w-full grid-cols-3 md:grid-cols-7 max-w-5xl">
              <TabsTrigger value="protocol"><Stethoscope className="h-4 w-4" /> Care protocol</TabsTrigger>
              <TabsTrigger value="team"><Users className="h-4 w-4" /> Team</TabsTrigger>
              <TabsTrigger value="security"><Shield className="h-4 w-4" /> Security</TabsTrigger>
              <TabsTrigger value="integrations"><Network className="h-4 w-4" /> Integrations</TabsTrigger>
              <TabsTrigger value="notifications"><Bell className="h-4 w-4" /> Notifications</TabsTrigger>
              <TabsTrigger value="export"><Download className="h-4 w-4" /> Data export</TabsTrigger>
              <TabsTrigger value="danger"><AlertTriangle className="h-4 w-4" /> Danger</TabsTrigger>
            </TabsList>

            <TabsContent value="protocol" className="mt-6">
              <CareProtocolTab data={data} onChanged={load} />
            </TabsContent>
            <TabsContent value="team" className="mt-6">
              <TeamInvitesTab />
            </TabsContent>
            <TabsContent value="security" className="mt-6">
              <SecurityTab />
            </TabsContent>
            <TabsContent value="integrations" className="mt-6">
              <ReadinessCenterTab />
            </TabsContent>
            <TabsContent value="notifications" className="mt-6">
              <NotificationsTab />
            </TabsContent>
            <TabsContent value="export" className="mt-6">
              <DataExportTab />
            </TabsContent>
            <TabsContent value="danger" className="mt-6">
              <DangerZoneTab hospital={data.hospital} />
            </TabsContent>
          </Tabs>
        ) : null}
      </div>
    </MotionConfig>
  );
}

// ── Tab 1: Care protocol ────────────────────────────────────────────────────
function CareProtocolTab({ data, onChanged }: { data: SettingsResponse; onChanged: () => void }) {
  const s = data.settings;
  const [recovery, setRecovery] = React.useState(s?.recoveryWindowDays ?? 14);
  const [cadence, setCadence] = React.useState(s?.checkinCadenceHours ?? 24);
  const [aiTriage, setAiTriage] = React.useState(s?.aiTriageEnabled ?? true);
  const [whatsapp, setWhatsapp] = React.useState(s?.whatsappEnabled ?? false);
  const [emailDigest, setEmailDigest] = React.useState(s?.emailDigestEnabled ?? true);
  const [nabhLevel, setNabhLevel] = React.useState(data.hospital.nabhLevel ?? "NOT_ACCREDITED");
  const [saving, setSaving] = React.useState(false);
  // Live integration status (Connected / Not configured) — fetched from
  // /api/integrations/status so the badge reflects real env configuration
  // instead of a stale hardcoded "Simulated" label.
  const [integrations, setIntegrations] = React.useState<{
    whatsapp?: { configured: boolean; status: string };
  }>({});
  React.useEffect(() => {
    let cancelled = false;
    fetch("/api/integrations/status", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => { if (!cancelled && d) setIntegrations(d); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);
  const waConfigured = integrations.whatsapp?.configured === true;

  const NABH_OPTIONS = [
    { value: "ENTRY_LEVEL", label: "Entry Level" },
    { value: "FULL_6TH_EDITION", label: "Full 6th Edition" },
    { value: "PRE_ACCREDITATION", label: "Pre-Accreditation" },
    { value: "NOT_ACCREDITED", label: "Not Accredited" },
  ];

  // Track dirty state so we only enable Save when something changed.
  const dirty =
    recovery !== (s?.recoveryWindowDays ?? 14) ||
    cadence !== (s?.checkinCadenceHours ?? 24) ||
    aiTriage !== (s?.aiTriageEnabled ?? true) ||
    whatsapp !== (s?.whatsappEnabled ?? false) ||
    emailDigest !== (s?.emailDigestEnabled ?? true) ||
    nabhLevel !== (data.hospital.nabhLevel ?? "NOT_ACCREDITED");

  const save = async () => {
    if (recovery < 1 || recovery > 90) { toast.error("Recovery window must be 1–90 days"); return; }
    if (cadence < 1 || cadence > 168) { toast.error("Check-in cadence must be 1–168 hours"); return; }
    setSaving(true);
    try {
      await api("/api/settings", {
        method: "PATCH",
        body: JSON.stringify({
          recoveryWindowDays: recovery,
          checkinCadenceHours: cadence,
          aiTriageEnabled: aiTriage,
          whatsappEnabled: whatsapp,
          emailDigestEnabled: emailDigest,
          nabhLevel,
        }),
      });
      toast.success("Care protocol saved");
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save settings");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Stethoscope className="h-5 w-5 text-primary" /> Care protocol</CardTitle>
        <CardDescription>
          Controls how Ojas schedules check-ins and triages patient replies for {data.hospital.name}.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Numeric settings */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-2">
            <Label htmlFor="recovery" className="flex items-center gap-2">
              <Gauge className="h-4 w-4 text-primary" /> Recovery window
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="recovery"
                type="number" min={1} max={90}
                value={recovery}
                onChange={(e) => setRecovery(Math.max(1, Math.min(90, Number(e.target.value) || 0)))}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">days post-discharge</span>
            </div>
            <p className="text-xs text-muted-foreground">Default 14. Drives how long Ojas follows up after discharge.</p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="cadence" className="flex items-center gap-2">
              <RefreshCw className="h-4 w-4 text-primary" /> Check-in cadence
            </Label>
            <div className="flex items-center gap-2">
              <Input
                id="cadence"
                type="number" min={1} max={168}
                value={cadence}
                onChange={(e) => setCadence(Math.max(1, Math.min(168, Number(e.target.value) || 0)))}
                className="w-24"
              />
              <span className="text-sm text-muted-foreground">hours between check-ins</span>
            </div>
            <p className="text-xs text-muted-foreground">Default 24. Daily is recommended for the first week.</p>
          </div>
        </div>

        <div className="h-px bg-border" />

        {/* NABH Accreditation Level */}
        <div className="space-y-2">
          <Label htmlFor="nabh-level" className="flex items-center gap-2">
            <Building2 className="h-4 w-4 text-primary" /> NABH accreditation level
          </Label>
          <Select value={nabhLevel} onValueChange={setNabhLevel}>
            <SelectTrigger id="nabh-level" className="w-full max-w-xs">
              <SelectValue placeholder="Select accreditation level" />
            </SelectTrigger>
            <SelectContent>
              {NABH_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">Used for NABH-aligned reporting and benchmarking.</p>
        </div>

        <div className="h-px bg-border" />

        {/* Switches */}
        <div className="space-y-4">
          <SwitchRow
            label="AI triage"
            description="Real LLM runs on every patient reply. Above-LOW risk creates a coordinator-confirmed escalation."
            checked={aiTriage}
            onChange={setAiTriage}
            icon={<Sparkles className="h-4 w-4 text-primary" />}
          />
          <SwitchRow
            label="WhatsApp check-ins"
            description="Schedule outbound WhatsApp messages for each check-in slot."
            checked={whatsapp}
            onChange={setWhatsapp}
            icon={<MessageSquare className="h-4 w-4 text-primary" />}
            disabled
            tooltip="Requires WhatsApp Cloud API credentials. Wire them in your deployment env to enable."
          />
          <div className="flex items-center gap-2 -mt-2 ml-6">
            {waConfigured ? (
              <Badge variant="outline" className="text-[10px] font-normal text-emerald-700 border-emerald-300 bg-emerald-50 dark:bg-emerald-950 dark:border-emerald-800 dark:text-emerald-400">Connected</Badge>
            ) : (
              <Badge variant="outline" className="text-[10px] font-normal text-amber-600 border-amber-300 bg-amber-50 dark:bg-amber-950 dark:border-amber-800 dark:text-amber-400">Not configured</Badge>
            )}
            <span className="text-[10px] text-muted-foreground">
              {waConfigured
                ? "Outbound messages send via the WhatsApp Cloud API; delivery/read receipts update message status automatically."
                : "Set WHATSAPP_ACCESS_TOKEN + WHATSAPP_PHONE_NUMBER_ID in your environment to enable real outbound dispatch and receipt handling."}
            </span>
          </div>
          <SwitchRow
            label="Email digest"
            description="Daily summary email to admins with escalations, missed check-ins, and AI usage."
            checked={emailDigest}
            onChange={setEmailDigest}
            icon={<Mail className="h-4 w-4 text-primary" />}
          />
        </div>

        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" onClick={onChanged} disabled={!dirty || saving}>
            Reset
          </Button>
          <Button onClick={save} disabled={!dirty || saving} className="glow-primary">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function SwitchRow({
  label, description, checked, onChange, icon, disabled, tooltip,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  icon: React.ReactNode;
  disabled?: boolean;
  tooltip?: string;
}) {
  return (
    <div className={cn(
      "flex items-start justify-between gap-4 rounded-lg border p-4 transition-colors",
      disabled ? "bg-muted/40 border-border" : "bg-card/50 border-border hover:bg-accent/30",
    )}>
      <div className="flex items-start gap-3 min-w-0">
        <div className="mt-0.5">{icon}</div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <Label className="text-sm font-medium cursor-pointer" onClick={() => !disabled && onChange(!checked)}>
              {label}
            </Label>
            {disabled && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <span className="inline-flex items-center gap-1 text-[11px] text-amber-700 dark:text-amber-300 cursor-help">
                    <Lock className="h-3 w-3" /> locked
                  </span>
                </TooltipTrigger>
                <TooltipContent>{tooltip}</TooltipContent>
              </Tooltip>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
        </div>
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} aria-label={label} />
    </div>
  );
}

// ── Tab 2: Team & invites ───────────────────────────────────────────────────
function TeamInvitesTab() {
  const [invites, setInvites] = React.useState<Invite[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [inviteOpen, setInviteOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<InvitesResponse>("/api/invites");
      setInvites(r.invites);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load invites");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const revoke = async (id: string) => {
    try {
      await api(`/api/invites?id=${encodeURIComponent(id)}`, { method: "DELETE" });
      toast.success("Invite revoked");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to revoke invite");
    }
  };

  return (
    <div className="space-y-6">
      <Card className="glass">
        <CardHeader className="flex flex-row items-start justify-between gap-4 flex-wrap">
          <div>
            <CardTitle className="flex items-center gap-2"><Mail className="h-5 w-5 text-primary" /> Pending invites</CardTitle>
            <CardDescription>
              Invite-only provisioning. Each invite is valid for 7 days. Active team members are managed by your Ojas superadmin.
            </CardDescription>
          </div>
          <Button onClick={() => setInviteOpen(true)} className="glow-primary">
            <UserPlus className="h-4 w-4" /> Invite member
          </Button>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-3">
              {[0, 1, 2].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
            </div>
          ) : invites && invites.length > 0 ? (
            <div className="rounded-lg border border-border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Sent</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-10" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invites.map((inv) => {
                    const st = inviteStatus(inv);
                    return (
                      <TableRow key={inv.id}>
                        <TableCell>
                          <span className="font-medium truncate max-w-[220px] inline-block align-bottom">{inv.email}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[11px]">{roleLabel(inv.role)}</Badge>
                        </TableCell>
                        <TableCell className="text-xs">
                          <div>{ago(inv.createdAt)}</div>
                          <div className="text-muted-foreground">{absTime(inv.createdAt)}</div>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn("text-[11px] border", st.cls)}>{st.label}</Badge>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="sm" variant="ghost"
                            className="text-muted-foreground hover:text-destructive"
                            onClick={() => revoke(inv.id)}
                            disabled={!!inv.acceptedAt}
                          >
                            <Trash2 className="h-3.5 w-3.5" /> Revoke
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <div className="text-center py-10 px-4">
              <div className="inline-flex items-center justify-center h-12 w-12 rounded-full bg-primary/10 text-primary mb-3">
                <Mail className="h-6 w-6" />
              </div>
              <p className="text-sm font-medium">No pending invites</p>
              <p className="text-xs text-muted-foreground mt-1 max-w-md mx-auto">
                Click <span className="font-medium">Invite member</span> to send a role-scoped invite. The recipient creates their account by accepting via the invite URL.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Users className="h-5 w-5 text-primary" /> Active team members</CardTitle>
          <CardDescription>Provisioned users with login access to this hospital.</CardDescription>
        </CardHeader>
        <CardContent>
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertTitle>Active team members are managed by your Ojas superadmin</AlertTitle>
            <AlertDescription>
              Once an invite is accepted, the user becomes a full team member. To remove an active user
              (e.g. a departed coordinator), contact Ojas support — direct user off-boarding from this
              console is reserved for a future release.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>

      <InviteDialog open={inviteOpen} onOpenChange={setInviteOpen} onCreated={load} />
    </div>
  );
}

function InviteDialog({ open, onOpenChange, onCreated }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onCreated: () => void;
}) {
  const [email, setEmail] = React.useState("");
  const [role, setRole] = React.useState<"HOSPITAL_ADMIN" | "COORDINATOR" | "DOCTOR">("COORDINATOR");
  const [saving, setSaving] = React.useState(false);
  const [result, setResult] = React.useState<{ inviteUrl: string; email: string } | null>(null);
  const [copied, setCopied] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      // Reset after close transition
      const t = setTimeout(() => {
        setEmail(""); setRole("COORDINATOR"); setResult(null); setCopied(false);
      }, 200);
      return () => clearTimeout(t);
    }
  }, [open]);

  const submit = async () => {
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      toast.error("Enter a valid email address");
      return;
    }
    setSaving(true);
    try {
      const r = await api<{ invite: Invite; inviteUrl: string }>("/api/invites", {
        method: "POST",
        body: JSON.stringify({ email: email.trim().toLowerCase(), role }),
      });
      toast.success("Invite created");
      setResult({ inviteUrl: r.inviteUrl, email: email.trim().toLowerCase() });
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to create invite");
    } finally {
      setSaving(false);
    }
  };

  const copyUrl = async () => {
    if (!result) return;
    try {
      await navigator.clipboard.writeText(result.inviteUrl);
      setCopied(true);
      toast.success("Invite URL copied");
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Couldn't copy — select the URL manually");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        {result ? (
          <>
            <DialogHeader>
              <DialogTitle>Invite ready to share</DialogTitle>
              <DialogDescription>
                Email isn&apos;t wired in this sandbox. Share this URL with{" "}
                <span className="font-medium text-foreground">{result.email}</span> — they&apos;ll set
                their name and password to claim the account.
              </DialogDescription>
            </DialogHeader>
            <Alert className="border-primary/30 bg-primary/5">
              <Mail className="h-4 w-4 text-primary" />
              <AlertDescription>
                <div className="font-mono text-xs break-all rounded bg-background/70 border border-border p-2">
                  {result.inviteUrl}
                </div>
              </AlertDescription>
            </Alert>
            <DialogFooter>
              <Button variant="outline" onClick={copyUrl}>
                {copied ? <Check className="h-4 w-4 text-emerald-500" /> : <Copy className="h-4 w-4" />}
                {copied ? "Copied" : "Copy URL"}
              </Button>
              <DialogClose asChild>
                <Button>Done</Button>
              </DialogClose>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Invite a team member</DialogTitle>
              <DialogDescription>
                They&apos;ll receive a role-scoped invite URL valid for 7 days. The role you pick determines what they can see and do in Ojas.
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email</Label>
                <Input
                  id="invite-email"
                  type="email"
                  placeholder="dr.sharma@hospital.in"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-2">
                <Label>Role</Label>
                <Select value={role} onValueChange={(v) => setRole(v as typeof role)}>
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INVITE_ROLES.map((r) => (
                      <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  Coordinators handle the check-in worklist. Doctors view patient context. Hospital admins manage settings and billing.
                  Super admin is never assignable via invite (B10).
                </p>
              </div>
            </div>
            <DialogFooter>
              <DialogClose asChild>
                <Button variant="outline">Cancel</Button>
              </DialogClose>
              <Button onClick={submit} disabled={saving} className="glow-primary">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Mail className="h-4 w-4" />}
                Create invite
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ── Tab 3: Security ─────────────────────────────────────────────────────────
function SecurityTab() {
  const [pw, setPw] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const posture = [
    { icon: Cookie, label: "HttpOnly cookies", detail: "Refresh tokens never touch JavaScript." },
    { icon: RefreshCw, label: "Refresh rotation w/ reuse detection", detail: "Reused tokens revoke the entire session family." },
    { icon: Lock, label: "AES-256-GCM PII encryption", detail: "Patient mobile numbers encrypted at rest." },
    { icon: Gauge, label: "Rate limiting on auth routes", detail: "10 login attempts / minute / IP." },
    { icon: FileClock, label: "Audit logging", detail: "Every privileged action is recorded with actor + IP." },
  ];

  const changePw = async () => {
    if (pw.length < 8) { toast.error("Password must be at least 8 characters"); return; }
    if (pw !== confirm) { toast.error("Passwords don't match"); return; }
    setSaving(true);
    try {
      await api("/api/auth", { method: "PATCH", body: JSON.stringify({ newPassword: pw }) });
      toast.success("Password updated");
      setPw(""); setConfirm("");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to change password");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><Shield className="h-5 w-5 text-primary" /> Security posture</CardTitle>
          <CardDescription>
            These are real properties of the Ojas platform — not aspirations. They apply to every tenant.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {posture.map((p) => (
              <div key={p.label} className="flex items-start gap-3 rounded-lg border border-border bg-card/50 p-3">
                <div className="inline-flex items-center justify-center h-9 w-9 rounded-md bg-primary/10 text-primary shrink-0">
                  <p.icon className="h-4 w-4" />
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-sm font-medium">{p.label}</span>
                    <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30">
                      Enforced
                    </Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{p.detail}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="glass">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><KeyRound className="h-5 w-5 text-primary" /> Change my password</CardTitle>
          <CardDescription>
            Cookie-based auth — your current password is not required. Just set a new one (≥8 chars).
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="newpw">New password</Label>
              <Input id="newpw" type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm">Confirm password</Label>
              <Input id="confirm" type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="••••••••" autoComplete="new-password" />
            </div>
          </div>
          <div className="flex items-center justify-end gap-2">
            <Button
              onClick={changePw}
              disabled={saving || !pw || !confirm || pw !== confirm}
              className="glow-primary"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
              Update password
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ── Tab 4: Danger zone ──────────────────────────────────────────────────────
function DangerZoneTab({ hospital }: { hospital: Hospital }) {
  return (
    <Card className="border-rose-500/40 bg-rose-500/5">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-rose-700 dark:text-rose-300">
          <AlertTriangle className="h-5 w-5" /> Danger zone
        </CardTitle>
        <CardDescription className="text-rose-700/80 dark:text-rose-300/80">
          Irreversible operations. Read carefully before contacting support.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3 rounded-lg border border-rose-500/30 bg-rose-500/5 p-4">
          <div>
            <div className="text-sm font-medium">Delete hospital &ldquo;{hospital.name}&rdquo;</div>
            <p className="text-xs text-muted-foreground mt-1 max-w-2xl">
              Hospital deletion is performed by your Ojas superadmin. It soft-deletes the hospital record
              (sets <code className="font-mono text-[11px]">deletedAt</code>) and is logged in the audit
              trail. Patient PII stays encrypted at rest; reports remain accessible to existing tenants.
              This action is intentionally not self-serve.
            </p>
          </div>
          <Button variant="outline" className="border-rose-500/40 text-rose-700 dark:text-rose-300 hover:bg-rose-500/10" disabled>
            <Shield className="h-4 w-4" /> Superadmin only
          </Button>
        </div>
        <Alert>
          <Mail className="h-4 w-4 text-primary" />
          <AlertTitle>Need to delete this hospital?</AlertTitle>
          <AlertDescription>
            Contact <a href="mailto:support@ojas.care" className="text-primary hover:underline">support@ojas.care</a>{" "}
            with your hospital ID and a written authorisation. The superadmin will verify ownership and
            perform the soft-delete from the Ojas superadmin console.
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

// ── Profile card ──────────────────────────────────────────────────────────────
function ProfileCard({ user, hospital, subscription }: {
  user: { name: string; email: string; role: string };
  hospital: Hospital;
  subscription: Subscription | null;
}) {
  const planTier = subscription?.planTier ?? hospital.planTier;
  const planBadge: Record<string, { label: string; cls: string }> = {
    STARTER: { label: "Starter", cls: "bg-muted text-muted-foreground border-border" },
    GROWTH: { label: "Growth", cls: "bg-primary/10 text-primary border-primary/30" },
    ENTERPRISE: { label: "Enterprise", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30" },
  };
  const badge = planBadge[planTier] ?? planBadge.STARTER;

  return (
    <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 rounded-lg border border-border bg-card/50 p-4">
      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-primary/10 text-primary shrink-0">
          <User className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold truncate">{user.name}</span>
            <Badge variant="outline" className="text-[11px]">{roleLabel(user.role)}</Badge>
          </div>
          <p className="text-xs text-muted-foreground truncate">{user.email}</p>
        </div>
      </div>

      <div className="hidden sm:block h-8 w-px bg-border" />

      <div className="flex items-center gap-3 min-w-0 flex-1">
        <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-primary/10 text-primary shrink-0">
          <Building2 className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-semibold truncate">{hospital.name}</span>
            <Badge className={cn("text-[11px] border", badge.cls)}>
              <Crown className="h-3 w-3 mr-1" />
              {badge.label}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground">
            {hospital.city ? `${hospital.city}, ` : ""}{hospital.country}
            {hospital.bedCount ? ` · ${hospital.bedCount} beds` : ""}
            {hospital.nabhLevel ? ` · ${hospital.nabhLevel.replace(/_/g, " ").toLowerCase().replace(/^\w/, (c) => c.toUpperCase())}` : ""}
          </p>
        </div>
      </div>
    </div>
  );
}

// ── Tab 5: Notifications ──────────────────────────────────────────────────────
function NotificationsTab() {
  const [prefs, setPrefs] = React.useState<NotificationPrefs | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [saving, setSaving] = React.useState(false);
  const [dirty, setDirty] = React.useState(false);
  const [original, setOriginal] = React.useState<NotificationPrefs | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<{ preferences: NotificationPrefs }>("/api/settings/notifications");
      setPrefs(r.preferences);
      setOriginal(r.preferences);
      setDirty(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load notification preferences");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { void load(); }, [load]);

  const updatePref = (key: keyof NotificationPrefs, value: boolean) => {
    if (!prefs) return;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    setDirty(original ? next.emailDailyDigest !== original.emailDailyDigest ||
      next.whatsappDeliveryReports !== original.whatsappDeliveryReports ||
      next.escalationAlerts !== original.escalationAlerts ||
      next.checkinReminders !== original.checkinReminders : true);
  };

  const save = async () => {
    if (!prefs) return;
    setSaving(true);
    try {
      await api("/api/settings/notifications", {
        method: "PATCH",
        body: JSON.stringify(prefs),
      });
      toast.success("Notification preferences saved");
      void load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save preferences");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <Card className="glass">
        <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
        <CardContent className="space-y-4">
          {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-16 w-full" />)}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Bell className="h-5 w-5 text-primary" /> Notification preferences</CardTitle>
        <CardDescription>
          Control which alerts and digest emails your hospital receives. Changes apply to all team members.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <SwitchRow
          label="Email daily digest"
          description="Receive a daily summary email with escalations, missed check-ins, and AI usage for your hospital."
          checked={prefs?.emailDailyDigest ?? true}
          onChange={(v) => updatePref("emailDailyDigest", v)}
          icon={<Mail className="h-4 w-4 text-primary" />}
        />
        <SwitchRow
          label="WhatsApp delivery reports"
          description="Get notified when WhatsApp messages are delivered or fail to reach patients."
          checked={prefs?.whatsappDeliveryReports ?? false}
          onChange={(v) => updatePref("whatsappDeliveryReports", v)}
          icon={<Phone className="h-4 w-4 text-primary" />}
        />
        <SwitchRow
          label="Escalation alerts"
          description="Immediate alerts for HIGH and CRITICAL escalations so coordinators can act fast."
          checked={prefs?.escalationAlerts ?? true}
          onChange={(v) => updatePref("escalationAlerts", v)}
          icon={<Megaphone className="h-4 w-4 text-primary" />}
        />
        <SwitchRow
          label="Check-in reminders"
          description="Remind coordinators of pending check-ins that haven&apos;t been sent or answered on schedule."
          checked={prefs?.checkinReminders ?? true}
          onChange={(v) => updatePref("checkinReminders", v)}
          icon={<ClipboardCheck className="h-4 w-4 text-primary" />}
        />
        <div className="flex items-center justify-end gap-2 pt-2">
          <Button variant="outline" onClick={load} disabled={!dirty || saving}>
            Reset
          </Button>
          <Button onClick={save} disabled={!dirty || saving} className="glow-primary">
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            Save changes
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Tab 6: Data export ────────────────────────────────────────────────────────
function DataExportTab() {
  const { user } = useAuth();
  const [from, setFrom] = React.useState<Date | undefined>(undefined);
  const [to, setTo] = React.useState<Date | undefined>(undefined);
  const [fromOpen, setFromOpen] = React.useState(false);
  const [toOpen, setToOpen] = React.useState(false);
  const [exporting, setExporting] = React.useState<string | null>(null);

  const isAdmin = user?.role === "HOSPITAL_ADMIN" || user?.role === "SUPER_ADMIN";

  const exportData = async (type: "patients" | "checkins" | "reports") => {
    setExporting(type);
    try {
      const params = new URLSearchParams({ type });
      if (from) params.set("from", from.toISOString().slice(0, 10));
      if (to) params.set("to", to.toISOString().slice(0, 10));
      const res = await fetch(`/api/settings/export?${params}`, { credentials: "include" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ojas-${type}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`${type.charAt(0).toUpperCase() + type.slice(1)} export downloaded`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExporting(null);
    }
  };

  const exports = [
    {
      type: "patients" as const,
      icon: User,
      title: "Export patients",
      description: "Patient demographics, surgery details, status, risk level, consent status, and enrollment dates.",
    },
    {
      type: "checkins" as const,
      icon: ClipboardCheck,
      title: "Export check-ins",
      description: "All check-in records including scheduled/sent/answered times, pain levels, symptoms, medication adherence, and AI risk scores.",
    },
    {
      type: "reports" as const,
      icon: FileSpreadsheet,
      title: "Export reports",
      description: "Escalations (severity, status, AI-proposed) and satisfaction surveys (ratings, recommendations, free text).",
    },
  ];

  return (
    <Card className="glass">
      <CardHeader>
        <CardTitle className="flex items-center gap-2"><Download className="h-5 w-5 text-primary" /> Data export</CardTitle>
        <CardDescription>
          Download your hospital data as CSV files. Exports are scoped to your hospital and respect date filters.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Date range selector */}
        <div className="space-y-2">
          <Label className="flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" /> Date range (optional)
          </Label>
          <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
            <div className="flex items-center gap-2">
              <Popover open={fromOpen} onOpenChange={setFromOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("w-40 justify-start text-left font-normal", !from && "text-muted-foreground")}>
                    <CalendarDays className="h-3.5 w-3.5 mr-1" />
                    {from ? fnsFormat(from, "d MMM yyyy") : "From date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={from}
                    onSelect={(d) => { setFrom(d); setFromOpen(false); }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
              <span className="text-xs text-muted-foreground">to</span>
              <Popover open={toOpen} onOpenChange={setToOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" size="sm" className={cn("w-40 justify-start text-left font-normal", !to && "text-muted-foreground")}>
                    <CalendarDays className="h-3.5 w-3.5 mr-1" />
                    {to ? fnsFormat(to, "d MMM yyyy") : "To date"}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={to}
                    onSelect={(d) => { setTo(d); setToOpen(false); }}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            </div>
            {(from || to) && (
              <Button variant="ghost" size="sm" className="text-xs" onClick={() => { setFrom(undefined); setTo(undefined); }}>
                Clear dates
              </Button>
            )}
          </div>
          <p className="text-xs text-muted-foreground">Leave empty to export all data. Filters apply to creation/scheduled date depending on the export type.</p>
        </div>

        <div className="h-px bg-border" />

        {/* Export buttons */}
        {!isAdmin ? (
          <Alert>
            <Shield className="h-4 w-4" />
            <AlertTitle>Admin access required</AlertTitle>
            <AlertDescription>Only hospital administrators can export data. Contact your admin if you need a report.</AlertDescription>
          </Alert>
        ) : (
          <div className="space-y-3">
            {exports.map((exp) => (
              <div key={exp.type} className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-lg border border-border bg-card/50 p-4 hover:bg-accent/30 transition-colors">
                <div className="flex items-start gap-3 min-w-0">
                  <div className="inline-flex items-center justify-center h-9 w-9 rounded-md bg-primary/10 text-primary shrink-0">
                    <exp.icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0">
                    <div className="text-sm font-medium">{exp.title}</div>
                    <p className="text-xs text-muted-foreground mt-0.5 leading-relaxed">{exp.description}</p>
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => void exportData(exp.type)}
                  disabled={exporting !== null}
                  className="shrink-0"
                >
                  {exporting === exp.type ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Download className="h-4 w-4" />
                  )}
                  {exporting === exp.type ? "Exporting…" : "Export CSV"}
                </Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Skeleton ────────────────────────────────────────────────────────────────
function SettingsSkeleton() {
  return (
    <div className="space-y-4">
      <Skeleton className="h-10 w-full max-w-2xl" />
      <Card className="glass">
        <CardHeader><Skeleton className="h-6 w-48" /></CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
          <Skeleton className="h-16 w-full" />
        </CardContent>
      </Card>
    </div>
  );
}
