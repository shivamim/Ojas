'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Globe,
  Server,
  FlaskConical,
  Monitor,
  FileText,
  Database,
  Code2,
  ArrowDown,
  Loader2,
  RefreshCw,
  Info,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { toast } from 'sonner';

// ─── Types ──────────────────────────────────────────────────────────────

interface ModeResolution {
  hospitalId: string;
  mode: string;
  source: 'hospital_profile' | 'global_env_fallback' | 'hardcoded_default';
}

// ─── Mode Config ────────────────────────────────────────────────────────

const MODE_CONFIG: Record<string, {
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
  border: string;
}> = {
  MANUAL_PORTAL: {
    label: 'Manual Portal',
    description: 'PM-JAY operations are performed manually through the government portal. No automated integration.',
    icon: <FileText className="w-6 h-6" />,
    color: 'text-gray-700',
    bg: 'bg-gray-50',
    border: 'border-gray-200',
  },
  STATE_API: {
    label: 'State API',
    description: 'Integrated with the State Health Agency (SHA) API for automated eligibility checks, pre-auth, and claims.',
    icon: <Globe className="w-6 h-6" />,
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
  },
  OFFICIAL_API: {
    label: 'Official API',
    description: 'Fully integrated with the official PM-JAY national API. Highest level of automation.',
    icon: <Server className="w-6 h-6" />,
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
  },
  SANDBOX: {
    label: 'Sandbox',
    description: 'Connected to the PM-JAY sandbox environment for testing and validation before production go-live.',
    icon: <FlaskConical className="w-6 h-6" />,
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
  },
  LOCAL: {
    label: 'Local / Development',
    description: 'Local development or mock mode. No real external API calls are made. For internal testing only.',
    icon: <Monitor className="w-6 h-6" />,
    color: 'text-sky-700',
    bg: 'bg-sky-50',
    border: 'border-sky-200',
  },
};

const SOURCE_CONFIG: Record<string, {
  label: string;
  description: string;
  icon: React.ReactNode;
  color: string;
  bg: string;
}> = {
  hospital_profile: {
    label: 'Hospital Profile',
    description: 'Mode was explicitly configured on this hospital\'s integration profile.',
    icon: <Database className="w-4 h-4" />,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
  },
  global_env_fallback: {
    label: 'Global Environment Fallback',
    description: 'No hospital-specific mode found. Falling back to the global PMJAY_PROVIDER_MODE env variable.',
    icon: <Code2 className="w-4 h-4" />,
    color: 'text-amber-600',
    bg: 'bg-amber-50',
  },
  hardcoded_default: {
    label: 'Hardcoded Default',
    description: 'Neither hospital profile nor env var specified a mode. Using the system default (MANUAL_PORTAL).',
    icon: <Info className="w-4 h-4" />,
    color: 'text-gray-600',
    bg: 'bg-gray-50',
  },
};

// ─── Resolution Flow ────────────────────────────────────────────────────

function ResolutionFlow({ source }: { source: string }) {
  const steps = [
    { label: 'Hospital Profile', active: source === 'hospital_profile' },
    { label: 'Env Variable', active: source === 'global_env_fallback' },
    { label: 'Default', active: source === 'hardcoded_default' },
  ];

  const activeIdx = steps.findIndex(s => s.active);

  return (
    <div className="flex flex-col items-center gap-0 py-3">
      {steps.map((step, idx) => (
        <div key={step.label} className="flex flex-col items-center">
          <div className="flex items-center gap-3">
            <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium transition-all ${
              step.active
                ? 'bg-emerald-600 text-white shadow-sm'
                : idx < activeIdx
                ? 'bg-emerald-100 text-emerald-600'
                : 'bg-gray-100 text-gray-400'
            }`}>
              <span className="w-5 h-5 rounded-full flex items-center justify-center text-[10px] border border-current">
                {step.active ? '✓' : idx + 1}
              </span>
              {step.label}
            </div>
            {step.active && idx < steps.length - 1 && (
              <div className="w-6 flex justify-center">
                <ArrowDown className="w-3.5 h-3.5 text-emerald-500" />
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────

export function PmjayModeDisplay({ hospitalId, hospitalName }: { hospitalId: string; hospitalName: string }) {
  const [resolution, setResolution] = useState<ModeResolution | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchMode = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/pmjay/resolve-mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hospitalId }),
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Failed to resolve PM-JAY mode');
        return;
      }
      const data = await res.json();
      setResolution(data);
    } catch {
      toast.error('Network error resolving PM-JAY mode');
    } finally {
      setLoading(false);
    }
  }, [hospitalId]);

  useEffect(() => {
    fetchMode();
  }, [fetchMode]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-40 w-full rounded-xl" />
        <Skeleton className="h-60 w-full rounded-xl" />
      </div>
    );
  }

  if (!resolution) {
    return (
      <Card className="border-red-200 bg-red-50/50">
        <CardContent className="py-10 text-center">
          <p className="text-sm text-red-700">Failed to resolve PM-JAY mode</p>
        </CardContent>
      </Card>
    );
  }

  const mode = MODE_CONFIG[resolution.mode] || MODE_CONFIG.MANUAL_PORTAL;
  const source = SOURCE_CONFIG[resolution.source] || SOURCE_CONFIG.hardcoded_default;

  return (
    <div className="space-y-4">
      {/* Mode Display Card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className={`shadow-sm border-2 ${mode.border}`}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base font-semibold">Resolved PM-JAY Mode</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchMode}
                className="text-xs text-muted-foreground hover:text-emerald-600"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1" />
                Re-resolve
              </Button>
            </div>
            <CardDescription>
              {hospitalName}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`rounded-xl ${mode.bg} border ${mode.border} p-5`}
>
              <div className="flex items-center gap-4">
                <div className={`p-3 rounded-xl bg-white shadow-sm ${mode.color}`}>
                  {mode.icon}
                </div>
                <div className="flex-1">
                  <h3 className={`text-lg font-bold ${mode.color}`}>{mode.label}</h3>
                  <Badge variant="outline" className="mt-1 text-[10px] font-mono">
                    {resolution.mode}
                  </Badge>
                </div>
              </div>
              <p className="text-sm text-muted-foreground mt-3">{mode.description}</p>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Resolution Source & Flow */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Resolution Path</CardTitle>
            <CardDescription>How the PM-JAY mode was determined</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            {/* Flow visualization */}
            <div className="flex justify-center">
              <ResolutionFlow source={resolution.source} />
            </div>

            <Separator />

            {/* Source detail */}
            <div className={`flex items-start gap-3 p-4 rounded-lg ${source.bg}`}>
              <div className={`p-2 rounded-lg bg-white shadow-sm ${source.color}`}>
                {source.icon}
              </div>
              <div className="flex-1">
                <h4 className={`text-sm font-semibold ${source.color}`}>{source.label}</h4>
                <p className="text-xs text-muted-foreground mt-1">{source.description}</p>
              </div>
              <Badge variant="outline" className="text-[10px] font-mono shrink-0">
                {resolution.source}
              </Badge>
            </div>

            <Separator />

            {/* Architecture Note */}
            <div className="p-4 rounded-lg bg-muted/50 border">
              <div className="flex items-start gap-2">
                <Info className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />
                <div className="text-xs text-muted-foreground leading-relaxed">
                  <p className="font-medium text-foreground/80 mb-1">Architecture Note</p>
                  <p>
                    PM-JAY mode resolution follows a <strong>cascading priority</strong>: the hospital's integration
                    profile takes precedence over the global environment variable, which in turn takes precedence over
                    the hardcoded default. This ensures that each hospital can operate with its own integration mode
                    without affecting others, while still allowing a system-wide fallback.
                  </p>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
