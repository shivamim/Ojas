"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Footprints, Stethoscope, Scissors, Bandage, Activity, Calendar, Circle,
  Plus, Check, X, Loader2,
} from "lucide-react";

import { api } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import type { Milestone, MilestonesResponse, MilestoneType } from "../types";
import { absDate } from "../helpers";
import { CountStat } from "../shared";

// ── Milestones tab ──────────────────────────────────────────────────────────
const MILESTONE_TYPE_OPTIONS: { value: MilestoneType; label: string }[] = [
  { value: "FIRST_WALK", label: "First walk" },
  { value: "WOUND_CHECK", label: "Wound check" },
  { value: "SUTURE_REMOVAL", label: "Suture removal" },
  { value: "STAPLE_REMOVAL", label: "Staple removal" },
  { value: "DRESSING_CHANGE", label: "Dressing change" },
  { value: "PHYSIOTHERAPY", label: "Physiotherapy" },
  { value: "FOLLOW_UP", label: "Follow-up" },
  { value: "OTHER", label: "Other" },
];

export function milestoneTypeIcon(type: MilestoneType): {
  Icon: React.ComponentType<{ className?: string }>;
  cls: string;
} {
  switch (type) {
    case "FIRST_WALK":      return { Icon: Footprints, cls: "bg-primary/15 text-primary" };
    case "WOUND_CHECK":     return { Icon: Stethoscope, cls: "bg-secondary text-secondary-foreground" };
    case "SUTURE_REMOVAL":  return { Icon: Scissors, cls: "bg-secondary text-secondary-foreground" };
    case "STAPLE_REMOVAL":  return { Icon: Scissors, cls: "bg-secondary text-secondary-foreground" };
    case "DRESSING_CHANGE": return { Icon: Bandage, cls: "bg-secondary text-secondary-foreground" };
    case "PHYSIOTHERAPY":   return { Icon: Activity, cls: "bg-primary/15 text-primary" };
    case "FOLLOW_UP":       return { Icon: Calendar, cls: "bg-accent text-accent-foreground" };
    case "OTHER":           return { Icon: Circle, cls: "bg-muted text-muted-foreground" };
  }
}

function milestoneTypeLabel(t: MilestoneType): string {
  return MILESTONE_TYPE_OPTIONS.find((o) => o.value === t)?.label ?? t.replace(/_/g, " ");
}

export function MilestonesTab({ patientId }: { patientId: string }) {
  const [items, setItems] = React.useState<Milestone[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<MilestonesResponse>(`/api/patients/${patientId}/milestones`);
      setItems(r.milestones);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load milestones");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  React.useEffect(() => { load(); }, [load]);

  const pending = items.filter((m) => m.status === "PENDING").length;
  const completed = items.filter((m) => m.status === "COMPLETED").length;
  const missed = items.filter((m) => m.status === "MISSED").length;

  const changeStatus = async (m: Milestone, status: "COMPLETED" | "MISSED") => {
    try {
      await api(`/api/patients/${patientId}/milestones`, {
        method: "PATCH",
        body: JSON.stringify({ milestoneId: m.id, status }),
      });
      toast.success(
        status === "COMPLETED" ? `${m.label} marked complete` : `${m.label} marked missed`
      );
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update milestone");
    }
  };

  return (
    <div className="space-y-4">
      <Card className="glass">
        <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <CountStat label="Pending" value={pending} accent="amber" />
            <CountStat label="Completed" value={completed} accent="emerald" />
            <CountStat label="Missed" value={missed} accent="rose" />
          </div>
          <Button onClick={() => setDialogOpen(true)} size="sm">
            <Plus className="h-4 w-4" /> Add milestone
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <MilestonesSkeleton />
      ) : items.length === 0 ? (
        <Card className="glass">
          <CardContent className="p-10 text-center">
            <div className="mx-auto h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <Footprints className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="font-semibold">No milestones set</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              Add recovery milestones like &apos;first walk&apos;, &apos;wound check&apos;,
              &apos;suture removal&apos; to track progress.
            </p>
            <Button onClick={() => setDialogOpen(true)} size="sm" className="mt-4">
              <Plus className="h-4 w-4" /> Add milestone
            </Button>
          </CardContent>
        </Card>
      ) : (
        <Card className="glass">
          <CardContent className="p-4 md:p-6">
            <ol className="relative border-l border-border ml-3 space-y-5">
              {items.map((m) => (
                <MilestoneNode key={m.id} milestone={m} onStatusChange={changeStatus} />
              ))}
            </ol>
          </CardContent>
        </Card>
      )}

      <AddMilestoneDialog
        patientId={patientId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={load}
      />
    </div>
  );
}

function MilestoneNode({
  milestone: m, onStatusChange,
}: {
  milestone: Milestone;
  onStatusChange: (m: Milestone, status: "COMPLETED" | "MISSED") => void;
}) {
  const { Icon, cls } = milestoneTypeIcon(m.type);
  return (
    <li className="ml-5">
      <span className={cn(
        "absolute -left-[13px] flex items-center justify-center h-6 w-6 rounded-full ring-4 ring-background",
        cls
      )}>
        <Icon className="h-3 w-3" />
      </span>
      <div className="flex flex-col sm:flex-row sm:items-baseline sm:justify-between gap-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-medium text-sm">{m.label}</span>
          <Badge variant="outline" className="bg-muted/60 text-muted-foreground border-border text-[10px] px-1.5 py-0 h-5">
            {milestoneTypeLabel(m.type)}
          </Badge>
          {m.status === "COMPLETED" ? (
            <Badge variant="outline" className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 text-[10px] px-1.5 py-0 h-5">
              <Check className="h-3 w-3" /> Completed
            </Badge>
          ) : m.status === "MISSED" ? (
            <Badge variant="outline" className="bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30 text-[10px] px-1.5 py-0 h-5">
              <X className="h-3 w-3" /> Missed
            </Badge>
          ) : (
            <Badge variant="outline" className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 text-[10px] px-1.5 py-0 h-5">
              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" aria-hidden="true" /> Pending
            </Badge>
          )}
        </div>
        <div className="text-xs text-muted-foreground">Target: {absDate(m.targetDate)}</div>
      </div>
      {m.completedAt && (
        <div className="text-xs text-emerald-700 dark:text-emerald-300 mt-1">
          Completed {absDate(m.completedAt)}
        </div>
      )}
      {m.notes && (
        <p className="text-xs text-muted-foreground mt-1">{m.notes}</p>
      )}
      {m.status === "PENDING" && (
        <div className="flex items-center gap-2 mt-2">
          <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => onStatusChange(m, "COMPLETED")}>
            <Check className="h-3.5 w-3.5" /> Mark complete
          </Button>
          <Button
            size="sm" variant="ghost"
            className="h-7 text-xs text-rose-700 dark:text-rose-300 hover:bg-rose-500/10 hover:text-rose-700 dark:hover:text-rose-200"
            onClick={() => onStatusChange(m, "MISSED")}
          >
            <X className="h-3.5 w-3.5" /> Mark missed
          </Button>
        </div>
      )}
    </li>
  );
}

function MilestonesSkeleton() {
  return (
    <Card className="glass">
      <CardContent className="p-4 md:p-6 space-y-5">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="ml-5 space-y-2">
            <Skeleton className="h-4 w-1/2" />
            <Skeleton className="h-3 w-1/4" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AddMilestoneDialog({
  patientId, open, onOpenChange, onCreated,
}: {
  patientId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const [type, setType] = React.useState<MilestoneType>("FIRST_WALK");
  const [label, setLabel] = React.useState("");
  const [targetDate, setTargetDate] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setType("FIRST_WALK");
      setLabel("");
      setTargetDate("");
      setNotes("");
      setSubmitting(false);
    }
  }, [open]);

  const submit = async () => {
    if (!label.trim() || !targetDate) {
      toast.error("Label and target date are required");
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, string> = {
        type,
        label: label.trim(),
        targetDate,
      };
      if (notes.trim()) body.notes = notes.trim();
      await api(`/api/patients/${patientId}/milestones`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast.success("Milestone added");
      onOpenChange(false);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add milestone");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto fancy-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Footprints className="h-5 w-5 text-primary" /> Add milestone
          </DialogTitle>
          <DialogDescription>
            Track a recovery milestone (e.g. first walk, wound check, suture removal).
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ms-type">Type *</Label>
            <Select value={type} onValueChange={(v) => setType(v as MilestoneType)}>
              <SelectTrigger id="ms-type" className="w-full"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MILESTONE_TYPE_OPTIONS.map((o) => (
                  <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ms-label">Label *</Label>
            <Input id="ms-label" placeholder="e.g. First walk post-surgery" value={label} onChange={(e) => setLabel(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ms-target">Target date *</Label>
            <Input id="ms-target" type="date" value={targetDate} onChange={(e) => setTargetDate(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ms-notes">Notes (optional)</Label>
            <Textarea id="ms-notes" placeholder="e.g. patient should walk 50m without assistance" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting} className="glow-primary">
            {submitting ? (<><Loader2 className="h-4 w-4 animate-spin" /> Adding…</>) : (<>Add milestone</>)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
