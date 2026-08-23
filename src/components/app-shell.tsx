"use client";

// Ojas — authenticated app shell. Sidebar nav + topbar + footer wrapping every
// signed-in view. Visual elevation pass: grouped nav with section labels, an
// animated active rail, brand-tinted hover lift, a scroll-aware topbar, and a
// more considered footer. No prop/type/API/route changes — restyle + re-compose only.

import * as React from "react";
import { useAuth } from "@/lib/auth-context";
import { navigate, type View } from "@/lib/router";
import { OJAS_BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { NotificationsBell } from "@/components/notifications-bell";
import { CommandHint } from "@/components/command-hint";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import {
  LayoutDashboard, Users, UserPlus, AlertTriangle, Clock,
  FileBarChart, Settings, CreditCard, Shield, Bot, Sparkles,
  LogOut, Menu, X, HeartPulse, MessageSquare, CheckSquare,
  Gauge, Star, TrendingDown, ClipboardList, BarChart3, Award,
  ShieldAlert, GitBranch, Pill, BellRing, Trophy, BookCheck, FlaskConical,
  UsersRound, Upload, FileLock2, LineChart, ShieldCheck, ScrollText, ClipboardCheck,
} from "lucide-react";

interface NavItem { view: View; label: string; icon: React.ComponentType<{ className?: string }>; roles?: string[]; }

const NAV: NavItem[] = [
  { view: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { view: "my-workload", label: "My worklist", icon: ClipboardList, roles: ["HOSPITAL_ADMIN", "COORDINATOR", "DOCTOR"] },
  { view: "risk-summary", label: "Risk summary", icon: ShieldAlert, roles: ["HOSPITAL_ADMIN", "COORDINATOR"] },
  { view: "medication-adherence", label: "Med adherence", icon: Pill, roles: ["HOSPITAL_ADMIN", "COORDINATOR"] },
  { view: "medication-alerts", label: "Med alerts", icon: BellRing, roles: ["HOSPITAL_ADMIN", "COORDINATOR"] },
  { view: "patients", label: "Patients", icon: Users, roles: ["HOSPITAL_ADMIN", "COORDINATOR", "DOCTOR"] },
  { view: "enroll", label: "Enroll patient", icon: UserPlus, roles: ["HOSPITAL_ADMIN", "COORDINATOR", "DOCTOR"] },
  { view: "checkins", label: "Check-ins", icon: CheckSquare, roles: ["HOSPITAL_ADMIN", "COORDINATOR", "DOCTOR"] },
  { view: "escalations", label: "Escalations", icon: AlertTriangle, roles: ["HOSPITAL_ADMIN", "COORDINATOR", "DOCTOR"] },
  { view: "timeline", label: "Timeline", icon: Clock, roles: ["HOSPITAL_ADMIN", "COORDINATOR", "DOCTOR"] },
  { view: "reports", label: "Reports", icon: FileBarChart, roles: ["HOSPITAL_ADMIN", "COORDINATOR"] },
  { view: "team", label: "Team workload", icon: Users, roles: ["HOSPITAL_ADMIN"] },
  { view: "productivity", label: "Productivity", icon: Gauge, roles: ["HOSPITAL_ADMIN"] },
  { view: "performance-review", label: "Performance review", icon: Award, roles: ["HOSPITAL_ADMIN"] },
  { view: "satisfaction", label: "Satisfaction", icon: Star, roles: ["HOSPITAL_ADMIN"] },
  { view: "readmission-analytics", label: "Readmissions", icon: TrendingDown, roles: ["HOSPITAL_ADMIN"] },
  { view: "recovery-trends", label: "Recovery trends", icon: LineChart, roles: ["HOSPITAL_ADMIN", "COORDINATOR"] },
  { view: "coordinator-success", label: "Coordinator success", icon: Trophy, roles: ["HOSPITAL_ADMIN", "COORDINATOR"] },
  { view: "pilot-tracker", label: "Pilot tracker", icon: FlaskConical, roles: ["HOSPITAL_ADMIN"] },
  { view: "benchmark", label: "Benchmarking", icon: BarChart3, roles: ["HOSPITAL_ADMIN"] },
  { view: "ai-usage", label: "AI usage", icon: Bot, roles: ["HOSPITAL_ADMIN"] },
  { view: "billing", label: "Billing", icon: CreditCard, roles: ["HOSPITAL_ADMIN"] },
  { view: "nabh-binder", label: "NABH binder", icon: BookCheck, roles: ["HOSPITAL_ADMIN"] },
  { view: "nabh-dashboard", label: "NABH dashboard", icon: ClipboardCheck, roles: ["HOSPITAL_ADMIN"] },
  { view: "dpdp-lite", label: "DPDP Lite", icon: FileLock2, roles: ["HOSPITAL_ADMIN"] },
  { view: "audit-log", label: "Audit log", icon: ScrollText, roles: ["HOSPITAL_ADMIN", "COORDINATOR"] },
  { view: "family-updates", label: "Family updates", icon: UsersRound, roles: ["HOSPITAL_ADMIN", "COORDINATOR"] },
  { view: "hms-import", label: "HMS import", icon: Upload, roles: ["HOSPITAL_ADMIN"] },
  { view: "settings", label: "Settings", icon: Settings, roles: ["HOSPITAL_ADMIN"] },
  { view: "pathways", label: "Pathways", icon: GitBranch, roles: ["HOSPITAL_ADMIN"] },
  { view: "go-live", label: "Integrations / Go-Live", icon: ShieldCheck, roles: ["HOSPITAL_ADMIN", "SUPER_ADMIN"] },
];

const SUPERADMIN_NAV: NavItem[] = [
  { view: "superadmin-hospitals", label: "Hospitals", icon: Shield },
  { view: "superadmin-users", label: "Users", icon: Users },
  { view: "superadmin-audit", label: "Audit logs", icon: FileBarChart },
  { view: "superadmin-ai-usage", label: "AI usage", icon: Bot },
];

// Group non-superadmin nav into labeled sections for scannability. Pure
// presentation — the NAV data structure above is unchanged.
const SECTION_ORDER: { id: string; label: string; views: View[] }[] = [
  { id: "overview", label: "Overview", views: ["dashboard"] },
  {
    id: "care", label: "Care delivery",
    views: ["my-workload", "risk-summary", "medication-adherence", "medication-alerts", "patients", "enroll", "checkins", "escalations", "timeline", "family-updates"],
  },
  {
    id: "insights", label: "Insights & reports",
    views: ["reports", "team", "productivity", "performance-review", "satisfaction", "readmission-analytics", "recovery-trends", "coordinator-success", "pilot-tracker", "benchmark", "ai-usage"],
  },
  {
    id: "compliance", label: "Compliance",
    views: ["nabh-binder", "nabh-dashboard", "dpdp-lite", "audit-log"],
  },
  {
    id: "admin", label: "Administration",
    views: ["billing", "hms-import", "pathways", "settings", "go-live"],
  },
];

function groupNav(nav: NavItem[]): { label: string; items: NavItem[] }[] {
  const byView = new Map(nav.map((n) => [n.view, n]));
  return SECTION_ORDER.map((s) => ({
    label: s.label,
    items: s.views.map((v) => byView.get(v)).filter((n): n is NavItem => !!n),
  })).filter((g) => g.items.length > 0);
}

// Hook: is the window scrolled past a threshold? Used for topbar elevation.
function useScrolled(threshold = 8) {
  const [scrolled, setScrolled] = React.useState(false);
  React.useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > threshold);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, [threshold]);
  return scrolled;
}

// Current view from the URL query — used to label the topbar for orientation.
function useCurrentView(): string | null {
  const [view, setView] = React.useState<string | null>(null);
  React.useEffect(() => {
    const read = () => {
      const params = new URLSearchParams(window.location.search);
      setView(params.get("view"));
    };
    read();
    window.addEventListener("popstate", read);
    return () => window.removeEventListener("popstate", read);
  }, []);
  return view;
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = React.useState(false);
  const isSuperadmin = user?.role === "SUPER_ADMIN";
  const nav = isSuperadmin ? SUPERADMIN_NAV : NAV.filter((n) => !n.roles || (user && n.roles.includes(user.role)));

  return (
    <div className="app-shell aurora-bg">
      {/* Sidebar (desktop) */}
      <aside className="hidden md:flex flex-col w-64 border-r border-sidebar-border bg-sidebar/80 backdrop-blur-xl sticky top-0 h-screen">
        <SidebarContent nav={nav} user={user} onLogout={logout} isSuperadmin={isSuperadmin} />
      </aside>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div className="md:hidden fixed inset-0 z-50 flex">
          <div
            className="absolute inset-0 bg-foreground/40 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="relative flex flex-col w-[82%] max-w-xs bg-sidebar border-r border-sidebar-border shadow-2xl animate-in slide-in-from-left duration-300">
            <button
              className="absolute top-4 right-4 p-1.5 rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground transition-colors"
              onClick={() => setMobileOpen(false)}
              aria-label="Close menu"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent nav={nav} user={user} onLogout={logout} isSuperadmin={isSuperadmin} onNavigate={() => setMobileOpen(false)} />
          </aside>
        </div>
      )}

      <div className="flex-1 flex flex-col min-w-0">
        {/* Topbar (desktop) — orientation label + notifications + identity */}
        <DesktopTopbar user={user} isSuperadmin={isSuperadmin} />

        {/* Topbar (mobile) */}
        <header className="md:hidden sticky top-0 z-40 flex items-center justify-between px-4 h-14 border-b border-border bg-background/85 backdrop-blur-xl">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open menu"
            className="p-2 -ml-2 rounded-md hover:bg-accent/50 transition-colors"
          >
            <Menu className="h-5 w-5" />
          </button>
          <BrandMark small />
          <NotificationsBell />
        </header>

        <main id="main-content" className="flex-1 p-4 md:p-8 max-w-[1400px] w-full mx-auto">
          {children}
        </main>

        <AppFooter />
      </div>
    </div>
  );
}

function DesktopTopbar({ user, isSuperadmin }: { user: { name: string; role: string } | null; isSuperadmin: boolean }) {
  const scrolled = useScrolled(8);
  const view = useCurrentView();
  const label = view
    ? isSuperadmin
      ? view.replace("superadmin-", "").replace("-", " ")
      : view.replace(/-/g, " ")
    : "Dashboard";
  return (
    <header
      className={cn(
        "hidden md:flex sticky top-0 z-30 items-center justify-between gap-2 px-6 h-14 border-b transition-all duration-300",
        scrolled
          ? "bg-background/85 backdrop-blur-xl border-border shadow-[0_1px_0_0_oklch(0.62_0.14_165/0.08)]"
          : "bg-background/60 backdrop-blur-md border-border/60"
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-[0.14em]">
          Ojas
        </span>
        <span className="text-muted-foreground/40">/</span>
        <span className="text-sm font-medium capitalize truncate">{label}</span>
      </div>
      <div className="flex items-center gap-2">
        <CommandHint />
        <NotificationsBell />
        <div className="w-px h-6 bg-border mx-1" />
        {user && (
          <div className="flex items-center gap-2 pr-1">
            <Avatar className="h-8 w-8 ring-1 ring-border">
              <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                {user.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="hidden lg:block leading-tight">
              <div className="text-xs font-medium">{user.name}</div>
              <div className="text-[10px] text-muted-foreground">
                {isSuperadmin ? "Super admin" : user.role.replace("_", " ").toLowerCase()}
              </div>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

function SidebarContent({ nav, user, onLogout, isSuperadmin, onNavigate }: {
  nav: NavItem[];
  user: { name: string; email: string; role: string; hospitalId?: string | null } | null;
  onLogout: () => void;
  isSuperadmin: boolean;
  onNavigate?: () => void;
}) {
  const groups = isSuperadmin ? [{ label: "Platform", items: nav }] : groupNav(nav);
  return (
    <>
      <div className="px-5 h-16 flex items-center border-b border-sidebar-border">
        <BrandMark />
      </div>
      <nav className="flex-1 overflow-y-auto fancy-scroll px-3 py-4">
        {groups.map((group, gi) => (
          <div key={group.label} className={cn(gi > 0 && "mt-5")}>
            <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
              {group.label}
            </div>
            <div className="space-y-0.5">
              {group.items.map((item) => (
                <NavLink key={item.view} item={item} onClick={onNavigate} />
              ))}
            </div>
          </div>
        ))}
        {!isSuperadmin && (
          <div className="pt-5 mt-5 border-t border-sidebar-border">
            <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-muted-foreground/80">
              Care console
            </div>
            <NavLink item={{ view: "messages", label: "Patient messages", icon: MessageSquare }} onClick={onNavigate} />
          </div>
        )}
      </nav>
      <div className="p-3 border-t border-sidebar-border">
        {user && (
          <div className="flex items-center gap-3 p-2 rounded-lg hover:bg-sidebar-accent transition-colors">
            <Avatar className="h-9 w-9 ring-1 ring-border">
              <AvatarFallback className="bg-primary/15 text-primary text-xs font-semibold">
                {user.name.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-medium truncate">{user.name}</div>
              <div className="text-[11px] text-muted-foreground truncate">{user.email}</div>
            </div>
          </div>
        )}
        <div className="mt-2 flex items-center gap-2">
          <Badge variant="outline" className="text-[10px] uppercase tracking-wider">
            {isSuperadmin ? "Super admin" : user?.role.replace("_", " ").toLowerCase()}
          </Badge>
          <Button variant="ghost" size="sm" className="ml-auto text-muted-foreground hover:text-destructive" onClick={onLogout}>
            <LogOut className="h-4 w-4 mr-1" /> Sign out
          </Button>
        </div>
      </div>
    </>
  );
}

function NavLink({ item, onClick }: { item: NavItem; onClick?: () => void }) {
  const [active, setActive] = React.useState(false);
  React.useEffect(() => {
    const check = () => {
      const params = new URLSearchParams(window.location.search);
      setActive(params.get("view") === item.view);
    };
    check();
    window.addEventListener("popstate", check);
    return () => window.removeEventListener("popstate", check);
  }, [item.view]);
  const Icon = item.icon;
  return (
    <button
      onClick={() => { navigate(item.view); onClick?.(); }}
      className={cn(
        "group relative w-full flex items-center gap-3 pl-3 pr-2.5 py-2 rounded-lg text-sm font-medium transition-all duration-200 text-left",
        active
          ? "bg-primary/10 text-primary elevate-1"
          : "text-sidebar-foreground/85 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
      )}
    >
      {/* Active rail — animates in from the left */}
      <span
        aria-hidden
        className={cn(
          "absolute left-0 top-1.5 bottom-1.5 w-[3px] rounded-full bg-primary transition-all duration-200",
          active ? "opacity-100 scale-y-100" : "opacity-0 scale-y-50"
        )}
      />
      <Icon className={cn("h-4 w-4 flex-shrink-0 transition-transform", !active && "group-hover:scale-110")} />
      <span className="truncate">{item.label}</span>
    </button>
  );
}

function BrandMark({ small }: { small?: boolean }) {
  return (
    <button onClick={() => navigate("landing")} className="flex items-center gap-2.5 group" aria-label="Ojas home">
      <div
        className={cn(
          "relative flex items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground glow-primary transition-transform duration-300 group-hover:scale-105",
          small ? "h-8 w-8" : "h-9 w-9"
        )}
      >
        <HeartPulse className={cn(small ? "h-4 w-4" : "h-5 w-5")} />
        {/* subtle inner ring for presence */}
        <span className="absolute inset-0 rounded-xl ring-1 ring-inset ring-white/20" aria-hidden />
      </div>
      <div className="text-left leading-none">
        <div className={cn("font-semibold tracking-tight", small ? "text-base" : "text-lg")}>
          Ojas
        </div>
        {!small && (
          <div className="text-[10px] text-muted-foreground uppercase tracking-[0.14em] mt-0.5">
            post-discharge care
          </div>
        )}
      </div>
    </button>
  );
}

export function AppFooter() {
  return (
    <footer className="border-t border-border bg-background/60 backdrop-blur-sm">
      <div className="max-w-[1400px] mx-auto px-4 md:px-8 py-8 grid grid-cols-1 md:grid-cols-3 gap-8 text-sm">
        <div>
          <div className="flex items-center gap-2 mb-3">
            <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-gradient-to-br from-primary to-primary/70 text-primary-foreground">
              <HeartPulse className="h-4 w-4" />
            </div>
            <span className="font-semibold tracking-tight">Ojas</span>
            <span className="text-[10px] text-muted-foreground uppercase tracking-[0.14em]">
              {OJAS_BRAND.tagline}
            </span>
          </div>
          <p className="text-muted-foreground text-xs leading-relaxed max-w-xs">
            AI-native, multi-tenant SaaS for hospital post-discharge care.
            Scheduled WhatsApp check-ins, AI-triaged risk, prioritized coordinator worklist.
          </p>
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-3">Contact</div>
          {/* Shared footer renders on every authenticated internal page — no
              founder name, no personal phone. Business inbox only. */}
          <div className="space-y-1.5 text-xs">
            <div className="text-muted-foreground">
              Email · <a href={`mailto:${OJAS_BRAND.email}`} className="text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded">{OJAS_BRAND.email}</a>
            </div>
            <div className="text-muted-foreground">{OJAS_BRAND.location}</div>
            <div className="text-muted-foreground pt-1 text-[10px] uppercase tracking-[0.14em]">
              For DPDPA grievances
            </div>
            <div className="text-muted-foreground">
              {OJAS_BRAND.grievanceOfficer.role}
            </div>
          </div>
        </div>
        <div>
          <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-3">Compliance</div>
          <div className="space-y-1.5 text-xs text-muted-foreground">
            <div className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-primary" />DPDP Rules 2025 — consent versioning &amp; 72-hour breach protocol</div>
            <div className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-primary" />PII encrypted at rest (AES-256-GCM)</div>
            <div className="flex items-center gap-2"><span className="h-1 w-1 rounded-full bg-primary" />NABH 6th-edition-aligned reporting</div>
            <div className="flex items-center gap-2 pt-1">
              <Sparkles className="h-3 w-3 text-primary" />
              <span>AI is decision support, not a diagnosis.</span>
            </div>
          </div>
          <div className="mt-4 pt-3 border-t border-border/60">
            <div className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground mb-2">Legal</div>
            <div className="flex items-center gap-4 text-xs">
              <button
                onClick={() => navigate("terms")}
                className="text-muted-foreground hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded"
              >
                Terms of Service
              </button>
              <button
                onClick={() => navigate("privacy")}
                className="text-muted-foreground hover:text-primary transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:rounded"
              >
                Privacy Policy
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="border-t border-border py-4 text-center text-[11px] text-muted-foreground">
        {/* No founder name in the shared copyright line — it renders on every
            internal dashboard screen. Plain business line only. */}
        © {new Date().getFullYear()} {OJAS_BRAND.name} · Built for Indian hospitals
      </div>
    </footer>
  );
}
