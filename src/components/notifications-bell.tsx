"use client";

// Ojas — Notifications bell. Shows a live count of open escalations and
// due check-ins. Clicking opens a dropdown with the most recent items,
// each linking to the relevant page.

import * as React from "react";
import { Bell, AlertTriangle, CheckSquare, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  Popover, PopoverContent, PopoverTrigger,
} from "@/components/ui/popover";
import { api, useAuth } from "@/lib/auth-context";
import { navigate } from "@/lib/router";
import { cn } from "@/lib/utils";

interface Notification {
  id: string;
  type: "escalation" | "checkin" | "ai";
  title: string;
  detail: string;
  time: string;
  severity?: string;
  actionView: "escalations" | "checkins";
  actionId?: string;
}

export function NotificationsBell() {
  const { user } = useAuth();
  const [open, setOpen] = React.useState(false);
  const [notifications, setNotifications] = React.useState<Notification[]>([]);
  const [hasCritical, setHasCritical] = React.useState(false);
  const [loading, setLoading] = React.useState(false);

  const fetchNotifications = React.useCallback(async () => {
    if (!user || user.role === "SUPER_ADMIN") return;
    setLoading(true);
    try {
      const [escData, dashData] = await Promise.all([
        api<{ escalations: { id: string; patient: { fullName: string }; severity: string; reason: string; createdAt: string }[] }>("/api/escalations/_"),
        api<{ stats: { checkinsDue24h: number; openEscalations: number; criticalEscalations: number }; upcomingCheckins: { id: string; patientName: string; surgeryType: string; scheduledFor: string }[] }>("/api/dashboard"),
      ]);
      const notifs: Notification[] = [];
      // Top 5 open escalations
      for (const e of escData.escalations.filter((e) => e.severity === "CRITICAL" || e.severity === "HIGH").slice(0, 5)) {
        notifs.push({
          id: e.id,
          type: "escalation",
          title: `${e.severity} escalation: ${e.patient.fullName}`,
          detail: e.reason.slice(0, 100),
          time: e.createdAt,
          severity: e.severity,
          actionView: "escalations",
          actionId: e.id,
        });
      }
      // Top 3 upcoming check-ins
      for (const c of dashData.upcomingCheckins.slice(0, 3)) {
        notifs.push({
          id: c.id,
          type: "checkin",
          title: `Check-in due: ${c.patientName}`,
          detail: `${c.surgeryType} — scheduled ${new Date(c.scheduledFor).toLocaleString("en-IN", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`,
          time: c.scheduledFor,
          actionView: "checkins",
        });
      }
      notifs.sort((a, b) => new Date(b.time).getTime() - new Date(a.time).getTime());
      setNotifications(notifs);
      setHasCritical(notifs.some((n) => n.severity === "CRITICAL"));
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [user]);

  React.useEffect(() => {
    if (open) fetchNotifications();
  }, [open, fetchNotifications]);

  // Refresh every 15s when critical notifications exist, 60s otherwise
  React.useEffect(() => {
    if (!user || user.role === "SUPER_ADMIN") return;
    fetchNotifications();
    const interval = setInterval(fetchNotifications, hasCritical ? 15000 : 60000);
    return () => clearInterval(interval);
  }, [user, fetchNotifications, hasCritical]);

  const count = notifications.length;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          className="relative h-9 w-9 rounded-full hover:bg-muted/60"
          aria-label="Notifications"
        >
          <Bell className="h-[18px] w-[18px]" />
          {count > 0 && (
            <span className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground">
              {count > 9 ? "9+" : count}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="end">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Notifications</span>
          </div>
          {count > 0 && <Badge variant="secondary" className="text-[10px]">{count} new</Badge>}
        </div>
        <ScrollArea className="max-h-[360px]">
          {loading ? (
            <div className="py-8 text-center text-sm text-muted-foreground">Loading…</div>
          ) : notifications.length === 0 ? (
            <div className="py-10 text-center">
              <div className="inline-flex items-center justify-center h-10 w-10 rounded-full bg-primary/10 mb-2">
                <Sparkles className="h-5 w-5 text-primary" />
              </div>
              <p className="text-sm text-muted-foreground">All clear. No pending alerts.</p>
            </div>
          ) : (
            <div className="py-1">
              {notifications.map((n) => {
                const isCritical = n.severity === "CRITICAL";
                const isHigh = n.severity === "HIGH";
                return (
                  <button
                    key={n.id}
                    onClick={() => {
                      navigate(n.actionView, n.actionId ? { escalationId: n.actionId } : undefined);
                      setOpen(false);
                    }}
                    className="w-full flex items-start gap-3 px-4 py-2.5 hover:bg-muted/50 transition-colors text-left border-b border-border/50 last:border-0"
                  >
                    <div className={cn(
                      "flex items-center justify-center h-7 w-7 rounded-lg flex-shrink-0 mt-0.5",
                      n.type === "escalation" && isCritical && "bg-destructive/10",
                      n.type === "escalation" && isHigh && "risk-high",
                      n.type === "escalation" && !isCritical && !isHigh && "risk-medium",
                      n.type === "checkin" && "bg-primary/10",
                    )}>
                      {n.type === "escalation" ? (
                        <AlertTriangle className={cn("h-3.5 w-3.5", isCritical ? "text-destructive" : "text-foreground")} />
                      ) : (
                        <CheckSquare className="h-3.5 w-3.5 text-primary" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium leading-tight">{n.title}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.detail}</div>
                      <div className="text-[10px] text-muted-foreground mt-1">
                        {timeAgo(new Date(n.time))}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </ScrollArea>
        {notifications.length > 0 && (
          <div className="border-t border-border px-4 py-2">
            <button
              onClick={() => { navigate("escalations"); setOpen(false); }}
              className="w-full text-center text-xs text-primary hover:underline py-1"
            >
              View all escalations →
            </button>
          </div>
        )}
      </PopoverContent>
    </Popover>
  );
}

function timeAgo(date: Date): string {
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}
