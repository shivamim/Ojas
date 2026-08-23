// Ojas — billing API. Plan tiers + current subscription + usage metering.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole, requireTenantAccess } from "@/lib/auth";
import { jsonError, audit, getClientIp } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import { parseBody, billingActivateSchema, ValidationError } from "@/lib/validation";

type Ctx = { params: Promise<{}> };

export const PLAN_TIERS = [
  {
    id: "PILOT", name: "Pilot", price: "Free for 30 days",
    patientLimit: 25, aiEnabled: true,
    features: ["Up to 25 active patients", "All 6 AI agents (real LLM calls)", "WhatsApp check-in scheduling", "Family Recovery Companion", "Escalation worklist + SLA", "NABH Entry Level binder", "Email digest"],
    notIncluded: ["Custom check-in cadence", "SSO", "Dedicated CSM"],
  },
  {
    id: "GROWTH", name: "Growth", price: "₹14,999/mo", popular: true,
    patientLimit: 500, aiEnabled: true,
    features: ["Up to 500 active patients", "Unlimited AI triage (Groq + Bedrock fallback)", "Conversational agent (Hinglish + 6 languages)", "Care coach agent", "Insights agent (weekly)", "Family Companion + Timeline Share", "Custom check-in cadence", "DPDP Lite", "Priority support"],
    notIncluded: ["SSO / SAML", "Dedicated CSM"],
  },
  {
    id: "ENTERPRISE", name: "Enterprise", price: "Custom",
    patientLimit: 5000, aiEnabled: true,
    features: ["Up to 5,000 active patients", "All AI agents, uncapped", "SSO / SAML", "Dedicated CSM", "On-premise option", "HMS integration adapter", "99.9% SLA with AI provider fallback"],
    notIncluded: [],
  },
] as const;

async function GETImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR", "SUPER_ADMIN"]);
  const plans = PLAN_TIERS;
  if (user.role === "SUPER_ADMIN") {
    return Response.json({ plans });
  }
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);
  const hospital = await db.hospital.findUnique({
    where: { id: user.hospitalId },
    include: { subscriptions: true, settings: true },
  });
  if (!hospital) return jsonError("Hospital not found", 404);
  const subscription = hospital.subscriptions[0] || null;
  // Real usage metering: counts from actual DB rows
  const [patientCount, aiCallsThisMonth] = await Promise.all([
    db.patient.count({ where: { hospitalId: user.hospitalId, deletedAt: null } }),
    db.aiAgentRun.count({
      where: {
        hospitalId: user.hospitalId,
        createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
      },
    }),
  ]);
  return Response.json({
    plans,
    current: {
      planTier: hospital.planTier,
      subscription,
      usage: {
        patientsUsed: patientCount,
        patientsLimit: subscription?.patientLimit ?? 25,
        aiCallsThisMonth,
        aiCallsLimit: hospital.planTier === "PILOT" ? 1000 : hospital.planTier === "GROWTH" ? 20000 : 100000,
      },
    },
  });
}

async function POSTImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);
  let body: { planTier: "PILOT" | "GROWTH" | "ENTERPRISE" };
  try {
    body = await parseBody(req, billingActivateSchema);
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid body", 400);
  }
  // P0.4: STARTER removed from new signups; only PILOT/GROWTH/ENTERPRISE accepted
  // (enforced by the schema's enum).
  const limit = body.planTier === "GROWTH" ? 500 : body.planTier === "ENTERPRISE" ? 5000 : 25;
  const [updated] = await db.$transaction([
    db.hospital.update({ where: { id: user.hospitalId }, data: { planTier: body.planTier } }),
  ]);
  // Upsert subscription
  const existing = await db.subscription.findFirst({ where: { hospitalId: user.hospitalId } });
  if (existing) {
    await db.subscription.update({ where: { id: existing.id }, data: { planTier: body.planTier, patientLimit: limit, currentPeriodEnd: body.planTier === "GROWTH" ? new Date(Date.now() + 30 * 86400 * 1000) : null } });
  } else {
    await db.subscription.create({ data: { hospitalId: user.hospitalId!, planTier: body.planTier, patientLimit: limit, currentPeriodEnd: body.planTier === "PILOT" ? new Date(Date.now() + 30 * 86400 * 1000) : null } });
  }
  await requireTenantAccess(user, updated.id);
  await audit({
    hospitalId: user.hospitalId, actorId: user.sub, action: "plan.change",
    target: user.hospitalId, detail: `Changed plan to ${body.planTier} (limit ${limit})`,
    ip: getClientIp(req),
  });
  return Response.json({ ok: true, planTier: body.planTier });
}

export const GET = withErrors(GETImpl);

export const POST = withErrors(POSTImpl);
