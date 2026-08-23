"use client";

import { motion } from "framer-motion";
import {
  CheckCircle2, ChevronRight, Sparkles,
} from "lucide-react";

import { navigate } from "@/lib/router";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

import type { PatientDetail } from "../types";
import { severityClass, ago } from "../helpers";

// ── Escalations tab ─────────────────────────────────────────────────────────
export function EscalationsTab({ patient }: { patient: PatientDetail }) {
  if (patient.escalations.length === 0) {
    return (
      <Card className="glass">
        <CardContent className="p-10 text-center">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-emerald-500/10 flex items-center justify-center mb-3">
            <CheckCircle2 className="h-7 w-7 text-emerald-600 dark:text-emerald-300" />
          </div>
          <h3 className="font-semibold">No escalations</h3>
          <p className="text-sm text-muted-foreground mt-1">
            This patient has not triggered any escalations.
          </p>
        </CardContent>
      </Card>
    );
  }
  return (
    <div className="space-y-3">
      {patient.escalations.map((e, i) => (
        <motion.div
          key={e.id}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.2, delay: Math.min(i * 0.05, 0.3) }}
        >
          <Card className="glass">
            <CardContent className="p-4">
              <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
                <div className="flex-1 min-w-0 space-y-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge className={severityClass(e.severity)}>{e.severity}</Badge>
                    <Badge variant="outline" className={
                      e.status === "RESOLVED"
                        ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30"
                        : e.status === "IN_PROGRESS"
                          ? "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30"
                          : "bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30"
                    }>
                      {e.status.replace("_", " ").toLowerCase()}
                    </Badge>
                    {e.aiProposed && (
                      <Badge variant="outline" className="bg-primary/10 text-primary border-primary/30">
                        <Sparkles className="h-3 w-3" /> AI-proposed
                      </Badge>
                    )}
                    <span className="text-xs text-muted-foreground">{ago(e.createdAt)}</span>
                  </div>
                  <p className="text-sm">{e.reason}</p>
                  {e.aiRationale && (
                    <p className="text-xs text-muted-foreground italic">
                      AI: {e.aiRationale}
                    </p>
                  )}
                  {e.resolution && (
                    <p className="text-xs">
                      <span className="text-muted-foreground">Resolution: </span>
                      {e.resolution}
                    </p>
                  )}
                </div>
                <Button
                  size="sm" variant="outline"
                  onClick={() => navigate("escalations", { escalationId: e.id })}
                >
                  Open <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      ))}
    </div>
  );
}
