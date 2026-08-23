"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  Pill, Plus, MoreVertical, Check, X, Calendar, Loader2,
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
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

import type { Medication, MedicationsResponse } from "../types";
import { absDate } from "../helpers";
import { Field, CountStat } from "../shared";

// ── Medications tab ─────────────────────────────────────────────────────────
const MEDICATION_STATUS_LABEL: Record<Medication["status"], string> = {
  ACTIVE: "Active",
  COMPLETED: "Completed",
  DISCONTINUED: "Discontinued",
};

function medStatusBadgeClass(s: Medication["status"]): string {
  switch (s) {
    case "ACTIVE":       return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
    case "COMPLETED":    return "bg-muted text-muted-foreground border-border";
    case "DISCONTINUED": return "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30";
  }
}

export function MedicationsTab({ patientId }: { patientId: string }) {
  const [meds, setMeds] = React.useState<Medication[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<MedicationsResponse>(`/api/patients/${patientId}/medications`);
      setMeds(r.medications);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load medications");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  React.useEffect(() => { load(); }, [load]);

  const active = meds.filter((m) => m.status === "ACTIVE").length;
  const completed = meds.filter((m) => m.status === "COMPLETED").length;
  const discontinued = meds.filter((m) => m.status === "DISCONTINUED").length;

  const changeStatus = async (med: Medication, status: "COMPLETED" | "DISCONTINUED") => {
    try {
      await api(`/api/patients/${patientId}/medications`, {
        method: "PATCH",
        body: JSON.stringify({ medicationId: med.id, status }),
      });
      toast.success(`${med.name} marked as ${status.toLowerCase()}`);
      load();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update medication");
    }
  };

  return (
    <div className="space-y-4">
      {/* Summary + Add */}
      <Card className="glass">
        <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <CountStat label="Active" value={active} accent="emerald" />
            <CountStat label="Completed" value={completed} accent="muted" />
            <CountStat label="Discontinued" value={discontinued} accent="rose" />
          </div>
          <Button onClick={() => setDialogOpen(true)} size="sm">
            <Plus className="h-4 w-4" /> Add medication
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <MedicationsSkeleton />
      ) : meds.length === 0 ? (
        <Card className="glass">
          <CardContent className="p-10 text-center">
            <div className="mx-auto h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <Pill className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="font-semibold">No medications recorded</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              Add prescribed medications to track adherence.
            </p>
            <Button onClick={() => setDialogOpen(true)} size="sm" className="mt-4">
              <Plus className="h-4 w-4" /> Add medication
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {meds.map((m, i) => (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: Math.min(i * 0.05, 0.3) }}
            >
              <MedicationCard med={m} onStatusChange={changeStatus} />
            </motion.div>
          ))}
        </div>
      )}

      <AddMedicationDialog
        patientId={patientId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={load}
      />
    </div>
  );
}

function MedicationCard({
  med, onStatusChange,
}: {
  med: Medication;
  onStatusChange: (med: Medication, status: "COMPLETED" | "DISCONTINUED") => void;
}) {
  return (
    <Card className="glass">
      <CardContent className="p-4">
        <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-semibold text-base">{med.name}</span>
              {med.isHighAlert && (
                <Badge variant="destructive" className="text-[10px] px-1.5 py-0">
                  High Alert{med.alertCategory ? ` · ${med.alertCategory}` : ""}
                </Badge>
              )}
              <Badge variant="outline" className={medStatusBadgeClass(med.status)}>
                {MEDICATION_STATUS_LABEL[med.status]}
              </Badge>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <Field icon={Pill} label="Dosage" value={med.dosage} />
              <Field icon={Calendar} label="Frequency" value={med.frequency} />
              <Field icon={Calendar} label="Start" value={absDate(med.startDate)} />
              <Field icon={Calendar} label="End" value={med.endDate ? absDate(med.endDate) : "Ongoing"} />
            </div>
            {med.notes && (
              <p className="text-xs text-muted-foreground italic">{med.notes}</p>
            )}
          </div>
          {med.status === "ACTIVE" && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="sm" aria-label={`Change status for ${med.name}`}>
                  <MoreVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuLabel>Update status</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => onStatusChange(med, "COMPLETED")}>
                  <Check className="h-4 w-4" /> Mark as completed
                </DropdownMenuItem>
                <DropdownMenuItem
                  onClick={() => onStatusChange(med, "DISCONTINUED")}
                  className="text-rose-700 dark:text-rose-300 focus:text-rose-700 dark:focus:text-rose-300"
                >
                  <X className="h-4 w-4" /> Discontinue
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </CardContent>
    </Card>
  );
}

function MedicationsSkeleton() {
  return (
    <div className="space-y-3">
      {Array.from({ length: 3 }).map((_, i) => <Skeleton key={i} className="h-28" />)}
    </div>
  );
}

function AddMedicationDialog({
  patientId, open, onOpenChange, onCreated,
}: {
  patientId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const [name, setName] = React.useState("");
  const [dosage, setDosage] = React.useState("");
  const [frequency, setFrequency] = React.useState("");
  const [startDate, setStartDate] = React.useState("");
  const [endDate, setEndDate] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setName(""); setDosage(""); setFrequency("");
      setStartDate(""); setEndDate(""); setNotes("");
      setSubmitting(false);
    }
  }, [open]);

  const submit = async () => {
    if (!name.trim() || !dosage.trim() || !frequency.trim() || !startDate) {
      toast.error("Name, dosage, frequency, and start date are required");
      return;
    }
    setSubmitting(true);
    try {
      const body: Record<string, string> = {
        name: name.trim(),
        dosage: dosage.trim(),
        frequency: frequency.trim(),
        startDate,
      };
      if (endDate) body.endDate = endDate;
      if (notes.trim()) body.notes = notes.trim();
      await api(`/api/patients/${patientId}/medications`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast.success("Medication added");
      onOpenChange(false);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add medication");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto fancy-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Pill className="h-5 w-5 text-primary" /> Add medication
          </DialogTitle>
          <DialogDescription>
            Track a prescribed medication. Changes are logged in the audit trail.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="med-name">Name *</Label>
            <Input id="med-name" placeholder="e.g. Amoxicillin" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="med-dose">Dosage *</Label>
              <Input id="med-dose" placeholder="e.g. 500mg" value={dosage} onChange={(e) => setDosage(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="med-freq">Frequency *</Label>
              <Input id="med-freq" placeholder="e.g. Twice daily" value={frequency} onChange={(e) => setFrequency(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="med-start">Start date *</Label>
              <Input id="med-start" type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="med-end">End date (optional)</Label>
              <Input id="med-end" type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="med-notes">Notes (optional)</Label>
            <Textarea id="med-notes" placeholder="e.g. take with food, complete full course…" value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>Cancel</Button>
          <Button onClick={submit} disabled={submitting} className="glow-primary">
            {submitting ? (<><Loader2 className="h-4 w-4 animate-spin" /> Adding…</>) : (<>Add medication</>)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
