"use client";

import * as React from "react";
import { OJAS_BRAND } from "@/lib/brand";
import { navigate } from "@/lib/router";
import { Button } from "@/components/ui/button";
import { HeartPulse, RefreshCw, LayoutDashboard, Mail } from "lucide-react";

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log to console in development for debugging
    console.error("[Ojas ErrorBoundary]", error, errorInfo);
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  handleGoToDashboard = () => {
    this.setState({ hasError: false, error: null });
    navigate("dashboard");
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen flex items-center justify-center p-6 bg-background">
          <div className="max-w-md w-full text-center space-y-6">
            {/* Brand mark */}
            <div className="flex justify-center">
              <div className="flex items-center justify-center h-14 w-14 rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-lg">
                <HeartPulse className="h-7 w-7" />
              </div>
            </div>

            {/* Error message */}
            <div className="space-y-2">
              <h1 className="text-2xl font-semibold tracking-tight text-foreground">
                Something went wrong
              </h1>
              <p className="text-muted-foreground text-sm leading-relaxed">
                An unexpected error occurred. We apologise for the inconvenience.
                Your data is safe — you can try again or return to the dashboard.
              </p>
            </div>

            {/* Error details (development only) */}
            {this.state.error && process.env.NODE_ENV === "development" && (
              <div className="text-left p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                <p className="text-xs font-mono text-destructive break-all">
                  {this.state.error.message}
                </p>
              </div>
            )}

            {/* Actions */}
            <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
              <Button onClick={this.handleReset} className="w-full sm:w-auto">
                <RefreshCw className="h-4 w-4 mr-2" />
                Try again
              </Button>
              <Button
                variant="outline"
                onClick={this.handleGoToDashboard}
                className="w-full sm:w-auto"
              >
                <LayoutDashboard className="h-4 w-4 mr-2" />
                Go to dashboard
              </Button>
            </div>

            {/* Report link */}
            <div className="pt-2">
              <a
                href={`mailto:${OJAS_BRAND.email}?subject=Ojas Error Report&body=${encodeURIComponent(
                  `Error: ${this.state.error?.message || "Unknown error"}\n\nTimestamp: ${new Date().toISOString()}\n\nPlease describe what you were doing when this error occurred:\n`
                )}`}
                className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-primary transition-colors"
              >
                <Mail className="h-3 w-3" />
                Report this issue
              </a>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
