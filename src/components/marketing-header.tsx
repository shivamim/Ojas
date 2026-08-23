"use client";

// Ojas — Shared marketing/auth page header.
// Single source of truth for navigation links, brand mark, and responsive
// mobile menu across all public-facing pages. Eliminates per-page header drift.

import * as React from "react";
import { navigate } from "@/lib/router";
import { OJAS_BRAND } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { HeartPulse, Menu, X } from "lucide-react";

interface MarketingHeaderProps {
  /** Override default nav items (e.g. landing has extra sections) */
  navItems?: Array<{ label: string; onClick: () => void }>;
  /** Show CTA button (default: true) */
  showCta?: boolean;
  /** CTA label (default: "Sign in") */
  ctaLabel?: string;
  /** CTA click handler */
  onCta?: () => void;
  /** Optional className for the header element */
  className?: string;
}

const DEFAULT_NAV = [
  { label: "Features", onClick: () => navigate("landing") },
  { label: "Status", onClick: () => navigate("status") },
  { label: "Integrations", onClick: () => navigate("integrations") },
  { label: "Security", onClick: () => navigate("security") },
  { label: "Architecture", onClick: () => navigate("architecture") },
  { label: "Compliance", onClick: () => navigate("compliance") },
  { label: "Pilot metrics", onClick: () => navigate("pilot-metrics") },
  { label: "API", onClick: () => navigate("api-reference") },
  { label: "Docs", onClick: () => navigate("docs") },
  { label: "Changelog", onClick: () => navigate("changelog") },
  { label: "Pricing", onClick: () => navigate("pricing") },
  { label: "Terms", onClick: () => navigate("terms") },
  { label: "Privacy", onClick: () => navigate("privacy") },
];

export function MarketingHeader({
  navItems = DEFAULT_NAV,
  showCta = true,
  ctaLabel = "Sign in",
  onCta = () => navigate("login"),
  className,
}: MarketingHeaderProps) {
  const [mobileOpen, setMobileOpen] = React.useState(false);

  return (
    <header
      className={cn(
        "sticky top-0 z-40 w-full border-b border-border/40 bg-background/80 backdrop-blur-xl",
        className
      )}
    >
      <div className="max-w-7xl mx-auto px-4 md:px-8 h-16 flex items-center justify-between">
        {/* Brand mark */}
        <button
          onClick={() => navigate("landing")}
          className="flex items-center gap-2.5 group"
          aria-label="Ojas home"
        >
          <div className="flex items-center justify-center h-8 w-8 rounded-xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground group-hover:scale-105 transition-transform">
            <HeartPulse className="h-4 w-4" />
          </div>
          <div className="text-left leading-none">
            <div className="font-semibold tracking-tight text-lg">Ojas</div>
          </div>
        </button>

        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-1">
          {navItems.map((item) => (
            <Button
              key={item.label}
              variant="ghost"
              size="sm"
              onClick={item.onClick}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {item.label}
            </Button>
          ))}
          {showCta && (
            <Button variant="outline" size="sm" onClick={onCta} className="ml-2">
              {ctaLabel}
            </Button>
          )}
        </nav>

        {/* Mobile hamburger */}
        <button
          className="md:hidden p-2 -mr-2 rounded-md hover:bg-accent/50 transition-colors"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Mobile dropdown */}
      {mobileOpen && (
        <div className="md:hidden border-t border-border/40 bg-background/95 backdrop-blur-xl animate-in slide-in-from-top duration-200">
          <nav className="max-w-7xl mx-auto px-4 py-4 space-y-1">
            {navItems.map((item) => (
              <button
                key={item.label}
                onClick={() => { item.onClick(); setMobileOpen(false); }}
                className="w-full text-left px-3 py-2 rounded-md text-sm text-muted-foreground hover:bg-accent hover:text-foreground transition-colors"
              >
                {item.label}
              </button>
            ))}
            {showCta && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => { onCta(); setMobileOpen(false); }}
                className="w-full mt-2"
              >
                {ctaLabel}
              </Button>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}
