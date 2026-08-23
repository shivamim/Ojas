import * as React from "react";

import { cn } from "@/lib/utils";

// ── Small shared sub-components used by Loaded + multiple tabs ──────────────

export function InfoLine({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="text-sm truncate">{value}</div>
    </div>
  );
}

export function Field({
  icon: Icon, label, value, truncate,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: React.ReactNode;
  truncate?: boolean;
}) {
  return (
    <div className="min-w-0">
      <div className="text-[11px] uppercase tracking-wider text-muted-foreground flex items-center gap-1">
        <Icon className="h-3 w-3" /> {label}
      </div>
      <div className={cn("text-sm", truncate && "truncate")}>{value}</div>
    </div>
  );
}

export function CountStat({
  label, value, accent,
}: {
  label: string;
  value: number;
  accent: "emerald" | "rose" | "amber" | "muted";
}) {
  const cls = accent === "emerald"
    ? "text-emerald-700 dark:text-emerald-300"
    : accent === "rose"
      ? "text-rose-700 dark:text-rose-300"
      : accent === "amber"
        ? "text-amber-700 dark:text-amber-300"
        : "text-muted-foreground";
  return (
    <div className="flex items-baseline gap-1.5">
      <span className={cn("text-xl font-semibold tabular-nums", cls)}>{value}</span>
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
