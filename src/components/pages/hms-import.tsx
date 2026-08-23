// Ojas — HMS Integration Adapter UI (P2.9).
// CSV importer for bulk patient enrollment from hospital management systems.
"use client";

import * as React from "react";
import { MotionConfig, motion } from "framer-motion";
import { toast } from "sonner";
import {
  Upload, FileText, Download, CheckCircle2, AlertTriangle,
  Loader2, RefreshCw, Database,
} from "lucide-react";

import { api } from "@/lib/auth-context";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";

interface ImportResult {
  totalRows: number;
  imported: number;
  skipped: number;
  errors: { row: number; message: string }[];
}

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4, ease: "easeOut" as const } },
};

const CSV_TEMPLATE_PREVIEW = `fullName,age,gender,mobile,surgeryType,surgeryDate,dischargeDate,comorbidities,uhid
Ramesh Kumar,65,M,+919876543210,Coronary Bypass,2025-06-01,2025-06-08,Diabetes;Hypertension,UHID-001
Priya Sharma,34,F,+919812345678,Caesarean Section,2025-06-10,2025-06-13,,UHID-002`;

export function HmsImportPage() {
  const [csvText, setCsvText] = React.useState("");
  const [importing, setImporting] = React.useState(false);
  const [result, setResult] = React.useState<ImportResult | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  const handleFile = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("File too large (max 5MB)");
      return;
    }
    const text = await file.text();
    setCsvText(text);
    toast.success(`Loaded ${file.name} (${(file.size / 1024).toFixed(1)} KB)`);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const handleImport = async () => {
    if (!csvText.trim()) {
      toast.error("Paste CSV text or upload a file first");
      return;
    }
    setImporting(true);
    setResult(null);
    try {
      const r = await fetch("/api/hms/import", {
        method: "POST",
        headers: { "content-type": "text/csv" },
        credentials: "include",
        body: csvText,
      });
      if (!r.ok) {
        const e = await r.json().catch(() => ({}));
        throw new Error(e.error || "Import failed");
      }
      const data = await r.json() as { result: ImportResult };
      setResult(data.result);
      toast.success(`Imported ${data.result.imported} patients, skipped ${data.result.skipped} duplicates`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed");
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = async () => {
    const r = await fetch("/api/hms/import", { credentials: "include" });
    if (!r.ok) {
      toast.error("Failed to download template");
      return;
    }
    const text = await r.text();
    const blob = new Blob([text], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "ojas-hms-template.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <MotionConfig reducedMotion="user">
      <div className="space-y-6">
        {/* Header */}
        <motion.div variants={fadeUp} initial="hidden" animate="show">
          <h1 className="text-2xl md:text-3xl font-semibold tracking-tight flex items-center gap-2">
            <Database className="h-7 w-7 text-primary" />
            HMS Integration — CSV Import
            <Badge variant="outline" className="ml-2 text-[10px] font-normal text-muted-foreground border-border">CSV only — HL7 v2 / FHIR R4 on roadmap</Badge>
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Bulk-enroll patients from your hospital management system. HL7/FHIR adapters coming in Q4.
          </p>
        </motion.div>

        {/* Step 1: Download template */}
        <motion.div variants={fadeUp} initial="hidden" animate="show">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Download className="h-4 w-4 text-primary" /> Step 1 — Get the template
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Download the CSV template your HMS team needs to fill in. Headers are case-insensitive.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button variant="outline" onClick={downloadTemplate}>
                <Download className="h-4 w-4 mr-2" /> Download CSV template
              </Button>
              <details className="mt-3">
                <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground">
                  Show template preview
                </summary>
                <pre className="mt-2 text-[10px] font-mono bg-muted p-3 rounded-md overflow-x-auto">
                  {CSV_TEMPLATE_PREVIEW}
                </pre>
              </details>
            </CardContent>
          </Card>
        </motion.div>

        {/* Step 2: Upload / paste */}
        <motion.div variants={fadeUp} initial="hidden" animate="show">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Upload className="h-4 w-4 text-primary" /> Step 2 — Upload CSV
              </CardTitle>
              <CardDescription className="text-xs mt-1">
                Drag & drop a file, or paste CSV text below. Max 500 rows per import.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div
                onDragOver={(e) => e.preventDefault()}
                onDrop={handleDrop}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-border rounded-lg p-8 text-center cursor-pointer hover:border-primary/50 transition-colors"
              >
                <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
                <div className="text-sm font-medium">Drop CSV here or click to browse</div>
                <div className="text-xs text-muted-foreground mt-1">Max 5MB · UTF-8 encoded</div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
              </div>
              <Textarea
                className="min-h-[180px] font-mono text-[11px]"
                placeholder="Or paste CSV text directly here…"
                value={csvText}
                onChange={(e) => setCsvText(e.target.value)}
              />
              <div className="flex items-center justify-between">
                <div className="text-xs text-muted-foreground">
                  {csvText ? `${csvText.split(/\r?\n/).filter(l => l.trim()).length - 1} rows ready` : "No data yet"}
                </div>
                <Button onClick={handleImport} disabled={importing || !csvText.trim()}>
                  {importing ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Upload className="h-4 w-4 mr-2" />}
                  Import patients
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Step 3: Results */}
        {result && (
          <motion.div variants={fadeUp} initial="hidden" animate="show">
            <Card>
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" /> Import results
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
                  <div>
                    <div className="text-2xl font-semibold">{result.totalRows}</div>
                    <div className="text-xs text-muted-foreground">Total rows</div>
                  </div>
                  <div>
                    <div className="text-2xl font-semibold text-emerald-600 flex items-center gap-1">
                      <CheckCircle2 className="h-5 w-5" /> {result.imported}
                    </div>
                    <div className="text-xs text-muted-foreground">Imported</div>
                  </div>
                  <div>
                    <div className="text-2xl font-semibold text-amber-600">{result.skipped}</div>
                    <div className="text-xs text-muted-foreground">Skipped (duplicates)</div>
                  </div>
                  <div>
                    <div className="text-2xl font-semibold text-rose-600 flex items-center gap-1">
                      <AlertTriangle className="h-5 w-5" /> {result.errors.length}
                    </div>
                    <div className="text-xs text-muted-foreground">Errors</div>
                  </div>
                </div>
                {result.errors.length > 0 && (
                  <>
                    <div className="text-sm font-medium mb-2">Error details</div>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead className="w-20">CSV row</TableHead>
                          <TableHead>Error</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {result.errors.slice(0, 20).map((e, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono text-xs">{e.row}</TableCell>
                            <TableCell className="text-xs text-rose-600">{e.message}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                    {result.errors.length > 20 && (
                      <div className="text-xs text-muted-foreground mt-2">
                        …and {result.errors.length - 20} more errors not shown
                      </div>
                    )}
                  </>
                )}
                <div className="mt-4 flex gap-2">
                  <Button variant="outline" onClick={() => { setCsvText(""); setResult(null); }}>
                    <RefreshCw className="h-4 w-4 mr-2" /> Import another file
                  </Button>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </div>
    </MotionConfig>
  );
}
