// Ojas — ABDM M4: NHCX claim submission & status.
// POST /api/abdm/nhcx — Create draft or submit pre-auth/claim (via NHCX adapter)
// GET  /api/abdm/nhcx — List claims
//
// V3 HARDENING:
//   • NHCX mode is controlled ENTIRELY by the NHCX configuration (isNhcxFullyConfigured),
//     NEVER by the ABDM configuration. (Issue A)
//   • FHIR artifacts are stored COMPLETELY (not truncated to 2000 chars). The full
//     validated FHIR bundle + responses live in the DB columns which are TEXT and
//     therefore unbounded. (Issue I)
//   • IDEMPOTENCY is enforced at two layers: (Issue J)
//       1. DB UNIQUE on clientRequestId — a concurrent duplicate insert throws P2002.
//       2. Business-level: a request with a known clientRequestId returns the
//          existing claim instead of creating/submission a duplicate.
//   • integrationSource records truthful provenance: LIVE | SANDBOX |
//     BLOCKED_BY_EXTERNAL_ONBOARDING. A local workflow is NEVER labelled LIVE. (Issue D)
//
// Uses the NHCX adapter (src/lib/integrations/nhcx-adapter.ts) + claim state
// machine (src/lib/claims/state-machine.ts). Clients CANNOT set status directly.
// IRDAI SLA: pre-auth 1hr, final auth 3hr per 2024 Master Circular.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { audit, getClientIp, jsonError } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import { validate, ValidationError, nhcxClaimCreateSchema } from "@/lib/validation";
import { applyClaimTransition, ClaimTransitionError } from "@/lib/claims/state-machine";
import {
  submitNhcxClaim,
  nhcxEnvironment,
  nhcxStatusLabel,
  toDecimal,
  type NhcxEnvironment,
} from "@/lib/integrations/nhcx-adapter";
import { isNhcxFullyConfigured } from "@/lib/env";
import { moneyToString } from "@/lib/money";

type Ctx = { params: Promise<{}> };

// V3-A: NHCX mode is derived from the NHCX configuration ONLY — never from ABDM.
const NHCX_ENV: NhcxEnvironment = nhcxEnvironment();
const SANDBOX_MODE = !isNhcxFullyConfigured; // truthful: sandbox until NHCX creds present

// V3-D: a fully-truthful source label. When the adapter is built but no creds are
// configured, the integration is BLOCKED_BY_EXTERNAL_ONBOARDING (not "live").
function integrationSource(): string {
  if (isNhcxFullyConfigured) return "LIVE";
  return "BLOCKED_BY_EXTERNAL_ONBOARDING";
}

async function POSTImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);

  let body;
  try {
    body = validate(nhcxClaimCreateSchema, await req.json());
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid request body", 400);
  }

  const patient = await db.patient.findFirst({
    where: { id: body.patientId, hospitalId: user.hospitalId, deletedAt: null },
  });
  if (!patient) return jsonError("Patient not found", 404);

  // V3-J: business-level idempotency. If the caller supplies a clientRequestId
  // (via a header) that already exists, return the existing claim — do NOT
  // create a duplicate or re-submit to NHCX. The DB UNIQUE constraint is the
  // last line of defense against a race.
  const idempotencyKey = req.headers.get("x-idempotency-key") || `ojas-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  const existing = await db.nhcxClaim.findUnique({ where: { clientRequestId: idempotencyKey } });
  if (existing) {
    // Idempotent replay — return the existing claim. Tenant check: the existing
    // claim must belong to the caller's hospital.
    if (existing.hospitalId !== user.hospitalId) return jsonError("Claim not found", 404);
    await audit({
      hospitalId: user.hospitalId, actorId: user.sub,
      action: "NHCX_CLAIM_IDEMPOTENT_REPLAY", target: existing.id,
      detail: `Idempotent replay of clientRequestId=${idempotencyKey}. Returned existing claim ${existing.claimId}; no re-submission.`,
      ip: getClientIp(req),
    });
    return Response.json({
      ok: true, replayed: true, sandbox: SANDBOX_MODE,
      nhcxEnvironment: NHCX_ENV, integrationSource: existing.integrationSource,
      claimId: existing.claimId, clientRequestId: idempotencyKey,
      status: existing.status,
      message: "Idempotent replay — existing claim returned, no duplicate submission.",
    });
  }

  const claimId = `NHCX-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const source = integrationSource();
  let claim;
  try {
    claim = await db.nhcxClaim.create({
      data: {
        hospitalId: user.hospitalId,
        patientId: body.patientId,
        abhaIdentityId: body.abhaIdentityId ?? null,
        claimId,
        clientRequestId: idempotencyKey,
        status: "DRAFT",
        claimType: body.claimType,
        packageCode: body.packageCode ?? null,
        packageName: body.packageName ?? null,
        estimatedAmount: body.estimatedAmount ? toDecimal(body.estimatedAmount) : null,
        sandboxMode: SANDBOX_MODE,
        integrationSource: source,
      },
    });
  } catch (e) {
    // P2002 = unique violation on clientRequestId (concurrent duplicate). Treat
    // as an idempotent replay: fetch + return the existing claim.
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      const race = await db.nhcxClaim.findUnique({ where: { clientRequestId: idempotencyKey } });
      if (race && race.hospitalId === user.hospitalId) {
        return Response.json({
          ok: true, replayed: true, sandbox: SANDBOX_MODE,
          nhcxEnvironment: NHCX_ENV, integrationSource: race.integrationSource,
          claimId: race.claimId, clientRequestId: idempotencyKey, status: race.status,
          message: "Idempotent replay (race) — existing claim returned.",
        });
      }
    }
    throw e;
  }

  await audit({
    hospitalId: user.hospitalId, actorId: user.sub,
    action: "NHCX_CLAIM_DRAFT_CREATED", target: claim.id,
    detail: `Draft NHCX claim ${claimId}. Environment=${NHCX_ENV} (${nhcxStatusLabel(NHCX_ENV)}). Source=${source}. Estimated=${moneyToString(claim.estimatedAmount)}.`,
    ip: getClientIp(req),
  });

  // Submit pre-auth via the adapter (builds + validates FHIR; LIVE only if configured).
  let submission: { ok: boolean; error?: string; acknowledgementId?: string } | null = null;
  try {
    const next = applyClaimTransition("DRAFT", "submit_preauth");
    const result = await submitNhcxClaim({
      claimId,
      patientName: patient.fullName,
      patientAbha: undefined,
      packageCode: body.packageCode ?? undefined,
      packageName: body.packageName ?? undefined,
      estimatedAmount: body.estimatedAmount ?? "0",
      hospitalId: user.hospitalId,
      claimType: body.claimType,
    });
    const now = new Date();
    if (result.ok) {
      // V3-I: store the COMPLETE validated FHIR bundle + response — NEVER slice().
      // The DB columns are TEXT (unbounded). For very large bundles in production
      // an object-storage reference would be used; the column is named
      // fhirClaimBundleRef to allow either a full document or a storage URI.
      await db.nhcxClaim.update({
        where: { id: claim.id },
        data: {
          status: next.status,
          submittedAt: next.submittedAt ?? now,
          preAuthDeadlineAt: new Date(now.getTime() + 3600000),
          finalAuthDeadlineAt: new Date(now.getTime() + 3 * 3600000),
          fhirClaimBundleRef: JSON.stringify(result.fhirBundle),
        },
      });
      submission = { ok: true, acknowledgementId: result.acknowledgementId };
    } else {
      submission = { ok: false, error: result.error };
    }
  } catch (e) {
    if (e instanceof ClaimTransitionError) return jsonError(e.message, 400);
    submission = { ok: false, error: e instanceof Error ? e.message : "unknown" };
  }

  await audit({
    hospitalId: user.hospitalId, actorId: user.sub,
    action: submission?.ok ? "NHCX_PRE_AUTH_SUBMITTED" : "NHCX_PRE_AUTH_SUBMIT_FAILED",
    target: claim.id,
    detail: `Pre-auth ${submission?.ok ? "submitted" : "FAILED"} for ${claimId}. Environment=${NHCX_ENV}. Source=${source}. ${submission?.error ?? ""}`.trim(),
    ip: getClientIp(req),
  });

  return Response.json({
    ok: true, sandbox: SANDBOX_MODE, nhcxEnvironment: NHCX_ENV, integrationSource: source,
    claimId, clientRequestId: idempotencyKey, submission,
    message: source === "BLOCKED_BY_EXTERNAL_ONBOARDING"
      ? "NHCX adapter built + FHIR-validated. NOT submitted to live NHCX — blocked by external onboarding (set NHCX_BASE_URL + NHCX_CLIENT_ID + NHCX_CLIENT_SECRET)."
      : undefined,
  });
}

async function GETImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);
  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get("patientId");
  const status = searchParams.get("status");
  const where: Record<string, unknown> = { hospitalId: user.hospitalId };
  if (patientId) where.patientId = patientId;
  if (status) where.status = status;
  const claims = await db.nhcxClaim.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      patient: { select: { id: true, fullName: true, uhid: true } },
      abhaIdentity: { select: { id: true, abhaNumber: true, verificationStatus: true } },
    },
  });
  return Response.json({
    claims: claims.map((c) => ({
      ...c,
      estimatedAmount: moneyToString(c.estimatedAmount),
      approvedAmount: moneyToString(c.approvedAmount),
      patientShare: moneyToString(c.patientShare),
      // Do not echo the full FHIR bundle in list responses (could be large +
      // contains package metadata). A separate detail endpoint can fetch it.
      fhirClaimBundleRef: c.fhirClaimBundleRef ? "[stored]" : null,
      fhirPreauthResponse: c.fhirPreauthResponse ? "[stored]" : null,
      fhirClaimResponse: c.fhirClaimResponse ? "[stored]" : null,
    })),
    sandboxMode: SANDBOX_MODE,
    nhcxEnvironment: NHCX_ENV,
    integrationSource: integrationSource(),
  });
}

export const POST = withErrors(POSTImpl);
export const GET = withErrors(GETImpl);
