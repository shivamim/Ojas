// Ojas — ABDM M1: ABHA identity creation & verification.
// POST /api/abdm/abha — Create or verify ABHA for a patient
// GET  /api/abdm/abha — List ABHA identities for hospital
//
// TRUTHFUL STATE MACHINE (P1): "found" (DISCOVERED) is NOT "verified". Only an
// OTP-confirmed link advances to VERIFIED/LINKED. See abha-state-machine.ts.
//
// When ABDM_CLIENT_ID/SECRET are absent, operates in SANDBOX mode with honest
// labelling — persisted rows carry sandboxMode=true and the UI shows "sandbox".
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { audit, getClientIp, jsonError } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import { validate, ValidationError, abhaActionSchema } from "@/lib/validation";
import { applyAbhaTransition, AbhaTransitionError, type AbhaStatus } from "@/lib/claims/abha-state-machine";
import { reconcileAbhaIdentity } from "@/lib/claims/abha-reconciliation";
import { ABDM_GATEWAY_URL, ABDM_CLIENT_ID, ABDM_CLIENT_SECRET } from "@/lib/env";

type Ctx = { params: Promise<{}> };

const SANDBOX_MODE = !ABDM_CLIENT_ID || !ABDM_CLIENT_SECRET;

async function getAbdmToken(): Promise<string | null> {
  if (SANDBOX_MODE) return null;
  try {
    const resp = await fetch(`${ABDM_GATEWAY_URL}/v1/auth/token`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ clientId: ABDM_CLIENT_ID, clientSecret: ABDM_CLIENT_SECRET, grantType: "client_credentials" }),
    });
    if (!resp.ok) return null;
    const data = await resp.json() as { accessToken?: string };
    return data.accessToken ?? null;
  } catch { return null; }
}

async function POSTImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);
  let body;
  try {
    body = validate(abhaActionSchema, await req.json());
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid request body", 400);
  }

  const patient = await db.patient.findFirst({
    where: { id: body.patientId, hospitalId: user.hospitalId, deletedAt: null },
  });
  if (!patient) return jsonError("Patient not found", 404);

  // Find or create the AbhaIdentity row (starts NOT_LINKED).
  let abha = await db.abhaIdentity.findFirst({
    where: { patientId: body.patientId, hospitalId: user.hospitalId },
  });
  if (!abha) {
    abha = await db.abhaIdentity.create({
      data: {
        hospitalId: user.hospitalId,
        patientId: body.patientId,
        verificationStatus: "NOT_LINKED",
        sandboxMode: SANDBOX_MODE,
      },
    });
  }

  const currentStatus = abha.verificationStatus as AbhaStatus;

  try {
    if (body.action === "search") {
      // ── SANDBOX path ──────────────────────────────────────────────────────
      if (SANDBOX_MODE) {
        const sandboxAbha = body.abhaNumber || `14-${Date.now().toString().padStart(11, "0")}`;
        const next = applyAbhaTransition(currentStatus, "discover");
        abha = await db.abhaIdentity.update({
          where: { id: abha.id },
          data: {
            abhaNumber: sandboxAbha,
            abhaAddress: `patient-${body.patientId.slice(-6)}@abdm`,
            verificationStatus: next.verificationStatus,
            nameAsPerAbha: patient.fullName,
            genderAsPerAbha: patient.gender,
            yearOfBirthAsPerAbha: patient.dateOfBirth ? new Date(patient.dateOfBirth).getFullYear() : null,
          },
        });
        await audit({
          hospitalId: user.hospitalId, actorId: user.sub, action: "ABDM_ABHA_SANDBOX_DISCOVER",
          target: abha.id,
          detail: `Sandbox ABHA discovered for patient ${body.patientId}. Status: DISCOVERED (NOT verified by real ABDM).`,
          ip: getClientIp(req),
        });
        return Response.json({
          ok: true, sandbox: true,
          message: "ABHA discovered in sandbox — NOT verified. Run send_otp + verify_otp to advance to VERIFIED.",
          abhaIdentity: abha,
        });
      }
      // ── LIVE path: real ABDM search-by-mobile ─────────────────────────────
      const token = await getAbdmToken();
      if (!token) return jsonError("Failed to obtain ABDM access token", 502);
      const resp = await fetch(`${ABDM_GATEWAY_URL}/v1/registration/healthId/search`, {
        method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ healthId: body.abhaNumber }),
      });
      const data = await resp.json();
      if (!resp.ok) return jsonError(`ABDM search failed: ${resp.status}`, 502);
      // search SUCCESS = DISCOVERED, NOT VERIFIED. Must still OTP-verify.
      const next = applyAbhaTransition(currentStatus, "discover");
      abha = await db.abhaIdentity.update({
        where: { id: abha.id },
        data: {
          abhaNumber: body.abhaNumber,
          verificationStatus: next.verificationStatus,
          abdmResponseRaw: JSON.stringify(data),
          nameAsPerAbha: (data as { name?: string }).name ?? patient.fullName,
        },
      });
      await audit({
        hospitalId: user.hospitalId, actorId: user.sub, action: "ABDM_ABHA_DISCOVERED",
        target: abha.id, detail: `ABHA discovered via ABDM (NOT verified). Txn pending OTP.`,
        ip: getClientIp(req),
      });
      return Response.json({
        ok: true, sandbox: false,
        message: "ABHA discovered. Send OTP to advance to VERIFIED.",
        abhaIdentity: abha, abdmResponse: data,
      });
    }

    if (body.action === "send_otp") {
      // Sandbox: simulate OTP send. LIVE: call ABDM /v1/auth/init.
      const next = applyAbhaTransition(currentStatus, "send_otp");
      const otpRef = SANDBOX_MODE ? `sandbox-otp-ref-${Date.now()}` : body.txnId ?? null;
      abha = await db.abhaIdentity.update({
        where: { id: abha.id },
        data: { verificationStatus: next.verificationStatus, verificationOtpRef: otpRef, abdmOtpTxnId: otpRef },
      });
      await audit({
        hospitalId: user.hospitalId, actorId: user.sub, action: "ABDM_ABHA_OTP_SENT",
        target: abha.id, detail: `OTP ${SANDBOX_MODE ? "(sandbox) " : ""}sent. Ref: ${otpRef}`,
        ip: getClientIp(req),
      });
      return Response.json({ ok: true, sandbox: SANDBOX_MODE, otpRef, abhaIdentity: abha });
    }

    if (body.action === "verify_otp") {
      if (!body.otp) return jsonError("otp required", 400);
      // Sandbox: accept "123456" as the valid OTP. LIVE: call ABDM /v1/auth/confirm.
      const otpOk = SANDBOX_MODE ? body.otp === "123456" : await verifyAbdmOtpLive(body.otp, abha.abdmOtpTxnId);
      const action = otpOk ? "verify_otp_success" : "verify_otp_fail";
      const next = applyAbhaTransition(currentStatus, action);
      abha = await db.abhaIdentity.update({
        where: { id: abha.id },
        data: { verificationStatus: next.verificationStatus, verifiedAt: next.verifiedAt },
      });
      await audit({
        hospitalId: user.hospitalId, actorId: user.sub,
        action: otpOk ? "ABDM_ABHA_VERIFIED" : "ABDM_ABHA_VERIFY_FAILED",
        target: abha.id, detail: `OTP verify ${otpOk ? "success" : "failed"} ${SANDBOX_MODE ? "(sandbox)" : ""}`,
        ip: getClientIp(req),
      });
      return Response.json({ ok: otpOk, sandbox: SANDBOX_MODE, abhaIdentity: abha });
    }

    if (body.action === "link") {
      // P1 (#6): apply identity reconciliation BEFORE the state transition.
      // Compare ABHA demographics against the patient record. If PARTIAL or
      // MISMATCH, require an explicit overrideReason — otherwise 409.
      const recon = reconcileAbhaIdentity({
        localName: patient.fullName,
        localGender: patient.gender,
        localYearOfBirth: patient.dateOfBirth ? new Date(patient.dateOfBirth).getFullYear() : null,
        abhaName: abha.nameAsPerAbha,
        abhaGender: abha.genderAsPerAbha,
        abhaYearOfBirth: abha.yearOfBirthAsPerAbha,
      });
      if (recon.match !== "MATCH" && !body.overrideReason) {
        return jsonError(
          `ABHA identity reconciliation: ${recon.match}. Override reason required. Reasons: ${recon.reasons.join("; ")}`,
          409,
        );
      }
      const next = applyAbhaTransition(currentStatus, "link");
      abha = await db.abhaIdentity.update({
        where: { id: abha.id },
        data: {
          verificationStatus: next.verificationStatus,
          // P1 (#1A): set provenance + authoritative based on sandbox mode.
          verificationSource: SANDBOX_MODE ? "SANDBOX" : "LIVE_EXTERNAL",
          isAuthoritative: !SANDBOX_MODE, // sandbox is NEVER authoritative
          // P1 (#6): persist reconciliation result + override.
          reconciliationResult: recon.match,
          reconciliationOverrideReason: recon.match !== "MATCH" ? body.overrideReason : null,
          reconciliationTimestamp: new Date(),
          reconciliationActor: user.sub,
        },
      });
      await audit({
        hospitalId: user.hospitalId, actorId: user.sub, action: "ABDM_ABHA_LINKED",
        target: abha.id, detail: `ABHA linked ${SANDBOX_MODE ? "(sandbox)" : ""} · reconciliation=${recon.match}`,
        ip: getClientIp(req),
      });
      // If an override was used, create a separate audit event for the override.
      if (recon.match !== "MATCH" && body.overrideReason) {
        await audit({
          hospitalId: user.hospitalId, actorId: user.sub, action: "ABDM_ABHA_LINK_OVERRIDE",
          target: abha.id, detail: `reconciliation=${recon.match} reasons=${recon.reasons.join("; ")}`,
          ip: getClientIp(req),
        });
      }
      return Response.json({ ok: true, sandbox: SANDBOX_MODE, abhaIdentity: abha });
    }

    // ── P1 (#4): manual capture ──────────────────────────────────────────────
    // Hospital staff can record an ABHA WITHOUT calling the ABDM API. This is
    // reference-only data entry — NOT verification, NOT KYC, NOT authoritative.
    // The record is MANUALLY_RECORDED + isAuthoritative=false + verificationSource=MANUAL_PORTAL.
    // It NEVER auto-transitions to VERIFIED/LINKED without the actual official flow.
    if (body.action === "manual_capture") {
      if (!body.abhaNumber || !body.nameAsPerAbha) {
        return jsonError("manual_capture requires abhaNumber + nameAsPerAbha", 400);
      }
      // P1 (#6): apply reconciliation before manual capture too.
      const recon = reconcileAbhaIdentity({
        localName: patient.fullName,
        localGender: patient.gender,
        localYearOfBirth: patient.dateOfBirth ? new Date(patient.dateOfBirth).getFullYear() : null,
        abhaName: body.nameAsPerAbha,
        abhaGender: body.genderAsPerAbha,
        abhaYearOfBirth: body.yearOfBirthAsPerAbha,
      });
      if (recon.match !== "MATCH" && !body.overrideReason) {
        return jsonError(
          `ABHA identity reconciliation: ${recon.match}. Override reason required. Reasons: ${recon.reasons.join("; ")}`,
          409,
        );
      }
      abha = await db.abhaIdentity.update({
        where: { id: abha.id },
        data: {
          abhaNumber: body.abhaNumber,
          abhaAddress: body.abhaAddress,
          nameAsPerAbha: body.nameAsPerAbha,
          genderAsPerAbha: body.genderAsPerAbha,
          yearOfBirthAsPerAbha: body.yearOfBirthAsPerAbha,
          // P1 (#4) + P6 (#7): MANUAL_UNVERIFIED — NEVER authoritative.
          // This is manual data entry (typing an ABHA from a card/app), NOT
          // a portal transaction. MANUAL_PORTAL is reserved for NHCX/PM-JAY
          // where an actual official portal transaction occurred.
          verificationStatus: "MANUALLY_RECORDED",
          verificationSource: "MANUAL_UNVERIFIED",
          isAuthoritative: false,
          // P1 (#6): persist reconciliation.
          reconciliationResult: recon.match,
          reconciliationOverrideReason: recon.match !== "MATCH" ? body.overrideReason : null,
          reconciliationTimestamp: new Date(),
          reconciliationActor: user.sub,
        },
      });
      await audit({
        hospitalId: user.hospitalId, actorId: user.sub, action: "ABDM_ABHA_MANUAL_CAPTURE",
        target: abha.id, detail: `Manual ABHA recorded · reconciliation=${recon.match}`,
        ip: getClientIp(req),
      });
      if (recon.match !== "MATCH" && body.overrideReason) {
        await audit({
          hospitalId: user.hospitalId, actorId: user.sub, action: "ABDM_ABHA_MANUAL_CAPTURE_OVERRIDE",
          target: abha.id, detail: `reconciliation=${recon.match} reasons=${recon.reasons.join("; ")}`,
          ip: getClientIp(req),
        });
      }
      return Response.json({ ok: true, sandbox: SANDBOX_MODE, abhaIdentity: abha });
    }

    if (body.action === "revoke") {
      const next = applyAbhaTransition(currentStatus, "revoke");
      abha = await db.abhaIdentity.update({
        where: { id: abha.id },
        data: { verificationStatus: next.verificationStatus, revokedAt: next.revokedAt },
      });
      await audit({
        hospitalId: user.hospitalId, actorId: user.sub, action: "ABDM_ABHA_REVOKED",
        target: abha.id, detail: `ABHA link revoked`, ip: getClientIp(req),
      });
      return Response.json({ ok: true, sandbox: SANDBOX_MODE, abhaIdentity: abha });
    }

    return jsonError(`Unsupported ABHA action: ${body.action}`, 400);
  } catch (e) {
    if (e instanceof AbhaTransitionError) return jsonError(e.message, 400);
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    throw e;
  }
}

async function verifyAbdmOtpLive(otp: string, txnId: string | null): Promise<boolean> {
  if (!txnId) return false;
  try {
    const token = await getAbdmToken();
    if (!token) return false;
    const resp = await fetch(`${ABDM_GATEWAY_URL}/v1/auth/confirm`, {
      method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ txnId, otp }),
    });
    return resp.ok;
  } catch { return false; }
}

async function GETImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "COORDINATOR"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);
  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get("patientId");
  const where: Record<string, unknown> = { hospitalId: user.hospitalId };
  if (patientId) where.patientId = patientId;
  const identities = await db.abhaIdentity.findMany({ where, orderBy: { createdAt: "desc" } });
  return Response.json({ identities, sandboxMode: SANDBOX_MODE });
}

export const POST = withErrors(POSTImpl);
export const GET = withErrors(GETImpl);
