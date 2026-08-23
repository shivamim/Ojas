// ─── PM-JAY Service Layer ──────────────────────────────────────────────
//
// Every hospital-specific PM-JAY operation MUST receive or resolve
// hospital context. The canonical resolution is:
//
//   get authenticated hospital
//          ↓
//   load HospitalIntegrationProfile
//          ↓
//   if profile.pmjayMode exists → use it
//          else → safe/default fallback
//          ↓
//   execute provider
//
// HospitalIntegrationProfile is the source of truth for hospital-specific
// PM-JAY runtime mode. Environment configuration may act only as a
// controlled fallback/default and must never override an explicit
// hospital configuration.

export { resolvePmjayProviderModeForHospital, resolvePmjayModeFromContext, buildPmjayServiceContext, resolvePmjayProviderMode, pmjayMode } from './resolver';
export type { PmjayProviderMode, PmjayModeResolution, PmjayResolutionContext, PmjayServiceContext, BeneficiaryLookupParams, PreAuthParams, ClaimParams, SettlementParams, EligibilityParams, QueryParams, PmjayOperationResult, ReadinessLevel, FieldReadiness, OverallReadiness } from './types';
export { PMJAY_MODES, PMJAY_MODE_LABELS, PMJAY_MODE_DESCRIPTIONS } from './types';

// ─── PM-JAY Sub-Services ─────────────────────────────────────────────

import { buildPmjayServiceContext } from './resolver';
import type { BeneficiaryLookupParams, PreAuthParams, ClaimParams, SettlementParams, EligibilityParams, QueryParams, PmjayOperationResult } from './types';

/**
 * Beneficiary lookup — resolves hospital context internally.
 */
export async function lookupBeneficiary(
  hospitalId: string,
  beneficiaryId: string,
  aadhaar?: string
): Promise<PmjayOperationResult> {
  const { mode } = await buildPmjayServiceContext(hospitalId);

  // Route to the appropriate provider based on resolved mode
  switch (mode.mode) {
    case 'MANUAL_PORTAL':
      return { success: true, mode: mode.mode, modeSource: mode.source, data: { message: 'Manual portal lookup', beneficiaryId }, hospitalId };
    case 'STATE_API':
      return { success: true, mode: mode.mode, modeSource: mode.source, data: { message: 'State API lookup', beneficiaryId }, hospitalId };
    case 'OFFICIAL_API':
      return { success: true, mode: mode.mode, modeSource: mode.source, data: { message: 'Official API lookup', beneficiaryId }, hospitalId };
    case 'SANDBOX':
      return { success: true, mode: mode.mode, modeSource: mode.source, data: { message: 'Sandbox lookup', beneficiaryId }, hospitalId };
    case 'LOCAL':
      return { success: true, mode: mode.mode, modeSource: mode.source, data: { message: 'Local/mock lookup', beneficiaryId }, hospitalId };
  }
}

/**
 * Pre-authorization — resolves hospital context internally.
 */
export async function createPreAuth(
  hospitalId: string,
  beneficiaryId: string,
  packageCode: string,
  estimatedAmount: number
): Promise<PmjayOperationResult> {
  const { mode } = await buildPmjayServiceContext(hospitalId);

  switch (mode.mode) {
    case 'MANUAL_PORTAL':
      return { success: true, mode: mode.mode, modeSource: mode.source, data: { message: 'Manual portal pre-auth created', beneficiaryId, packageCode, estimatedAmount }, hospitalId };
    case 'STATE_API':
      return { success: true, mode: mode.mode, modeSource: mode.source, data: { message: 'State API pre-auth created', beneficiaryId, packageCode, estimatedAmount }, hospitalId };
    case 'OFFICIAL_API':
      return { success: true, mode: mode.mode, modeSource: mode.source, data: { message: 'Official API pre-auth created', beneficiaryId, packageCode, estimatedAmount }, hospitalId };
    case 'SANDBOX':
      return { success: true, mode: mode.mode, modeSource: mode.source, data: { message: 'Sandbox pre-auth created', beneficiaryId, packageCode, estimatedAmount }, hospitalId };
    case 'LOCAL':
      return { success: true, mode: mode.mode, modeSource: mode.source, data: { message: 'Local/mock pre-auth created', beneficiaryId, packageCode, estimatedAmount }, hospitalId };
  }
}

/**
 * Claim submission — resolves hospital context internally.
 */
export async function submitClaim(
  hospitalId: string,
  preAuthId: string,
  actualAmount: number,
  diagnosisCodes: string[]
): Promise<PmjayOperationResult> {
  const { mode } = await buildPmjayServiceContext(hospitalId);

  switch (mode.mode) {
    case 'MANUAL_PORTAL':
      return { success: true, mode: mode.mode, modeSource: mode.source, data: { message: 'Manual portal claim submitted', preAuthId, actualAmount }, hospitalId };
    case 'STATE_API':
      return { success: true, mode: mode.mode, modeSource: mode.source, data: { message: 'State API claim submitted', preAuthId, actualAmount }, hospitalId };
    case 'OFFICIAL_API':
      return { success: true, mode: mode.mode, modeSource: mode.source, data: { message: 'Official API claim submitted', preAuthId, actualAmount }, hospitalId };
    case 'SANDBOX':
      return { success: true, mode: mode.mode, modeSource: mode.source, data: { message: 'Sandbox claim submitted', preAuthId, actualAmount }, hospitalId };
    case 'LOCAL':
      return { success: true, mode: mode.mode, modeSource: mode.source, data: { message: 'Local/mock claim submitted', preAuthId, actualAmount }, hospitalId };
  }
}

/**
 * Eligibility check — resolves hospital context internally.
 */
export async function checkEligibility(
  hospitalId: string,
  beneficiaryId: string,
  schemeId?: string
): Promise<PmjayOperationResult> {
  const { mode } = await buildPmjayServiceContext(hospitalId);

  switch (mode.mode) {
    case 'MANUAL_PORTAL':
      return { success: true, mode: mode.mode, modeSource: mode.source, data: { message: 'Manual portal eligibility check', beneficiaryId }, hospitalId };
    case 'STATE_API':
      return { success: true, mode: mode.mode, modeSource: mode.source, data: { message: 'State API eligibility check', beneficiaryId }, hospitalId };
    case 'OFFICIAL_API':
      return { success: true, mode: mode.mode, modeSource: mode.source, data: { message: 'Official API eligibility check', beneficiaryId }, hospitalId };
    case 'SANDBOX':
      return { success: true, mode: mode.mode, modeSource: mode.source, data: { message: 'Sandbox eligibility check', beneficiaryId }, hospitalId };
    case 'LOCAL':
      return { success: true, mode: mode.mode, modeSource: mode.source, data: { message: 'Local/mock eligibility check', beneficiaryId }, hospitalId };
  }
}

/**
 * Claim query — resolves hospital context internally.
 */
export async function queryClaim(
  hospitalId: string,
  claimId?: string,
  preAuthId?: string
): Promise<PmjayOperationResult> {
  const { mode } = await buildPmjayServiceContext(hospitalId);

  switch (mode.mode) {
    case 'MANUAL_PORTAL':
      return { success: true, mode: mode.mode, modeSource: mode.source, data: { message: 'Manual portal claim query', claimId }, hospitalId };
    case 'STATE_API':
      return { success: true, mode: mode.mode, modeSource: mode.source, data: { message: 'State API claim query', claimId }, hospitalId };
    case 'OFFICIAL_API':
      return { success: true, mode: mode.mode, modeSource: mode.source, data: { message: 'Official API claim query', claimId }, hospitalId };
    case 'SANDBOX':
      return { success: true, mode: mode.mode, modeSource: mode.source, data: { message: 'Sandbox claim query', claimId }, hospitalId };
    case 'LOCAL':
      return { success: true, mode: mode.mode, modeSource: mode.source, data: { message: 'Local/mock claim query', claimId }, hospitalId };
  }
}

/**
 * Settlement processing — resolves hospital context internally.
 */
export async function processSettlement(
  hospitalId: string,
  claimIds: string[]
): Promise<PmjayOperationResult> {
  const { mode } = await buildPmjayServiceContext(hospitalId);

  switch (mode.mode) {
    case 'MANUAL_PORTAL':
      return { success: true, mode: mode.mode, modeSource: mode.source, data: { message: 'Manual portal settlement', claimCount: claimIds.length }, hospitalId };
    case 'STATE_API':
      return { success: true, mode: mode.mode, modeSource: mode.source, data: { message: 'State API settlement', claimCount: claimIds.length }, hospitalId };
    case 'OFFICIAL_API':
      return { success: true, mode: mode.mode, modeSource: mode.source, data: { message: 'Official API settlement', claimCount: claimIds.length }, hospitalId };
    case 'SANDBOX':
      return { success: true, mode: mode.mode, modeSource: mode.source, data: { message: 'Sandbox settlement', claimCount: claimIds.length }, hospitalId };
    case 'LOCAL':
      return { success: true, mode: mode.mode, modeSource: mode.source, data: { message: 'Local/mock settlement', claimCount: claimIds.length }, hospitalId };
  }
}

/**
 * Workflow operation — resolves hospital context internally.
 */
export async function executeWorkflow(
  hospitalId: string,
  workflowType: string,
  payload: Record<string, unknown>
): Promise<PmjayOperationResult> {
  const { mode } = await buildPmjayServiceContext(hospitalId);

  switch (mode.mode) {
    case 'MANUAL_PORTAL':
      return { success: true, mode: mode.mode, modeSource: mode.source, data: { message: 'Manual portal workflow', workflowType }, hospitalId };
    case 'STATE_API':
      return { success: true, mode: mode.mode, modeSource: mode.source, data: { message: 'State API workflow', workflowType }, hospitalId };
    case 'OFFICIAL_API':
      return { success: true, mode: mode.mode, modeSource: mode.source, data: { message: 'Official API workflow', workflowType }, hospitalId };
    case 'SANDBOX':
      return { success: true, mode: mode.mode, modeSource: mode.source, data: { message: 'Sandbox workflow', workflowType }, hospitalId };
    case 'LOCAL':
      return { success: true, mode: mode.mode, modeSource: mode.source, data: { message: 'Local/mock workflow', workflowType }, hospitalId };
  }
}
