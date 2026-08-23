// ─── Readiness Calculation ─────────────────────────────────────────
//
// Evaluates the Go-Live readiness of a hospital based on its
// integration profile. Does NOT claim LIVE simply because a field
// has a value — uses nuanced status logic.

import type { FieldReadiness, OverallReadiness, ReadinessLevel } from './pmjay/types';
import type { HospitalIntegrationProfile } from '@prisma/client';

/**
 * Days before certificate expiry to flag as EXPIRING_SOON.
 */
const CERT_EXPIRY_WARNING_DAYS = 30;

/**
 * Evaluate readiness for a single date-based field.
 */
function dateFieldReadiness(
  value: Date | null | undefined,
  label: string
): FieldReadiness {
  if (!value) {
    return { field: label, label, status: 'MISSING' };
  }

  const now = new Date();
  const expiry = new Date(value);
  const daysUntilExpiry = Math.ceil(
    (expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
  );

  if (daysUntilExpiry < 0) {
    return {
      field: label,
      label,
      status: 'EXPIRED',
      value: expiry.toISOString(),
      detail: `Expired ${Math.abs(daysUntilExpiry)} days ago`,
    };
  }

  if (daysUntilExpiry <= CERT_EXPIRY_WARNING_DAYS) {
    return {
      field: label,
      label,
      status: 'EXPIRING_SOON',
      value: expiry.toISOString(),
      detail: `Expires in ${daysUntilExpiry} days`,
    };
  }

  return {
    field: label,
    label,
    status: 'VERIFIED',
    value: expiry.toISOString(),
  };
}

/**
 * Evaluate readiness for a string/ID field.
 */
function stringFieldReadiness(
  value: string | null | undefined,
  label: string,
  fieldKey: string
): FieldReadiness {
  if (!value || value.trim() === '') {
    return { field: fieldKey, label, status: 'MISSING' };
  }
  return {
    field: fieldKey,
    label,
    status: 'CONFIGURED',
    value,
  };
}

/**
 * Evaluate readiness for an enum status field.
 */
function enumFieldReadiness(
  value: string | null | undefined,
  label: string,
  fieldKey: string,
  terminalValues: string[]
): FieldReadiness {
  if (!value) {
    return { field: fieldKey, label, status: 'MISSING' };
  }

  if (terminalValues.includes(value)) {
    return { field: fieldKey, label, status: 'VERIFIED', value };
  }

  if (value === 'NOT_STARTED') {
    return { field: fieldKey, label, status: 'MISSING', value };
  }

  return {
    field: fieldKey,
    label,
    status: 'PENDING_VERIFICATION',
    value,
  };
}

/**
 * Compute the full readiness assessment for a hospital's integration profile.
 */
export function computeReadiness(
  profile: HospitalIntegrationProfile | null
): OverallReadiness {
  if (!profile) {
    return {
      level: 'MISSING',
      fields: [
        { field: 'profile', label: 'Integration Profile', status: 'MISSING' },
      ],
      lastEvaluated: null,
    };
  }

  const fields: FieldReadiness[] = [
    // Core Facility
    stringFieldReadiness(profile.hfrId, 'HFR ID', 'hfrId'),
    stringFieldReadiness(
      profile.pmjayFacilityId,
      'PM-JAY Facility ID',
      'pmjayFacilityId'
    ),
    stringFieldReadiness(profile.shaCode, 'SHA Code', 'shaCode'),
    enumFieldReadiness(
      profile.hemStatus,
      'HEM Status',
      'hemStatus',
      ['COMPLETED']
    ),

    // ABDM / NHA
    enumFieldReadiness(
      profile.wasaAuditStatus,
      'WASA Audit Status',
      'wasaAuditStatus',
      ['PASSED']
    ),
    dateFieldReadiness(profile.wasaAuditDate, 'WASA Audit Date'),
    stringFieldReadiness(
      profile.safeToHostCertRef,
      'Safe-to-Host Certificate',
      'safeToHostCertRef'
    ),
    dateFieldReadiness(
      profile.certExpiryDate,
      'Certificate Expiry'
    ),

    // NHCX
    stringFieldReadiness(
      profile.nhcxParticipantCode,
      'NHCX Participant Code',
      'nhcxParticipantCode'
    ),

    // PM-JAY Mode
    profile.pmjayMode
      ? {
          field: 'pmjayMode',
          label: 'PM-JAY Provider Mode',
          status: 'CONFIGURED' as ReadinessLevel,
          value: profile.pmjayMode,
        }
      : {
          field: 'pmjayMode',
          label: 'PM-JAY Provider Mode',
          status: 'MISSING' as ReadinessLevel,
        },
  ];

  // Compute overall level
  const hasMissing = fields.some((f) => f.status === 'MISSING');
  const hasExpired = fields.some((f) => f.status === 'EXPIRED');
  const hasExpiringSoon = fields.some(
    (f) => f.status === 'EXPIRING_SOON'
  );
  const hasPending = fields.some(
    (f) => f.status === 'PENDING_VERIFICATION'
  );
  const allVerified = fields.every((f) => f.status === 'VERIFIED' || f.status === 'CONFIGURED');

  let level: string;
  if (hasExpired) {
    level = 'EXPIRED';
  } else if (hasMissing) {
    level = 'INCOMPLETE';
  } else if (hasPending) {
    level = 'PENDING_VERIFICATION';
  } else if (hasExpiringSoon) {
    level = 'EXPIRING_SOON';
  } else if (allVerified) {
    level = 'READY';
  } else {
    level = 'CONFIGURED';
  }

  return {
    level,
    fields,
    lastEvaluated: profile.readinessLastEval,
  };
}

/**
 * Refresh the readiness evaluation timestamp on the profile.
 * Call this after updating any integration profile field.
 */
export async function refreshReadinessTimestamp(
  hospitalId: string
): Promise<void> {
  const { db } = await import('@/lib/db');
  await db.hospitalIntegrationProfile.update({
    where: { hospitalId },
    data: { readinessLastEval: new Date() },
  });
}
