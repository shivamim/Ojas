// ─── Zod Validation Schemas ────────────────────────────────────────
import { z } from 'zod';

/** Core facility fields */
export const hfrIdSchema = z
  .string()
  .max(50, 'HFR ID must be at most 50 characters')
  .regex(/^[A-Za-z0-9\-_/]+$/, 'HFR ID contains invalid characters')
  .optional()
  .nullable();

export const pmjayFacilityIdSchema = z
  .string()
  .max(50, 'PM-JAY Facility ID must be at most 50 characters')
  .regex(/^[A-Za-z0-9\-_/]+$/, 'PM-JAY Facility ID contains invalid characters')
  .optional()
  .nullable();

export const shaCodeSchema = z
  .string()
  .max(20, 'SHA code must be at most 20 characters')
  .regex(/^[A-Za-z0-9]+$/, 'SHA code must be alphanumeric')
  .optional()
  .nullable();

export const hemStatusSchema = z
  .enum(['NOT_STARTED', 'IN_PROGRESS', 'COMPLETED', 'FAILED'])
  .optional()
  .nullable();

/** ABDM / NHA fields */
export const wasaAuditStatusSchema = z
  .enum(['NOT_STARTED', 'SCHEDULED', 'IN_PROGRESS', 'PASSED', 'FAILED', 'EXPIRED'])
  .optional()
  .nullable();

export const wasaAuditDateSchema = z
  .string()
  .datetime({ message: 'WASA audit date must be a valid ISO date' })
  .optional()
  .nullable()
  .transform((v) => (v ? new Date(v) : null));

export const safeToHostCertRefSchema = z
  .string()
  .max(100, 'Certificate reference must be at most 100 characters')
  .optional()
  .nullable();

export const certExpiryDateSchema = z
  .string()
  .datetime({ message: 'Certificate expiry must be a valid ISO date' })
  .optional()
  .nullable()
  .transform((v) => (v ? new Date(v) : null));

/** NHCX fields */
export const nhcxParticipantCodeSchema = z
  .string()
  .max(50, 'NHCX Participant Code must be at most 50 characters')
  .regex(/^[A-Za-z0-9\-_/]+$/, 'NHCX Participant Code contains invalid characters')
  .optional()
  .nullable();

/** PM-JAY mode */
export const pmjayModeSchema = z
  .enum(['MANUAL_PORTAL', 'STATE_API', 'OFFICIAL_API', 'SANDBOX', 'LOCAL'])
  .optional()
  .nullable();

/** Full integration profile update schema */
export const integrationProfileUpdateSchema = z
  .object({
    hfrId: hfrIdSchema,
    pmjayFacilityId: pmjayFacilityIdSchema,
    shaCode: shaCodeSchema,
    hemStatus: hemStatusSchema,
    wasaAuditStatus: wasaAuditStatusSchema,
    wasaAuditDate: wasaAuditDateSchema,
    safeToHostCertRef: safeToHostCertRefSchema,
    certExpiryDate: certExpiryDateSchema,
    nhcxParticipantCode: nhcxParticipantCodeSchema,
    pmjayMode: pmjayModeSchema,
  })
  .strict();

export type IntegrationProfileUpdate = z.infer<typeof integrationProfileUpdateSchema>;

/** Seed hospital schema */
export const createHospitalSchema = z.object({
  name: z.string().min(1).max(200),
  code: z.string().min(1).max(20).regex(/^[A-Za-z0-9_\-]+$/),
  address: z.string().max(500).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email().max(200).optional(),
});

/** Create user schema */
export const createUserSchema = z.object({
  email: z.string().email(),
  name: z.string().max(100).optional(),
  role: z.enum(['SUPER_ADMIN', 'HOSPITAL_ADMIN', 'OPERATOR', 'VIEWER']),
  hospitalId: z.string().optional(),
});
