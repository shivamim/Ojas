// Ojas — Family Recovery Companion dashboard (P0.2 UI).
// Lists family updates sent/queued for the hospital, allows ad-hoc creation.
"use client";

import * as React from "react";
import { MotionConfig, motion } from "framer-motion";
import { toast } from "sonner";
import {
  Users, MessageSquare, Send, Loader2, RefreshCw,
  CheckCircle2, Clock, Plus,
} from "lucide-react";

import { api } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface FamilyUpdate {
  id: string;
  patientId: string;
  content: string;
  type: "DAILY_RECOVERY" | "MEDICATION_REMINDER" | "APPOINTMENT_ALERT" | "ESCALATION_NOTICE" | "MILESTONE_ACHIEVED";
  status: "QUEUED" | "SENT" | "DELIVERED" | "READ" | "FAILED";
  language: string;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  createdAt: string;
  patient: { fullName: string; surgeryType: string; dischargeDate: string };
}

interface Patient {
  id: string;
  fullName: string;
  familyOptIn: boolean;
}

const STATUS_BADGE: Record<string, string> = {
  QUEUED: "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30",
  SENT: "bg-sky-500/15 text-sky-700 dark:text-sky-300 border-sky-500/30",
  DELIVERED: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30",
  READ: "bg-primary/15 text-primary border-primary/30",
  FAILED: "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30",
};

const TYPE_LABEL: Record<string, string> = {
  DAILY_RECOVERY: "Daily recovery",
  MEDICATION_REMINDER: "Medication",
  APPOINTMENT_ALERT: "Appointment",
  ESCALATION_NOTICE: "Escalation",
  MILESTONE_ACHIEVED: "Milestone",
};

// Language flags for the family-update cards (visual cue for regionality)
const LANG_FLAGS: Record<string, string> = {
  HINGLISH: "🇮🇳",
  HINDI: "🇮🇳",
  ENGLISH: "🇬🇧",
  TAMIL: "🇮🇳",
  TELUGU: "🇮🇳",
  MARATHI: "🇮🇳",
  BENGALI: "🇮🇳",
};

function fmtDate(iso: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short" });
}

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

export function FamilyUpdatesPage() {
  const [updates, setUpdates] = React.useState<FamilyUpdate[]>([]);
  const [patients, setPatients] = React.useState<Patient[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [createOpen, setCreateOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const [u, p] = await Promise.all([
        api<{ updates: FamilyUpdate[] }>("/api/family-updates?limit=100"),
        api<{ patients: Patient[] }>("/api/patients"),
      ]);
      setUpdates(u.updates);
      setPatients(p.patients);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  // Summary
  const totalSent = updates.filter(u => ["SENT", "DELIVERED", "READ"].includes(u.status)).length;
  const totalRead = updates.filter(u => u.status === "READ").length;
  const totalQueued = updates.filter(u => u.status === "QUEUED").length;
  const optedInCount = patients.filter(p => p.familyOptIn).length;

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-6">
        <motion.div variants={fadeUp} initial="hidden" animate="show" className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight flex items-center gap-2">
              <Users className="h-7 w-7 text-primary" />
              Family Recovery Companion
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Daily WhatsApp updates to family members managing post-discharge care.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={load}>
              <RefreshCw className="h-4 w-4 mr-2" /> Refresh
            </Button>
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              <Plus className="h-4 w-4 mr-2" /> New update
            </Button>
          </div>
        </motion.div>

        {/* Summary cards */}
        <motion.div variants={fadeUp} initial="hidden" animate="show" className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="p-4">
              <Users className="h-5 w-5 text-primary" />
              <div className="text-2xl font-semibold mt-3">{optedInCount}</div>
              <div className="text-xs text-muted-foreground">Families opted in</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <Clock className="h-5 w-5 text-amber-500" />
              <div className="text-2xl font-semibold mt-3">{totalQueued}</div>
              <div className="text-xs text-muted-foreground">Queued for delivery</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <Send className="h-5 w-5 text-sky-500" />
              <div className="text-2xl font-semibold mt-3">{totalSent}</div>
              <div className="text-xs text-muted-foreground">Sent (last 100)</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <CheckCircle2 className="h-5 w-5 text-emerald-500" />
              <div className="text-2xl font-semibold mt-3">{totalRead}</div>
              <div className="text-xs text-muted-foreground">Read by family</div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Updates feed — WhatsApp-style message cards */}
        <motion.div variants={fadeUp} initial="hidden" animate="show">
          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <MessageSquare className="h-4 w-4 text-primary" /> Recent family updates
                  </CardTitle>
                  <CardDescription className="text-xs mt-1">
                    Cron at 6:00 PM IST auto-generates daily updates. HIGH/CRITICAL triage triggers immediate escalation notices.
                  </CardDescription>
                </div>
                {updates.length > 0 && (
                  <Badge variant="outline" className="text-xs">
                    {updates.length} total
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="space-y-3">
                  {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-32" />)}
                </div>
              ) : updates.length === 0 ? (
                <div className="text-center py-12 text-sm text-muted-foreground">
                  <MessageSquare className="h-12 w-12 mx-auto mb-3 text-muted-foreground/40" />
                  <div className="font-medium">No family updates yet</div>
                  <div className="text-xs mt-1">Enroll patients with family opt-in to start sending daily recovery updates.</div>
                </div>
              ) : (
                <div className="space-y-3 max-h-[700px] overflow-y-auto pr-2">
                  {updates.map((u) => (
                    <div
                      key={u.id}
                      className={cn(
                        "rounded-lg border p-4 transition-colors hover:bg-muted/30",
                        u.status === "READ" && "border-emerald-500/30 bg-emerald-500/[0.03]",
                        u.status === "QUEUED" && "border-amber-500/30 bg-amber-500/[0.03]",
                        u.status === "FAILED" && "border-rose-500/30 bg-rose-500/[0.03]",
                      )}
                    >
                      {/* Header row */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={cn(
                            "h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-semibold",
                            u.type === "ESCALATION_NOTICE" && "bg-rose-500/15 text-rose-700",
                            u.type === "DAILY_RECOVERY" && "bg-primary/15 text-primary",
                            u.type === "MEDICATION_REMINDER" && "bg-sky-500/15 text-sky-700",
                            u.type === "APPOINTMENT_ALERT" && "bg-amber-500/15 text-amber-700",
                            u.type === "MILESTONE_ACHIEVED" && "bg-emerald-500/15 text-emerald-700",
                          )}>
                            {u.patient.fullName.split(" ").map(n => n[0]).slice(0, 2).join("")}
                          </div>
                          <div className="min-w-0">
                            <div className="font-medium text-sm truncate">{u.patient.fullName}</div>
                            <div className="text-xs text-muted-foreground flex items-center gap-2">
                              <span>{u.patient.surgeryType}</span>
                              <span className="text-muted-foreground/40">·</span>
                              <span className="inline-flex items-center gap-1">
                                {LANG_FLAGS[u.language] || "🌐"} {u.language}
                              </span>
                            </div>
                          </div>
                        </div>
                        <div className="flex flex-col items-end gap-1 flex-shrink-0">
                          <Badge variant="outline" className={cn("text-[10px]", STATUS_BADGE[u.status])}>
                            {u.status === "READ" && <CheckCircle2 className="h-2.5 w-2.5 mr-1" />}
                            {u.status === "QUEUED" && <Clock className="h-2.5 w-2.5 mr-1" />}
                            {u.status}
                          </Badge>
                          <Badge variant="outline" className="text-[10px]">
                            {TYPE_LABEL[u.type]}
                          </Badge>
                        </div>
                      </div>
                      {/* Message body — WhatsApp-style chat bubble */}
                      <div className="ml-12">
                        <div className={cn(
                          "relative rounded-lg rounded-tl-none p-3 text-sm whitespace-pre-wrap",
                          u.status === "READ"
                            ? "bg-emerald-500/[0.06] border border-emerald-500/15"
                            : u.status === "QUEUED"
                              ? "bg-amber-500/[0.06] border border-amber-500/15"
                              : "bg-muted/40 border border-border",
                        )}>
                          {u.content}
                        </div>
                      </div>
                      {/* Footer: timestamps */}
                      <div className="flex items-center justify-end gap-4 mt-2 text-[10px] text-muted-foreground">
                        {u.sentAt && (
                          <span className="inline-flex items-center gap-1">
                            <Send className="h-2.5 w-2.5" /> Sent {fmtDate(u.sentAt)}
                          </span>
                        )}
                        {u.deliveredAt && (
                          <span className="inline-flex items-center gap-1">
                            <CheckCircle2 className="h-2.5 w-2.5" /> Delivered {fmtDate(u.deliveredAt)}
                          </span>
                        )}
                        {u.readAt && (
                          <span className="inline-flex items-center gap-1 text-emerald-600">
                            <CheckCircle2 className="h-2.5 w-2.5" /> Read {fmtDate(u.readAt)}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <CreateUpdateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        patients={patients}
        onCreated={load}
      />
    </MotionConfig>
  );
}

function CreateUpdateDialog({ open, onOpenChange, patients, onCreated }: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  patients: Patient[];
  onCreated: () => void;
}) {
  const optedIn = patients.filter(p => p.familyOptIn);
  const [patientId, setPatientId] = React.useState("");
  const [type, setType] = React.useState<FamilyUpdate["type"]>("DAILY_RECOVERY");
  const [content, setContent] = React.useState("");
  const [saving, setSaving] = React.useState(false);

  const submit = async () => {
    if (!patientId) {
      toast.error("Select a patient");
      return;
    }
    setSaving(true);
    try {
      const r = await fetch("/api/family-updates", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ patientId, type, content: content || undefined }),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || "Failed");
      }
      toast.success("Family update queued");
      setContent("");
      setPatientId("");
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
          <DialogTitle>Send a family update</DialogTitle>
          <DialogDescription>
            Ad-hoc update to the family contact. Daily recovery content auto-composes if left blank.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div>
            <Label className="text-xs">Patient (family opted-in only)</Label>
            <Select value={patientId} onValueChange={setPatientId}>
              <SelectTrigger><SelectValue placeholder="Select patient…" /></SelectTrigger>
              <SelectContent>
                {optedIn.length === 0 ? (
                  <SelectItem value="_none" disabled>No patients with family opt-in</SelectItem>
                ) : optedIn.map(p => (
                  <SelectItem key={p.id} value={p.id}>{p.fullName}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Type</Label>
            <Select value={type} onValueChange={(v) => setType(v as FamilyUpdate["type"])}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="DAILY_RECOVERY">Daily recovery (auto-compose)</SelectItem>
                <SelectItem value="MEDICATION_REMINDER">Medication reminder</SelectItem>
                <SelectItem value="APPOINTMENT_ALERT">Appointment alert</SelectItem>
                <SelectItem value="ESCALATION_NOTICE">Escalation notice</SelectItem>
                <SelectItem value="MILESTONE_ACHIEVED">Milestone achieved</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label className="text-xs">Content (optional — leave blank for DAILY_RECOVERY to auto-compose)</Label>
            <Textarea
              className="min-h-[120px]"
              placeholder="Namaste {familyName} ji, aaj {day} ka din hai recovery mein…"
              value={content}
              onChange={(e) => setContent(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={submit} disabled={saving || !patientId}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Queue update
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
