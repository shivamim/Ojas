// Ojas — NABH readiness dashboard API.
// Returns the hospital's NABH readiness summary: chapter scores, gaps,
// corrective actions, and evidence counts. Positioned as a readiness/evidence/
// gap-management tool — NOT accreditation. See docs/ (NABH section).
//
// V3-33/45: NABH is a readiness platform. A record existing does NOT mean
// compliant. The dashboard surfaces verified vs gap vs partial vs expired evidence.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { audit, getClientIp, jsonError } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import { generateNabhBinder } from "@/lib/nabh-binder";

type Ctx = { params: Promise<{}> };

async function GETImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR", "DOCTOR"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);

  // The binder computes auto-generated evidence from existing Ojas data.
  const binder = await generateNabhBinder(user.hospitalId);

  // Fetch manually-uploaded evidence records for the gap/corrective-action view.
  const evidence = await db.nabhEvidence.findMany({
    where: { hospitalId: user.hospitalId },
    orderBy: { updatedAt: "desc" },
    take: 200,
  });

  // Aggregate by status.
  const byStatus = evidence.reduce((acc, e) => {
    acc[e.status] = (acc[e.status] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  // Open gaps + corrective actions.
  const gaps = evidence.filter((e) =>
    e.status === "GAP" || e.status === "PARTIAL" || e.status === "REQUIRES_REVIEW" || e.status === "EXPIRED"
  ).map((e) => ({
    id: e.id,
    standardCode: e.standardCode,
    category: e.category,
    title: e.title,
    status: e.status,
    gapDescription: e.gapDescription,
    correctiveAction: e.correctiveAction,
    correctiveOwner: e.correctiveOwner,
    correctiveDueDate: e.correctiveDueDate,
    expiresAt: e.expiresAt,
  }));

  // Upcoming corrective-action deadlines (next 30 days).
  const now = new Date();
  const thirtyDays = new Date(now.getTime() + 30 * 86400000);
  const upcomingDeadlines = evidence.filter((e) =>
    e.correctiveDueDate && e.correctiveDueDate >= now && e.correctiveDueDate <= thirtyDays && e.status !== "VERIFIED"
  ).map((e) => ({
    id: e.id,
    standardCode: e.standardCode,
    title: e.title,
    correctiveOwner: e.correctiveOwner,
    correctiveDueDate: e.correctiveDueDate,
  }));

  // Audit the dashboard view (NABH binder generation is compliance-relevant).
  await audit({
    hospitalId: user.hospitalId, actorId: user.sub,
    action: "NABH_DASHBOARD_VIEWED",
    target: `hospital:${user.hospitalId}`,
    detail: `score=${binder.complianceScore}% met=${binder.metCount}/${binder.totalCount} core=${binder.coreMetCount}/${binder.coreTotalCount} (${binder.coreComplianceScore}%) gaps=${gaps.length}`,
    ip: getClientIp(req),
  });

  return Response.json({
    hospitalId: user.hospitalId,
    hospitalName: binder.hospitalName,
    generatedAt: binder.generatedAt,
    // Overall readiness (NOT accreditation)
    readinessScore: binder.complianceScore,
    coreReadinessScore: binder.coreComplianceScore,
    metCount: binder.metCount,
    totalCount: binder.totalCount,
    coreMetCount: binder.coreMetCount,
    coreTotalCount: binder.coreTotalCount,
    // Chapter breakdown
    chapters: binder.chapters,
    // Evidence summary
    evidence: {
      total: evidence.length,
      byStatus,
      gaps,
      upcomingDeadlines,
    },
    // Positioning (truthful)
    positioning: "NABH readiness + evidence + gap-management platform. NOT accreditation. A record existing does not mean compliant.",
  });
}

export const GET = withErrors(GETImpl);
