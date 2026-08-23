// Ojas — NHCX live-gating gate advance + rollback endpoint.
// POST /api/integrations/readiness/gate — advance a hospital to the next NHCX gate.
// DELETE /api/integrations/readiness/gate — rollback to FAILED (cert expiry / incident).
//
// V3-23: an operator CANNOT flip NHCX LIVE by accident. Each gate is verified +
// timestamped + audited on the HospitalIntegrationProfile. LIVE is double-gated
// (DB gates + NHCX_ENVIRONMENT=LIVE env override). See live-gating.ts.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { audit, getClientIp, jsonError } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import { validate, ValidationError, nhcxGateAdvanceSchema, nhcxGateRollbackSchema } from "@/lib/validation";
import { advanceNhcxGate, rollbackNhcxGate, NhcxLiveGatingError, getCurrentNhcxGate, NHCX_GATE_ORDER } from "@/lib/integrations/nhcx/live-gating";

type Ctx = { params: Promise<{}> };

async function POSTImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);

  let body;
  try {
    body = validate(nhcxGateAdvanceSchema, await req.json());
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid request body", 400);
  }

  try {
    const result = await advanceNhcxGate(user.hospitalId, body.gate, {
      actorId: user.sub,
      evidence: body.evidence ?? undefined,
    });
    return Response.json({ ...result, ok: true, currentGate: await getCurrentNhcxGate(user.hospitalId) });
  } catch (e) {
    if (e instanceof NhcxLiveGatingError) return jsonError(e.message, 400);
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    throw e;
  }
}

async function DELETEImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);

  let body;
  try {
    body = validate(nhcxGateRollbackSchema, await req.json());
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid request body", 400);
  }

  await rollbackNhcxGate(user.hospitalId, body.reason, { actorId: user.sub });
  return Response.json({ ok: true, currentGate: await getCurrentNhcxGate(user.hospitalId) });
}

// GET — returns the gate sequence + current gate (for the UI stepper).
async function GETImpl(_req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);
  const current = await getCurrentNhcxGate(user.hospitalId);
  return Response.json({
    gates: NHCX_GATE_ORDER,
    currentGate: current,
    currentIndex: current ? NHCX_GATE_ORDER.indexOf(current) : -1,
  });
}

export const POST = withErrors(POSTImpl);
export const DELETE = withErrors(DELETEImpl);
export const GET = withErrors(GETImpl);
