import * as React from "react";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import {
  UserPlus, AlertTriangle, PhoneCall, Bot, Activity,
  CheckCircle2, ClipboardList,
} from "lucide-react";

import type { PatientStatus, Escalation, Checkin } from "./types";

// ── Pure helpers (extracted verbatim from patient-detail.tsx lines 208-285) ──

export function statusBadgeClass(s: PatientStatus): string {
  switch (s) {
    case "ENROLLED":       return "bg-primary/15 text-primary border-primary/30";
    case "ACTIVE":         return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
    case "RECOVERED":      return "bg-muted text-muted-foreground border-border";
    case "READMITTED":     return "risk-critical";
    case "LOST_TO_FOLLOWUP": return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
  }
}

export function statusLabel(s: PatientStatus): string {
  return s === "LOST_TO_FOLLOWUP" ? "Lost to follow-up" :
         s.charAt(0) + s.slice(1).toLowerCase();
}

export function riskBadgeClass(risk: string | null | undefined): string {
  switch (risk) {
    case "LOW":      return "risk-low";
    case "MEDIUM":   return "risk-medium";
    case "HIGH":     return "risk-high";
    case "CRITICAL": return "risk-critical";
    default:         return "bg-muted text-muted-foreground";
  }
}

export function severityClass(s: Escalation["severity"]): string {
  switch (s) {
    case "CRITICAL": return "risk-critical";
    case "HIGH":     return "risk-high";
    case "MEDIUM":   return "risk-medium";
    case "LOW":      return "risk-low";
  }
}

export function checkinStatusBadge(s: Checkin["status"]): string {
  switch (s) {
    case "SCHEDULED": return "bg-muted text-muted-foreground border-border";
    case "SENT":      return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
    case "ANSWERED":  return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
    case "MISSED":    return "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30";
  }
}

export function timelineIcon(eventType: string): {
  Icon: React.ComponentType<{ className?: string }>;
  cls: string;
} {
  const t = eventType.toUpperCase();
  if (t.includes("ENROLL")) return { Icon: UserPlus, cls: "bg-primary/15 text-primary" };
  if (t.includes("ESCALAT")) return { Icon: AlertTriangle, cls: "risk-high" };
  if (t.includes("CHECKIN") || t.includes("CHECK_IN")) return { Icon: PhoneCall, cls: "bg-accent text-accent-foreground" };
  if (t.includes("CALL") || t.includes("AI_TRIAGE") || t.includes("TRIAGE")) return { Icon: Bot, cls: "bg-primary/15 text-primary" };
  if (t.includes("STATUS")) return { Icon: Activity, cls: "bg-secondary text-secondary-foreground" };
  if (t.includes("RESOLVE")) return { Icon: CheckCircle2, cls: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" };
  return { Icon: ClipboardList, cls: "bg-muted text-muted-foreground" };
}

export function recoveryDay(dischargeISO: string): number {
  try {
    const diff = Date.now() - parseISO(dischargeISO).getTime();
    return Math.max(1, Math.ceil(diff / 86400000));
  } catch {
    return 1;
  }
}

export function abs(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return format(parseISO(iso), "d MMM yyyy · h:mm a"); } catch { return "—"; }
}

export function absDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return format(parseISO(iso), "d MMM yyyy"); } catch { return "—"; }
}

export function ago(iso: string | null | undefined): string {
  if (!iso) return "—";
  try { return formatDistanceToNow(parseISO(iso), { addSuffix: true }); } catch { return "—"; }
}
