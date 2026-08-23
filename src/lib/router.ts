// Ojas — tiny client-side view router based on ?view= query param.
// Only the / route is exposed to the user, so we use query params for
// "navigation" within the SPA.
"use client";

import * as React from "react";

export type View =
  | "landing" | "pricing" | "login" | "accept-invite" | "forgot"
  | "dashboard" | "patients" | "patient-detail" | "enroll"
  | "escalations" | "timeline" | "reports" | "settings" | "billing"
  | "superadmin" | "superadmin-hospitals" | "superadmin-users" | "superadmin-audit" | "superadmin-ai-usage"
  | "ai-usage" | "messages" | "checkins" | "team" | "discharge-summary" | "productivity"
  | "satisfaction" | "readmission-analytics" | "my-workload" | "benchmark"
  | "performance-review" | "risk-summary" | "pathways" | "medication-adherence"
  | "medication-alerts" | "checklist" | "terms" | "privacy"
  | "coordinator-success" | "nabh-binder" | "nabh-dashboard" | "pilot-tracker"
  | "dpdp-lite" | "hms-import" | "timeline-share" | "family-updates"
  | "recovery-trends" | "audit-log" | "go-live"
  | "integrations" | "security" | "documentation" | "docs" | "changelog" | "architecture" | "compliance" | "pilot-metrics" | "api-reference" | "status";

export interface RouteState {
  view: View;
  patientId?: string;
  escalationId?: string;
  token?: string;
  [key: string]: string | undefined;
}

function parseHash(): RouteState {
  const params = new URLSearchParams(window.location.search);
  const view = (params.get("view") as View) || "landing";
  return {
    view,
    patientId: params.get("patientId") || undefined,
    escalationId: params.get("escalationId") || undefined,
    token: params.get("token") || undefined,
  };
}

export function useRoute() {
  const [route, setRoute] = React.useState<RouteState>({ view: "landing" });
  React.useEffect(() => {
    setRoute(parseHash());
    const onPop = () => setRoute(parseHash());
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  return route;
}

export function navigate(view: View, params?: Record<string, string>) {
  const sp = new URLSearchParams({ view, ...(params || {}) });
  const url = `/?${sp.toString()}`;
  window.history.pushState({}, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
}

export function navigateUrl(url: string) {
  window.history.pushState({}, "", url);
  window.dispatchEvent(new PopStateEvent("popstate"));
}
