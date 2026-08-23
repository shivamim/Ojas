'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import {
  Globe,
  Server,
  FlaskConical,
  Monitor,
  FileText,
  RefreshCw,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Clock,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';

// ─── Types ──────────────────────────────────────────────────────────────

interface Hospital {
  id: string;
  code: string;
  name: string;
  adminEmail: string;
}

interface ModeResolution {
  hospitalId: string;
  mode: string;
  source: string;
}

interface HospitalModeRow extends Hospital {
 modeResolution?: ModeResolution;
}

// ─── Helpers ────────────────────────────────────────────────────────────

const MODE_LABELS: Record<string, string> = {
  MANUAL_PORTAL: 'Manual Portal',
  STATE_API: 'State API',
  OFFICIAL_API: 'Official API',
  SANDBOX: 'Sandbox',
  LOCAL: 'Local / Dev',
};

const SOURCE_LABELS: Record<string, string> = {
  hospital_profile: 'Profile',
  global_env_fallback: 'Env Fallback',
  hardcoded_default: 'Default',
};

function ModeBadge({ mode }: { mode: string }) {
  const config: Record<string, { className: string; icon: React.ReactNode }> = {
    MANUAL_PORTAL: {
      className: 'bg-gray-100 text-gray-700 border-gray-200',
      icon: <FileText className="w-3 h-3" />,
    },
    STATE_API: {
      className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: <Globe className="w-3 h-3" />,
    },
    OFFICIAL_API: {
      className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      icon: <Server className="w-3 h-3" />,
    },
    SANDBOX: {
      className: 'bg-amber-50 text-amber-700 border-amber-200',
      icon: <FlaskConical className="w-3 h-3" />,
    },
    LOCAL: {
      className: 'bg-sky-50 text-sky-700 border-sky-200',
      icon: <Monitor className="w-3 h-3" />,
    },
  };

  const c = config[mode] || config.MANUAL_PORTAL;
  return (
    <Badge variant="outline" className={`${c.className} gap-1 text-[11px] font-medium`}>
      {c.icon}
      {MODE_LABELS[mode] || mode}
    </Badge>
  );
}

function SourceBadge({ source }: { source: string }) {
  const config: Record<string, string> = {
    hospital_profile: 'bg-emerald-50 text-emerald-600 border-emerald-200',
    global_env_fallback: 'bg-amber-50 text-amber-600 border-amber-200',
    hardcoded_default: 'bg-gray-100 text-gray-500 border-gray-200',
  };

  return (
    <Badge variant="outline" className={`${config[source] || ''} text-[10px]`}>
      {SOURCE_LABELS[source] || source}
    </Badge>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────

export function MultiHospitalView() {
  const [hospitals, setHospitals] = useState<HospitalModeRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [resolving, setResolving] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Seed to get hospitals
      const seedRes = await fetch('/api/seed', { method: 'POST' });
      const seedData = await seedRes.json();

      if (!seedData.success || !seedData.hospitals) {
        toast.error('Failed to load hospitals');
        return;
      }

      const hospList: HospitalModeRow[] = seedData.hospitals.map((h: Hospital) => ({ ...h }));
      setHospitals(hospList);

      // Resolve mode for each hospital
      setResolving(true);
      const promises = hospList.map(async (h) => {
        try {
          const res = await fetch('/api/pmjay/resolve-mode', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ hospitalId: h.id }),
          });
          const data = await res.json();
          return { ...h, modeResolution: data };
        } catch {
          return h;
        }
      });

      const resolved = await Promise.all(promises);
      setHospitals(resolved);
    } catch {
      toast.error('Failed to load multi-hospital data');
    } finally {
      setLoading(false);
      setResolving(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const uniqueModes = [...new Set(hospitals.map(h => h.modeResolution?.mode).filter(Boolean))];

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-80 w-full rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Summary Banner */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="shadow-sm border-emerald-100">
          <CardContent className="py-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-emerald-100">
                  <Globe className="w-5 h-5 text-emerald-600" />
                </div>
                <div>
                  <p className="text-sm font-semibold text-foreground">Multi-Hospital Overview</p>
                  <p className="text-xs text-muted-foreground">
                    {hospitals.length} hospitals &middot; {uniqueModes.length} distinct PM-JAY mode{uniqueModes.length !== 1 ? 's' : ''}
                  </p>
                </div>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={fetchData}
                disabled={loading || resolving}
                className="text-xs border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
              >
                {resolving ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5 mr-1.5" />}
                Refresh
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Table */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <CardTitle className="text-base font-semibold">Hospital PM-JAY Modes</CardTitle>
            <CardDescription>
              Each hospital can have its own PM-JAY provider mode, demonstrating tenant-level isolation.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {/* Desktop Table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-xs font-semibold">Hospital</TableHead>
                    <TableHead className="text-xs font-semibold">Code</TableHead>
                    <TableHead className="text-xs font-semibold">PM-JAY Mode</TableHead>
                    <TableHead className="text-xs font-semibold">Source</TableHead>
                    <TableHead className="text-xs font-semibold">Admin</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {hospitals.map((h, idx) => (
                    <TableRow key={h.id} className={idx % 2 === 0 ? 'bg-white' : 'bg-muted/10'}>
                      <TableCell className="font-medium text-sm">{h.name}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-mono text-[11px]">{h.code}</Badge>
                      </TableCell>
                      <TableCell>
                        {h.modeResolution?.mode ? (
                          <ModeBadge mode={h.modeResolution.mode} />
                        ) : (
                          <Badge variant="secondary" className="text-[11px] text-muted-foreground">
                            <HelpCircle className="w-3 h-3 mr-1" />Unresolved
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        {h.modeResolution?.source && (
                          <SourceBadge source={h.modeResolution.source} />
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{h.adminEmail}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y">
              {hospitals.map(h => (
                <div key={h.id} className="p-4 space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-medium">{h.name}</p>
                    <Badge variant="secondary" className="font-mono text-[10px]">{h.code}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">Mode:</span>
                    {h.modeResolution?.mode ? (
                      <ModeBadge mode={h.modeResolution.mode} />
                    ) : (
                      <Badge variant="secondary" className="text-[11px] text-muted-foreground">Unresolved</Badge>
                    )}
                    {h.modeResolution?.source && <SourceBadge source={h.modeResolution.source} />}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Highlight Card */}
      {uniqueModes.length > 1 && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
        >
          <Card className="shadow-sm border-amber-100 bg-amber-50/30">
            <CardContent className="py-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
                <div className="text-xs text-muted-foreground leading-relaxed">
                  <p className="font-medium text-amber-800 mb-1">Mixed Modes Detected</p>
                  <p>
                    Hospitals in this system are configured with different PM-JAY provider modes.
                    This is intentional &mdash; each hospital operates independently with its own
                    integration profile. The Go-Live Checklist for each hospital reflects its
                    specific readiness requirements based on its mode.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )}
    </div>
  );
}
