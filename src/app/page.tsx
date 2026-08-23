"use client";

import * as React from "react";
import { CommandPalette } from "@/components/command-palette";
import { AuthProvider, useAuth } from "@/lib/auth-context";
import { useRoute } from "@/lib/router";
import { ThemeToggle } from "@/components/theme-toggle";
import { LoginPageSkeleton, PublicPageSkeleton } from "@/components/page-skeletons";
import { ErrorBoundary } from "@/components/error-boundary";
import { OfflineBanner } from "@/components/offline-banner";

// ── Lazy-loaded page components ──────────────────────────────────────────────
// Only the landing + login pages are eagerly loaded (first paint). Every other
// page is code-split via React.lazy so the initial JS bundle stays small.

const LandingPage = React.lazy(() =>
  import("@/components/pages/landing").then((m) => ({ default: m.LandingPage }))
);
const PricingPage = React.lazy(() =>
  import("@/components/pages/pricing").then((m) => ({ default: m.PricingPage }))
);
const LoginPage = React.lazy(() =>
  import("@/components/pages/login").then((m) => ({ default: m.LoginPage }))
);
const AcceptInvitePage = React.lazy(() =>
  import("@/components/pages/accept-invite").then((m) => ({ default: m.AcceptInvitePage }))
);
const ForgotPasswordPage = React.lazy(() =>
  import("@/components/pages/forgot-password").then((m) => ({ default: m.ForgotPasswordPage }))
);
const AppShell = React.lazy(() =>
  import("@/components/app-shell").then((m) => ({ default: m.AppShell }))
);
const DashboardPage = React.lazy(() =>
  import("@/components/pages/dashboard").then((m) => ({ default: m.DashboardPage }))
);
const PatientsPage = React.lazy(() =>
  import("@/components/pages/patients").then((m) => ({ default: m.PatientsPage }))
);
const PatientDetailPage = React.lazy(() =>
  import("@/components/pages/patient-detail").then((m) => ({ default: m.PatientDetailPage }))
);
const EnrollPage = React.lazy(() =>
  import("@/components/pages/enroll").then((m) => ({ default: m.EnrollPage }))
);
const EscalationsPage = React.lazy(() =>
  import("@/components/pages/escalations").then((m) => ({ default: m.EscalationsPage }))
);
const TimelinePage = React.lazy(() =>
  import("@/components/pages/timeline").then((m) => ({ default: m.TimelinePage }))
);
const ReportsPage = React.lazy(() =>
  import("@/components/pages/reports").then((m) => ({ default: m.ReportsPage }))
);
const SettingsPage = React.lazy(() =>
  import("@/components/pages/settings").then((m) => ({ default: m.SettingsPage }))
);
const BillingPage = React.lazy(() =>
  import("@/components/pages/billing").then((m) => ({ default: m.BillingPage }))
);
const SuperadminPage = React.lazy(() =>
  import("@/components/pages/superadmin").then((m) => ({ default: m.SuperadminPage }))
);
const AiUsagePage = React.lazy(() =>
  import("@/components/pages/ai-usage").then((m) => ({ default: m.AiUsagePage }))
);
const CheckinsPage = React.lazy(() =>
  import("@/components/pages/checkins").then((m) => ({ default: m.CheckinsPage }))
);
const TeamWorkloadPage = React.lazy(() =>
  import("@/components/pages/team").then((m) => ({ default: m.TeamWorkloadPage }))
);
const DischargeSummaryPage = React.lazy(() =>
  import("@/components/pages/discharge-summary").then((m) => ({ default: m.DischargeSummaryPage }))
);
const ProductivityPage = React.lazy(() =>
  import("@/components/pages/productivity").then((m) => ({ default: m.ProductivityPage }))
);
const SatisfactionPage = React.lazy(() =>
  import("@/components/pages/satisfaction").then((m) => ({ default: m.SatisfactionPage }))
);
const ReadmissionAnalyticsPage = React.lazy(() =>
  import("@/components/pages/readmission-analytics").then((m) => ({ default: m.ReadmissionAnalyticsPage }))
);
const MyWorkloadPage = React.lazy(() =>
  import("@/components/pages/my-workload").then((m) => ({ default: m.MyWorkloadPage }))
);
const BenchmarkPage = React.lazy(() =>
  import("@/components/pages/benchmark").then((m) => ({ default: m.BenchmarkPage }))
);
const PerformanceReviewPage = React.lazy(() =>
  import("@/components/pages/performance-review").then((m) => ({ default: m.PerformanceReviewPage }))
);
const RiskSummaryPage = React.lazy(() =>
  import("@/components/pages/risk-summary").then((m) => ({ default: m.RiskSummaryPage }))
);
const PathwaysPage = React.lazy(() =>
  import("@/components/pages/pathways").then((m) => ({ default: m.PathwaysPage }))
);
const MedicationAdherencePage = React.lazy(() =>
  import("@/components/pages/medication-adherence").then((m) => ({ default: m.MedicationAdherencePage }))
);
const MedicationAlertsPage = React.lazy(() =>
  import("@/components/pages/medication-alerts").then((m) => ({ default: m.MedicationAlertsPage }))
);
const TermsPage = React.lazy(() =>
  import("@/components/pages/terms").then((m) => ({ default: m.TermsPage }))
);
const PrivacyPage = React.lazy(() =>
  import("@/components/pages/privacy").then((m) => ({ default: m.PrivacyPage }))
);
const CoordinatorSuccessPage = React.lazy(() =>
  import("@/components/pages/coordinator-success").then((m) => ({ default: m.CoordinatorSuccessPage }))
);
const NabhBinderPage = React.lazy(() =>
  import("@/components/pages/nabh-binder").then((m) => ({ default: m.NabhBinderPage }))
);
const NabhDashboardPage = React.lazy(() =>
  import("@/components/pages/nabh-dashboard").then((m) => ({ default: m.NabhDashboardPage }))
);
const PilotTrackerPage = React.lazy(() =>
  import("@/components/pages/pilot-tracker").then((m) => ({ default: m.PilotTrackerPage }))
);
const DpdpLitePage = React.lazy(() =>
  import("@/components/pages/dpdp-lite").then((m) => ({ default: m.DpdpLitePage }))
);
const HmsImportPage = React.lazy(() =>
  import("@/components/pages/hms-import").then((m) => ({ default: m.HmsImportPage }))
);
const TimelineSharePage = React.lazy(() =>
  import("@/components/pages/timeline-share").then((m) => ({ default: m.TimelineSharePage }))
);
const FamilyUpdatesPage = React.lazy(() =>
  import("@/components/pages/family-updates").then((m) => ({ default: m.FamilyUpdatesPage }))
);
const RecoveryTrendsPage = React.lazy(() =>
  import("@/components/pages/recovery-trends").then((m) => ({ default: m.RecoveryTrendsPage }))
);
// ── New production views (hardening / integration admin / docs) ──────────────
const IntegrationsPage = React.lazy(() =>
  import("@/components/pages/integrations").then((m) => ({ default: m.IntegrationsPage }))
);
const AuditLogPage = React.lazy(() =>
  import("@/components/pages/audit-log").then((m) => ({ default: m.AuditLogPage }))
);
const GoLivePage = React.lazy(() =>
  import("@/components/pages/go-live").then((m) => ({ default: m.GoLivePage }))
);
const PilotMetricsPage = React.lazy(() =>
  import("@/components/pages/pilot-metrics").then((m) => ({ default: m.PilotMetricsPage }))
);
// Public docs pages
const SecurityPage = React.lazy(() =>
  import("@/components/pages/security").then((m) => ({ default: m.SecurityPage }))
);
const DocumentationPage = React.lazy(() =>
  import("@/components/pages/documentation").then((m) => ({ default: m.DocumentationPage }))
);
const ChangelogPage = React.lazy(() =>
  import("@/components/pages/changelog").then((m) => ({ default: m.ChangelogPage }))
);
const CompliancePage = React.lazy(() =>
  import("@/components/pages/compliance").then((m) => ({ default: m.CompliancePage }))
);
const ArchitecturePage = React.lazy(() =>
  import("@/components/pages/architecture").then((m) => ({ default: m.ArchitecturePage }))
);
const ApiReferencePage = React.lazy(() =>
  import("@/components/pages/api-reference").then((m) => ({ default: m.ApiReferencePage }))
);
const StatusPage = React.lazy(() =>
  import("@/components/pages/status").then((m) => ({ default: m.StatusPage }))
);

// ── View classification ──────────────────────────────────────────────────────
const PUBLIC_VIEWS = new Set([
  "landing", "pricing", "terms", "privacy", "accept-invite", "forgot",
  "timeline-share", "integrations", "security", "documentation", "changelog",
  "compliance", "architecture", "api-reference", "status",
]);

const SUPERADMIN_VIEWS = new Set([
  "superadmin", "superadmin-hospitals", "superadmin-users",
  "superadmin-audit", "superadmin-ai-usage",
]);

// ── Suspense fallback ────────────────────────────────────────────────────────
function PageFallback() {
  return <PublicPageSkeleton />;
}

function Router() {
  const route = useRoute();
  const { user, loading } = useAuth();

  const page = (
    <React.Suspense fallback={<PageFallback />}>
      {/* Public views (no auth required) */}
      {route.view === "landing" && <LandingPage />}
      {route.view === "pricing" && <PricingPage />}
      {route.view === "terms" && <TermsPage />}
      {route.view === "privacy" && <PrivacyPage />}
      {route.view === "accept-invite" && <AcceptInvitePage token={route.token} />}
      {route.view === "forgot" && <ForgotPasswordPage />}
      {route.view === "timeline-share" && route.token && (
        <TimelineSharePage token={route.token} />
      )}
      {/* Public docs / status pages */}
      {route.view === "integrations" && <IntegrationsPage />}
      {route.view === "security" && <SecurityPage />}
      {route.view === "documentation" && <DocumentationPage />}
      {route.view === "changelog" && <ChangelogPage />}
      {route.view === "compliance" && <CompliancePage />}
      {route.view === "architecture" && <ArchitecturePage />}
      {route.view === "api-reference" && <ApiReferencePage />}
      {route.view === "status" && <StatusPage />}

      {/* Login view */}
      {route.view === "login" && (
        loading ? <LoginPageSkeleton /> :
        user ? <RedirectToApp role={user.role} /> :
        <LoginPage />
      )}

      {/* Auth-required views */}
      {!PUBLIC_VIEWS.has(route.view) && route.view !== "login" && (
        loading ? <PublicPageSkeleton /> :
        !user ? <LoginPage /> :
        SUPERADMIN_VIEWS.has(route.view) && user.role !== "SUPER_ADMIN" ? <AccessDenied /> : (
          <AppShell>
            {route.view === "dashboard" && <DashboardPage />}
            {route.view === "patients" && <PatientsPage />}
            {route.view === "patient-detail" && <PatientDetailPage patientId={route.patientId!} />}
            {route.view === "enroll" && <EnrollPage />}
            {route.view === "escalations" && <EscalationsPage escalationId={route.escalationId} />}
            {route.view === "timeline" && <TimelinePage />}
            {route.view === "reports" && <ReportsPage />}
            {route.view === "settings" && <SettingsPage />}
            {route.view === "billing" && <BillingPage />}
            {route.view === "superadmin" && <SuperadminPage initialView="hospitals" />}
            {route.view === "superadmin-hospitals" && <SuperadminPage initialView="hospitals" />}
            {route.view === "superadmin-users" && <SuperadminPage initialView="users" />}
            {route.view === "superadmin-audit" && <SuperadminPage initialView="audit" />}
            {route.view === "superadmin-ai-usage" && <SuperadminPage initialView="ai-usage" />}
            {route.view === "ai-usage" && <AiUsagePage />}
            {route.view === "checkins" && <CheckinsPage />}
            {route.view === "messages" && <TimelinePage />}
            {route.view === "team" && <TeamWorkloadPage />}
            {route.view === "productivity" && <ProductivityPage />}
            {route.view === "satisfaction" && <SatisfactionPage />}
            {route.view === "readmission-analytics" && <ReadmissionAnalyticsPage />}
            {route.view === "my-workload" && <MyWorkloadPage />}
            {route.view === "benchmark" && <BenchmarkPage />}
            {route.view === "performance-review" && <PerformanceReviewPage />}
            {route.view === "risk-summary" && <RiskSummaryPage />}
            {route.view === "pathways" && <PathwaysPage />}
            {route.view === "medication-adherence" && <MedicationAdherencePage />}
            {route.view === "medication-alerts" && <MedicationAlertsPage />}
            {route.view === "coordinator-success" && <CoordinatorSuccessPage />}
            {route.view === "nabh-binder" && <NabhBinderPage />}
            {route.view === "nabh-dashboard" && <NabhDashboardPage />}
            {route.view === "pilot-tracker" && <PilotTrackerPage />}
            {route.view === "pilot-metrics" && <PilotMetricsPage />}
            {route.view === "dpdp-lite" && <DpdpLitePage />}
            {route.view === "hms-import" && <HmsImportPage />}
            {route.view === "family-updates" && <FamilyUpdatesPage />}
            {route.view === "recovery-trends" && <RecoveryTrendsPage />}
            {route.view === "audit-log" && <AuditLogPage />}
            {route.view === "go-live" && <GoLivePage />}
            {route.view === "discharge-summary" && route.patientId && (
              <DischargeSummaryPage patientId={route.patientId} />
            )}
          </AppShell>
        )
      )}
    </React.Suspense>
  );

  return page;
}

function RedirectToApp({ role }: { role: string }) {
  React.useEffect(() => {
    const view = role === "SUPER_ADMIN" ? "superadmin" : "dashboard";
    const sp = new URLSearchParams({ view });
    window.history.replaceState({}, "", `/?${sp.toString()}`);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, [role]);
  return <PublicPageSkeleton />;
}

function AccessDenied() {
  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="text-center max-w-md">
        <h1 className="text-2xl font-semibold mb-2">Access denied</h1>
        <p className="text-muted-foreground">You don&apos;t have permission to view this page.</p>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <AuthProvider>
      <ErrorBoundary>
        <Router />
      </ErrorBoundary>
      <OfflineBanner />
      <CommandPalette />
      <ThemeToggle className="fixed bottom-4 right-4 z-50" />
    </AuthProvider>
  );
}
