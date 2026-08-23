"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import {
  ClipboardList, ClipboardCheck, PartyPopper, User, Plus, Loader2,
} from "lucide-react";

import { api, useAuth } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";

import type {
  ChecklistCategory, ChecklistItem, ChecklistResponse,
} from "../types";
import { ago } from "../helpers";

// ── Checklist tab ───────────────────────────────────────────────────────────
const CHECKLIST_CATEGORIES: { value: ChecklistCategory; label: string }[] = [
  { value: "DISCHARGE_SUMMARY", label: "Discharge summary" },
  { value: "MEDICATION_REVIEW", label: "Medication review" },
  { value: "FOLLOW_UP_BOOKED", label: "Follow-up booked" },
  { value: "TRANSPORT", label: "Transport" },
  { value: "FAMILY_BRIEFED", label: "Family briefed" },
  { value: "DPDPA_CONSENT", label: "DPDPA consent" },
  { value: "OTHER", label: "Other" },
];

function checklistCategoryLabel(c: ChecklistCategory): string {
  return CHECKLIST_CATEGORIES.find((o) => o.value === c)?.label ?? c.replace(/_/g, " ");
}

export function ChecklistTab({
  patientId, onSummaryChange,
}: {
  patientId: string;
  onSummaryChange?: (remaining: number) => void;
}) {
  const { user } = useAuth();
  const [data, setData] = React.useState<ChecklistResponse | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [dialogOpen, setDialogOpen] = React.useState(false);

  // Stable ref so load() identity doesn't change when the callback does.
  const onSummaryRef = React.useRef(onSummaryChange);
  onSummaryRef.current = onSummaryChange;

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<ChecklistResponse>(`/api/patients/${patientId}/checklist`);
      setData(r);
      onSummaryRef.current?.(r.summary.remaining);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load checklist");
    } finally {
      setLoading(false);
    }
  }, [patientId]);

  React.useEffect(() => { load(); }, [load]);

  const toggle = async (item: ChecklistItem, checked: boolean) => {
    // Optimistic update — adjust local state immediately for snappy UX.
    setData((prev) => {
      if (!prev) return prev;
      const items = prev.items.map((i) =>
        i.id === item.id
          ? {
              ...i,
              checked,
              checkedAt: checked ? new Date().toISOString() : null,
              checkedById: checked ? (user?.id ?? null) : null,
            }
          : i
      );
      const checkedCount = items.filter((i) => i.checked).length;
      const total = items.length;
      return {
        items,
        summary: {
          total,
          checked: checkedCount,
          remaining: total - checkedCount,
          completionRate: total > 0 ? Math.round((checkedCount / total) * 100) : 0,
        },
      };
    });
    try {
      await api(`/api/patients/${patientId}/checklist`, {
        method: "PATCH",
        body: JSON.stringify({ itemId: item.id, checked }),
      });
      // Silently refresh to get server-truth (timestamps, IDs).
      const r = await api<ChecklistResponse>(`/api/patients/${patientId}/checklist`);
      setData(r);
      onSummaryRef.current?.(r.summary.remaining);
      if (checked) {
        toast.success(`"${item.item}" checked off`);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to update checklist item");
      // Revert to server state.
      try {
        const r = await api<ChecklistResponse>(`/api/patients/${patientId}/checklist`);
        setData(r);
        onSummaryRef.current?.(r.summary.remaining);
      } catch {
        // ignore secondary error
      }
    }
  };

  const summary = data?.summary;
  const items = data?.items ?? [];
  const allComplete = !loading && items.length > 0 && items.every((i) => i.checked);

  // Group items by category in canonical order.
  const grouped = React.useMemo(() => {
    const map = new Map<ChecklistCategory, ChecklistItem[]>();
    for (const cat of CHECKLIST_CATEGORIES) map.set(cat.value, []);
    for (const item of items) {
      const bucket = map.get(item.category) ?? map.get("OTHER")!;
      bucket.push(item);
    }
    return CHECKLIST_CATEGORIES
      .map((c) => ({ category: c.value, items: map.get(c.value) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [items]);

  return (
    <div className="space-y-4">
      {/* Progress + Add */}
      <Card className="glass">
        <CardContent className="p-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex-1 min-w-0 space-y-2">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-sm font-medium">Discharge checklist</span>
              <span className="text-xs text-muted-foreground tabular-nums">
                {summary ? `${summary.checked} of ${summary.total} checked` : "—"}
                {summary && summary.total > 0 && ` · ${summary.completionRate}%`}
              </span>
            </div>
            <Progress
              value={summary?.completionRate ?? 0}
              className={cn(
                "h-1.5",
                allComplete ? "[&>div]:bg-emerald-500" : "[&>div]:bg-primary"
              )}
            />
          </div>
          <Button onClick={() => setDialogOpen(true)} size="sm" className="flex-shrink-0">
            <Plus className="h-4 w-4" /> Add item
          </Button>
        </CardContent>
      </Card>

      {loading ? (
        <ChecklistSkeleton />
      ) : items.length === 0 ? (
        <Card className="glass">
          <CardContent className="p-10 text-center">
            <div className="mx-auto h-14 w-14 rounded-2xl bg-muted flex items-center justify-center mb-3">
              <ClipboardCheck className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="font-semibold">No checklist items yet</h3>
            <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
              Add items to verify before discharge — discharge summary, medication
              review, follow-up booking, transport, family briefing, DPDPA consent.
            </p>
            <Button onClick={() => setDialogOpen(true)} size="sm" className="mt-4">
              <Plus className="h-4 w-4" /> Add first item
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {allComplete && (
            <motion.div
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
            >
              <Alert className="border-emerald-500/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200">
                <PartyPopper className="h-4 w-4" />
                <AlertTitle>Discharge checklist complete!</AlertTitle>
                <AlertDescription>
                  Every item has been verified. The patient is ready for discharge.
                </AlertDescription>
              </Alert>
            </motion.div>
          )}

          {grouped.map((group) => (
            <Card key={group.category} className="glass">
              <CardHeader className="border-b border-border py-3">
                <CardTitle className="text-sm font-semibold flex items-center gap-2">
                  <ClipboardList className="h-3.5 w-3.5 text-primary" />
                  {checklistCategoryLabel(group.category)}
                  <Badge variant="outline" className="bg-muted/60 text-muted-foreground border-border text-[10px] px-1.5 py-0 h-5 ml-1">
                    {group.items.filter((i) => i.checked).length}/{group.items.length}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="p-2 md:p-3">
                <ul className="divide-y divide-border">
                  {group.items.map((item) => (
                    <ChecklistRow
                      key={item.id}
                      item={item}
                      currentUserId={user?.id}
                      onToggle={(checked) => toggle(item, checked)}
                    />
                  ))}
                </ul>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <AddChecklistItemDialog
        patientId={patientId}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        onCreated={load}
      />
    </div>
  );
}

function ChecklistRow({
  item, currentUserId, onToggle,
}: {
  item: ChecklistItem;
  currentUserId?: string;
  onToggle: (checked: boolean) => void;
}) {
  const [toggling, setToggling] = React.useState(false);
  const handleToggle = async (checked: boolean) => {
    setToggling(true);
    try {
      await onToggle(checked);
    } finally {
      setToggling(false);
    }
  };

  const checkedByMe = item.checkedById != null && item.checkedById === currentUserId;

  return (
    <li className="flex items-start gap-3 p-3 rounded-lg hover:bg-muted/40 transition-colors">
      <Checkbox
        id={`checklist-${item.id}`}
        checked={item.checked}
        disabled={toggling}
        onCheckedChange={(c) => handleToggle(c === true)}
        className="mt-0.5"
      />
      <div className="flex-1 min-w-0 space-y-1">
        <div className="flex flex-wrap items-center gap-2">
          <label
            htmlFor={`checklist-${item.id}`}
            className={cn(
              "text-sm cursor-pointer select-none",
              item.checked && "line-through text-muted-foreground"
            )}
          >
            {item.item}
          </label>
          <Badge variant="outline" className="bg-muted/60 text-muted-foreground border-border text-[10px] px-1.5 py-0 h-5">
            {checklistCategoryLabel(item.category)}
          </Badge>
        </div>
        {item.notes && (
          <p className="text-xs italic text-muted-foreground leading-relaxed break-words">
            {item.notes}
          </p>
        )}
        {item.checked && item.checkedAt && (
          <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 dark:text-emerald-300">
            <User className="h-3 w-3" />
            <span>
              {checkedByMe ? "Checked by you" : "Checked"}
              {" · "}
              {ago(item.checkedAt)}
            </span>
          </div>
        )}
      </div>
    </li>
  );
}

function ChecklistSkeleton() {
  return (
    <Card className="glass">
      <CardContent className="p-2 md:p-3 divide-y divide-border">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 p-3">
            <Skeleton className="h-4 w-4 rounded-[4px] mt-0.5" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-4 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

function AddChecklistItemDialog({
  patientId, open, onOpenChange, onCreated,
}: {
  patientId: string;
  open: boolean;
  onOpenChange: (o: boolean) => void;
  onCreated: () => void;
}) {
  const [item, setItem] = React.useState("");
  const [category, setCategory] = React.useState<ChecklistCategory>("DISCHARGE_SUMMARY");
  const [notes, setNotes] = React.useState("");
  const [submitting, setSubmitting] = React.useState(false);

  React.useEffect(() => {
    if (!open) {
      setItem("");
      setCategory("DISCHARGE_SUMMARY");
      setNotes("");
      setSubmitting(false);
    }
  }, [open]);

  const submit = async () => {
    if (!item.trim()) {
      toast.error("Item text is required");
      return;
    }
    setSubmitting(true);
    try {
      const body: { item: string; category: string; notes?: string } = {
        item: item.trim(),
        category,
      };
      if (notes.trim()) body.notes = notes.trim();
      await api(`/api/patients/${patientId}/checklist`, {
        method: "POST",
        body: JSON.stringify(body),
      });
      toast.success("Checklist item added");
      onOpenChange(false);
      onCreated();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add checklist item");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto fancy-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ClipboardCheck className="h-5 w-5 text-primary" /> Add checklist item
          </DialogTitle>
          <DialogDescription>
            Add an item to verify before this patient is discharged.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ckl-item">Item *</Label>
            <Input
              id="ckl-item"
              placeholder="e.g. Discharge summary printed and handed to patient"
              value={item}
              onChange={(e) => setItem(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ckl-cat">Category *</Label>
            <Select value={category} onValueChange={(v) => setCategory(v as ChecklistCategory)}>
              <SelectTrigger id="ckl-cat" className="w-full">
                <SelectValue placeholder="Select a category" />
              </SelectTrigger>
              <SelectContent>
                {CHECKLIST_CATEGORIES.map((c) => (
                  <SelectItem key={c.value} value={c.value}>
                    {c.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ckl-notes">Notes (optional)</Label>
            <Textarea
              id="ckl-notes"
              placeholder="e.g. handed to family member, copy filed in EMR…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting} className="glow-primary">
            {submitting ? (
              <><Loader2 className="h-4 w-4 animate-spin" /> Adding…</>
            ) : (
              <>Add item</>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
