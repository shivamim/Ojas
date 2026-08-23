"use client";

// Ojas — Command palette (⌘K). Quick navigation + actions across the app.
// Triggered by Cmd/Ctrl+K. Fuzzy search across pages, patients, and actions.

import * as React from "react";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { navigate } from "@/lib/router";
import { useAuth, api } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard, Users, UserPlus, AlertTriangle, Clock,
  FileBarChart, Settings, CreditCard, Shield, Bot, MessageSquare,
  CheckSquare, Search, ArrowRight, HeartPulse, Plus, Phone, LogOut,
  Gauge, type LucideIcon,
} from "lucide-react";

interface CommandItem {
  id: string;
  label: string;
  hint?: string;
  icon: LucideIcon;
  group: "Navigate" | "Actions" | "Patients";
  keywords?: string;
  action: () => void;
  badge?: string;
}

export function CommandPalette() {
  const { user, logout } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [query, setQuery] = React.useState("");
  const [selectedIdx, setSelectedIdx] = React.useState(0);
  const [patients, setPatients] = React.useState<{ id: string; fullName: string; surgeryType: string }[]>([]);

  // ⌘K / Ctrl+K to open
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((v) => !v);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // Preload patients on app mount (not just when palette opens) so search
  // results appear instantly when the user types.
  React.useEffect(() => {
    if (!user || user.role === "SUPER_ADMIN") return;
    let cancelled = false;
    api<{ patients: { id: string; fullName: string; surgeryType: string }[] }>("/api/patients")
      .then((data) => { if (!cancelled) setPatients(data.patients); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [user]);

  // Re-fetch when palette opens to ensure fresh data
  React.useEffect(() => {
    if (!open || !user || user.role === "SUPER_ADMIN") return;
    let cancelled = false;
    api<{ patients: { id: string; fullName: string; surgeryType: string }[] }>("/api/patients")
      .then((data) => { if (!cancelled) setPatients(data.patients); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [open, user]);

  // Reset query when closing
  React.useEffect(() => {
    if (!open) { setQuery(""); setSelectedIdx(0); }
  }, [open]);

  const closePalette = React.useCallback(() => setOpen(false), []);

  const navItems: CommandItem[] = React.useMemo(() => {
    if (!user) return [];
    const isSuper = user.role === "SUPER_ADMIN";
    const items: CommandItem[] = [
      { id: "nav-dashboard", label: "Dashboard", icon: LayoutDashboard, group: "Navigate", action: () => { navigate("dashboard"); closePalette(); } },
      { id: "nav-patients", label: "Patients", icon: Users, group: "Navigate", action: () => { navigate("patients"); closePalette(); } },
      { id: "nav-enroll", label: "Enroll patient", icon: UserPlus, group: "Navigate", action: () => { navigate("enroll"); closePalette(); } },
      { id: "nav-checkins", label: "Check-ins", icon: CheckSquare, group: "Navigate", action: () => { navigate("checkins"); closePalette(); } },
      { id: "nav-escalations", label: "Escalations", icon: AlertTriangle, group: "Navigate", action: () => { navigate("escalations"); closePalette(); } },
      { id: "nav-timeline", label: "Timeline", icon: Clock, group: "Navigate", action: () => { navigate("timeline"); closePalette(); } },
      { id: "nav-reports", label: "Reports", icon: FileBarChart, group: "Navigate", action: () => { navigate("reports"); closePalette(); } },
      { id: "nav-messages", label: "Patient messages", icon: MessageSquare, group: "Navigate", action: () => { navigate("messages"); closePalette(); } },
    ];
    if (user.role === "HOSPITAL_ADMIN") {
      items.push(
        { id: "nav-ai-usage", label: "AI usage", icon: Bot, group: "Navigate", action: () => { navigate("ai-usage"); closePalette(); } },
        { id: "nav-productivity", label: "Coordinator productivity", icon: Gauge, group: "Navigate", action: () => { navigate("productivity"); closePalette(); } },
        { id: "nav-billing", label: "Billing", icon: CreditCard, group: "Navigate", action: () => { navigate("billing"); closePalette(); } },
        { id: "nav-settings", label: "Settings", icon: Settings, group: "Navigate", action: () => { navigate("settings"); closePalette(); } },
      );
    }
    if (isSuper) {
      items.push(
        { id: "nav-super-hospitals", label: "Superadmin: Hospitals", icon: Shield, group: "Navigate", action: () => { navigate("superadmin-hospitals"); closePalette(); } },
        { id: "nav-super-users", label: "Superadmin: Users", icon: Users, group: "Navigate", action: () => { navigate("superadmin-users"); closePalette(); } },
        { id: "nav-super-audit", label: "Superadmin: Audit logs", icon: FileBarChart, group: "Navigate", action: () => { navigate("superadmin-audit"); closePalette(); } },
        { id: "nav-super-ai", label: "Superadmin: AI usage", icon: Bot, group: "Navigate", action: () => { navigate("superadmin-ai-usage"); closePalette(); } },
      );
    }
    // Action items
    items.push(
      { id: "act-enroll", label: "Enroll a new patient", icon: Plus, group: "Actions", hint: "Start the 4-step wizard", action: () => { navigate("enroll"); closePalette(); } },
      { id: "act-escalations", label: "View open escalations", icon: AlertTriangle, group: "Actions", action: () => { navigate("escalations"); closePalette(); } },
      { id: "act-reports", label: "Generate compliance report", icon: FileBarChart, group: "Actions", action: () => { navigate("reports"); closePalette(); } },
      { id: "act-logout", label: "Sign out", icon: LogOut, group: "Actions", action: () => { logout(); closePalette(); } },
    );
    return items;
  }, [user, logout, closePalette]);

  const patientItems: CommandItem[] = React.useMemo(() => {
    return patients.slice(0, 8).map((p) => ({
      id: `pat-${p.id}`,
      label: p.fullName,
      hint: p.surgeryType,
      icon: HeartPulse,
      group: "Patients" as const,
      keywords: p.surgeryType,
      action: () => { navigate("patient-detail", { patientId: p.id }); closePalette(); },
    }));
  }, [patients, closePalette]);

  const allItems = [...navItems, ...patientItems];

  // Filter
  const filtered = React.useMemo(() => {
    if (!query.trim()) return allItems;
    const q = query.toLowerCase();
    return allItems.filter((item) =>
      item.label.toLowerCase().includes(q) ||
      item.hint?.toLowerCase().includes(q) ||
      item.keywords?.toLowerCase().includes(q) ||
      item.group.toLowerCase().includes(q)
    );
  }, [allItems, query]);

  // Group filtered items
  const grouped = React.useMemo(() => {
    const groups: Record<string, CommandItem[]> = {};
    for (const item of filtered) {
      if (!groups[item.group]) groups[item.group] = [];
      groups[item.group].push(item);
    }
    return groups;
  }, [filtered]);

  // Keyboard navigation
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      filtered[selectedIdx]?.action();
    }
  };

  // Flatten for index tracking
  const flatList: CommandItem[] = [];
  for (const group of ["Navigate", "Actions", "Patients"]) {
    if (grouped[group]) flatList.push(...grouped[group]);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="p-0 gap-0 max-w-xl overflow-hidden" onKeyDown={handleKeyDown}>
        <DialogHeader className="sr-only">
          <DialogTitle>Command palette</DialogTitle>
        </DialogHeader>
        <div className="flex items-center gap-3 px-4 py-3 border-b border-border">
          <Search className="h-4 w-4 text-muted-foreground flex-shrink-0" />
          <Input
            autoFocus
            value={query}
            onChange={(e) => { setQuery(e.target.value); setSelectedIdx(0); }}
            placeholder="Search pages, patients, or actions…"
            className="border-0 p-0 h-auto focus-visible:ring-0 text-base shadow-none"
            role="combobox"
            aria-expanded={open}
            aria-activedescendant={filtered[selectedIdx] ? `cmd-item-${filtered[selectedIdx].id}` : undefined}
          />
          <kbd className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded">ESC</kbd>
        </div>
        <ScrollArea className="max-h-[400px]">
          {flatList.length === 0 ? (
            <div className="py-12 text-center text-sm text-muted-foreground">
              No results for &ldquo;{query}&rdquo;
            </div>
          ) : (
            <div className="py-2">
              {["Navigate", "Actions", "Patients"].map((group) => {
                const items = grouped[group];
                if (!items || items.length === 0) return null;
                return (
                  <div key={group} className="mb-1">
                    <div className="px-4 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {group}
                    </div>
                    {items.map((item) => {
                      const flatIdx = flatList.indexOf(item);
                      const isSelected = flatIdx === selectedIdx;
                      const Icon = item.icon;
                      return (
                        <button
                          key={item.id}
                          id={`cmd-item-${item.id}`}
                          onMouseEnter={() => setSelectedIdx(flatIdx)}
                          onClick={item.action}
                          className={cn(
                            "w-full flex items-center gap-3 px-4 py-2 text-sm transition-colors text-left",
                            isSelected ? "bg-primary/10 text-primary" : "hover:bg-muted/50"
                          )}
                          role="option"
                          aria-selected={isSelected}
                        >
                          <Icon className="h-4 w-4 flex-shrink-0" />
                          <span className="flex-1 truncate font-medium">{item.label}</span>
                          {item.hint && (
                            <span className="text-xs text-muted-foreground truncate max-w-[150px]">{item.hint}</span>
                          )}
                          {item.badge && <Badge variant="outline" className="text-[10px]">{item.badge}</Badge>}
                          {isSelected && <ArrowRight className="h-3 w-3 text-primary flex-shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </div>
          )}
        </ScrollArea>
        <div className="border-t border-border px-4 py-2 flex items-center justify-between text-[11px] text-muted-foreground">
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1"><kbd className="font-mono bg-muted px-1 rounded">↑↓</kbd> navigate</span>
            <span className="flex items-center gap-1"><kbd className="font-mono bg-muted px-1 rounded">↵</kbd> select</span>
          </div>
          <span>Ojas · ⌘K</span>
        </div>
      </DialogContent>
    </Dialog>
  );
}
