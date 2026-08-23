'use client';

import { useEffect, useState, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { format } from 'date-fns';
import {
  Save,
  X,
  Pencil,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Clock,
  HelpCircle,
  Loader2,
  RotateCcw,
} from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { toast } from 'sonner';

// ─── Types ──────────────────────────────────────────────────────────────

interface FieldReadiness {
  field: string;
  label: string;
  status: 'MISSING' | 'CONFIGURED' | 'PENDING_VERIFICATION' | 'VERIFIED' | 'EXPIRED' | 'EXPIRING_SOON';
  value?: string | null;
  detail?: string;
}

interface OverallReadiness {
  level: string;
  fields: FieldReadiness[];
  lastEvaluated?: string | null;
}

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
  createdAt: string;
  updatedAt: string;
}

interface EditableField {
  key: string;
  label: string;
  type: 'text' | 'select' | 'date';
  maxLength?: number;
  options?: { value: string; label: string }[];
  placeholder?: string;
}

// ─── Field Config ───────────────────────────────────────────────────────

const FIELD_SECTIONS: { title: string; description: string; fields: EditableField[] }[] = [
  {
    title: 'Core Facility',
    description: 'Essential identifiers for hospital registration and PM-JAY empanelment',
    fields: [
      { key: 'hfrId', label: 'HFR ID', type: 'text', maxLength: 50, placeholder: 'e.g. HFR-MH-001234' },
      { key: 'pmjayFacilityId', label: 'PM-JAY Facility ID', type: 'text', maxLength: 50, placeholder: 'e.g. PMJ-MH-CGH-001' },
      { key: 'shaCode', label: 'SHA Code', type: 'text', maxLength: 20, placeholder: 'e.g. MHSHA' },
      {
        key: 'hemStatus',
        label: 'HEM Status',
        type: 'select',
        options: [
          { value: 'NOT_STARTED', label: 'Not Started' },
          { value: 'IN_PROGRESS', label: 'In Progress' },
          { value: 'COMPLETED', label: 'Completed' },
          { value: 'FAILED', label: 'Failed' },
        ],
      },
    ],
  },
  {
    title: 'ABDM / NHA Readiness',
    description: 'Compliance status for Ayushman Bharat Digital Mission requirements',
    fields: [
      {
        key: 'wasaAuditStatus',
        label: 'WASA Audit Status',
        type: 'select',
        options: [
          { value: 'NOT_STARTED', label: 'Not Started' },
          { value: 'SCHEDULED', label: 'Scheduled' },
          { value: 'IN_PROGRESS', label: 'In Progress' },
          { value: 'PASSED', label: 'Passed' },
          { value: 'FAILED', label: 'Failed' },
          { value: 'EXPIRED', label: 'Expired' },
        ],
      },
      { key: 'wasaAuditDate', label: 'WASA Audit Date', type: 'date' },
      { key: 'safeToHostCertRef', label: 'Safe-to-Host Certificate Ref', type: 'text', maxLength: 100, placeholder: 'e.g. STH-MH-2024-00042' },
      { key: 'certExpiryDate', label: 'Certificate Expiry Date', type: 'date' },
    ],
  },
  {
    title: 'NHCX',
    description: 'National Health Claims Exchange configuration for claim processing',
    fields: [
      { key: 'nhcxParticipantCode', label: 'NHCX Participant Code', type: 'text', maxLength: 50, placeholder: 'e.g. NHCX-MH-RCI-001' },
    ],
  },
  {
    title: 'PM-JAY Configuration',
    description: 'Operational mode for PM-JAY insurance claim processing',
    fields: [
      {
        key: 'pmjayMode',
        label: 'PM-JAY Provider Mode',
        type: 'select',
        options: [
          { value: 'MANUAL_PORTAL', label: 'Manual Portal' },
          { value: 'STATE_API', label: 'State API' },
          { value: 'OFFICIAL_API', label: 'Official API' },
          { value: 'SANDBOX', label: 'Sandbox' },
          { value: 'LOCAL', label: 'Local / Development' },
        ],
      },
    ],
  },
];

// ─── Readiness Badge ────────────────────────────────────────────────────

function ReadinessBadge({ status, detail }: { status: string; detail?: string }) {
  const config: Record<string, { variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string; icon: React.ReactNode }> = {
    MISSING: {
      variant: 'secondary',
      className: 'bg-gray-100 text-gray-600 border-gray-200 hover:bg-gray-100',
      icon: <HelpCircle className="w-3 h-3" />,
    },
    CONFIGURED: {
      variant: 'outline',
      className: 'bg-sky-50 text-sky-700 border-sky-200 hover:bg-sky-50',
      icon: <CheckCircle2 className="w-3 h-3" />,
    },
    PENDING_VERIFICATION: {
      variant: 'outline',
      className: 'bg-amber-50 text-amber-700 border-amber-200 hover:bg-amber-50',
      icon: <Clock className="w-3 h-3" />,
    },
    VERIFIED: {
      variant: 'outline',
      className: 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-50',
      icon: <CheckCircle2 className="w-3 h-3" />,
    },
    EXPIRED: {
      variant: 'destructive',
      className: 'bg-red-50 text-red-700 border-red-200 hover:bg-red-50',
      icon: <XCircle className="w-3 h-3" />,
    },
    EXPIRING_SOON: {
      variant: 'outline',
      className: 'bg-orange-50 text-orange-700 border-orange-200 hover:bg-orange-50',
      icon: <AlertTriangle className="w-3 h-3" />,
    },
  };

  const c = config[status] || config.MISSING;
  const label = status.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  return (
    <Badge variant={c.variant} className={`${c.className} gap-1 text-[11px] font-medium px-2 py-0.5`}>
      {c.icon}
      {label}
      {detail && (
        <span className="ml-1 opacity-70">({detail})</span>
      )}
    </Badge>
  );
}

// ─── Overall Readiness Banner ───────────────────────────────────────────

function ReadinessBanner({ level, lastEvaluated, hospitalName }: { level: string; lastEvaluated?: string | null; hospitalName: string }) {
  const bannerConfig: Record<string, { bg: string; border: string; text: string; icon: React.ReactNode; label: string; desc: string }> = {
    READY: {
      bg: 'bg-emerald-50',
      border: 'border-emerald-200',
      text: 'text-emerald-800',
      icon: <CheckCircle2 className="w-5 h-5 text-emerald-600" />,
      label: 'Ready for Go-Live',
      desc: 'All integration fields are verified and current.',
    },
    CONFIGURED: {
      bg: 'bg-sky-50',
      border: 'border-sky-200',
      text: 'text-sky-800',
      icon: <CheckCircle2 className="w-5 h-5 text-sky-600" />,
      label: 'Configured',
      desc: 'Fields are populated but some may need verification.',
    },
    INCOMPLETE: {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      text: 'text-amber-800',
      icon: <AlertTriangle className="w-5 h-5 text-amber-600" />,
      label: 'Incomplete',
      desc: 'Some required fields are missing. Complete them to proceed.',
    },
    PENDING_VERIFICATION: {
      bg: 'bg-amber-50',
      border: 'border-amber-200',
      text: 'text-amber-800',
      icon: <Clock className="w-5 h-5 text-amber-600" />,
      label: 'Pending Verification',
      desc: 'Fields need verification before go-live.',
    },
    EXPIRING_SOON: {
      bg: 'bg-orange-50',
      border: 'border-orange-200',
      text: 'text-orange-800',
      icon: <AlertTriangle className="w-5 h-5 text-orange-600" />,
      label: 'Expiring Soon',
      desc: 'Some certificates or audits are approaching expiry.',
    },
    EXPIRED: {
      bg: 'bg-red-50',
      border: 'border-red-200',
      text: 'text-red-800',
      icon: <XCircle className="w-5 h-5 text-red-600" />,
      label: 'Expired',
      desc: 'One or more certificates or audits have expired. Action required.',
    },
    MISSING: {
      bg: 'bg-gray-50',
      border: 'border-gray-200',
      text: 'text-gray-800',
      icon: <HelpCircle className="w-5 h-5 text-gray-500" />,
      label: 'No Profile',
      desc: 'No integration profile found for this hospital.',
    },
  };

  const c = bannerConfig[level] || bannerConfig.MISSING;

  return (
    <motion.div
      initial={{ opacity: 0, y: -8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={`rounded-xl border ${c.border} ${c.bg} p-4 sm:p-5`}
    >
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {c.icon}
          <div>
            <p className={`font-semibold text-sm ${c.text}`}>{c.label}</p>
            <p className="text-xs text-muted-foreground mt-0.5">{hospitalName} &mdash; {c.desc}</p>
          </div>
        </div>
        {lastEvaluated && (
          <p className="text-xs text-muted-foreground/70 whitespace-nowrap">
            Last evaluated: {format(new Date(lastEvaluated), 'dd MMM yyyy, HH:mm')}
          </p>
        )}
      </div>
    </motion.div>
  );
}

// ─── Field Row ──────────────────────────────────────────────────────────

function FieldRow({
  field,
  value,
  readiness,
  isEditing,
  editValue,
  onEdit,
  onSave,
  onCancel,
  onEditValueChange,
  isSaving,
}: {
  field: EditableField;
  value: string | null;
  readiness: FieldReadiness | undefined;
  isEditing: boolean;
  editValue: string;
  onEdit: () => void;
  onSave: () => void;
  onCancel: () => void;
  onEditValueChange: (val: string) => void;
  isSaving: boolean;
}) {
  const displayValue = value || '—';

  return (
    <div className="group flex flex-col sm:flex-row sm:items-center justify-between gap-2 py-3 border-b border-border/50 last:border-0">
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <Label className="text-sm font-medium text-foreground/90 shrink-0">{field.label}</Label>
          {readiness && <ReadinessBadge status={readiness.status} detail={readiness.detail} />}
        </div>
        {isEditing ? (
          <div className="flex items-center gap-2 mt-1.5">
            {field.type === 'text' && (
              <Input
                value={editValue}
                onChange={e => onEditValueChange(e.target.value)}
                maxLength={field.maxLength}
                placeholder={field.placeholder}
                className="h-8 text-sm max-w-xs"
                autoFocus
              />
            )}
            {field.type === 'select' && (
              <Select value={editValue} onValueChange={onEditValueChange}>
                <SelectTrigger className="h-8 text-sm w-56">
                  <SelectValue placeholder="Select..." />
                </SelectTrigger>
                <SelectContent>
                  {field.options?.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            {field.type === 'date' && (
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-8 text-sm w-56 justify-start text-left font-normal"
                  >
                    {editValue ? format(new Date(editValue), 'dd MMM yyyy') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar
                    mode="single"
                    selected={editValue ? new Date(editValue) : undefined}
                    onSelect={d => onEditValueChange(d ? d.toISOString() : '')}
                    initialFocus
                  />
                </PopoverContent>
              </Popover>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={onSave}
              disabled={isSaving}
              className="h-8 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              <span className="ml-1">Save</span>
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={onCancel}
              disabled={isSaving}
              className="h-8 text-muted-foreground hover:bg-muted"
            >
              <X className="w-3.5 h-3.5" />
              <span className="ml-1">Cancel</span>
            </Button>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground truncate font-mono">
            {field.type === 'date' && value
              ? format(new Date(value), 'dd MMM yyyy')
              : displayValue}
          </p>
        )}
      </div>
      {!isEditing && (
        <Button
          size="sm"
          variant="ghost"
          onClick={onEdit}
          className="h-8 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-emerald-600 hover:bg-emerald-50 shrink-0"
        >
          <Pencil className="w-3.5 h-3.5" />
          <span className="ml-1 text-xs">Edit</span>
        </Button>
      )}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────

export function GoLiveChecklist({ hospitalId, hospitalName }: { hospitalId: string; hospitalName: string }) {
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [readiness, setReadiness] = useState<OverallReadiness | null>(null);
  const [loading, setLoading] = useState(true);
  const [savingField, setSavingField] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const fetchProfile = useCallback(async () => {
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
    setLoading(true);
    fetchProfile();
  }, [fetchProfile]);

  const handleEdit = (field: EditableField, currentValue: string | null) => {
    setEditingField(field.key);
    setEditValue(currentValue || '');
  };

  const handleCancel = () => {
    setEditingField(null);
    setEditValue('');
  };

  const handleSave = async (field: EditableField) => {
    const normalizedValue = editValue.trim() === '' ? null : editValue;
    setSavingField(field.key);

    try {
      const body: Record<string, unknown> = {};
      body[field.key] = normalizedValue;

      const res = await fetch('/api/integration-profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const err = await res.json();
        const msg = err.details
          ? Object.values(err.details).flat().join(', ')
          : err.error || 'Update failed';
        toast.error(msg);
        return;
      }

      const data = await res.json();
      setProfile(data.profile);
      setReadiness(data.readiness);
      setEditingField(null);
      setEditValue('');
      toast.success(`${field.label} updated successfully`);
    } catch {
      toast.error('Network error saving field');
    } finally {
      setSavingField(null);
    }
  };

  const getFieldValue = (key: string): string | null => {
    if (!profile) return null;
    return (profile as unknown as Record<string, unknown>)[key] as string | null ?? null;
  };

  const getFieldReadiness = (key: string): FieldReadiness | undefined => {
    return readiness?.fields.find(f => f.field === key);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-20 w-full rounded-xl" />
        <div className="grid gap-4">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-48 w-full rounded-xl" />
          ))}
        </div>
      </div>
    );
  }

  if (!profile || !readiness) {
    return (
      <Card className="border-red-200 bg-red-50/50">
        <CardContent className="py-10 text-center">
          <XCircle className="w-8 h-8 text-red-400 mx-auto mb-3" />
          <p className="text-sm text-red-700 font-medium">No integration profile found</p>
          <p className="text-xs text-muted-foreground mt-1">Run seed to create a profile for this hospital.</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {/* Overall Readiness Banner */}
      <ReadinessBanner
        level={readiness.level}
        lastEvaluated={readiness.lastEvaluated}
        hospitalName={hospitalName}
      />

      {/* Field Sections */}
      {FIELD_SECTIONS.map((section, sIdx) => (
        <motion.div
          key={section.title}
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: sIdx * 0.08 }}
        >
          <Card className="shadow-sm hover:shadow-md transition-shadow duration-200">
            <CardHeader className="pb-3">
              <CardTitle className="text-base font-semibold">{section.title}</CardTitle>
              <CardDescription className="text-xs">{section.description}</CardDescription>
            </CardHeader>
            <CardContent className="pt-0">
              {section.fields.map(field => (
                <FieldRow
                  key={field.key}
                  field={field}
                  value={getFieldValue(field.key)}
                  readiness={getFieldReadiness(field.key)}
                  isEditing={editingField === field.key}
                  editValue={editValue}
                  onEdit={() => handleEdit(field, getFieldValue(field.key))}
                  onSave={() => handleSave(field)}
                  onCancel={handleCancel}
                  onEditValueChange={setEditValue}
                  isSaving={savingField === field.key}
                />
              ))}
            </CardContent>
          </Card>
        </motion.div>
      ))}

      {/* Refresh Button */}
      <div className="flex justify-center pt-2">
        <Button
          variant="outline"
          size="sm"
          onClick={() => { setLoading(true); fetchProfile(); }}
          className="text-xs text-muted-foreground border-emerald-200 hover:bg-emerald-50 hover:text-emerald-700"
        >
          <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
          Refresh Profile
        </Button>
      </div>
    </div>
  );
}
