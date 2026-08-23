// Ojas — Patient vitals API. Returns combined pain + temperature trend data
// for the patient detail page's recovery chart.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireAuth, requireTenantAccess } from "@/lib/auth";
import { withErrors } from "@/lib/api-handler";
import { jsonError } from "@/lib/server-utils";

type Ctx = { params: Promise<{ id: string }> };

async function GETImpl(_req: NextRequest, ctx: Ctx) {
  const user = requireAuth(await getCurrentUser());
  const { id } = await ctx.params;
  const patient = await db.patient.findUnique({ where: { id } });
  if (!patient) return jsonError("Patient not found", 404);
  await requireTenantAccess(user, patient.hospitalId);

  const checkins = await db.checkin.findMany({
    where: { patientId: id, status: "ANSWERED" },
    orderBy: { scheduledFor: "asc" },
  });

  const vitals = checkins
    .filter((c) => c.painLevel !== null || c.temperature !== null)
    .map((c, i) => ({
      day: i + 1,
      date: c.scheduledFor.toISOString().slice(0, 10),
      pain: c.painLevel,
      temp: c.temperature,
      symptoms: c.symptomsText,
      riskLevel: c.aiRiskLevel,
    }));

  // Compute summary stats
  const painValues = vitals.map((v) => v.pain).filter((v): v is number => v !== null);
  const tempValues = vitals.map((v) => v.temp).filter((v): v is number => v !== null);
  const latest = vitals[vitals.length - 1] || null;
  const previous = vitals[vitals.length - 2] || null;

  const summary = {
    totalAnswered: checkins.length,
    avgPain: painValues.length > 0 ? Math.round((painValues.reduce((a, b) => a + b, 0) / painValues.length) * 10) / 10 : null,
    maxPain: painValues.length > 0 ? Math.max(...painValues) : null,
    latestPain: latest?.pain ?? null,
    previousPain: previous?.pain ?? null,
    painTrend: latest?.pain !== null && previous?.pain !== null && latest?.pain !== undefined && previous?.pain !== undefined
      ? (latest.pain > previous.pain ? "increasing" : latest.pain < previous.pain ? "decreasing" : "stable")
      : "unknown",
    latestTemp: latest?.temp ?? null,
    maxTemp: tempValues.length > 0 ? Math.max(...tempValues) : null,
    feverEpisodes: tempValues.filter((t) => t >= 38).length,
  };

  return Response.json({ vitals, summary });
}

export const GET = withErrors(GETImpl);
