'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion } from 'framer-motion';
import { format } from 'date-fns';
import {
  ScrollText,
  RefreshCw,
  Database,
  Clock,
  FileEdit,
  User,
  Info,
  Loader2,
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

interface ProfileData {
  id: string;
  hospitalId: string;
  hfrId: string | null;
  pmjayFacilityId: string | null;
  shaCode: string | null;
  hemStatus: string | null;
  wasaAuditStatus: string | null;
  wasaAuditDate: string | null;
  safeToHostCertRef: string | null;
  certExpiryDate: string | null;
  nhcxParticipantCode: string | null;
  pmjayMode: string | null;
  readinessLastEval: string | null;
  updatedAt: string;
  createdAt: string;
}

interface FieldReadiness {
  field: string;
  label: string;
  status: string;
  value?: string | null;
  detail?: string;
}

interface OverallReadiness {
  level: string;
  fields: FieldReadiness[];
  lastEvaluated?: string | null;
}

// ─── Field Label Map ────────────────────────────────────────────────────

const FIELD_LABELS: Record<string, string> = {
  hfrId: 'HFR ID',
  pmjayFacilityId: 'PM-JAY Facility ID',
  shaCode: 'SHA Code',
  hemStatus: 'HEM Status',
  wasaAuditStatus: 'WASA Audit Status',
  wasaAuditDate: 'WASA Audit Date',
  safeToHostCertRef: 'Safe-to-Host Cert Ref',
  certExpiryDate: 'Certificate Expiry',
  nhcxParticipantCode: 'NHCX Participant Code',
  pmjayMode: 'PM-JAY Mode',
};

// ─── Main Component ─────────────────────────────────────────────────────

export function AuditLogView({ hospitalId }: { hospitalId: string }) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [readiness, setReadiness] = useState<OverallReadiness | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/integration-profile', {
        credentials: 'include',
      });
      if (!res.ok) {
        const err = await res.json();
        toast.error(err.error || 'Failed to load profile');
        return;
      }
      const data = await res.json();
      setProfile(data.profile);
      setReadiness(data.readiness);
    } catch {
      toast.error('Network error loading profile');
    } finally {
      setLoading(false);
    }
  }, [hospitalId]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full rounded-xl" />
        <Skeleton className="h-60 w-full rounded-xl" />
      </div>
    );
  }

  if (!profile) {
    return (
      <Card className="border-red-200 bg-red-50/50">
        <CardContent className="py-10 text-center">
          <p className="text-sm text-red-700">No integration profile found</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Profile Metadata Card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Database className="w-4 h-4 text-emerald-600" />
                <CardTitle className="text-base font-semibold">Profile Metadata</CardTitle>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={fetchProfile}
                className="text-xs text-muted-foreground hover:text-emerald-600"
              >
                <RefreshCw className="w-3.5 h-3.5 mr-1" />
                Refresh
              </Button>
            </div>
            <CardDescription>Integration profile timestamps and evaluation info</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Profile Created</p>
                <p className="text-sm font-mono">
                  {format(new Date(profile.createdAt), 'dd MMM yyyy, HH:mm:ss')}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Last Updated</p>
                <p className="text-sm font-mono">
                  {format(new Date(profile.updatedAt), 'dd MMM yyyy, HH:mm:ss')}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Readiness Last Evaluated</p>
                <p className="text-sm font-mono">
                  {profile.readinessLastEval
                    ? format(new Date(profile.readinessLastEval), 'dd MMM yyyy, HH:mm:ss')
                    : 'Never'}
                </p>
              </div>
              <div className="space-y-1">
                <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">Profile ID</p>
                <p className="text-sm font-mono truncate" title={profile.id}>
                  {profile.id}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Current Values Table */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
      >
        <Card className="shadow-sm">
          <CardHeader className="pb-3">
            <div className="flex items-center gap-2">
              <FileEdit className="w-4 h-4 text-emerald-600" />
              <CardTitle className="text-base font-semibold">Current Field Values</CardTitle>
            </div>
            <CardDescription>Snapshot of the current integration profile configuration</CardDescription>
          </CardHeader>
          <CardContent className="p-0">
            {/* Desktop Table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/30">
                    <TableHead className="text-xs font-semibold">Field</TableHead>
                    <TableHead className="text-xs font-semibold">Value</TableHead>
                    <TableHead className="text-xs font-semibold">Readiness</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {readiness?.fields.map((f, idx) => (
                    <TableRow key={f.field} className={idx % 2 === 0 ? 'bg-white' : 'bg-muted/10'}>
                      <TableCell className="text-sm font-medium">{f.label}</TableCell>
                      <TableCell className="text-sm font-mono max-w-[250px] truncate">
                        {f.value
                          ? f.status === 'VERIFIED' && f.field.includes('Date')
                            ? format(new Date(f.value), 'dd MMM yyyy')
                            : f.value
                          : '—'}
                      </TableCell>
                      <TableCell>
                        <ReadinessStatusBadge status={f.status} />
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y">
              {readiness?.fields.map(f => (
                <div key={f.field} className="px-4 py-3 flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-sm font-medium truncate">{f.label}</p>
                    <p className="text-xs text-muted-foreground font-mono truncate">
                      {f.value || '—'}
                    </p>
                  </div>
                  <ReadinessStatusBadge status={f.status} />
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>

      {/* Audit Info Card */}
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.2 }}
      >
        <Card className="shadow-sm border-sky-100 bg-sky-50/20">
          <CardContent className="py-4">
            <div className="flex items-start gap-3">
              <Info className="w-5 h-5 text-sky-500 mt-0.5 shrink-0" />
              <div className="text-xs text-muted-foreground leading-relaxed">
                <p className="font-medium text-sky-700 mb-1">About Audit Logging</p>
                <p>
                  All integration profile field changes are recorded with full audit trails in the
                  database. Each change captures the field path, old and new values, actor email,
                  role, and timestamp. Sensitive fields (secrets, tokens, certificates) are
                  automatically filtered from the audit log for security. Query the{' '}
                  <code className="px-1 py-0.5 rounded bg-muted text-[10px] font-mono">AuditLog</code> table
                  directly for the complete history.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}

// ─── Readiness Status Badge ─────────────────────────────────────────────

function ReadinessStatusBadge({ status }: { status: string }) {
  const config: Record<string, { className: string; label: string }> = {
    MISSING: {
      className: 'bg-gray-100 text-gray-600 border-gray-200',
      label: 'Missing',
    },
    CONFIGURED: {
      className: 'bg-sky-50 text-sky-700 border-sky-200',
      label: 'Configured',
    },
    PENDING_VERIFICATION: {
      className: 'bg-amber-50 text-amber-700 border-amber-200',
      label: 'Pending',
    },
    VERIFIED: {
      className: 'bg-emerald-50 text-emerald-700 border-emerald-200',
      label: 'Verified',
    },
    EXPIRED: {
      className: 'bg-red-50 text-red-700 border-red-200',
      label: 'Expired',
    },
    EXPIRING_SOON: {
      className: 'bg-orange-50 text-orange-700 border-orange-200',
      label: 'Expiring Soon',
    },
  };

  const c = config[status] || config.MISSING;

  return (
    <Badge variant="outline" className={`${c.className} text-[10px] font-medium`}>
      {c.label}
    </Badge>
  );
}
