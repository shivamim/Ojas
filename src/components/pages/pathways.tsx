"use client";

// Ojas — Care pathway templates. Hospital admins customize the recovery
// milestone schedule per surgery type. At enrollment, a hospital-specific
// template overrides the built-in defaults. CRUD against /api/pathways.
import * as React from "react";
import { MotionConfig, motion } from "framer-motion";
import { toast } from "sonner";
import {
  Workflow, Plus, Pencil, Trash2, Save, Loader2, Footprints,
  Stethoscope, Scissors, Bandage, Activity, Calendar, Circle,
  Info, Sparkles, ListChecks,
} from "lucide-react";

import { api } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";

// ── Types matching /api/pathways contract ───────────────────────────────────
type MilestoneType =
  | "FIRST_WALK" | "WOUND_CHECK" | "SUTURE_REMOVAL" | "STAPLE_REMOVAL"
  | "DRESSING_CHANGE" | "PHYSIOTHERAPY" | "FOLLOW_UP" | "OTHER";

interface PathwayMilestone {
  type: MilestoneType;
  label: string;
  dayOffset: number;
}

interface PathwayTemplate {
  id: string;
  hospitalId: string;
  surgeryType: string;
  name: string;
  description: string | null;
  milestones: PathwayMilestone[];
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

interface PathwaysResponse {
  templates: PathwayTemplate[];
}

// ── Constants ───────────────────────────────────────────────────────────────
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

function milestoneTypeIcon(type: MilestoneType): {
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

// ── Page ────────────────────────────────────────────────────────────────────
export function PathwaysPage() {
  const [templates, setTemplates] = React.useState<PathwayTemplate[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [editorOpen, setEditorOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<PathwayTemplate | null>(null);
  const [deleteTarget, setDeleteTarget] = React.useState<PathwayTemplate | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<PathwaysResponse>("/api/pathways");
      setTemplates(r.templates);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load care pathway templates");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const openNew = () => {
    setEditing(null);
    setEditorOpen(true);
  };
  const openEdit = (t: PathwayTemplate) => {
    setEditing(t);
    setEditorOpen(true);
  };

  const toggleActive = async (t: PathwayTemplate, next: boolean) => {
    // Optimistic update
    setTemplates((prev) => prev.map((p) => p.id === t.id ? { ...p, isActive: next } : p));
    try {
      await api<{ template: PathwayTemplate }>(`/api/pathways`, {
        method: "PATCH",
        body: JSON.stringify({ id: t.id, isActive: next }),
      });
      toast.success(`${t.name} ${next ? "activated" : "paused"}`);
    } catch (err) {
      // Rollback
      setTemplates((prev) => prev.map((p) => p.id === t.id ? { ...p, isActive: t.isActive } : p));
      toast.error(err instanceof Error ? err.message : "Failed to update template");
    }
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    try {
      await api(`/api/pathways?id=${encodeURIComponent(target.id)}`, { method: "DELETE" });
      toast.success(`${target.name} deleted`);
      setTemplates((prev) => prev.filter((p) => p.id !== target.id));
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to delete template");
    }
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-6 md:space-y-8">
        {/* Header */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col md:flex-row md:items-end md:justify-between gap-4"
        >
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight flex items-center gap-2">
              <Workflow className="h-6 w-6 md:h-7 md:w-7 text-primary" />
              Care pathway templates
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              Customize recovery milestones per surgery type. Templates override the built-in defaults at enrollment.
            </p>
          </div>
          <Button onClick={openNew} className="glow-primary">
            <Plus className="h-4 w-4" /> New template
          </Button>
        </motion.section>

        {/* Info note */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.05 }}
          className="flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 border border-border rounded-lg p-3 max-w-3xl"
        >
          <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-primary" />
          <p>
            One template per surgery type. Inactive templates stay on file but are skipped at enrollment —
            patients get the built-in defaults instead. Edit a template to refine the recovery timeline
            for future enrollments; existing patient milestones are not retroactively changed.
          </p>
        </motion.div>

        {/* List */}
        <section>
          {loading ? (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <Card key={i} className="glass">
                  <CardContent className="p-5 space-y-3">
                    <Skeleton className="h-5 w-1/2" />
                    <Skeleton className="h-3 w-3/4" />
                    <Skeleton className="h-20 w-full" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : templates.length === 0 ? (
            <Card className="glass">
              <CardContent className="p-10 flex flex-col items-center justify-center text-center">
                <div className="h-14 w-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
                  <Workflow className="h-7 w-7 text-primary" />
                </div>
                <h3 className="font-semibold text-lg">No custom templates yet</h3>
                <p className="text-sm text-muted-foreground mt-1 max-w-md mx-auto">
                  Built-in surgery-specific milestones are used by default. Create a template to customize
                  the recovery pathway for a specific surgery type.
                </p>
                <Button onClick={openNew} className="mt-5 glow-primary">
                  <Plus className="h-4 w-4" /> Create your first template
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {templates.map((t, i) => (
                <TemplateCard
                  key={t.id}
                  template={t}
                  delay={i * 0.05}
                  onEdit={() => openEdit(t)}
                  onDelete={() => setDeleteTarget(t)}
                  onToggleActive={(next) => toggleActive(t, next)}
                />
              ))}
            </div>
          )}
        </section>

        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 pt-1">
          <Sparkles className="h-3 w-3 text-primary" />
          Care pathway templates are scoped to your hospital.
        </p>
      </div>

      {/* New / edit dialog */}
      <TemplateEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        editing={editing}
        onSaved={() => { setEditorOpen(false); load(); }}
      />

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-rose-500" />
              Delete &ldquo;{deleteTarget?.name}&rdquo;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This permanently removes the {deleteTarget?.surgeryType} template. Future enrollments for
              this surgery type will fall back to the built-in milestones. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); void confirmDelete(); }}
              className="bg-rose-600 text-white hover:bg-rose-700"
            >
              <Trash2 className="h-4 w-4" /> Delete template
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </MotionConfig>
  );
}

// ── Template card ───────────────────────────────────────────────────────────
function TemplateCard({
  template: t, delay, onEdit, onDelete, onToggleActive,
}: {
  template: PathwayTemplate;
  delay: number;
  onEdit: () => void;
  onDelete: () => void;
  onToggleActive: (next: boolean) => void;
}) {
  const sorted = React.useMemo(
    () => [...t.milestones].sort((a, b) => a.dayOffset - b.dayOffset),
    [t.milestones]
  );
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
    >
      <Card className={cn(
        "glass h-full flex flex-col transition-opacity",
        !t.isActive && "opacity-60"
      )}>
        <CardHeader className="border-b border-border pb-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 flex-wrap">
                <CardTitle className="text-base truncate">{t.name}</CardTitle>
                <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30 text-[10px] uppercase tracking-wide">
                  {t.surgeryType}
                </Badge>
              </div>
              <CardDescription className="mt-1 line-clamp-2">
                {t.description || "No description provided."}
              </CardDescription>
            </div>
            <label className="flex items-center gap-2 text-[11px] text-muted-foreground flex-shrink-0 cursor-pointer select-none">
              <span className={cn("font-medium", t.isActive ? "text-emerald-600 dark:text-emerald-400" : "text-muted-foreground")}>
                {t.isActive ? "Active" : "Paused"}
              </span>
              <Switch checked={t.isActive} onCheckedChange={onToggleActive} aria-label="Toggle active" />
            </label>
          </div>
        </CardHeader>

        <CardContent className="p-4 md:p-5 flex-1 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider flex items-center gap-1.5">
              <ListChecks className="h-3.5 w-3.5" />
              {t.milestones.length} milestone{t.milestones.length === 1 ? "" : "s"}
            </span>
            <span className="text-[11px] text-muted-foreground">
              updated {new Date(t.updatedAt).toLocaleDateString()}
            </span>
          </div>

          <ul className="space-y-2 max-h-72 overflow-y-auto fancy-scroll -mr-1 pr-1">
            {sorted.map((m, i) => {
              const { Icon, cls } = milestoneTypeIcon(m.type);
              return (
                <li key={i} className="flex items-center gap-2.5 rounded-md border border-border bg-background/40 px-3 py-2">
                  <span className={cn("flex items-center justify-center h-7 w-7 rounded-md flex-shrink-0", cls)}>
                    <Icon className="h-3.5 w-3.5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium truncate">{m.label}</div>
                    <div className="text-[10px] text-muted-foreground uppercase tracking-wide">
                      {milestoneTypeLabel(m.type)}
                    </div>
                  </div>
                  <Badge variant="outline" className="text-[10px] bg-muted/40 text-muted-foreground border-border">
                    Day {m.dayOffset}
                  </Badge>
                </li>
              );
            })}
          </ul>

          <div className="flex items-center justify-end gap-2 pt-1 mt-auto">
            <Button size="sm" variant="outline" onClick={onEdit}>
              <Pencil className="h-3.5 w-3.5" /> Edit
            </Button>
            <Button
              size="sm" variant="ghost"
              className="text-rose-700 dark:text-rose-300 hover:bg-rose-500/10 hover:text-rose-700 dark:hover:text-rose-200"
              onClick={onDelete}
            >
              <Trash2 className="h-3.5 w-3.5" /> Delete
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ── Template editor dialog ──────────────────────────────────────────────────
interface DraftMilestone {
  type: MilestoneType;
  label: string;
  dayOffset: string; // string for input control; parsed on submit
}

function TemplateEditorDialog({
  open, onOpenChange, editing, onSaved,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  editing: PathwayTemplate | null;
  onSaved: () => void;
}) {
  const [surgeryType, setSurgeryType] = React.useState("");
  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [milestones, setMilestones] = React.useState<DraftMilestone[]>([]);
  const [submitting, setSubmitting] = React.useState(false);

  // Sync form when dialog opens
  React.useEffect(() => {
    if (!open) return;
    if (editing) {
      setSurgeryType(editing.surgeryType);
      setName(editing.name);
      setDescription(editing.description || "");
      setMilestones(
        editing.milestones.map((m) => ({
          type: m.type,
          label: m.label,
          dayOffset: String(m.dayOffset),
        }))
      );
    } else {
      setSurgeryType("");
      setName("");
      setDescription("");
      setMilestones([
        { type: "FIRST_WALK", label: "", dayOffset: "1" },
      ]);
    }
    setSubmitting(false);
  }, [open, editing]);

  const addMilestone = () => {
    setMilestones((prev) => [
      ...prev,
      { type: "FOLLOW_UP", label: "", dayOffset: "7" },
    ]);
  };

  const removeMilestone = (idx: number) => {
    setMilestones((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateMilestone = (idx: number, patch: Partial<DraftMilestone>) => {
    setMilestones((prev) => prev.map((m, i) => i === idx ? { ...m, ...patch } : m));
  };

  const submit = async () => {
    // Validate
    const st = surgeryType.trim();
    const nm = name.trim();
    if (!st) { toast.error("Surgery type is required"); return; }
    if (!nm) { toast.error("Template name is required"); return; }
    if (milestones.length === 0) { toast.error("At least one milestone is required"); return; }
    const cleaned: PathwayMilestone[] = [];
    for (let i = 0; i < milestones.length; i++) {
      const m = milestones[i];
      const label = m.label.trim();
      const offset = parseInt(m.dayOffset, 10);
      if (!label) {
        toast.error(`Milestone ${i + 1}: label is required`);
        return;
      }
      if (isNaN(offset) || offset < 0 || offset > 365) {
        toast.error(`Milestone ${i + 1}: day offset must be between 0 and 365`);
        return;
      }
      cleaned.push({ type: m.type, label, dayOffset: offset });
    }

    setSubmitting(true);
    try {
      if (editing) {
        await api<{ template: PathwayTemplate }>(`/api/pathways`, {
          method: "PATCH",
          body: JSON.stringify({
            id: editing.id,
            name: nm,
            description: description.trim() || undefined,
            milestones: cleaned,
          }),
        });
        toast.success("Template updated");
      } else {
        await api<{ template: PathwayTemplate }>(`/api/pathways`, {
          method: "POST",
          body: JSON.stringify({
            surgeryType: st,
            name: nm,
            description: description.trim() || undefined,
            milestones: cleaned,
          }),
        });
        toast.success("Template created");
      }
      onSaved();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save template");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl max-h-[92vh] overflow-y-auto fancy-scroll">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Workflow className="h-5 w-5 text-primary" />
            {editing ? "Edit template" : "New care pathway template"}
          </DialogTitle>
          <DialogDescription>
            Define recovery milestones for a specific surgery type. These override the built-in
            defaults at enrollment.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-5 py-2">
          {/* Top fields */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <Label htmlFor="pw-surgery">Surgery type *</Label>
              <Input
                id="pw-surgery"
                placeholder="e.g. Coronary Bypass"
                value={surgeryType}
                onChange={(e) => setSurgeryType(e.target.value)}
                disabled={!!editing}
              />
              {editing && (
                <p className="text-[10px] text-muted-foreground">
                  Surgery type is locked once a template is created.
                </p>
              )}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pw-name">Template name *</Label>
              <Input
                id="pw-name"
                placeholder="e.g. Standard CABG recovery"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pw-desc">Description (optional)</Label>
            <Textarea
              id="pw-desc"
              placeholder="Brief notes on what this pathway covers — e.g. timing, special precautions."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
            />
          </div>

          {/* Milestone builder */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <Label className="flex items-center gap-1.5">
                <ListChecks className="h-3.5 w-3.5" />
                Milestones
              </Label>
              <Button size="sm" variant="outline" onClick={addMilestone} type="button">
                <Plus className="h-3.5 w-3.5" /> Add milestone
              </Button>
            </div>

            <div className="space-y-2">
              {milestones.map((m, idx) => {
                const { Icon, cls } = milestoneTypeIcon(m.type);
                return (
                  <div
                    key={idx}
                    className="grid grid-cols-12 gap-2 items-start rounded-lg border border-border bg-background/40 p-2.5"
                  >
                    <div className="col-span-12 sm:col-span-4">
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Type</Label>
                      <Select
                        value={m.type}
                        onValueChange={(v) => updateMilestone(idx, { type: v as MilestoneType })}
                      >
                        <SelectTrigger className="w-full h-9 mt-0.5">
                          <span className="flex items-center gap-1.5">
                            <span className={cn("flex items-center justify-center h-5 w-5 rounded", cls)}>
                              <Icon className="h-3 w-3" />
                            </span>
                            <SelectValue />
                          </span>
                        </SelectTrigger>
                        <SelectContent>
                          {MILESTONE_TYPE_OPTIONS.map((o) => (
                            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="col-span-12 sm:col-span-5">
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Label</Label>
                      <Input
                        placeholder="e.g. Sternum check"
                        value={m.label}
                        onChange={(e) => updateMilestone(idx, { label: e.target.value })}
                        className="mt-0.5 h-9"
                      />
                    </div>
                    <div className="col-span-10 sm:col-span-2">
                      <Label className="text-[10px] uppercase tracking-wider text-muted-foreground">Day offset</Label>
                      <Input
                        type="number"
                        min={0}
                        max={365}
                        placeholder="e.g. 7"
                        value={m.dayOffset}
                        onChange={(e) => updateMilestone(idx, { dayOffset: e.target.value })}
                        className="mt-0.5 h-9"
                      />
                    </div>
                    <div className="col-span-2 sm:col-span-1 flex items-end justify-end h-9">
                      <Button
                        size="icon"
                        variant="ghost"
                        className="h-9 w-9 text-muted-foreground hover:text-rose-600 hover:bg-rose-500/10"
                        onClick={() => removeMilestone(idx)}
                        aria-label="Remove milestone"
                        type="button"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                );
              })}
              {milestones.length === 0 && (
                <div className="text-center py-6 text-xs text-muted-foreground border border-dashed border-border rounded-lg">
                  No milestones yet. Click &ldquo;Add milestone&rdquo; to begin.
                </div>
              )}
            </div>
            <p className="text-[10px] text-muted-foreground">
              Day offset is the number of days after discharge (e.g. Day 1 = first day home).
            </p>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting} className="glow-primary">
            {submitting
              ? <Loader2 className="h-4 w-4 animate-spin" />
              : editing
                ? <Save className="h-4 w-4" />
                : <Plus className="h-4 w-4" />}
            {editing ? "Save changes" : "Create template"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Re-export milestone helpers so other pages (e.g. patient-detail) can reuse them.
export { milestoneTypeIcon, milestoneTypeLabel };
