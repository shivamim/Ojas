// ─── PM-JAY Provider Mode Types ─────────────────────────────────────────
//
// HospitalIntegrationProfile is the source of truth for hospital-specific
// PM-JAY runtime mode. Environment configuration may act only as a
// controlled fallback/default and must never override an explicit
// hospital configuration.

export type PmjayProviderMode =
  | 'MANUAL_PORTAL'
  | 'STATE_API'
  | 'OFFICIAL_API'
  | 'SANDBOX'
  | 'LOCAL';

/**
 * Ordered by "liveness" — MANUAL_PORTAL is the least automated,
 * OFFICIAL_API is the most.
 */
export const PMJAY_MODES: PmjayProviderMode[] = [
  'MANUAL_PORTAL',
  'STATE_API',
  'OFFICIAL_API',
  'SANDBOX',
  'LOCAL',
];

export const PMJAY_MODE_LABELS: Record<PmjayProviderMode, string> = {
  MANUAL_PORTAL: 'Manual Portal',
  STATE_API: 'State API',
  OFFICIAL_API: 'Official API',
  SANDBOX: 'Sandbox',
  LOCAL: 'Local / Development',
};

export const PMJAY_MODE_DESCRIPTIONS: Record<PmjayProviderMode, string> = {
  MANUAL_PORTAL:
    'PM-JAY operations are performed manually through the government portal.',
  STATE_API: 'Integrated with the State Health Agency API for automated operations.',
  OFFICIAL_API:
    'Fully integrated with the official PM-JAY national API.',
  SANDBOX:
    'Connected to the PM-JAY sandbox environment for testing.',
  LOCAL: 'Local development / mock mode. No real external calls.',
};

/** Result of resolving the PM-JAY mode for a specific hospital. */
export interface PmjayModeResolution {
  /** The resolved mode that MUST be used at runtime. */
  mode: PmjayProviderMode;
  /** Where the mode came from — for debugging / audit. */
  source: 'hospital_profile' | 'global_env_fallback' | 'hardcoded_default';
  /** The hospital ID (if resolved from a profile). */
  hospitalId?: string;
}

/** Context needed to resolve the PM-JAY mode for a hospital. */
export interface PmjayResolutionContext {
  hospitalId: string;
  /** Pre-loaded profile mode, if available. Avoids extra DB call. */
  profilePmjayMode?: PmjayProviderMode | null;
}

// ─── Readiness Types ───────────────────────────────────────────────────

export type ReadinessLevel =
  | 'MISSING'
  | 'CONFIGURED'
  | 'PENDING_VERIFICATION'
  | 'VERIFIED'
  | 'EXPIRED'
  | 'EXPIRING_SOON';

export interface FieldReadiness {
  field: string;
  label: string;
  status: ReadinessLevel;
  value?: string | null;
  detail?: string;
}

export interface OverallReadiness {
  level: string;
  fields: FieldReadiness[];
  lastEvaluated?: Date | null;
}

// ─── Service Types ─────────────────────────────────────────────────────

export interface PmjayServiceContext {
  hospitalId: string;
  mode: PmjayModeResolution;
}

export interface BeneficiaryLookupParams {
  serviceContext: PmjayServiceContext;
  beneficiaryId: string;
  aadhaar?: string;
}

export interface PreAuthParams {
  serviceContext: PmjayServiceContext;
  beneficiaryId: string;
  packageCode: string;
  estimatedAmount: number;
}

export interface ClaimParams {
  serviceContext: PmjayServiceContext;
  preAuthId: string;
  actualAmount: number;
  diagnosisCodes: string[];
}

export interface SettlementParams {
  serviceContext: PmjayServiceContext;
  claimIds: string[];
}

export interface EligibilityParams {
  serviceContext: PmjayServiceContext;
  beneficiaryId: string;
  schemeId?: string;
}

export interface QueryParams {
  serviceContext: PmjayServiceContext;
  claimId?: string;
  preAuthId?: string;
}

export interface PmjayOperationResult {
  success: boolean;
  mode: PmjayProviderMode;
  modeSource: string;
  data?: unknown;
  error?: string;
  hospitalId: string;
}
