// ─── PM-JAY Hospital-Specific Mode Resolver ────────────────────────────
//
// HospitalIntegrationProfile is the source of truth for hospital-specific
// PM-JAY runtime mode. Environment configuration may act only as a
// controlled fallback/default and must never override an explicit
// hospital configuration.
//
// ARCHITECTURE:
//   Hospital
//     ↓
//   HospitalIntegrationProfile
//     ↓
//   resolvePmjayProviderModeForHospital(...)
//     ↓
//   PM-JAY runtime
//     ↓
//   MANUAL_PORTAL / STATE_API / OFFICIAL_API / SANDBOX / LOCAL

import { db } from '@/lib/db';
import type {
  PmjayProviderMode,
  PmjayModeResolution,
  PmjayResolutionContext,
} from './types';

/**
 * Read the global PMJAY_PROVIDER_MODE environment variable.
 * This is used ONLY as a fallback when no hospital-specific mode is set.
 */
function getGlobalPmjayMode(): PmjayProviderMode | null {
  const envVal = process.env.PMJAY_PROVIDER_MODE?.toUpperCase().trim();
  if (
    envVal &&
    ['MANUAL_PORTAL', 'STATE_API', 'OFFICIAL_API', 'SANDBOX', 'LOCAL'].includes(
      envVal
    )
  ) {
    return envVal as PmjayProviderMode;
  }
  return null;
}

/**
 * Hardcoded safe default when nothing else is configured.
 * We default to MANUAL_PORTAL — the safest, least automated mode.
 * We NEVER default to a live/API mode.
 */
const SAFE_DEFAULT_MODE: PmjayProviderMode = 'MANUAL_PORTAL';

/**
 * Canonical resolver: resolves the PM-JAY provider mode for a specific hospital.
 *
 * Resolution order (strict precedence):
 * 1. HospitalIntegrationProfile.pmjayMode (if set)  ← SOURCE OF TRUTH
 * 2. PMJAY_PROVIDER_MODE env var (fallback only)
 * 3. SAFE_DEFAULT_MODE = MANUAL_PORTAL (hardcoded safe default)
 *
 * @param hospitalId - The hospital's database ID (from auth context, NOT client input)
 * @returns PmjayModeResolution with the mode and its provenance
 */
export async function resolvePmjayProviderModeForHospital(
  hospitalId: string
): Promise<PmjayModeResolution> {
  // Step 1: Load the hospital's integration profile
  const profile = await db.hospitalIntegrationProfile.findUnique({
    where: { hospitalId },
    select: { pmjayMode: true, hospitalId: true },
  });

  // Step 2: Hospital profile takes absolute precedence
  if (profile?.pmjayMode) {
    return {
      mode: profile.pmjayMode as PmjayProviderMode,
      source: 'hospital_profile',
      hospitalId,
    };
  }

  // Step 3: Global env fallback
  const globalMode = getGlobalPmjayMode();
  if (globalMode) {
    return {
      mode: globalMode,
      source: 'global_env_fallback',
      hospitalId,
    };
  }

  // Step 4: Safe hardcoded default
  return {
    mode: SAFE_DEFAULT_MODE,
    source: 'hardcoded_default',
    hospitalId,
  };
}

/**
 * Optimized resolver when the profile mode is already known.
 * Avoids an extra database round-trip.
 */
export function resolvePmjayModeFromContext(
  ctx: PmjayResolutionContext
): PmjayModeResolution {
  // Hospital profile takes absolute precedence
  if (ctx.profilePmjayMode) {
    return {
      mode: ctx.profilePmjayMode,
      source: 'hospital_profile',
      hospitalId: ctx.hospitalId,
    };
  }

  // Global env fallback
  const globalMode = getGlobalPmjayMode();
  if (globalMode) {
    return {
      mode: globalMode,
      source: 'global_env_fallback',
      hospitalId: ctx.hospitalId,
    };
  }

  // Safe default
  return {
    mode: SAFE_DEFAULT_MODE,
    source: 'hardcoded_default',
    hospitalId: ctx.hospitalId,
  };
}

// ─── DEPRECATED: Global resolver (kept for backward compat, logs warning) ──
//
// IMPORTANT: This function is DEPRECATED for hospital-specific operations.
// Use resolvePmjayProviderModeForHospital(hospitalId) instead.
// This function remains ONLY as a safe default for operations that are
// genuinely global (not hospital-specific).

/**
 * @deprecated Use resolvePmjayProviderModeForHospital(hospitalId) instead.
 * Returns the global PM-JAY mode from environment or safe default.
 * DO NOT use this for hospital-specific operations.
 */
export function resolvePmjayProviderMode(): PmjayModeResolution {
  const globalMode = getGlobalPmjayMode();
  if (globalMode) {
    return {
      mode: globalMode,
      source: 'global_env_fallback',
    };
  }
  return {
    mode: SAFE_DEFAULT_MODE,
    source: 'hardcoded_default',
  };
}

/**
 * @deprecated Use resolvePmjayProviderModeForHospital(hospitalId) instead.
 */
export function pmjayMode(): PmjayProviderMode {
  const envVal = process.env.PMJAY_PROVIDER_MODE?.toUpperCase().trim();
  if (
    envVal &&
    ['MANUAL_PORTAL', 'STATE_API', 'OFFICIAL_API', 'SANDBOX', 'LOCAL'].includes(
      envVal
    )
  ) {
    return envVal as PmjayProviderMode;
  }
  return SAFE_DEFAULT_MODE;
}

/**
 * Build the full service context for a PM-JAY operation.
 * This is the single entry point all PM-JAY services MUST use.
 */
export async function buildPmjayServiceContext(
  hospitalId: string
): Promise<{ mode: PmjayModeResolution; hospitalId: string }> {
  const mode = await resolvePmjayProviderModeForHospital(hospitalId);
  return { mode, hospitalId };
}
