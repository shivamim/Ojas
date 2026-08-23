// Ojas — NHCX Coverage Eligibility + Communication domain services.
//
// NHCX workflows are SEPARATE: Coverage Eligibility, Claim, Communication.
// They are NOT mixed into one generic "claim submit" API. Each has its own
// FHIR mapper, validator, transport boundary, and state.
//
// FHIR artifacts are stored COMPLETELY (never truncated) with a SHA-256 hash
// + profile version for audit/retrieval.
//
// Environment state comes from resolveNhcxEnvironmentState() — independent of
// ABDM/PM-JAY. LIVE requires operator-declared NHCX_ENVIRONMENT=LIVE + mTLS.
import { db } from "@/lib/db";
import { createHash } from "crypto";
import { Prisma } from "@prisma/client";
import { resolveNhcxEnvironmentState, isNhcxFullyConfigured } from "@/lib/env";

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

// ── Coverage Eligibility ──────────────────────────────────────────────────────
export interface CoverageEligibilityFhirInput {
  requestId: string;
  patientAbha?: string;
  patientName: string;
  payerId: string;
  providerFacilityId: string;
  serviceType?: string;
}

/** Build a FHIR R4 CoverageEligibilityRequest bundle. */
export function buildCoverageEligibilityBundle(input: CoverageEligibilityFhirInput): Record<string, unknown> {
  return {
    resourceType: "Bundle",
    type: "collection",
    entry: [
      {
        fullUrl: `CoverageEligibilityRequest/${input.requestId}`,
        resource: {
          resourceType: "CoverageEligibilityRequest",
          id: input.requestId,
          status: "active",
          purpose: ["validation", "benefits"],
          patient: input.patientAbha
            ? { identifier: { system: "http://abdm.gov.in/abha", value: input.patientAbha } }
            : { display: input.patientName },
          insurer: { identifier: { system: "http://ojas.in/payer", value: input.payerId } },
          provider: { identifier: { system: "http://ojas.in/facility", value: input.providerFacilityId } },
          created: new Date().toISOString(),
          ...(input.serviceType ? { item: [{ category: { coding: [{ code: input.serviceType }] } }] } : {}),
        },
      },
    ],
  };
}

export interface CoverageEligibilityCreateInput {
  hospitalId: string;
  patientId: string;
  abhaIdentityId?: string | null;
  clientRequestId: string;
  payerId: string;
  providerFacilityId: string;
  serviceType?: string;
  patientAbha?: string;
  patientName: string;
}

/** Create + store a Coverage Eligibility request (DRAFT). Stores the COMPLETE
 *  FHIR bundle (not truncated) + hash + environment state. */
export async function createCoverageEligibility(input: CoverageEligibilityCreateInput) {
  const existing = await db.nhcxCoverageEligibility.findUnique({ where: { clientRequestId: input.clientRequestId } });
  if (existing) return { ok: true, eligibility: existing, replayed: true };

  const envState = resolveNhcxEnvironmentState();
  const bundle = buildCoverageEligibilityBundle({
    requestId: input.clientRequestId,
    patientAbha: input.patientAbha,
    patientName: input.patientName,
    payerId: input.payerId,
    providerFacilityId: input.providerFacilityId,
    serviceType: input.serviceType,
  });
  const bundleStr = JSON.stringify(bundle);
  try {
    const eligibility = await db.nhcxCoverageEligibility.create({
      data: {
        hospitalId: input.hospitalId,
        patientId: input.patientId,
        abhaIdentityId: input.abhaIdentityId ?? null,
        clientRequestId: input.clientRequestId,
        status: "DRAFT",
        payerId: input.payerId,
        providerFacilityId: input.providerFacilityId,
        serviceType: input.serviceType ?? null,
        fhirRequest: bundleStr,                          // COMPLETE artifact
        fhirRequestHash: sha256(bundleStr),              // checksum
        fhirProfileVersion: "fhir-r4-coverageeligibility",
        environmentState: envState as never,
        source: envState === "LIVE" ? "LIVE_EXTERNAL" : envState === "SANDBOX" ? "SANDBOX" : "LOCAL_RECORD",
        isAuthoritative: envState === "LIVE",
      },
    });
    return { ok: true, eligibility, replayed: false };
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      const race = await db.nhcxCoverageEligibility.findUnique({ where: { clientRequestId: input.clientRequestId } });
      if (race) return { ok: true, eligibility: race, replayed: true };
    }
    throw e;
  }
}

/** Submit a Coverage Eligibility request to NHCX. LIVE → real transport;
 *  otherwise records the submission with truthful non-authoritative source.
 *  NEVER fabricates a successful LIVE response. */
export async function submitCoverageEligibility(eligibilityId: string) {
  const eligibility = await db.nhcxCoverageEligibility.findUnique({ where: { id: eligibilityId } });
  if (!eligibility) throw new Error("Coverage eligibility not found");
  if (eligibility.status !== "DRAFT") throw new Error(`Cannot submit from status ${eligibility.status}`);

  const envState = resolveNhcxEnvironmentState();
  if (envState === "DISABLED" || !isNhcxFullyConfigured) {
    return {
      ok: false,
      error: "NHCX is DISABLED (no NHCX_BASE_URL/CLIENT_ID/CLIENT_SECRET). Cannot submit. Record a MANUAL_PORTAL submission instead.",
      environmentState: envState,
    };
  }

  if (envState !== "LIVE") {
    // SANDBOX / PRODUCTION_PENDING / PRODUCTION_READY — record submission,
    // truthful non-authoritative. Real transport only happens when LIVE.
    const updated = await db.nhcxCoverageEligibility.update({
      where: { id: eligibilityId },
      data: {
        status: "SUBMITTED",
        submittedAt: new Date(),
        source: envState === "SANDBOX" ? "SANDBOX" : "LOCAL_RECORD",
        isAuthoritative: false,
      },
    });
    return {
      ok: true, eligibility: updated, environmentState: envState,
      message: `Submitted in ${envState} mode — NOT a live NHCX transaction.`,
    };
  }

  // LIVE transport — real official NHCX endpoint via the transport boundary.
  // Ojas NEVER POSTs to a guessed URL; the endpoint path must come from
  // NHCX_COVERAGE_ELIGIBILITY_ENDPOINT (partner onboarding documentation).
  const coverageEndpoint = process.env.NHCX_COVERAGE_ELIGIBILITY_ENDPOINT ?? "";
  if (!coverageEndpoint) {
    await db.nhcxCoverageEligibility.update({
      where: { id: eligibilityId },
      data: { status: "FAILED", error: "NHCX_COVERAGE_ELIGIBILITY_ENDPOINT not configured. Ojas refuses to POST to a guessed URL. PRODUCTION_PENDING_ONBOARDING." },
    });
    return {
      ok: false,
      error: "NHCX_COVERAGE_ELIGIBILITY_ENDPOINT not configured. Set the official endpoint path from the partner onboarding documentation.",
      environmentState: envState,
    };
  }
  try {
    const { nhcxTransport } = await import("./transport");
    const result = await nhcxTransport.submit({
      endpointPath: coverageEndpoint,
      body: eligibility.fhirRequest ?? "{}",
    });
    if (!result.ok) {
      await db.nhcxCoverageEligibility.update({
        where: { id: eligibilityId },
        data: { status: "FAILED", error: result.error ?? `NHCX ${result.status}`, fhirResponse: result.body },
      });
      return { ok: false, error: result.error ?? `NHCX returned ${result.status}`, environmentState: envState };
    }
    const updated = await db.nhcxCoverageEligibility.update({
      where: { id: eligibilityId },
      data: {
        status: "ACKNOWLEDGED",
        submittedAt: new Date(),
        respondedAt: new Date(),
        fhirResponse: result.body,                 // COMPLETE response
        fhirResponseHash: sha256(result.body),
        source: "LIVE_EXTERNAL",
        isAuthoritative: true,
      },
    });
    return { ok: true, eligibility: updated, environmentState: envState };
  } catch (err) {
    await db.nhcxCoverageEligibility.update({
      where: { id: eligibilityId },
      data: { status: "FAILED", error: err instanceof Error ? err.message : "transport error" },
    });
    return { ok: false, error: `NHCX transport error: ${err instanceof Error ? err.message : "unknown"}`, environmentState: envState };
  }
}

// ── Communication ──────────────────────────────────────────────────────────────
export interface CommunicationCreateInput {
  hospitalId: string;
  patientId: string;
  claimId?: string | null;
  coverageEligibilityId?: string | null;
  clientRequestId: string;
  type: "QUERY" | "CLARIFICATION" | "DOCUMENT_REQUEST" | "RESPONSE" | "ACKNOWLEDGEMENT";
  subject?: string;
  payload?: Record<string, unknown>;
  senderId: string;
  receiverId: string;
}

/** Create a Communication (query/clarification/document-request). Builds a FHIR
 *  Communication resource + stores it COMPLETELY with a hash. */
export async function createCommunication(input: CommunicationCreateInput) {
  const existing = await db.nhcxCommunication.findUnique({ where: { clientRequestId: input.clientRequestId } });
  if (existing) return { ok: true, communication: existing, replayed: true };

  const envState = resolveNhcxEnvironmentState();
  const commResource: Record<string, unknown> = {
    resourceType: "Communication",
    id: input.clientRequestId,
    status: "preparing",
    subject: input.subject ?? null,
    ...(input.payload ?? {}),
    sender: { identifier: { system: "http://ojas.in/actor", value: input.senderId } },
    recipient: [{ identifier: { system: "http://ojas.in/actor", value: input.receiverId } }],
    sent: new Date().toISOString(),
  };
  const payloadStr = JSON.stringify(commResource);
  try {
    const comm = await db.nhcxCommunication.create({
      data: {
        hospitalId: input.hospitalId,
        patientId: input.patientId,
        claimId: input.claimId ?? null,
        coverageEligibilityId: input.coverageEligibilityId ?? null,
        clientRequestId: input.clientRequestId,
        type: input.type,
        subject: input.subject ?? null,
        payload: payloadStr,
        payloadHash: sha256(payloadStr),
        senderId: input.senderId,
        receiverId: input.receiverId,
        status: "DRAFT",
        environmentState: envState as never,
        source: envState === "LIVE" ? "LIVE_EXTERNAL" : envState === "SANDBOX" ? "SANDBOX" : "LOCAL_RECORD",
        isAuthoritative: envState === "LIVE",
      },
    });
    return { ok: true, communication: comm, replayed: false };
  } catch (e) {
    if (e && typeof e === "object" && "code" in e && (e as { code: string }).code === "P2002") {
      const race = await db.nhcxCommunication.findUnique({ where: { clientRequestId: input.clientRequestId } });
      if (race) return { ok: true, communication: race, replayed: true };
    }
    throw e;
  }
}

/** Decimal helper. */
export function toDecimal(v: string | number | Prisma.Decimal | null | undefined): Prisma.Decimal {
  if (v === null || v === undefined || v === "") return new Prisma.Decimal("0");
  return new Prisma.Decimal(v);
}
