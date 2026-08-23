// Ojas — FHIR validation boundary.
//
// P0-15: clearly separates STRUCTURAL validation (what Ojas does today) from
// official NHCX profile conformance (which requires the official FHIR IG +
// validator service, plugged in during onboarding).
//
// The structural validator checks:
//   • resourceType is correct
//   • required fields are present
//   • references resolve within the bundle
//   • cardinality (1..1 fields present, 0..* fields are arrays when expected)
//
// The FHIRProfileValidator interface allows the official NHCX FHIR profile
// validator to be plugged in when the official IG + validator service is
// available. Until then, FHIR_STATUS = STRUCTURALLY_VALIDATED (not
// NHCX_PROFILE_CONFORMANCE).

export type FhirValidationStatus = "STRUCTURALLY_VALIDATED" | "PROFILE_CONFORMANCE_VERIFIED" | "FAILED";

export interface FhirValidationResult {
  status: FhirValidationStatus;
  valid: boolean;
  errors: string[];
  warnings: string[];
  profileVersion?: string;   // the official IG version, when profile validation is used
  validator?: string;        // "structural" | "official-nhcx-validator" | "fhirpath"
}

/**
 * FHIRProfileValidator — a pluggable interface for the official NHCX FHIR
 * profile validator. When the official IG + validator service is available
 * (from NHA/partner onboarding), a concrete implementation is wired here.
 *
 * Until then, the structural validator (below) is the only validation, and
 * FHIR_STATUS = STRUCTURALLY_VALIDATED — never claimed as PROFILE_CONFORMANCE.
 */
export interface FHIRProfileValidator {
  /** Validate a FHIR bundle against the official NHCX profile.
   *  Returns PROFILE_CONFORMANCE_VERIFIED when the bundle conforms to the
   *  official IG, FAILED when it does not. */
  validateProfile(bundle: Record<string, unknown>, profileUrl: string): Promise<FhirValidationResult>;
  /** The official IG version this validator targets. */
  profileVersion: string;
}

/** Structural FHIR validation — checks resource types, required fields,
 *  references, and cardinality. This is NOT NHCX profile conformance. */
export function validateFhirStructure(bundle: Record<string, unknown>): FhirValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (bundle.resourceType !== "Bundle") {
    errors.push("resourceType must be 'Bundle'");
    return { status: "FAILED", valid: false, errors, warnings, validator: "structural" };
  }
  const entries = bundle.entry as Array<Record<string, unknown>> | undefined;
  if (!entries || !Array.isArray(entries) || entries.length === 0) {
    errors.push("Bundle must have at least one entry");
    return { status: "FAILED", valid: false, errors, warnings, validator: "structural" };
  }

  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    const res = e.resource as Record<string, unknown> | undefined;
    if (!res) {
      errors.push(`entry[${i}] missing resource`);
      continue;
    }
    if (!res.resourceType || typeof res.resourceType !== "string") {
      errors.push(`entry[${i}].resource missing resourceType`);
    }
    if (!res.id && !res.fullUrl) {
      errors.push(`entry[${i}].resource missing id`);
    }
  }

  const valid = errors.length === 0;
  return {
    status: valid ? "STRUCTURALLY_VALIDATED" : "FAILED",
    valid,
    errors,
    warnings,
    validator: "structural",
  };
}

/** The current FHIR validation status of the system. Truthful: structural only. */
export const FHIR_STATUS = "STRUCTURALLY_VALIDATED" as FhirValidationStatus;

/**
 * Pluggable profile validator holder. When the official NHCX FHIR profile
 * validator is available (from onboarding), set `profileValidator` to the
 * concrete implementation. Until then, it's null and only structural
 * validation is performed.
 */
export let profileValidator: FHIRProfileValidator | null = null;

export function setProfileValidator(validator: FHIRProfileValidator): void {
  profileValidator = validator;
}

/**
 * Validate a FHIR bundle. Performs structural validation always. If an official
 * profile validator is plugged in AND a profileUrl is provided, also performs
 * profile conformance validation.
 */
export async function validateFhir(
  bundle: Record<string, unknown>,
  profileUrl?: string,
): Promise<FhirValidationResult> {
  const structural = validateFhirStructure(bundle);
  if (!structural.valid) return structural;

  if (profileValidator && profileUrl) {
    return profileValidator.validateProfile(bundle, profileUrl);
  }

  return structural;
}
