// Ojas — P1.6 NABH Entry Level Evidence Binder page.
// Auto-generates compliance documentation from data already in the system.
// v2 — 14 standards across 6 NABH chapters with per-chapter compliance rollup,
// per-standard evidence description, and PDF export via browser print.
"use client";

import * as React from "react";
import { MotionConfig, motion } from "framer-motion";
import { toast } from "sonner";
import {
  BookCheck, RefreshCw, FileDown, CheckCircle2, XCircle, Clock,
  Hospital, ShieldCheck, Printer, Info,
} from "lucide-react";

import { api } from "@/lib/auth-context";
import { cn } from "@/lib/utils";
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Tooltip, TooltipContent, TooltipProvider, TooltipTrigger,
} from "@/components/ui/tooltip";

// ── Types matching /api/nabh/binder contract ────────────────────────────────
type NabhStatus = "MET" | "GAP" | "PARTIAL";

interface NabhStandardResult {
  code: string;
  title: string;
  chapter: string;
  chapterLabel: string;
  category: "Core" | "Commitment" | "Achievement" | "Excellence";
  source: string;
  model: string;
  query: string;
  count: number;
  status: NabhStatus;
  description: string;
}

interface NabhChapter {
  id: string;
  label: string;
  total: number;
  met: number;
  complianceScore: number;
}

interface NabhBinder {
  hospitalId: string;
  hospitalName: string;
  generatedAt: string;
  standards: NabhStandardResult[];
  chapters: NabhChapter[];
  complianceScore: number;
  metCount: number;
  totalCount: number;
  coreMetCount: number;
  coreTotalCount: number;
  coreComplianceScore: number;
}

function statusBadge(status: NabhStatus) {
  switch (status) {
    case "MET":
      return (
        <Badge className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/30 hover:bg-emerald-500/20">
          <CheckCircle2 className="h-3 w-3 mr-1" /> MET
        </Badge>
      );
    case "GAP":
      return (
        <Badge className="bg-rose-500/15 text-rose-700 dark:text-rose-300 border-rose-500/30 hover:bg-rose-500/20">
          <XCircle className="h-3 w-3 mr-1" /> GAP
        </Badge>
      );
    case "PARTIAL":
      return (
        <Badge className="bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/30 hover:bg-amber-500/20">
          <Clock className="h-3 w-3 mr-1" /> PARTIAL
        </Badge>
      );
  }
}

function formatDateTime(iso: string): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleString(undefined, {
    year: "numeric", month: "short", day: "numeric",
    hour: "2-digit", minute: "2-digit",
  });
}

// ── Chapter icon/color mapping ──────────────────────────────────────────────
const CHAPTER_COLORS: Record<string, { bg: string; text: string; ring: string }> = {
  AAC: { bg: "bg-primary/10", text: "text-primary", ring: "ring-primary/20" },
  COP: { bg: "bg-emerald-500/10", text: "text-emerald-700 dark:text-emerald-300", ring: "ring-emerald-500/20" },
  MOM: { bg: "bg-rose-500/10", text: "text-rose-700 dark:text-rose-300", ring: "ring-rose-500/20" },
  PRE: { bg: "bg-amber-500/10", text: "text-amber-700 dark:text-amber-300", ring: "ring-amber-500/20" },
  IPC: { bg: "bg-purple-500/10", text: "text-purple-700 dark:text-purple-300", ring: "ring-purple-500/20" },
  PSQ: { bg: "bg-cyan-500/10", text: "text-cyan-700 dark:text-cyan-300", ring: "ring-cyan-500/20" },
  IMS: { bg: "bg-teal-500/10", text: "text-teal-700 dark:text-teal-300", ring: "ring-teal-500/20" },
};

function chapterColor(id: string) {
  return CHAPTER_COLORS[id] ?? { bg: "bg-muted", text: "text-muted-foreground", ring: "ring-border" };
}

// ── PDF export via browser print ────────────────────────────────────────────
// Opens a new window with a print-optimized HTML document containing the
// full binder (header, compliance score, chapters, standards table). The
// user can then save as PDF from the browser's print dialog.
function exportBinderAsPdf(binder: NabhBinder) {
  const win = window.open("", "_blank", "width=1024,height=768");
  if (!win) {
    toast.error("Pop-up blocked", { description: "Allow pop-ups to export the binder as PDF." });
    return;
  }

  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<title>NABH 6th Edition Evidence Binder — ${binder.hospitalName}</title>
<style>
  * { box-sizing: border-box; }
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; margin: 40px; color: #1a1a1a; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  h2 { font-size: 18px; margin: 24px 0 8px; padding-bottom: 6px; border-bottom: 2px solid #e5e7eb; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 24px; padding-bottom: 16px; border-bottom: 1px solid #d1d5db; }
  .header .meta { text-align: right; font-size: 12px; color: #6b7280; }
  .score-row { display: flex; align-items: center; gap: 24px; margin-bottom: 32px; padding: 16px; background: #f9fafb; border-radius: 8px; }
  .score-ring { width: 96px; height: 96px; border-radius: 50%; background: conic-gradient(${binder.complianceScore >= 75 ? "#10b981" : binder.complianceScore >= 50 ? "#f59e0b" : "#ef4444"} ${binder.complianceScore * 3.6}deg, #e5e7eb 0deg); display: flex; align-items: center; justify-content: center; }
  .score-ring .inner { width: 76px; height: 76px; border-radius: 50%; background: white; display: flex; flex-direction: column; align-items: center; justify-content: center; font-size: 20px; font-weight: 700; }
  .score-ring .inner small { font-size: 10px; color: #6b7280; font-weight: 500; text-transform: uppercase; letter-spacing: 0.05em; }
  .score-meta { flex: 1; }
  .score-meta .label { font-size: 11px; color: #6b7280; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 600; }
  .score-meta .value { font-size: 16px; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-top: 8px; }
  th { text-align: left; padding: 8px 10px; background: #f3f4f6; border: 1px solid #d1d5db; font-weight: 600; font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; }
  td { padding: 10px; border: 1px solid #e5e7eb; vertical-align: top; }
  td.code { font-family: monospace; font-weight: 600; white-space: nowrap; }
  td.count { text-align: right; font-variant-numeric: tabular-nums; font-weight: 600; }
  td.status { text-align: center; }
  .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 10px; font-weight: 700; letter-spacing: 0.05em; }
  .badge.met { background: #d1fae5; color: #065f46; }
  .badge.gap { background: #fee2e2; color: #991b1b; }
  .badge.partial { background: #fef3c7; color: #92400e; }
  .chapter-card { margin-bottom: 16px; padding: 12px 16px; border-left: 4px solid #10b981; background: #f9fafb; border-radius: 4px; }
  .chapter-card.warn { border-left-color: #f59e0b; }
  .chapter-card.bad { border-left-color: #ef4444; }
  .chapter-card .head { display: flex; justify-content: space-between; align-items: baseline; }
  .chapter-card .name { font-weight: 600; font-size: 14px; }
  .chapter-card .stat { font-size: 12px; color: #6b7280; }
  .desc { font-size: 11px; color: #4b5563; margin-top: 4px; line-height: 1.4; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #d1d5db; font-size: 11px; color: #6b7280; }
  .footer p { margin: 4px 0; }
  @media print { body { margin: 20px; } .header { page-break-after: avoid; } h2 { page-break-after: avoid; } table { page-break-inside: auto; } tr { page-break-inside: avoid; } }
</style>
</head>
<body>
<div class="header">
  <div>
    <h1>NABH 6th Edition Evidence Binder</h1>
    <div style="font-size: 14px; color: #6b7280; margin-top: 4px;">${binder.hospitalName}</div>
  </div>
  <div class="meta">
    <div>Generated: ${formatDateTime(binder.generatedAt)}</div>
    <div>Standards tracked: ${binder.totalCount}</div>
    <div>Standards met: ${binder.metCount}</div>
    <div>Core compliance: ${binder.coreMetCount}/${binder.coreTotalCount} (${binder.coreComplianceScore}%)</div>
  </div>
</div>

<div class="score-row">
  <div class="score-ring">
    <div class="inner">
      ${binder.complianceScore}%
      <small>met</small>
    </div>
  </div>
  <div class="score-meta">
    <div class="label">Compliance Score</div>
    <div class="value">${binder.metCount} of ${binder.totalCount} standards met (${binder.complianceScore}%) · Core: ${binder.coreMetCount}/${binder.coreTotalCount} (${binder.coreComplianceScore}%)</div>
    <div style="font-size: 12px; color: #6b7280; margin-top: 6px;">
      ${binder.coreComplianceScore === 100 ? "✅ Core compliance at 100% — meets NABH 6th Edition mandatory requirement." :
        `⚠️ Core compliance at ${binder.coreComplianceScore}% — NABH requires 100% Core standard compliance for accreditation.`}
      ${binder.complianceScore >= 75 ? " Overall accreditation-ready." :
        binder.complianceScore >= 50 ? " In progress — several chapters need evidence." :
        " Early stage — focus on closing GAPs first."}
    </div>
  </div>
</div>

<h2>Chapter Summary</h2>
${binder.chapters.map((c) => {
  const cls = c.complianceScore >= 75 ? "" : c.complianceScore >= 50 ? "warn" : "bad";
  return `<div class="chapter-card ${cls}">
    <div class="head">
      <span class="name">${c.id} · ${c.label}</span>
      <span class="stat">${c.met} of ${c.total} met · ${c.complianceScore}%</span>
    </div>
  </div>`;
}).join("")}

<h2>Standards Evidence</h2>
<table>
  <thead>
    <tr>
      <th style="width: 80px;">Code</th>
      <th>Standard</th>
      <th style="width: 70px;">Category</th>
      <th>Chapter</th>
      <th style="width: 60px;">Records</th>
      <th style="width: 80px;">Status</th>
    </tr>
  </thead>
  <tbody>
    ${binder.standards.map((s) => `
      <tr>
        <td class="code">${s.code}</td>
        <td>
          <div style="font-weight: 600;">${s.title}</div>
          <div class="desc">${s.description}</div>
          <div style="font-size: 10px; color: #9ca3af; margin-top: 4px;">Source: ${s.source}</div>
        </td>
        <td style="text-align:center;"><span style="display:inline-block;padding:2px 6px;border-radius:3px;font-size:10px;font-weight:600;background:${s.category === "Core" ? "#fee2e2" : s.category === "Commitment" ? "#dbeafe" : s.category === "Achievement" ? "#d1fae5" : "#fef3c7"};color:${s.category === "Core" ? "#991b1b" : s.category === "Commitment" ? "#1e40af" : s.category === "Achievement" ? "#065f46" : "#92400e"};">${s.category}</span></td>
        <td><span style="font-family: monospace; font-size: 11px;">${s.chapter}</span><br/><span style="font-size: 10px; color: #6b7280;">${s.chapterLabel}</span></td>
        <td class="count">${s.count}</td>
        <td class="status"><span class="badge ${s.status.toLowerCase()}">${s.status}</span></td>
      </tr>
    `).join("")}
  </tbody>
</table>

<div class="footer">
  <p><strong>About this binder:</strong> Auto-generated from data already in Ojas. Each standard is mapped to a live data source; a count ≥ 1 is MET, 0 is a GAP. Core standards require 100% compliance per NABH 6th Edition.</p>
  <p>Generated by Ojas · AI-native post-discharge care · NABH 6th Edition · ${new Date().getFullYear()}</p>
</div>

<script>
  window.onload = function() { window.print(); };
</script>
</body>
</html>`;

  win.document.open();
  win.document.write(html);
  win.document.close();
  toast.success("PDF export ready", { description: "Print dialog opened — save as PDF from the new window." });
}

// ── Page ────────────────────────────────────────────────────────────────────
export function NabhBinderPage() {
  const [binder, setBinder] = React.useState<NabhBinder | null>(null);
  const [loading, setLoading] = React.useState(true);

  const load = React.useCallback(async () => {
    setLoading(true);
    try {
      const r = await api<NabhBinder>("/api/nabh/binder");
      setBinder(r);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load NABH binder");
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => { load(); }, [load]);

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-6">
        {/* Header */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
          className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4"
        >
          <div>
            <h1 className="text-2xl md:text-3xl font-semibold tracking-tight flex items-center gap-2">
              <BookCheck className="h-6 w-6 text-primary" />
              NABH 6th Edition Evidence Binder
            </h1>
            <p className="text-sm text-muted-foreground mt-1">
              Auto-generated from data already in Ojas. NABH 6th Edition — {binder?.totalCount ?? "…"} standards across {binder?.chapters.length ?? "…"} chapters. Core compliance requires 100%.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              <RefreshCw className={cn("h-4 w-4 mr-1.5", loading && "animate-spin")} />
              Regenerate
            </Button>
            <Button
              size="sm"
              onClick={() => binder ? exportBinderAsPdf(binder) : toast.error("Binder still loading")}
              disabled={loading || !binder}
            >
              <FileDown className="h-4 w-4 mr-1.5" />
              Export PDF
            </Button>
          </div>
        </motion.section>

        {/* Top: hospital info + compliance score */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.06 }}
        >
          <Card className="glass">
            <CardContent className="p-4 md:p-6">
              <div className="flex flex-col lg:flex-row items-start lg:items-center gap-6">
                {/* Compliance score ring */}
                <div className="flex items-center gap-4 flex-shrink-0">
                  <ComplianceRing
                    score={binder?.complianceScore ?? 0}
                    loading={loading}
                  />
                  <div>
                    <div className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                      Compliance score
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {binder ? `${binder.metCount} of ${binder.totalCount} standards met · Core: ${binder.coreMetCount}/${binder.coreTotalCount} (${binder.coreComplianceScore}%)` : "—"}
                    </div>
                    <Badge variant="outline" className="mt-2 text-[10px] uppercase tracking-wider">
                      <ShieldCheck className="h-3 w-3 mr-1" />
                      {binder && binder.complianceScore >= 75 ? "Accreditation-ready"
                        : binder && binder.complianceScore >= 50 ? "In progress"
                        : "Early stage"}
                    </Badge>
                  </div>
                </div>

                {/* Hospital info */}
                <div className="flex-1 grid grid-cols-2 md:grid-cols-3 gap-4 w-full">
                  <InfoCell
                    icon={Hospital}
                    label="Hospital"
                    value={binder?.hospitalName}
                    loading={loading}
                  />
                  <InfoCell
                    icon={Clock}
                    label="Last updated"
                    value={binder ? formatDateTime(binder.generatedAt) : null}
                    loading={loading}
                  />
                  <InfoCell
                    icon={BookCheck}
                    label="Standards tracked"
                    value={binder ? `${binder.totalCount} across ${binder.chapters.length} chapters` : null}
                    loading={loading}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.section>

        {/* Chapter cards */}
        {!loading && binder && (
          <motion.section
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3, delay: 0.1 }}
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3"
          >
            {binder.chapters.map((c, i) => (
              <ChapterCard key={c.id} chapter={c} delay={0.12 + i * 0.04} />
            ))}
          </motion.section>
        )}

        {/* Standards table */}
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3, delay: 0.18 }}
        >
          <Card className="glass">
            <CardHeader className="border-b border-border">
              <CardTitle className="flex items-center gap-2 text-base">
                <BookCheck className="h-4 w-4 text-primary" />
                Standards evidence
              </CardTitle>
              <CardDescription>
                Each NABH Entry Level standard is mapped to a live data source in Ojas. A count &gt; 0 is MET (data substrate exists); 0 is a GAP.
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              {loading ? (
                <div className="p-4 space-y-3">
                  {Array.from({ length: 14 }).map((_, i) => (
                    <Skeleton key={i} className="h-14 w-full" />
                  ))}
                </div>
              ) : !binder || binder.standards.length === 0 ? (
                <div className="flex flex-col items-center justify-center text-center py-16 px-6">
                  <BookCheck className="h-10 w-10 text-muted-foreground/40 mb-3" />
                  <p className="text-sm text-muted-foreground">No standards data available</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-[90px]">Code</TableHead>
                        <TableHead>Standard</TableHead>
                        <TableHead className="hidden md:table-cell w-[100px]">Category</TableHead>
                        <TableHead className="hidden md:table-cell w-[120px]">Chapter</TableHead>
                        <TableHead className="text-right w-[80px]">Records</TableHead>
                        <TableHead className="w-[110px] text-right">Status</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {binder.standards.map((s) => {
                        const cc = chapterColor(s.chapter);
                        return (
                          <TableRow key={s.code}>
                            <TableCell className="font-mono text-xs font-semibold">{s.code}</TableCell>
                            <TableCell>
                              <div className="font-medium">{s.title}</div>
                              <div className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2 max-w-xl">
                                {s.description}
                              </div>
                              <div className="text-[10px] text-muted-foreground/70 mt-1 flex items-center gap-1">
                                <Info className="h-3 w-3" /> Source: {s.source}
                              </div>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <Badge variant="outline" className={cn("text-[10px] uppercase tracking-wider",
                                s.category === "Core" ? "bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/30" :
                                s.category === "Commitment" ? "bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-500/30" :
                                s.category === "Achievement" ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/30" :
                                "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/30"
                              )}>
                                {s.category}
                              </Badge>
                            </TableCell>
                            <TableCell className="hidden md:table-cell">
                              <TooltipProvider>
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <span className={cn("inline-flex items-center justify-center px-1.5 py-0.5 rounded text-[10px] font-bold font-mono", cc.bg, cc.text)}>
                                      {s.chapter}
                                    </span>
                                  </TooltipTrigger>
                                  <TooltipContent>
                                    <div className="text-xs">
                                      <div className="font-semibold">{s.chapterLabel}</div>
                                      <div className="text-muted-foreground mt-0.5">{s.chapter} chapter</div>
                                    </div>
                                  </TooltipContent>
                                </Tooltip>
                              </TooltipProvider>
                            </TableCell>
                            <TableCell className="text-right tabular-nums font-semibold">
                              {s.count}
                            </TableCell>
                            <TableCell className="text-right">
                              {statusBadge(s.status)}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </motion.section>
      </div>
    </MotionConfig>
  );
}

// ── Compliance ring (circular progress) ─────────────────────────────────────
function ComplianceRing({ score, loading }: { score: number; loading: boolean }) {
  // SVG circular progress. Score is 0..100.
  const R = 36;
  const C = 2 * Math.PI * R;
  const clamped = Math.max(0, Math.min(100, score));
  const offset = C * (1 - clamped / 100);
  const color = clamped >= 75 ? "oklch(0.62 0.14 165)"
    : clamped >= 50 ? "oklch(0.78 0.14 75)"
    : "oklch(0.58 0.22 25)";
  return (
    <div className="relative h-24 w-24 flex-shrink-0">
      {loading ? (
        <Skeleton className="h-24 w-24 rounded-full" />
      ) : (
        <>
          <svg className="h-24 w-24 -rotate-90" viewBox="0 0 96 96">
            <circle
              cx="48" cy="48" r={R}
              fill="none"
              stroke="var(--muted)"
              strokeWidth="8"
              opacity="0.3"
            />
            <circle
              cx="48" cy="48" r={R}
              fill="none"
              stroke={color}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={C}
              strokeDashoffset={offset}
              style={{ transition: "stroke-dashoffset 0.6s ease-out" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-semibold tabular-nums">{clamped}%</span>
            <span className="text-[9px] text-muted-foreground uppercase tracking-wider">met</span>
          </div>
        </>
      )}
    </div>
  );
}

// ── Chapter card ────────────────────────────────────────────────────────────
function ChapterCard({ chapter, delay }: { chapter: NabhChapter; delay: number }) {
  const cc = chapterColor(chapter.id);
  const pct = chapter.complianceScore;
  const barColor = pct >= 75 ? "bg-emerald-500"
    : pct >= 50 ? "bg-amber-500"
    : "bg-rose-500";
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay }}
    >
      <Card className={cn("glass elevate-1 h-full", "ring-1", cc.ring)}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between gap-2 mb-3">
            <div className="flex items-center gap-2 min-w-0">
              <span className={cn("flex items-center justify-center h-7 w-7 rounded-md font-mono text-[10px] font-bold flex-shrink-0", cc.bg, cc.text)}>
                {chapter.id}
              </span>
              <div className="min-w-0">
                <div className="text-xs font-semibold truncate">{chapter.label}</div>
                <div className="text-[10px] text-muted-foreground">
                  {chapter.met} of {chapter.total} met
                </div>
              </div>
            </div>
            <span className={cn(
              "text-sm font-bold tabular-nums",
              pct >= 75 ? "text-emerald-600 dark:text-emerald-400"
                : pct >= 50 ? "text-amber-600 dark:text-amber-400"
                : "text-rose-600 dark:text-rose-400"
            )}>
              {pct}%
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted overflow-hidden">
            <motion.div
              className={cn("h-full rounded-full", barColor)}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.7, delay: delay + 0.05, ease: [0.2, 0.8, 0.2, 1] }}
            />
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ── Info cell ───────────────────────────────────────────────────────────────
function InfoCell({
  icon: Icon, label, value, loading,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string | null | undefined;
  loading: boolean;
}) {
  return (
    <div>
      <div className="flex items-center gap-1.5 mb-1">
        <Icon className="h-3.5 w-3.5 text-muted-foreground" />
        <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider">
          {label}
        </span>
      </div>
      {loading ? (
        <Skeleton className="h-5 w-32" />
      ) : (
        <div className="text-sm font-medium truncate">{value ?? "—"}</div>
      )}
    </div>
  );
}
