"use client";

import * as React from "react";
import { MotionConfig, motion } from "framer-motion";
import { toast } from "sonner";
import {
  ShieldAlert, Users, Activity, Gauge, AlertTriangle,
  Sparkles, ChevronRight, Info, ClipboardList,
} from "lucide-react";
import {
  Pie, PieChart, Cell, ResponsiveContainer, Tooltip as RTooltip,
  Bar, BarChart, XAxis, YAxis, CartesianGrid,
} from "recharts";

import { api } from "@/lib/auth-context";
import { navigate } from "@/lib/router";
import { cn } from "@/lib/utils";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription, CardAction,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

// ── Types matching /api/risk-summary contract ───────────────────────────────
type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" | null;

interface RiskPatient {
  id: string;
  fullName: string;
  age: number;
  gender: string;
  surgeryType: string;
  dischargeDate: string;
  status: string;
  riskLevel: RiskLevel;
  riskScore: number | null;
  riskAssessedAt: string | null;
  comorbidities: string | null;
  recoveryDay: number;
}

interface Distribution {
  CRITICAL: number;
  HIGH: number;
  MEDIUM: number;
  LOW: number;
  UNASSESSED: number;
}

interface RiskStats {
  total: number;
  assessed: number;
  unassessed: number;
  avgScore: number | null;
  maxScore: number | null;
}

interface BySurgery {
  surgery: string;
  total: number;
  avgScore: number;
}

interface RiskSummaryResponse {
  patients: RiskPatient[];
  distribution: Distribution;
  stats: RiskStats;
  bySurgeryType: BySurgery[];
}

// ── Color tokens ────────────────────────────────────────────────────────────
// CRITICAL = rose, HIGH = amber, MEDIUM = primary, LOW = emerald, UNASSESSED = muted
const RISK_HEX: Record<string, string> = {
  CRITICAL: "oklch(0.58 0.22 25)",   // rose
  HIGH: "oklch(0.7 0.17 70)",        // amber
  MEDIUM: "oklch(0.62 0.14 165)",    // primary (emerald/teal)
  LOW: "oklch(0.7 0.12 160)",        // emerald
  UNASSESSED: "oklch(0.7 0.02 250)", // muted
};

function riskBadgeClass(level: RiskLevel): string {
  switch (level) {
    case "CRITICAL": return "risk-critical";
    case "HIGH":     return "risk-high";
    case "MEDIUM":   return "risk-medium";
    case "LOW":      return "risk-low";
    default:         return "bg-muted text-muted-foreground";
  }
}

function scoreBarClass(level: RiskLevel): string {
  // recolor Progress inner bar via arbitrary variants
  switch (level) {
    case "CRITICAL": return "[&>div]:bg-rose-500";
    case "HIGH":     return "[&>div]:bg-amber-500";
    case "MEDIUM":   return "[&>div]:bg-primary";
    case "LOW":      return "[&>div]:bg-emerald-500";
    default:         return "[&>div]:bg-muted-foreground/50";
  }
}

function rowTintClass(level: RiskLevel): string {
  // subtle row tint for CRITICAL / HIGH
  switch (level) {
    case "CRITICAL": return "bg-rose-500/[0.06] hover:bg-rose-500/[0.1]";
    case "HIGH":     return "bg-amber-500/[0.06] hover:bg-amber-500/[0.1]";
    default:         return "hover:bg-muted/40";
  }
}

function statusLabel(s: string): string {
  return s.replace(/_/g, " ").toLowerCase();
}

// ── Page ────────────────────────────────────────────────────────────────────
export function RiskSummaryPage() {
  const [data, setData] = React.useState<RiskSummaryResponse | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<RiskSummaryResponse>("/api/risk-summary");
      setData(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load risk summary");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  const dist = data?.distribution;
  const stats = data?.stats;
  const allUnassessed = !!dist && (dist.CRITICAL + dist.HIGH + dist.MEDIUM + dist.LOW === 0);

  const pieData = React.useMemo(() => {
    if (!dist) return [];
    return ([
      { key: "CRITICAL",  value: dist.CRITICAL },
      { key: "HIGH",      value: dist.HIGH },
      { key: "MEDIUM",    value: dist.MEDIUM },
      { key: "LOW",       value: dist.LOW },
      { key: "UNASSESSED", value: dist.UNASSESSED },
    ]).filter((d) => d.value > 0);
  }, [dist]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-6 md:space-y-8">
        {/* Header */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight flex items-center gap-2">
            <ShieldAlert className="h-6 w-6 md:h-7 md:w-7 text-primary" />
            Risk stratification
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            All patients ranked by AI-predicted readmission risk.
          </p>
          <div className="mt-3 flex items-start gap-2 text-xs text-muted-foreground bg-muted/40 border border-border rounded-lg p-3 max-w-3xl">
            <Info className="h-3.5 w-3.5 flex-shrink-0 mt-0.5 text-primary" />
            <p>
              Risk is assessed automatically at enrollment. Use the{" "}
              <span className="font-medium text-foreground">Risk assessment</span> button on a
              patient&rsquo;s detail page to re-run.
            </p>
          </div>
        </motion.section>

        {/* Summary cards */}
        <section className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4">
          <SummaryCard
            label="Total patients"
            value={stats?.total}
            icon={Users}
            loading={loading}
            delay={0}
          />
          <SummaryCard
            label="Assessed"
            value={stats?.assessed}
            hint={stats ? `${stats.unassessed} not yet` : undefined}
            icon={Activity}
            loading={loading}
            delay={0.05}
          />
          <SummaryCard
            label="Avg risk score"
            value={stats?.avgScore ?? undefined}
            emptyValue="—"
            hint={stats?.maxScore != null ? `max ${stats.maxScore}` : undefined}
            icon={Gauge}
            loading={loading}
            delay={0.1}
          />
          <SummaryCard
            label="Critical"
            value={dist?.CRITICAL}
            icon={AlertTriangle}
            tint="critical"
            loading={loading}
            delay={0.15}
          />
          <SummaryCard
            label="High"
            value={dist?.HIGH}
            icon={ShieldAlert}
            tint="high"
            loading={loading}
            delay={0.2}
          />
        </section>

        {/* Distribution + by surgery type */}
        <section className="grid grid-cols-1 lg:grid-cols-2 gap-4 md:gap-6">
          {/* Donut */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.2 }}
          >
            <Card className="glass h-full">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2 text-base">
                  <ShieldAlert className="h-4 w-4 text-primary" />
                  Risk distribution
                </CardTitle>
                <CardDescription>Patients grouped by AI risk level.</CardDescription>
              </CardHeader>
              <CardContent className="p-4 md:p-6">
                {loading ? (
                  <div className="flex items-center justify-center py-6">
                    <Skeleton className="h-48 w-48 rounded-full" />
                  </div>
                ) : allUnassessed ? (
                  <div className="flex flex-col items-center justify-center text-center py-10 px-4">
                    <span className="flex items-center justify-center h-12 w-12 rounded-full bg-muted text-muted-foreground mb-3">
                      <ShieldAlert className="h-6 w-6" />
                    </span>
                    <p className="text-sm font-medium">No risk assessments yet</p>
                    <p className="text-xs text-muted-foreground mt-1 max-w-xs">
                      Risk is assessed automatically at enrollment. New patients will appear here once assessed.
                    </p>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row items-center gap-6">
                    <div className="h-48 w-48 flex-shrink-0 relative">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={pieData}
                            dataKey="value"
                            nameKey="key"
                            cx="50%"
                            cy="50%"
                            innerRadius={48}
                            outerRadius={84}
                            paddingAngle={2}
                            stroke="var(--card)"
                            strokeWidth={2}
                          >
                            {pieData.map((entry) => (
                              <Cell key={entry.key} fill={RISK_HEX[entry.key]} />
                            ))}
                          </Pie>
                          <RTooltip
                            contentStyle={{
                              background: "var(--popover)",
                              border: "1px solid var(--border)",
                              borderRadius: 8,
                              fontSize: 12,
                            }}
                            formatter={(v: number, n: string) => [
                              `${v} patient${v === 1 ? "" : "s"}`,
                              n.charAt(0) + n.slice(1).toLowerCase(),
                            ]}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                      <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                        <span className="text-2xl font-bold tabular-nums">{stats?.total ?? 0}</span>
                        <span className="text-[10px] text-muted-foreground uppercase tracking-wider">patients</span>
                      </div>
                    </div>
                    <ul className="flex-1 w-full space-y-2">
                      {([
                        ["CRITICAL", "Critical"],
                        ["HIGH", "High"],
                        ["MEDIUM", "Medium"],
                        ["LOW", "Low"],
                        ["UNASSESSED", "Not assessed"],
                      ] as const).map(([key, label]) => (
                        <li key={key} className="flex items-center justify-between rounded-md border border-border px-3 py-2">
                          <span className="flex items-center gap-2 text-xs font-medium">
                            <span
                              className="h-2.5 w-2.5 rounded-full"
                              style={{ background: RISK_HEX[key] }}
                            />
                            {label}
                          </span>
                          <span className="text-sm font-semibold tabular-nums">
                            {dist?.[key as keyof Distribution] ?? 0}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>

          {/* By surgery type */}
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.25 }}
          >
            <Card className="glass h-full">
              <CardHeader className="border-b border-border">
                <CardTitle className="flex items-center gap-2 text-base">
                  <Gauge className="h-4 w-4 text-primary" />
                  Risk by surgery type
                </CardTitle>
                <CardDescription>Average AI risk score per surgery type (0–100).</CardDescription>
              </CardHeader>
              <CardContent className="p-4 md:p-6">
                {loading ? (
                  <Skeleton className="h-48 w-full" />
                ) : !data?.bySurgeryType || data.bySurgeryType.length === 0 ? (
                  <div className="flex flex-col items-center justify-center text-center py-10 px-4">
                    <span className="flex items-center justify-center h-12 w-12 rounded-full bg-muted text-muted-foreground mb-3">
                      <Gauge className="h-6 w-6" />
                    </span>
                    <p className="text-sm font-medium">No assessed patients yet</p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Average risk scores by surgery type will appear here.
                    </p>
                  </div>
                ) : (
                  <div className="h-[260px] w-full">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart
                        data={data.bySurgeryType}
                        layout="vertical"
                        margin={{ top: 4, right: 16, bottom: 4, left: 8 }}
                      >
                        <CartesianGrid horizontal={false} stroke="var(--border)" strokeDasharray="3 3" />
                        <XAxis
                          type="number"
                          domain={[0, 100]}
                          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <YAxis
                          type="category"
                          dataKey="surgery"
                          width={120}
                          tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                          axisLine={false}
                          tickLine={false}
                        />
                        <RTooltip
                          cursor={{ fill: "var(--muted)" }}
                          contentStyle={{
                            background: "var(--popover)",
                            border: "1px solid var(--border)",
                            borderRadius: 8,
                            fontSize: 12,
                          }}
                          formatter={(v: number, _n: string, payload) => {
                            const total = payload?.payload?.total as number | undefined;
                            return [`${v} avg (${total ?? 0} patient${total === 1 ? "" : "s"})`, "Risk"];
                          }}
                        />
                        <Bar
                          dataKey="avgScore"
                          fill="oklch(0.58 0.22 25)"
                          radius={[0, 4, 4, 0]}
                          maxBarSize={22}
                        />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        </section>

        {/* Patient risk table */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.3 }}
        >
          <Card className="glass">
            <CardHeader className="border-b border-border">
              <CardTitle className="flex items-center gap-2 text-base">
                <Users className="h-4 w-4 text-primary" />
                Patient risk ranking
              </CardTitle>
              <CardDescription>
                Sorted by AI risk score — highest first, unassessed last.
              </CardDescription>
              <CardAction>
                <Button size="sm" variant="outline" onClick={() => navigate("patients")}>
                  View all patients <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </CardAction>
            </CardHeader>
            <CardContent className="p-3 md:p-4">
              {loading ? (
                <div className="space-y-2">
                  {Array.from({ length: 6 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : !data || data.patients.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center py-12 px-4">
                  <span className="flex items-center justify-center h-12 w-12 rounded-full bg-muted text-muted-foreground mb-3">
                    <ClipboardList className="h-6 w-6" />
                  </span>
                  <p className="text-sm font-medium">No patients enrolled yet</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Enroll a patient to begin AI risk stratification.
                  </p>
                </div>
              ) : (
                <>
                  {/* Desktop table */}
                  <div className="hidden md:block">
                    <Table>
                      <TableHeader>
                        <TableRow className="hover:bg-transparent">
                          <TableHead className="w-[26%]">Patient</TableHead>
                          <TableHead>Surgery</TableHead>
                          <TableHead className="text-center">Day</TableHead>
                          <TableHead>Risk</TableHead>
                          <TableHead className="w-[14%]">Score</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead className="w-[18%]">Comorbidities</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {data.patients.map((p) => (
                          <PatientRow key={p.id} p={p} />
                        ))}
                      </TableBody>
                    </Table>
                  </div>

                  {/* Mobile cards */}
                  <ul className="md:hidden space-y-2">
                    {data.patients.map((p) => (
                      <PatientCard key={p.id} p={p} />
                    ))}
                  </ul>
                </>
              )}
            </CardContent>
          </Card>
        </motion.section>

        <p className="text-[11px] text-muted-foreground flex items-center gap-1.5 pt-1">
          <Sparkles className="h-3 w-3 text-primary" />
          AI is decision support, not a diagnosis.
        </p>
      </div>
    </MotionConfig>
  );
}

// ── Sub-components ──────────────────────────────────────────────────────────

function SummaryCard({
  label, value, hint, icon: Icon, loading, tint, emptyValue, delay,
}: {
  label: string;
  value: number | undefined;
  hint?: string;
  icon: React.ComponentType<{ className?: string }>;
  loading: boolean;
  tint?: "critical" | "high";
  emptyValue?: string;
  delay: number;
}) {
  const tintCls =
    tint === "critical"
      ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
      : tint === "high"
      ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
      : "bg-primary/10 text-primary";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
    >
      <Card className="glass hover:glow-primary transition-shadow h-full">
        <CardContent className="p-4 md:p-5 flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <span className="text-[11px] md:text-xs font-medium text-muted-foreground uppercase tracking-wider">
              {label}
            </span>
            <span className={cn("flex items-center justify-center h-7 w-7 rounded-md", tintCls)}>
              <Icon className="h-3.5 w-3.5" />
            </span>
          </div>
          {loading ? (
            <Skeleton className="h-7 w-14" />
          ) : (
            <span className="text-2xl md:text-3xl font-semibold tabular-nums">
              {value !== undefined ? value : (emptyValue ?? "0")}
            </span>
          )}
          {hint && !loading && (
            <p className="text-[11px] text-muted-foreground">{hint}</p>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

function RiskBadge({ level }: { level: RiskLevel }) {
  if (level === null) {
    return (
      <Badge variant="outline" className="bg-muted/60 text-muted-foreground border-transparent text-[10px] px-2 py-0.5">
        Not assessed
      </Badge>
    );
  }
  return (
    <Badge className={cn("text-[10px] px-2 py-0.5 border-transparent", riskBadgeClass(level))}>
      {level}
    </Badge>
  );
}

function PatientRow({ p }: { p: RiskPatient }) {
  return (
    <TableRow className={cn("transition-colors", rowTintClass(p.riskLevel))}>
      <TableCell>
        <button
          onClick={() => navigate("patient-detail", { patientId: p.id })}
          className="text-left group"
        >
          <div className="text-sm font-medium group-hover:text-primary group-hover:underline underline-offset-2">
            {p.fullName}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {p.age}y · {p.gender}
          </div>
        </button>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">{p.surgeryType}</TableCell>
      <TableCell className="text-center text-xs tabular-nums">{p.recoveryDay}</TableCell>
      <TableCell>
        {p.riskLevel === null ? (
          <div className="flex items-center gap-2">
            <RiskBadge level={p.riskLevel} />
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[10px]"
              onClick={() => navigate("patient-detail", { patientId: p.id })}
            >
              Assess now <ChevronRight className="h-3 w-3" />
            </Button>
          </div>
        ) : (
          <RiskBadge level={p.riskLevel} />
        )}
      </TableCell>
      <TableCell>
        {p.riskScore === null ? (
          <span className="text-xs text-muted-foreground">—</span>
        ) : (
          <div className="flex items-center gap-2">
            <Progress
              value={p.riskScore}
              className={cn("h-1.5 flex-1", scoreBarClass(p.riskLevel))}
            />
            <span className="text-xs font-semibold tabular-nums w-7 text-right">{p.riskScore}</span>
          </div>
        )}
      </TableCell>
      <TableCell>
        <Badge variant="outline" className="text-[10px] capitalize border-border">
          {statusLabel(p.status)}
        </Badge>
      </TableCell>
      <TableCell>
        {p.comorbidities && p.comorbidities.length > 0 ? (
          <span className="text-xs text-muted-foreground line-clamp-1" title={p.comorbidities}>
            {p.comorbidities}
          </span>
        ) : (
          <span className="text-xs text-muted-foreground italic">none</span>
        )}
      </TableCell>
    </TableRow>
  );
}

function PatientCard({ p }: { p: RiskPatient }) {
  return (
    <li className={cn("rounded-lg border border-border p-3 transition-colors", rowTintClass(p.riskLevel))}>
      <div className="flex items-start justify-between gap-2">
        <button
          onClick={() => navigate("patient-detail", { patientId: p.id })}
          className="text-left min-w-0 flex-1"
        >
          <div className="text-sm font-medium hover:text-primary hover:underline underline-offset-2 truncate">
            {p.fullName}
          </div>
          <div className="text-[11px] text-muted-foreground">
            {p.age}y · {p.gender} · {p.surgeryType}
          </div>
          <div className="text-[11px] text-muted-foreground mt-0.5">
            Day {p.recoveryDay} · {statusLabel(p.status)}
          </div>
        </button>
        <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
          <RiskBadge level={p.riskLevel} />
          {p.riskScore !== null && (
            <span className="text-xs font-semibold tabular-nums">{p.riskScore}/100</span>
          )}
        </div>
      </div>

      {p.riskScore !== null && (
        <Progress
          value={p.riskScore}
          className={cn("h-1.5 mt-2", scoreBarClass(p.riskLevel))}
        />
      )}

      <div className="flex items-center justify-between mt-2 gap-2">
        {p.comorbidities && p.comorbidities.length > 0 ? (
          <span className="text-[11px] text-muted-foreground line-clamp-1 min-w-0 flex-1" title={p.comorbidities}>
            {p.comorbidities}
          </span>
        ) : (
          <span className="text-[11px] text-muted-foreground italic">no comorbidities</span>
        )}
        {p.riskLevel === null && (
          <Button
            size="sm"
            variant="outline"
            className="h-6 px-2 text-[10px] flex-shrink-0"
            onClick={() => navigate("patient-detail", { patientId: p.id })}
          >
            Assess now <ChevronRight className="h-3 w-3" />
          </Button>
        )}
      </div>
    </li>
  );
}
