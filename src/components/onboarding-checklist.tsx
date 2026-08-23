"use client";

// Ojas — Onboarding checklist card. Shows on the dashboard for hospital
// admins when setup is incomplete. Each item links to the relevant settings
// page. Dismissible per-session (not persisted — comes back on refresh to
// keep it visible until actually completed).

import * as React from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  CheckCircle2, Circle, ChevronRight, X, Sparkles, Loader2,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { api, useAuth } from "@/lib/auth-context";
import { navigate } from "@/lib/router";
import { cn } from "@/lib/utils";

interface ChecklistItem {
  id: string;
  title: string;
  description: string;
  done: boolean;
  actionView?: string;
  actionLabel?: string;
  category: string;
}

interface OnboardingData {
  checklist: Record<string, ChecklistItem[]>;
  completedCount: number;
  totalCount: number;
  completionRate: number;
  stats: { teamMembers: number; patients: number; pendingInvites: number; planTier: string };
}

export function OnboardingChecklist() {
  const { user } = useAuth();
  const [data, setData] = React.useState<OnboardingData | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [dismissed, setDismissed] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!user || user.role !== "HOSPITAL_ADMIN") { setLoading(false); return; }
    try {
      const r = await api<OnboardingData>("/api/onboarding");
      setData(r);
    } catch {
      // silent
    } finally {
      setLoading(false);
    }
  }, [user]);

  React.useEffect(() => { load(); }, [load]);

  // Don't show for non-admins, when loading, when dismissed, or when 100% done
  if (!user || user.role !== "HOSPITAL_ADMIN" || loading || dismissed || !data || data.completionRate >= 100) {
    return null;
  }

  const categories = Object.entries(data.checklist);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, height: 0 }}
        animate={{ opacity: 1, height: "auto" }}
        exit={{ opacity: 0, height: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="glass-strong border-primary/20 glow-primary">
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between">
              <div>
                <CardTitle className="flex items-center gap-2 text-base">
                  <Sparkles className="h-4 w-4 text-primary" />
                  Setup checklist
                </CardTitle>
                <CardDescription className="mt-1">
                  {data.completedCount} of {data.totalCount} complete · {data.completionRate}% done
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 -mt-1 -mr-1 text-muted-foreground hover:text-foreground"
                onClick={() => setDismissed(true)}
                aria-label="Dismiss checklist"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>
            <Progress value={data.completionRate} className="h-1.5 mt-2" />
          </CardHeader>
          <CardContent className="pt-0">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
              {categories.map(([category, items]) => (
                <div key={category} className="py-1">
                  <div className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1.5">
                    {category}
                  </div>
                  <div className="space-y-0.5">
                    {items.map((item) => (
                      <button
                        key={item.id}
                        onClick={() => item.actionView && navigate(item.actionView as never)}
                        className={cn(
                          "w-full flex items-center gap-2.5 py-1.5 px-2 -mx-2 rounded-lg text-left transition-colors group",
                          item.done
                            ? "opacity-60 hover:opacity-100"
                            : "hover:bg-primary/5"
                        )}
                      >
                        {item.done ? (
                          <CheckCircle2 className="h-4 w-4 text-primary flex-shrink-0" />
                        ) : (
                          <Circle className="h-4 w-4 text-muted-foreground/40 flex-shrink-0 group-hover:text-primary/60" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className={cn(
                            "text-xs font-medium leading-tight",
                            item.done && "line-through text-muted-foreground"
                          )}>
                            {item.title}
                          </div>
                          {!item.done && (
                            <div className="text-[10px] text-muted-foreground leading-tight mt-0.5 truncate">
                              {item.description}
                            </div>
                          )}
                        </div>
                        {!item.done && item.actionLabel && (
                          <span className="flex items-center gap-0.5 text-[10px] text-primary font-medium opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                            {item.actionLabel}
                            <ChevronRight className="h-3 w-3" />
                          </span>
                        )}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            {data.completionRate < 50 && (
              <div className="mt-3 pt-3 border-t border-border/50 text-center">
                <p className="text-[11px] text-muted-foreground">
                  Complete the checklist to get the most out of Ojas. Each step takes under a minute.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </motion.div>
    </AnimatePresence>
  );
}
