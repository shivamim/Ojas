"use client";

import * as React from "react";
import { MarketingHeader } from "@/components/marketing-header";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  FileText, Search, BookOpen, Shield, Database, Stethoscope, Settings,
  Clock, HardDrive, ArrowUpRight, Filter,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface DocEntry {
  filename: string;
  title: string;
  description: string;
  category: "Production" | "Security" | "Database" | "Healthcare" | "Operations";
  sizeBytes: number;
  approxReadingTimeMin: number;
}

const CATEGORY_META: Record<DocEntry["category"], { icon: React.ComponentType<{ className?: string }>; tone: string; label: string }> = {
  Production: { icon: Settings, tone: "border-primary/30 bg-primary/10 text-primary", label: "Production" },
  Security: { icon: Shield, tone: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-400", label: "Security" },
  Database: { icon: Database, tone: "border-blue-500/40 bg-blue-500/10 text-blue-700 dark:text-blue-400", label: "Database" },
  Healthcare: { icon: Stethoscope, tone: "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-400", label: "Healthcare" },
  Operations: { icon: BookOpen, tone: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400", label: "Operations" },
};

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentationPage() {
  const [docs, setDocs] = React.useState<DocEntry[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [query, setQuery] = React.useState("");
  const [activeCategory, setActiveCategory] = React.useState<DocEntry["category"] | "All">("All");

  React.useEffect(() => {
    fetch("/api/docs")
      .then((r) => r.json())
      .then((d: { docs: DocEntry[] }) => { setDocs(d.docs ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  const categories = React.useMemo(() => {
    const set = new Set(docs.map((d) => d.category));
    return ["All", ...Array.from(set)] as (DocEntry["category"] | "All")[];
  }, [docs]);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return docs.filter((d) => {
      if (activeCategory !== "All" && d.category !== activeCategory) return false;
      if (!q) return true;
      return d.title.toLowerCase().includes(q) || d.description.toLowerCase().includes(q) || d.filename.toLowerCase().includes(q);
    });
  }, [docs, query, activeCategory]);

  return (
    <div className="min-h-screen bg-gradient-to-b from-background via-background to-primary/5">
      <MarketingHeader />

      <main className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        {/* Hero */}
        <div className="text-center mb-10 sm:mb-12">
          <div className="inline-flex items-center gap-1.5 text-eyebrow text-primary mb-3">
            <FileText className="h-3.5 w-3.5" />
            DOCUMENTATION
          </div>
          <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">
            Production documentation
          </h1>
          <p className="mt-4 text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            Every document is grounded in the actual codebase — file paths, function names, env vars, and model names. No marketing claims. {docs.length} documents covering production readiness, security, database, healthcare integrations, and operations.
          </p>
        </div>

        {/* Search + filter */}
        <div className="mb-8 space-y-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search documents by title, description, or filename…"
              className="pl-10 text-sm h-11"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="flex items-center gap-1 text-xs text-muted-foreground mr-1">
              <Filter className="h-3 w-3" /> Filter:
            </span>
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={cn(
                  "px-2.5 py-1 rounded-full text-xs font-medium transition-colors border",
                  activeCategory === cat
                    ? "bg-primary text-primary-foreground border-primary"
                    : "bg-background border-border text-muted-foreground hover:bg-muted",
                )}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>

        {/* Docs grid */}
        {loading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Array.from({ length: 9 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
          </div>
        ) : filtered.length === 0 ? (
          <Card><CardContent className="p-8 text-center text-sm text-muted-foreground">No documents match your search.</CardContent></Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filtered.map((doc) => {
              const meta = CATEGORY_META[doc.category];
              return (
                <a
                  key={doc.filename}
                  href={`/docs/${doc.filename}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block group"
                >
                  <Card className="h-full elevate-2 hover:-translate-y-0.5 transition-transform overflow-hidden">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center flex-shrink-0", meta.tone)}>
                          <meta.icon className="h-4.5 w-4.5" />
                        </div>
                        <Badge variant="outline" className={cn("text-[9px] uppercase tracking-wider gap-1", meta.tone)}>
                          {meta.label}
                        </Badge>
                      </div>
                      <CardTitle className="text-sm font-semibold flex items-center gap-1.5">
                        {doc.title}
                        <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground/50 group-hover:text-primary transition-colors" />
                      </CardTitle>
                      <CardDescription className="text-xs mt-1 leading-relaxed line-clamp-2">
                        {doc.description}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="flex items-center justify-between text-[10px] text-muted-foreground/80 font-mono">
                        <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> {doc.approxReadingTimeMin} min</span>
                        <span className="flex items-center gap-1"><HardDrive className="h-3 w-3" /> {formatBytes(doc.sizeBytes)}</span>
                      </div>
                    </CardContent>
                  </Card>
                </a>
              );
            })}
          </div>
        )}

        {/* Footer note */}
        <div className="mt-10 text-center">
          <p className="text-xs text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            These documents live in the <code className="bg-muted px-1 py-0.5 rounded">docs/</code> directory of the repository and are version-controlled alongside the source code. They are updated as part of every production-hardening change.
          </p>
        </div>
      </main>
    </div>
  );
}
