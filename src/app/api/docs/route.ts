// Ojas — Documentation index endpoint.
// Returns a categorized, described list of all docs/*.md files so the public
// Documentation page can render a searchable index without hardcoding the list
// in the client. Reads file sizes from the filesystem. Does NOT expose file
// contents (some docs may contain operational detail) — the page links to the
// raw markdown via /docs/<filename> served by Next.js static serving.
import { readdir, stat } from "fs/promises";
import { join } from "path";
import { withErrors } from "@/lib/api-handler";

type Ctx = { params: Promise<{}> };

interface DocEntry {
  filename: string;
  title: string;
  description: string;
  category: "Production" | "Security" | "Database" | "Healthcare" | "Operations";
  sizeBytes: number;
  approxReadingTimeMin: number;
}

// Curated metadata for each doc. The filename is the source of truth; the
// description + category come from this map. Unknown docs are omitted (not
// blindly exposed).
const DOC_META: Record<string, { title: string; description: string; category: DocEntry["category"] }> = {
  "PRODUCTION_READINESS.md": { title: "Production Readiness", description: "Executive verdict, integration matrix, and overall pilot-readiness assessment.", category: "Production" },
  "PRODUCTION_CHECKLIST.md": { title: "Production Checklist", description: "Final go/no-go security gate — every mandatory control verified.", category: "Production" },
  "DEPLOYMENT.md": { title: "Deployment", description: "Vercel/standalone deployment, env vars, build commands, health checks.", category: "Production" },
  "SECURITY.md": { title: "Security", description: "Auth, RBAC, PII encryption, tenant isolation, key rotation architecture.", category: "Security" },
  "THREAT_MODEL.md": { title: "Threat Model", description: "STRIDE threat model with per-threat mitigations and residual risks.", category: "Security" },
  "INCIDENT_RESPONSE.md": { title: "Incident Response", description: "Severity levels, on-call, DPDP 72-hour breach notification flow.", category: "Operations" },
  "BACKUP_AND_RECOVERY.md": { title: "Backup & Recovery", description: "RPO/RTO, managed Postgres PITR, restore runbook, DR scenarios.", category: "Database" },
  "DATABASE_MIGRATION.md": { title: "Database Migration", description: "SQLite→PostgreSQL, Float→Decimal, enum expansions, migrate deploy.", category: "Database" },
  "DATA_FLOW.md": { title: "Data Flow", description: "ASCII diagrams for every workflow: enrollment, webhook, ABHA, NHCX, claims.", category: "Operations" },
  "INTEGRATIONS.md": { title: "Integrations", description: "Per-integration status matrix + adapter architecture.", category: "Healthcare" },
  "NHA_NHCX_PMJAY_GO_LIVE.md": { title: "NHA / NHCX / PM-JAY Go-Live", description: "The external-integration runbook: onboarding steps, credentials, certs, sandbox→live.", category: "Healthcare" },
  "HEALTHCARE_INTEGRATION_RUNBOOK.md": { title: "Healthcare Integration Runbook", description: "What Ojas implements vs what official systems do vs what staff do.", category: "Healthcare" },
  "ABDM_ABHA.md": { title: "ABDM / ABHA", description: "8-state ABHA machine (NOT_LINKED→…→KYC_VERIFIED→LINKED), search≠verified≠KYC.", category: "Healthcare" },
  "HFR_HEM_ONBOARDING.md": { title: "HFR / HEM Onboarding", description: "Facility identity — HFR ID, PM-JAY empanelment, onboarding checklist.", category: "Healthcare" },
  "PMJAY_WORKFLOW.md": { title: "PM-JAY Workflow", description: "Beneficiary→package→preauth→claim→query→settlement domain + MANUAL_PORTAL.", category: "Healthcare" },
  "MANUAL_PMJAY.md": { title: "Manual PM-JAY", description: "14-step operator portal workflow — valid production without a direct API.", category: "Healthcare" },
  "CLAIM_ENGINE.md": { title: "Claim Engine", description: "Payer-agnostic NormalizedClaim, PayerProfile, completeness engine, work queue, risk signals.", category: "Healthcare" },
  "NHCX_ARCHITECTURE.md": { title: "NHCX Architecture", description: "3 workflows (Coverage Eligibility, Claim, Communication) + transport + live-gating.", category: "Healthcare" },
  "NHCX_FHIR.md": { title: "NHCX FHIR", description: "FHIR R4 artifacts, complete storage + hashes, prerequisite chain.", category: "Healthcare" },
};

async function GETImpl(_req: Request, _ctx: Ctx) {
  const docsDir = join(process.cwd(), "docs");
  let files: string[];
  try {
    files = (await readdir(docsDir)).filter((f) => f.endsWith(".md"));
  } catch {
    return Response.json({ docs: [] });
  }

  const docs: DocEntry[] = [];
  for (const filename of files) {
    const meta = DOC_META[filename];
    if (!meta) continue; // unknown doc — don't expose
    let sizeBytes = 0;
    try {
      sizeBytes = (await stat(join(docsDir, filename))).size;
    } catch {
      // leave 0
    }
    // Rough reading-time estimate: ~250 wpm, ~6 chars/word.
    const approxReadingTimeMin = Math.max(1, Math.round((sizeBytes / 6) / 250));
    docs.push({
      filename,
      title: meta.title,
      description: meta.description,
      category: meta.category,
      sizeBytes,
      approxReadingTimeMin,
    });
  }

  // Sort: category alpha, then title.
  docs.sort((a, b) => a.category.localeCompare(b.category) || a.title.localeCompare(b.title));

  return Response.json({ docs, total: docs.length });
}

export const GET = withErrors(GETImpl);
