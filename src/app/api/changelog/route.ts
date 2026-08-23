// Ojas — Changelog API.
// Parses /home/z/my-project/worklog.md into a structured list of production-
// hardening phases so the public Changelog page can render the engineering
// timeline without hardcoding it. Each phase has: id, title, agent, task,
// stage summary, and key bullet points.
//
// The worklog format (per the system's required template) uses sections
// separated by `---` dividers, each beginning with `Task ID: <id>` followed
// by `Agent:`, `Task:`, `Work Log:` (bulleted), and `Stage Summary:`. The
// FIRST `## ` heading inside each section is used as the phase title; if none
// is found, the `Task:` line is used as the title.
//
// This parser is resilient: it handles BOTH the legacy `## Phase N — Title`
// format AND the current `Task ID: N` format, so older worklog entries and
// future entries both render correctly.
import { readFile } from "fs/promises";
import { join } from "path";
import { withErrors } from "@/lib/api-handler";

type Ctx = { params: Promise<{}> };

export interface ChangelogEntry {
  phase: string;       // "Phase 0", "Task 1", etc.
  title: string;       // human-readable title
  taskId: string;
  agent: string;
  task: string;
  stageSummary: string;
  keyPoints: string[]; // bullet lines from Work Log + Stage Summary
  category: "setup" | "hardening" | "testing" | "docs" | "feature" | "review";
  timestamp?: string;  // ISO date if derivable from content
}

/** Categorize a phase by its title + task keywords for color-coding. */
function categorize(title: string, task: string): ChangelogEntry["category"] {
  const t = (title + " " + task).toLowerCase();
  if (t.includes("baseline") || t.includes("setup") || t.includes("intake")) return "setup";
  if (t.includes("test") || t.includes("qa") || t.includes("verification")) return "testing";
  if (t.includes("doc") || t.includes("backup") || t.includes("runbook")) return "docs";
  if (t.includes("cron review") || t.includes("autonomous") || t.includes("review")) return "review";
  if (t.includes("hardening") || t.includes("fix") || t.includes("security") || t.includes("reliability") || t.includes("webhook")) return "hardening";
  return "feature";
}

/** Derive a human-readable title for a section.
 *  Priority: first `## ` heading → `Task:` line (truncated) → `Task ID` fallback. */
function deriveTitle(sectionBody: string, taskId: string, task: string): string {
  // Look for the first `## ` heading in the section.
  const headingMatch = sectionBody.match(/^##\s+(.+)$/m);
  if (headingMatch) {
    const h = headingMatch[1].trim();
    // Skip generic section headers like "A. Files Changed" — those are not
    // good titles. Use them only if no better option exists.
    if (!/^[A-Z]\.\s/.test(h)) {
      return h.replace(/\s*\(.*?\)\s*/g, " ").trim();
    }
  }
  // Fall back to the Task: line (truncated).
  if (task) {
    return task.length > 80 ? task.slice(0, 80) + "…" : task;
  }
  return `Task ${taskId}`;
}

/** Derive a phase label like "Task 1" or "Phase 0" from the task ID. */
function derivePhaseLabel(taskId: string): string {
  if (!taskId) return "Phase ?";
  // If taskId is numeric, label as "Task N".
  if (/^\d+$/.test(taskId)) return `Task ${taskId}`;
  // If it has a sub-id like "2-a", label as "Task 2-a".
  return `Task ${taskId}`;
}

/** Try to find a timestamp in the section (ISO date or "Month DD, YYYY"). */
function deriveTimestamp(body: string): string | undefined {
  const iso = body.match(/\b(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2})/);
  if (iso) return iso[1];
  const date = body.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (date) return date[1];
  return undefined;
}

async function GETImpl(_req: Request, _ctx: Ctx) {
  let raw: string;
  try {
    raw = await readFile(join(process.cwd(), "worklog.md"), "utf-8");
  } catch {
    return Response.json({ phases: [], total: 0 });
  }

  const phases: ChangelogEntry[] = [];

  // ── Strategy 1: split on `---` dividers (the current worklog format).
  // Each section may contain a `Task ID:` line. We only keep sections that
  // have a Task ID (this skips the worklog preamble + any non-task sections).
  const dividerSections = raw.split(/\n---\n/);

  for (const section of dividerSections) {
    const taskIdMatch = section.match(/Task ID:\s*(.+)/);
    if (!taskIdMatch) continue; // not a task section
    const taskId = taskIdMatch[1].trim();

    const agent = section.match(/Agent:\s*(.+)/)?.[1]?.trim() ?? "";
    const task = section.match(/Task:\s*(.+(?:\n(?!(?:Work Log|Stage Summary):).+)*)/)?.[1]?.trim() ?? "";
    const stageSummary = section.match(/Stage Summary:\s*([\s\S]*?)(?=\n---|\nTask ID:|$)/)?.[1]?.trim() ?? "";

    // Extract bullet points from Work Log section.
    const bulletLines: string[] = [];
    const workLogMatch = section.match(/Work Log:\s*\n([\s\S]*?)(?=\nStage Summary:|\nTask ID:|\n---|$)/);
    if (workLogMatch) {
      const workLog = workLogMatch[1];
      for (const line of workLog.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("- ")) {
          bulletLines.push(trimmed.slice(2).trim());
        }
      }
    }
    // Also pull bullets from Stage Summary (often the most concise).
    if (stageSummary) {
      for (const line of stageSummary.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.startsWith("- ") && bulletLines.length < 8) {
          bulletLines.push(trimmed.slice(2).trim());
        }
      }
    }

    const title = deriveTitle(section, taskId, task);
    const phase = derivePhaseLabel(taskId);
    const timestamp = deriveTimestamp(section);

    phases.push({
      phase,
      title,
      taskId,
      agent,
      task,
      stageSummary,
      keyPoints: bulletLines.slice(0, 8),
      category: categorize(title, task),
      timestamp,
    });
  }

  // ── Strategy 2 (legacy fallback): if no Task-ID sections were found, try
  // the old `## Phase N — Title` format. This keeps backward compatibility
  // with older worklog versions.
  if (phases.length === 0) {
    const legacySections = raw.split(/^## (Phase .+)$/m).filter(Boolean);
    for (let i = 1; i < legacySections.length; i += 2) {
      const header = legacySections[i].trim();
      const body = legacySections[i + 1] ?? "";
      const headerMatch = header.match(/^(Phase \d+)\s*[—–-]\s*(.+)$/);
      const phase = headerMatch?.[1] ?? header;
      const title = headerMatch?.[2] ?? header;
      const taskId = body.match(/Task ID:\s*(.+)/)?.[1]?.trim() ?? "";
      const agent = body.match(/Agent:\s*(.+)/)?.[1]?.trim() ?? "";
      const task = body.match(/Task:\s*(.+(?:\n(?!(?:Work Log|Stage Summary):).+)*)/)?.[1]?.trim() ?? "";
      const stageSummary = body.match(/Stage Summary:\s*(.+(?:\n(?!---).+)*)/)?.[1]?.trim() ?? "";
      const bulletLines: string[] = [];
      const workLogMatch = body.match(/Work Log:\s*\n([\s\S]*?)(?=\nStage Summary:|\n---|$)/);
      if (workLogMatch) {
        for (const line of workLogMatch[1].split("\n")) {
          const trimmed = line.trim();
          if (trimmed.startsWith("- ")) bulletLines.push(trimmed.slice(2).trim());
        }
      }
      phases.push({
        phase, title, taskId, agent, task, stageSummary,
        keyPoints: bulletLines.slice(0, 8),
        category: categorize(title, task),
        timestamp: deriveTimestamp(body),
      });
    }
  }

  // Sort: numeric task IDs ascending; non-numeric last.
  phases.sort((a, b) => {
    const an = parseInt(a.taskId, 10);
    const bn = parseInt(b.taskId, 10);
    if (!isNaN(an) && !isNaN(bn)) return an - bn;
    if (!isNaN(an)) return -1;
    if (!isNaN(bn)) return 1;
    return a.taskId.localeCompare(b.taskId);
  });

  return Response.json({
    phases,
    total: phases.length,
    source: "worklog.md",
    generatedAt: new Date().toISOString(),
  });
}

export const GET = withErrors(GETImpl);
