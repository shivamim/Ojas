"use client";

import * as React from "react";
import { MotionConfig, motion } from "framer-motion";
import { toast } from "sonner";
import { format, formatDistanceToNow, parseISO } from "date-fns";
import {
  Users, UserPlus, Search, Phone, Stethoscope,
  Activity, CheckCircle2, ArrowLeft, ChevronRight, Calendar,
  MoreVertical, Eye, PhoneCall, ClipboardList, Clock, AlertCircle,
} from "lucide-react";

import { api } from "@/lib/auth-context";
import { navigate } from "@/lib/router";
import { cn } from "@/lib/utils";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ReadmitDialog } from "@/components/pages/patient-detail";

// ── Types matching /api/patients GET ─────────────────────────────────────────
type PatientStatus =
  | "ENROLLED" | "ACTIVE" | "RECOVERED" | "READMITTED" | "LOST_TO_FOLLOWUP";

interface PatientRow {
  id: string;
  fullName: string;
  age: number;
  gender: string;
  mobileMasked: string;
  surgeryType: string;
  surgeryDate: string;
  dischargeDate: string;
  status: PatientStatus;
  dpdpaConsent: boolean;
  createdAt: string;
}

interface PatientsResponse { patients: PatientRow[] }

// ── Helpers ─────────────────────────────────────────────────────────────────
const STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "ENROLLED", label: "Enrolled" },
  { value: "ACTIVE", label: "Active" },
  { value: "RECOVERED", label: "Recovered" },
  { value: "READMITTED", label: "Readmitted" },
  { value: "LOST_TO_FOLLOWUP", label: "Lost to follow-up" },
];

function statusBadgeClass(s: PatientStatus): string {
  switch (s) {
    case "ENROLLED":       return "bg-primary/15 text-primary border-primary/30";
    case "ACTIVE":         return "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30";
    case "RECOVERED":      return "bg-muted text-muted-foreground border-border";
    case "READMITTED":     return "risk-critical";
    case "LOST_TO_FOLLOWUP": return "bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30";
  }
}

function statusLabel(s: PatientStatus): string {
  return s === "LOST_TO_FOLLOWUP" ? "Lost to follow-up" :
         s.charAt(0) + s.slice(1).toLowerCase();
}

function genderShort(g: string): string {
  if (!g) return "—";
  const t = g.toLowerCase();
  if (t.startsWith("m")) return "M";
  if (t.startsWith("f")) return "F";
  if (t.startsWith("o")) return "O";
  return "—";
}

function relativeDay(iso: string): string {
  try {
    return formatDistanceToNow(parseISO(iso), { addSuffix: true });
  } catch {
    return "—";
  }
}

function absoluteDate(iso: string): string {
  try {
    return format(parseISO(iso), "d MMM yyyy");
  } catch {
    return "—";
  }
}

// ── Page ────────────────────────────────────────────────────────────────────
export function PatientsPage() {
  const [patients, setPatients] = React.useState<PatientRow[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [search, setSearch] = React.useState("");
  const [status, setStatus] = React.useState<string>("all");
  const [readmitPatient, setReadmitPatient] = React.useState<PatientRow | null>(null);

  // Debounce the search input (300ms) so we don't fire on every keystroke.
  const debounced = React.useRef<number | undefined>(undefined);
  React.useEffect(() => {
    if (debounced.current) window.clearTimeout(debounced.current);
    debounced.current = window.setTimeout(() => {
      load(status, search);
    }, 300);
    return () => {
      if (debounced.current) window.clearTimeout(debounced.current);
    };
  }, [search, status]);

  const load = React.useCallback(async (st: string, q: string) => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (st !== "all") params.set("status", st);
      if (q.trim()) params.set("q", q.trim());
      const path = `/api/patients${params.size ? `?${params.toString()}` : ""}`;
      const r = await api<PatientsResponse>(path);
      setPatients(r.patients);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load patients");
      setPatients([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Initial fetch (no debounce).
  React.useEffect(() => {
    load("all", "");
  }, [load]);

  const counts = React.useMemo(() => {
    const list = patients || [];
    return {
      total: list.length,
      active: list.filter((p) => p.status === "ACTIVE").length,
      recovered: list.filter((p) => p.status === "RECOVERED").length,
      readmitted: list.filter((p) => p.status === "READMITTED").length,
    };
  }, [patients]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-6">
        {/* Header */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4"
        >
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight">Patients</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Manage your hospital&apos;s enrolled patients and post-discharge care.
            </p>
          </div>
          <Button onClick={() => navigate("enroll")} className="glow-primary">
            <UserPlus className="h-4 w-4" /> Enroll patient
          </Button>
        </motion.section>

        {/* Stats strip */}
        <section className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          <StatTile label="In view" value={counts.total} icon={Users} tint="primary" />
          <StatTile label="Active" value={counts.active} icon={Activity} tint="emerald" />
          <StatTile label="Recovered" value={counts.recovered} icon={CheckCircle2} tint="muted" />
          <StatTile label="Readmitted" value={counts.readmitted} icon={ArrowLeft} tint="rose" />
        </section>

        {/* Filters */}
        <section className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search by patient name…"
              className="pl-9"
              aria-label="Search patients"
            />
          </div>
          <Select value={status} onValueChange={setStatus}>
            <SelectTrigger className="w-full sm:w-52" aria-label="Filter by status">
              <SelectValue placeholder="All statuses" />
            </SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </section>

        {/* List */}
        {loading ? (
          <Card className="glass">
            <CardContent className="p-0">
              <div className="p-4 space-y-3">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            </CardContent>
          </Card>
        ) : !patients || patients.length === 0 ? (
          <EmptyState />
        ) : (
          <>
            {/* Desktop table (≥768px) */}
            <Card className="glass hidden md:block">
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="pl-4">Patient</TableHead>
                      <TableHead>Surgery</TableHead>
                      <TableHead>Discharged</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="hidden lg:table-cell">Mobile</TableHead>
                      <TableHead className="text-right pr-4">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {patients.map((p, i) => (
                      <motion.tr
                        key={p.id}
                        initial={{ opacity: 0, y: 4 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.2, delay: Math.min(i * 0.025, 0.3) }}
                        className="border-b transition-colors hover:bg-muted/50 cursor-pointer group"
                        onClick={() => navigate("patient-detail", { patientId: p.id })}
                      >
                        <TableCell className="pl-4">
                          <div className="font-medium">{p.fullName}</div>
                          <div className="text-xs text-muted-foreground">
                            {p.age}y · {genderShort(p.gender)}
                          </div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2 text-sm">
                            <Stethoscope className="h-3.5 w-3.5 text-muted-foreground" />
                            <span className="truncate max-w-[180px]">{p.surgeryType}</span>
                          </div>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground">
                          <div className="flex items-center gap-2">
                            <Calendar className="h-3.5 w-3.5" />
                            {absoluteDate(p.dischargeDate)}
                          </div>
                          <div className="text-xs">{relativeDay(p.dischargeDate)}</div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={statusBadgeClass(p.status)}>
                            {statusLabel(p.status)}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm text-muted-foreground tabular-nums hidden lg:table-cell">
                          <span className="inline-flex items-center gap-1.5">
                            <Phone className="h-3 w-3" /> {p.mobileMasked}
                          </span>
                        </TableCell>
                        <TableCell className="text-right pr-4">
                          <div className="inline-flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                            <Button
                              size="sm" variant="outline"
                              onClick={() => navigate("checkins", { patientId: p.id })}
                              className="hidden sm:inline-flex"
                            >
                              Log check-in
                            </Button>
                            <Button
                              size="sm" variant="ghost"
                              onClick={() => navigate("patient-detail", { patientId: p.id })}
                              aria-label={`View ${p.fullName}`}
                            >
                              View <ChevronRight className="h-3.5 w-3.5" />
                            </Button>
                            <PatientQuickActions patient={p} onReadmit={setReadmitPatient} />
                          </div>
                        </TableCell>
                      </motion.tr>
                    ))}
                  </TableBody>
                </Table>
                </div>
              </CardContent>
            </Card>

            {/* Mobile cards (<768px) */}
            <div className="md:hidden space-y-3">
              {patients.map((p, i) => (
                <motion.div
                  key={p.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.2, delay: Math.min(i * 0.025, 0.3) }}
                >
                  <Card
                    className="glass cursor-pointer hover:glow-primary transition-all"
                    onClick={() => navigate("patient-detail", { patientId: p.id })}
                  >
                    <CardContent className="p-4 space-y-3">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="font-medium truncate">{p.fullName}</div>
                          <div className="text-xs text-muted-foreground">
                            {p.age}y · {genderShort(p.gender)} · {p.mobileMasked}
                          </div>
                        </div>
                        <Badge variant="outline" className={statusBadgeClass(p.status)}>
                          {statusLabel(p.status)}
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-muted-foreground min-w-0">
                          <Stethoscope className="h-3.5 w-3.5 flex-shrink-0" />
                          <span className="truncate">{p.surgeryType}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground text-xs flex-shrink-0">
                          <Calendar className="h-3 w-3" />
                          {absoluteDate(p.dischargeDate)}
                        </div>
                      </div>
                      <div className="flex gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
                        <Button
                          size="sm" variant="outline" className="flex-1"
                          onClick={() => navigate("checkins", { patientId: p.id })}
                        >
                          Log check-in
                        </Button>
                        <Button
                          size="sm" className="flex-1"
                          onClick={() => navigate("patient-detail", { patientId: p.id })}
                        >
                          View <ChevronRight className="h-3.5 w-3.5" />
                        </Button>
                        <PatientQuickActions patient={p} onReadmit={setReadmitPatient} />
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              ))}
            </div>
          </>
        )}

        {/* Shared readmit dialog (controlled from any row's quick-actions menu) */}
        {readmitPatient && (
          <ReadmitDialog
            patientId={readmitPatient.id}
            patientName={readmitPatient.fullName}
            open={!!readmitPatient}
            onOpenChange={(o) => { if (!o) setReadmitPatient(null); }}
            onDone={() => load(status, search)}
          />
        )}
      </div>
    </MotionConfig>
  );
}

// ── Quick-actions dropdown (shared by desktop table + mobile cards) ─────────
function PatientQuickActions({
  patient,
  onReadmit,
}: {
  patient: PatientRow;
  onReadmit: (p: PatientRow) => void;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          size="icon"
          variant="ghost"
          className="h-8 w-8 flex-shrink-0"
          aria-label={`More actions for ${patient.fullName}`}
        >
          <MoreVertical className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuItem
          onClick={() => navigate("patient-detail", { patientId: patient.id })}
        >
          <Eye className="h-4 w-4" /> View details
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => navigate("checkins", { patientId: patient.id })}
        >
          <PhoneCall className="h-4 w-4" /> Log check-in
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={() => navigate("discharge-summary", { patientId: patient.id })}
        >
          <ClipboardList className="h-4 w-4" /> Discharge summary
        </DropdownMenuItem>
        {patient.status !== "READMITTED" && (
          <DropdownMenuItem
            onClick={() => onReadmit(patient)}
            className="text-rose-700 dark:text-rose-300 focus:bg-rose-500/10 focus:text-rose-700 dark:focus:text-rose-200"
          >
            <AlertCircle className="h-4 w-4" /> Mark as readmitted
          </DropdownMenuItem>
        )}
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => navigate("timeline")}>
          <Clock className="h-4 w-4" /> View timeline
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

// ── Stat tile ───────────────────────────────────────────────────────────────
function StatTile({
  label, value, icon: Icon, tint,
}: {
  label: string;
  value: number;
  icon: React.ComponentType<{ className?: string }>;
  tint: "primary" | "emerald" | "muted" | "rose";
}) {
  const tintCls = {
    primary: "bg-primary/15 text-primary",
    emerald: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300",
    muted:   "bg-muted text-muted-foreground",
    rose:    "risk-critical",
  }[tint];
  return (
    <Card className="glass">
      <CardContent className="p-4 flex items-center gap-3">
        <div className={cn("h-10 w-10 rounded-lg flex items-center justify-center flex-shrink-0", tintCls)}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="min-w-0">
          <div className="text-2xl font-semibold tabular-nums leading-tight">{value}</div>
          <div className="text-xs text-muted-foreground truncate">{label}</div>
        </div>
      </CardContent>
    </Card>
  );
}

// ── Empty state ─────────────────────────────────────────────────────────────
function EmptyState() {
  return (
    <Card className="glass">
      <CardContent className="p-10 text-center">
        <div className="mx-auto h-16 w-16 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
          <Users className="h-8 w-8 text-primary" />
        </div>
        <h3 className="text-lg font-semibold">No patients yet</h3>
        <p className="text-sm text-muted-foreground mt-1 max-w-sm mx-auto">
          Enroll your first patient to start scheduling WhatsApp check-ins and
          AI-triaged post-discharge care.
        </p>
        <Button onClick={() => navigate("enroll")} className="mt-5 glow-primary">
          <UserPlus className="h-4 w-4" /> Enroll your first patient
        </Button>
      </CardContent>
    </Card>
  );
}
