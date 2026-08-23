"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { Activity, ShieldCheck, Layers, ScrollText, Lock } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useAuth } from "@/lib/auth-context";
import { GoLiveChecklist } from "@/components/go-live/go-live-checklist";
import { PmjayModeDisplay } from "@/components/go-live/pmjay-mode-display";
import { MultiHospitalView } from "@/components/go-live/multi-hospital-view";
import { AuditLogView } from "@/components/go-live/audit-log-view";
import { Card, CardContent } from "@/components/ui/card";

function AccessDeniedCard({ title, description }: { title: string; description: string }) {
  return (
    <Card className="border-amber-500/40 bg-amber-500/5">
      <CardContent className="p-6 flex items-start gap-3">
        <Lock className="h-5 w-5 text-amber-600 mt-0.5 flex-shrink-0" />
        <div>
          <p className="font-semibold text-sm">{title}</p>
          <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Go-Live / Integration Profile Admin.
 *
 * This is the dedicated administration area for the hospital integration
 * profile, PM-JAY mode, multi-hospital readiness, and the audit log of every
 * integration-profile field change. Hospital Admin / Super Admin only.
 *
 * NOTE: This page is deliberately NOT the root. The root renders the product
 * landing → login → dashboard flow. This admin surface lives behind the
 * authenticated AppShell at ?view=go-live (also linked from Settings).
 */
export function GoLivePage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = React.useState("checklist");

  // Hospital Admin + Super Admin only. Coordinators/Doctors get AccessDenied.
  const isAdmin = user?.role === "HOSPITAL_ADMIN" || user?.role === "SUPER_ADMIN";

  if (!isAdmin) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Integrations &amp; Go-Live</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Integration profile administration for hospital administrators.
          </p>
        </div>
        <AccessDeniedCard
          title="Administrator access required"
          description="Only Hospital Admins and Super Admins can manage the integration profile. Contact your hospital administrator if you need access."
        />
      </div>
    );
  }

  const hospitalId = user?.hospitalId ?? "";
  const hospitalName = user?.name ? `${user.name}'s hospital` : "Your hospital";

  return (
    <div className="space-y-6">
      {/* Heading */}
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2 text-eyebrow text-primary mb-1">
            <ShieldCheck className="h-3.5 w-3.5" />
            INTEGRATION PROFILE ADMIN
          </div>
          <h1 className="text-2xl font-bold tracking-tight">Integrations &amp; Go-Live</h1>
          <p className="text-muted-foreground text-sm mt-1 max-w-2xl">
            Hospital-specific PM-JAY mode, ABDM/NHA readiness, NHCX participant code, and the
            full audit trail of every integration-profile change. Readiness is never faked — each
            field is verified and timestamped.
          </p>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground bg-muted/40 border rounded-md px-3 py-2">
          <Lock className="h-3.5 w-3.5" />
          Hospital-scoped · audited
        </div>
      </div>

      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6 bg-emerald-50/60 dark:bg-emerald-950/20 p-1 flex flex-wrap h-auto">
            <TabsTrigger
              value="checklist"
              className="data-[state=active]:bg-background data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400 data-[state=active]:shadow-sm"
            >
              <Activity className="w-3.5 h-3.5 mr-1.5" />
              <span className="hidden sm:inline">Go-Live Checklist</span>
              <span className="sm:hidden">Checklist</span>
            </TabsTrigger>
            <TabsTrigger
              value="pmjay"
              className="data-[state=active]:bg-background data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400 data-[state=active]:shadow-sm"
            >
              <ShieldCheck className="w-3.5 h-3.5 mr-1.5" />
              <span className="hidden sm:inline">PM-JAY Mode</span>
              <span className="sm:hidden">Mode</span>
            </TabsTrigger>
            {user?.role === "SUPER_ADMIN" && (
              <TabsTrigger
                value="multi"
                className="data-[state=active]:bg-background data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400 data-[state=active]:shadow-sm"
              >
                <Layers className="w-3.5 h-3.5 mr-1.5" />
                <span className="hidden sm:inline">Multi-Hospital</span>
                <span className="sm:hidden">Multi</span>
              </TabsTrigger>
            )}
            <TabsTrigger
              value="audit"
              className="data-[state=active]:bg-background data-[state=active]:text-emerald-700 dark:data-[state=active]:text-emerald-400 data-[state=active]:shadow-sm"
            >
              <ScrollText className="w-3.5 h-3.5 mr-1.5" />
              <span className="hidden sm:inline">Audit Log</span>
              <span className="sm:hidden">Audit</span>
            </TabsTrigger>
          </TabsList>

          <TabsContent value="checklist">
            <GoLiveChecklist hospitalId={hospitalId} hospitalName={hospitalName} />
          </TabsContent>

          <TabsContent value="pmjay">
            <PmjayModeDisplay hospitalId={hospitalId} hospitalName={hospitalName} />
          </TabsContent>

          {user?.role === "SUPER_ADMIN" && (
            <TabsContent value="multi">
              <MultiHospitalView />
            </TabsContent>
          )}

          <TabsContent value="audit">
            <AuditLogView hospitalId={hospitalId} />
          </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}
