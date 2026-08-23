// Ojas — Public timeline share view (P0.3 UI).
// Accessed via /?view=timeline-share&token=... — no auth required.
// Shows redacted timeline events for a patient (no PII).
"use client";

import * as React from "react";
import { MotionConfig, motion } from "framer-motion";
import { toast } from "sonner";
import {
  Activity, ShieldCheck, Clock, AlertCircle, Loader2,
  HeartPulse, Calendar, Stethoscope,
} from "lucide-react";

import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { OJAS_BRAND } from "@/lib/brand";
import { AppFooter } from "@/components/app-shell";

interface TimelineEvent {
  id: string;
  eventType: string;
  title: string;
  detail: string | null;
  occurredAt: string;
}

interface ShareData {
  token: string;
  audience: string;
  expiresAt: string;
  patient: {
    surgeryType: string;
    dayOfRecovery: number;
    dischargeDate: string;
    status: string;
    riskLevel: string | null;
  };
  events: TimelineEvent[];
}

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

const EVENT_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  ENROLLMENT: Calendar,
  STATUS_CHANGE: Activity,
  CHECKIN_SENT: Clock,
  CHECKIN_ANSWERED: Activity,
  ESCALATION: AlertCircle,
  ESCALATION_RESOLVED: HeartPulse,
  AI_TRIAGE: Stethoscope,
  MEDICATION_TAKEN: HeartPulse,
  MILESTONE_COMPLETED: Activity,
  FOLLOW_UP_COMPLETED: Calendar,
  FAMILY_UPDATE_QUEUED: Activity,
  FAMILY_MEMBER_REPORTED_CONCERN: AlertCircle,
};

export function TimelineSharePage({ token }: { token: string }) {
  const [data, setData] = React.useState<ShareData | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const r = await fetch(`/api/timeline/share/${token}`);
        if (r.status === 404) throw new Error("Share link not found");
        if (r.status === 410) throw new Error("This share link has expired");
        if (!r.ok) throw new Error("Failed to load timeline");
        const json = await r.json() as ShareData;
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Failed");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [token]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="min-h-screen flex flex-col bg-gradient-to-b from-background to-muted/30">
        {/* Top bar */}
        <header className="border-b bg-card/60 backdrop-blur-sm sticky top-0 z-10">
          <div className="max-w-4xl mx-auto px-4 py-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <HeartPulse className="h-5 w-5 text-primary" />
              <span className="font-semibold text-sm">{OJAS_BRAND.name}</span>
              <Badge variant="outline" className="text-xs ml-2">Shared timeline</Badge>
            </div>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-500" />
              <span className="hidden sm:inline">PII redacted · Read-only</span>
            </div>
          </div>
        </header>

        <main className="flex-1 max-w-4xl mx-auto w-full px-4 py-6 space-y-6">
          {loading && <LoadingSkeleton />}

          {error && (
            <Card>
              <CardContent className="p-8 text-center">
                <AlertCircle className="h-10 w-10 mx-auto mb-3 text-rose-500" />
                <div className="font-medium">{error}</div>
                <div className="text-xs text-muted-foreground mt-2">
                  Contact the hospital coordinator if you believe this is an error.
                </div>
              </CardContent>
            </Card>
          )}

          {data && (
            <>
              {/* Patient summary */}
              <motion.div variants={fadeUp} initial="hidden" animate="show">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-lg flex items-center gap-2">
                      <Activity className="h-5 w-5 text-primary" />
                      Recovery timeline
                    </CardTitle>
                    <CardDescription>
                      Day {data.patient.dayOfRecovery} of recovery · Status: {data.patient.status}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <div className="text-xs text-muted-foreground">Surgery</div>
                        <div className="font-medium text-sm mt-1">{data.patient.surgeryType}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Discharged</div>
                        <div className="font-medium text-sm mt-1">
                          {new Date(data.patient.dischargeDate).toLocaleDateString("en-IN")}
                        </div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Recovery day</div>
                        <div className="font-medium text-sm mt-1">{data.patient.dayOfRecovery}</div>
                      </div>
                      <div>
                        <div className="text-xs text-muted-foreground">Risk level</div>
                        <div className="font-medium text-sm mt-1">
                          {data.patient.riskLevel ? (
                            <Badge variant="outline" className={
                              data.patient.riskLevel === "CRITICAL" || data.patient.riskLevel === "HIGH"
                                ? "bg-rose-500/15 text-rose-700 border-rose-500/30"
                                : data.patient.riskLevel === "MEDIUM"
                                  ? "bg-amber-500/15 text-amber-700 border-amber-500/30"
                                  : "bg-emerald-500/15 text-emerald-700 border-emerald-500/30"
                            }>{data.patient.riskLevel}</Badge>
                          ) : "—"}
                        </div>
                      </div>
                    </div>
                    <div className="mt-4 text-xs text-muted-foreground flex items-center gap-2">
                      <Clock className="h-3.5 w-3.5" />
                      Link expires {new Date(data.expiresAt).toLocaleDateString("en-IN")}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>

              {/* Timeline events */}
              <motion.div variants={fadeUp} initial="hidden" animate="show">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Recent events ({data.events.length})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="space-y-3 max-h-[60vh] overflow-y-auto">
                      {data.events.map((e, idx) => {
                        const Icon = EVENT_ICONS[e.eventType] || Activity;
                        return (
                          <div key={e.id} className="flex gap-3">
                            <div className="flex flex-col items-center">
                              <div className="w-8 h-8 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0">
                                <Icon className="h-4 w-4 text-primary" />
                              </div>
                              {idx < data.events.length - 1 && (
                                <div className="w-px flex-1 bg-border mt-1" />
                              )}
                            </div>
                            <div className="flex-1 pb-3">
                              <div className="flex items-start justify-between gap-2 flex-wrap">
                                <div className="font-medium text-sm">{e.title}</div>
                                <div className="text-xs text-muted-foreground">
                                  {new Date(e.occurredAt).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}
                                </div>
                              </div>
                              {e.detail && (
                                <div className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">
                                  {e.detail}
                                </div>
                              )}
                              <div className="text-[10px] text-muted-foreground/70 mt-1 font-mono">
                                {e.eventType}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            </>
          )}
        </main>
        <AppFooter />
      </div>
    </MotionConfig>
  );
}

function LoadingSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-32" />
      <Skeleton className="h-96" />
    </div>
  );
}
