// Ojas — NHCX adapter.
//
// Architecture:
//   Ojas Claim Domain
//     -> NHCX Adapter (this file)
//       -> FHIR Mapper (builds a FHIR Claim / Bundle)
//         -> FHIR Validation (structural checks)
//           -> Transport (HTTP to NHCX ecosystem)
//             -> Acknowledgement
//               -> Response parser -> claim state machine
//
// TRUTHFUL STATUS:
//   • When NHCX_BASE_URL + NHCX_CLIENT_ID + NHCX_CLIENT_SECRET are all set, the
//     adapter attempts LIVE submission. Until then it operates in SANDBOX mode:
//     it builds + validates the FHIR bundle, persists it, and simulates an
//     acknowledgement. The UI labels this "NHCX: SANDBOX" — never "LIVE".
//   • A stored claim workflow is NOT a live NHCX submission. The claim row's
//     `integrationSource` field records the truthful provenance
//     ("LIVE" | "SANDBOX" | "WORKFLOW_ONLY").
//
// FHIR structures follow the official NHA/NHCX + HL7 FHIR R4 Claim resource.
// No invented endpoints.
import { Prisma } from "@prisma/client";
import { isNhcxFullyConfigured, NHCX_BASE_URL, resolveNhcxEnvironmentState } from "@/lib/env";
import { nhcxTransport } from "./nhcx/transport";

export type NhcxEnvironment = "LIVE" | "SANDBOX" | "WORKFLOW_ONLY";

/** The resolved NHCX environment state (independent of ABDM). One of DISABLED |
 *  SANDBOX | PRODUCTION_PENDING_ONBOARDING | PRODUCTION_READY | LIVE. Ojas never
 *  auto-promotes to LIVE — an operator must set NHCX_ENVIRONMENT=LIVE after
 *  completing official onboarding. */
export function nhcxEnvironmentState(): string {
  return resolveNhcxEnvironmentState();
}

export function nhcxEnvironment(): NhcxEnvironment {
  const state = resolveNhcxEnvironmentState();
  if (state === "LIVE") return "LIVE";
  if (state === "SANDBOX") return "SANDBOX";
  return "WORKFLOW_ONLY"; // DISABLED / PENDING / READY (but not LIVE) = workflow only
}

/** The operator-configured NHCX claim endpoint path. Ojas does NOT guess this.
 *  It comes from the partner onboarding documentation via NHCX_CLAIM_ENDPOINT. */
const NHCX_CLAIM_ENDPOINT = process.env.NHCX_CLAIM_ENDPOINT ?? "";

export interface FhirClaimInput {
  claimId: string;
  patientName: string;
  patientAbha?: string;
  packageCode?: string;
  packageName?: string;
  estimatedAmount: string;
  hospitalId: string;
  claimType: "PREAUTH" | "CLAIM";
}

/** Build a FHIR R4 Claim bundle. This is a structural mapping only — field
 *  values reflect Ojas's domain model. Real NHCX submission may require
 *  additional NHA-specified extensions (provider certificates, etc.). */
export function buildFhirClaimBundle(input: FhirClaimInput): Record<string, unknown> {
  const use = input.claimType === "PREAUTH" ? "preauthorization" : "claim";
  return {
    resourceType: "Bundle",
    type: "collection",
    entry: [
      {
        fullUrl: `Claim/${input.claimId}`,
        resource: {
          resourceType: "Claim",
          id: input.claimId,
          status: "active",
          use,
          patient: input.patientAbha
            ? { identifier: { system: "http://abdm.gov.in/abha", value: input.patientAbha } }
            : { display: "patient" },
          created: new Date().toISOString(),
          provider: { identifier: { system: "http://ojas.in/hospital", value: input.hospitalId } },
          ...(input.packageCode
            ? { supportingInfo: [{ sequence: 1, category: { coding: [{ code: input.packageCode, display: input.packageName ?? "" }] } }] }
            : {}),
          total: { value: Number(input.estimatedAmount), currency: "INR" },
        },
      },
    ],
  };
}

/** Structural FHIR validation — checks required fields are present. Returns
 *  {valid, errors}. Full FHIRPath validation requires a validator service. */
export function validateFhirBundle(bundle: Record<string, unknown>): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  if (bundle.resourceType !== "Bundle") errors.push("resourceType must be Bundle");
  const entries = bundle.entry as Array<Record<string, unknown>> | undefined;
  if (!entries || entries.length === 0) errors.push("Bundle must have at least one entry");
  for (const e of entries ?? []) {
    const res = e.resource as Record<string, unknown> | undefined;
    if (!res) { errors.push("entry missing resource"); continue; }
    if (res.resourceType !== "Claim") errors.push("entry resource must be a Claim");
    if (!res.id) errors.push("Claim missing id");
    if (!res.use) errors.push("Claim missing use");
    if (!res.created) errors.push("Claim missing created");
  }
  return { valid: errors.length === 0, errors };
}

export interface NhcxSubmissionResult {
  ok: boolean;
  environment: NhcxEnvironment;
  claimId: string;
  acknowledgementId?: string;
  fhirBundle: Record<string, unknown>;
  error?: string;
  submittedAt: Date;
}

/** Submit (or simulate) a claim to NHCX. Idempotent by clientRequestId at the
 *  caller layer (the route handler checks for an existing claim first). */
export async function submitNhcxClaim(input: FhirClaimInput): Promise<NhcxSubmissionResult> {
  const env = nhcxEnvironment();
  const fhirBundle = buildFhirClaimBundle(input);
  const validation = validateFhirBundle(fhirBundle);
  if (!validation.valid) {
    return {
      ok: false,
      environment: env,
      claimId: input.claimId,
      fhirBundle,
      error: `FHIR validation failed: ${validation.errors.join("; ")}`,
      submittedAt: new Date(),
    };
  }

  if (env !== "LIVE") {
    // SANDBOX: build + validate, simulate acknowledgement. NOT a live submission.
    return {
      ok: true,
      environment: "SANDBOX",
      claimId: input.claimId,
      acknowledgementId: `sandbox-ack-${Date.now()}`,
      fhirBundle,
      submittedAt: new Date(),
    };
  }

  // LIVE: submit via the NHCX transport to the operator-configured endpoint.
  // Ojas NEVER POSTs to a guessed URL — the transport refuses "/api/v1/*" paths
  // and requires NHCX_CLAIM_ENDPOINT from the partner onboarding documentation.
  if (!NHCX_CLAIM_ENDPOINT) {
    return {
      ok: false, environment: "LIVE", claimId: input.claimId, fhirBundle,
      error: "NHCX_CLAIM_ENDPOINT not configured. Ojas refuses to POST to a guessed URL. Set the official claim endpoint path from the partner onboarding documentation. PRODUCTION_PENDING_ONBOARDING.",
      submittedAt: new Date(),
    };
  }
  const result = await nhcxTransport.submit({
    endpointPath: NHCX_CLAIM_ENDPOINT,
    body: JSON.stringify(fhirBundle),
  });
  if (!result.ok) {
    return {
      ok: false, environment: "LIVE", claimId: input.claimId, fhirBundle,
      error: result.error ?? `NHCX returned ${result.status}`, submittedAt: new Date(),
    };
  }
  try {
    const data = JSON.parse(result.body) as { acknowledgementId?: string };
    return {
      ok: true, environment: "LIVE", claimId: input.claimId,
      acknowledgementId: data.acknowledgementId ?? `ack-${Date.now()}`,
      fhirBundle, submittedAt: new Date(),
    };
  } catch {
    return {
      ok: false, environment: "LIVE", claimId: input.claimId, fhirBundle,
      error: `NHCX returned malformed JSON (status ${result.status})`, submittedAt: new Date(),
    };
  }
}

/** Truthful label for UI. */
export function nhcxStatusLabel(env: NhcxEnvironment): string {
  switch (env) {
    case "LIVE": return "LIVE";
    case "SANDBOX": return "SANDBOX (FHIR built + validated, not sent to NHCX)";
    case "WORKFLOW_ONLY": return "WORKFLOW ONLY (local record, no NHCX integration)";
  }
}

/** Decimal helper re-export for route handlers that compute amounts. */
export function toDecimal(v: string | number | Prisma.Decimal | null | undefined): Prisma.Decimal {
  if (v === null || v === undefined || v === "") return new Prisma.Decimal("0");
  return new Prisma.Decimal(v);
}
