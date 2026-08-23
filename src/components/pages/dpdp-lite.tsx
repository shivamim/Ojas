// Ojas — DPDP Lite dashboard (P2.8).
// Surfaces: versioned consent, 72-hour breach clock, DSR tracker.
// All data comes from /api/dpdp/* routes — no fabricated numbers.
"use client";

import * as React from "react";
import { MotionConfig, motion } from "framer-motion";
import { toast } from "sonner";
import {
  ShieldCheck, Clock, FileText, AlertTriangle, CheckCircle2,
  Loader2, RefreshCw, Send, Plus,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip,
  XAxis, YAxis,
} from "recharts";

import { api } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

// ── Types ───────────────────────────────────────────────────────────────────
interface ConsentVersion {
  id: string;
  purpose: string;
  version: string;
  content: string;
  hash: string;
  effectiveAt: string;
}

interface ConsentVersionsResponse {
  byPurpose: Record<string, { current: ConsentVersion; history: ConsentVersion[] }>;
  reconsentQueueCount: number;
}

interface BreachRow {
  id: string;
  title: string;
  description: string;
  hospitalId: string;
  detectedAt: string;
  notifiedAt: string | null;
  dpbNotifiedAt: string | null;
  slaDeadline: string;
  hoursRemaining: number;
  slaStatus: "OK" | "AT_RISK" | "OVERDUE" | "NOTIFIED";
  status: string;
  affectedCount: number | null;
  hospital: { name: string };
}

interface BreachClockResponse {
  breaches: BreachRow[];
  summary: { total: number; atRisk: number; overdue: number; notified: number };
}

interface DpdpRequest {
  id: string;
  type: "ACCESS" | "CORRECTION" | "ERASURE" | "GRIEVANCE";
  status: "PENDING" | "IN_REVIEW" | "FULFILLED" | "REJECTED";
  description: string | null;
  response: string | null;
  slaDeadline: string | null;
  requestedAt: string;
  resolvedAt: string | null;
  patient: { fullName: string };
}

// ── Helpers ─────────────────────────────────────────────────────────────────
const SLA_BADGE: Record<string, string> = {
  OK: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  AT_RISK: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  OVERDUE: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
  NOTIFIED: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
};

const STATUS_BADGE: Record<string, string> = {
  PENDING: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  IN_REVIEW: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  FULFILLED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  REJECTED: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" });
}

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

// ── Page ────────────────────────────────────────────────────────────────────
export function DpdpLitePage() {
  const [consent, setConsent] = React.useState<ConsentVersionsResponse | null>(null);
  const [breach, setBreach] = React.useState<BreachClockResponse | null>(null);
  const [dsrs, setDsrs] = React.useState<DpdpRequest[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [newVersionOpen, setNewVersionOpen] = React.useState(false);
  const [notifyTarget, setNotifyTarget] = React.useState<BreachRow | null>(null);
  const [notifying, setNotifying] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [c, b, d] = await Promise.all([
        api<ConsentVersionsResponse>("/api/dpdp/consent-versions"),
        api<BreachClockResponse>("/api/dpdp/breach-clock"),
        api<{ requests: DpdpRequest[] }>("/api/dpdp/request"),
      ]);
      setConsent(c);
      setBreach(b);
      setDsrs(d.requests);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load DPDP data");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const notifyDpb = async () => {
    if (!notifyTarget) return;
    setNotifying(true);
    try {
      const r = await fetch(`/api/dpdp/breach-clock/${notifyTarget.id}/notify-dpb`, {
        method: "POST",
        credentials: "include",
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || "Failed to notify DPB");
      }
      toast.success("DPB notified. SLA clock stopped.");
      setNotifyTarget(null);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setNotifying(false);
    }
  };

  if (loading) return <DpdpSkeleton />;

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-6">
        {/* Header */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight flex items-center gap-2">
              <ShieldCheck className="h-7 w-7 text-primary" />
              DPDP Lite
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Versioned consent · 72-hour breach clock · Data Subject Rights tracker
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={load}>
            <RefreshCw className="h-4 w-4 mr-2" /> Refresh
          </Button>
        </motion.div>

        {/* Summary cards */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <FileText className="h-5 w-5 text-primary" />
                {consent && consent.reconsentQueueCount > 0 && (
                  <Badge className="bg-amber-500/15 text-amber-700 border-amber-500/30">
                    {consent.reconsentQueueCount} pending
                  </Badge>
                )}
              </div>
              <div className="text-2xl font-semibold mt-3">
                {consent ? Object.keys(consent.byPurpose).length : 0}
              </div>
              <div className="text-xs text-muted-foreground">Consent purposes tracked</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <Clock className="h-5 w-5 text-primary" />
              <div className="text-2xl font-semibold mt-3">{breach?.summary.total ?? 0}</div>
              <div className="text-xs text-muted-foreground">Active breaches</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <div className="text-2xl font-semibold mt-3 text-amber-600">
                {(breach?.summary.atRisk ?? 0) + (breach?.summary.overdue ?? 0)}
              </div>
              <div className="text-xs text-muted-foreground">SLA at risk / overdue</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <div className="text-2xl font-semibold mt-3">{breach?.summary.notified ?? 0}</div>
              <div className="text-xs text-muted-foreground">Breaches notified</div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Consent Versions */}
        <motion.div variants={fadeUp} initial="hidden" animate="show">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Versioned Consent</CardTitle>
                <CardDescription className="text-xs mt-1">
                  Hash-proven record of consent text shown to each patient. New versions require re-consent.
                </CardDescription>
              </div>
              <Button size="sm" variant="outline" onClick={() => setNewVersionOpen(true)}>
                <Plus className="h-4 w-4 mr-1" /> New version
              </Button>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-48">Purpose</TableHead>
                    <TableHead className="w-20">Version</TableHead>
                    <TableHead>Content preview</TableHead>
                    <TableHead className="w-32">Hash</TableHead>
                    <TableHead className="w-40">Effective</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {consent && Object.entries(consent.byPurpose).map(([purpose, v]) => (
                    <TableRow key={purpose}>
                      <TableCell className="font-mono text-xs">{purpose}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{v.current.version}</Badge>
                        {v.history.length > 0 && (
                          <span className="text-xs text-muted-foreground ml-2">+{v.history.length} older</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground max-w-md truncate">
                        {v.current.content}
                      </TableCell>
                      <TableCell className="font-mono text-[10px] text-muted-foreground">
                        {v.current.hash.slice(0, 16)}…
                      </TableCell>
                      <TableCell className="text-xs">{fmtDate(v.current.effectiveAt)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </motion.div>

        {/* Breach Clock */}
        <motion.div variants={fadeUp} initial="hidden" animate="show">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Clock className="h-4 w-4 text-primary" /> 72-Hour Breach Clock
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                DPDP Rules require notifying affected data principals within 72 hours of breach detection.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {breach && breach.breaches.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  <CheckCircle2 className="h-10 w-10 mx-auto mb-2 text-emerald-500" />
                  No active breaches. All clear.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Title</TableHead>
                      <TableHead className="w-32">Detected</TableHead>
                      <TableHead className="w-32">SLA deadline</TableHead>
                      <TableHead className="w-24">Hours left</TableHead>
                      <TableHead className="w-28">Status</TableHead>
                      <TableHead className="w-32">Action</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {breach?.breaches.map((b) => (
                      <TableRow key={b.id}>
                        <TableCell>
                          <div className="font-medium text-sm">{b.title}</div>
                          <div className="text-xs text-muted-foreground">
                            {b.affectedCount ?? 0} affected
                          </div>
                        </TableCell>
                        <TableCell className="text-xs">{fmtDate(b.detectedAt)}</TableCell>
                        <TableCell className="text-xs">{fmtDate(b.slaDeadline)}</TableCell>
                        <TableCell className={cn(
                          "font-mono text-xs font-medium",
                          b.slaStatus === "OVERDUE" && "text-rose-600",
                          b.slaStatus === "AT_RISK" && "text-amber-600",
                          b.slaStatus === "OK" && "text-emerald-600",
                        )}>
                          {b.slaStatus === "NOTIFIED" ? "—" : `${b.hoursRemaining.toFixed(1)}h`}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={SLA_BADGE[b.slaStatus]}>
                            {b.slaStatus}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          {!b.dpbNotifiedAt && (
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => setNotifyTarget(b)}
                            >
                              <Send className="h-3 w-3 mr-1" /> Notify DPB
                            </Button>
                          )}
                          {b.dpbNotifiedAt && (
                            <span className="text-xs text-emerald-600">DPB notified</span>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </motion.div>

        {/* DSR Tracker */}
        <motion.div variants={fadeUp} initial="hidden" animate="show">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Data Subject Rights Requests</CardTitle>
              <CardDescription className="text-xs mt-1">
                ACCESS / CORRECTION (30-day SLA) · ERASURE / GRIEVANCE (no statutory SLA)
              </CardDescription>
            </CardHeader>
            <CardContent>
              {dsrs.length === 0 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">
                  No DSR requests submitted yet.
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-32">Type</TableHead>
                      <TableHead>Patient</TableHead>
                      <TableHead className="w-32">Requested</TableHead>
                      <TableHead className="w-32">SLA deadline</TableHead>
                      <TableHead className="w-28">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {dsrs.map((d) => (
                      <TableRow key={d.id}>
                        <TableCell>
                          <Badge variant="outline">{d.type}</Badge>
                        </TableCell>
                        <TableCell className="text-sm">{d.patient.fullName}</TableCell>
                        <TableCell className="text-xs">{fmtDate(d.requestedAt)}</TableCell>
                        <TableCell className="text-xs">
                          {d.slaDeadline ? fmtDate(d.slaDeadline) : "—"}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={STATUS_BADGE[d.status]}>
                            {d.status}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Notify DPB Dialog */}
      <Dialog open={!!notifyTarget} onOpenChange={(o) => !o && setNotifyTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Notify Data Protection Board?</DialogTitle>
            <DialogDescription>
              This will mark the breach as DPB-notified and stop the SLA clock. A pre-built notification
              template will be generated for submission to the DPB.
              <br /><br />
              <strong>Breach:</strong> {notifyTarget?.title}<br />
              <strong>Detected:</strong> {notifyTarget && fmtDate(notifyTarget.detectedAt)}<br />
              <strong>SLA deadline:</strong> {notifyTarget && fmtDate(notifyTarget.slaDeadline)}<br />
              <strong>Affected:</strong> {notifyTarget?.affectedCount ?? 0} individuals
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setNotifyTarget(null)}>Cancel</Button>
            <Button onClick={notifyDpb} disabled={notifying}>
              {notifying ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
              Notify DPB
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <NewVersionDialog open={newVersionOpen} onOpenChange={setNewVersionOpen} onCreated={load} />
    </MotionConfig>
  );
}

// ── New Consent Version Dialog ──────────────────────────────────────────────
function NewVersionDialog({ open, onOpenChange, onCreated }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const [purpose, setPurpose] = React.useState("whatsapp_monitoring");
  const [version, setVersion] = React.useState("1.1");
  const [content, setContent] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const submit = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/dpdp/consent-versions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ purpose, version, content }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      toast.success("New consent version created. Patients with old version will be asked to re-consent.");
      setContent("");
      onOpenChange(false);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create new consent version</DialogTitle>
          <DialogDescription>
            When consent text changes, patients with the old version are flagged for re-consent on next check-in.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Purpose</Label>
              <Select value={purpose} onValueChange={setPurpose}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="whatsapp_monitoring">whatsapp_monitoring</SelectItem>
                  <SelectItem value="ai_triage">ai_triage</SelectItem>
                  <SelectItem value="data_sharing_hospital">data_sharing_hospital</SelectItem>
                  <SelectItem value="data_sharing_insurance">data_sharing_insurance</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">Version</Label>
              <input
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm"
                value={version}
                onChange={(e) => setVersion(e.target.value)}
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Consent text</Label>
            <Textarea
              className="min-h-[160px] font-mono text-xs"
              placeholder="Full consent text shown to the patient…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving || content.length < 10}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Create version
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Skeleton ────────────────────────────────────────────────────────────────
function DpdpSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-10 w-64" />
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-24" />)}
      </div>
      <Skeleton className="h-64" />
      <Skeleton className="h-64" />
    </div>
  );
}
