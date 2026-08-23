// ─── Audit Logging ────────────────────────────────────────────────────
//
// Every integration-profile field change must remain audited.
// Do NOT log: secrets, private keys, client secrets, tokens, full certificates.

import { db } from '@/lib/db';

// Fields that must NEVER appear in audit logs
const SENSITIVE_FIELD_PATTERNS = [
  /secret/i,
  /password/i,
  /token/i,
  /private.?key/i,
  /certificate.*(body|content|pem|key)/i,
];

function isSensitiveField(fieldPath: string): boolean {
  return SENSITIVE_FIELD_PATTERNS.some((p) => p.test(fieldPath));
}

export interface AuditEntry {
  hospitalId: string;
  userId?: string;
  entityType: string;
  entityId?: string;
  fieldPath: string;
  oldValue?: unknown;
  newValue?: unknown;
  actorEmail?: string;
  actorRole?: string;
  requestId?: string;
}

/**
 * Log a single field change. Silently skips sensitive fields.
 */
export async function logAuditChange(entry: AuditEntry): Promise<void> {
  if (isSensitiveField(entry.fieldPath)) {
    return; // never log sensitive fields
  }

  await db.auditLog.create({
    data: {
      hospitalId: entry.hospitalId,
      action: 'FIELD_CHANGE',
      userId: entry.userId ?? null,
      entityType: entry.entityType,
      entityId: entry.entityId ?? null,
      fieldPath: entry.fieldPath,
      oldValue: entry.oldValue !== undefined ? JSON.stringify(entry.oldValue) : null,
      newValue: entry.newValue !== undefined ? JSON.stringify(entry.newValue) : null,
      actorEmail: entry.actorEmail ?? null,
      actorRole: entry.actorRole ?? null,
      requestId: entry.requestId ?? null,
    },
  });
}

/**
 * Log multiple field changes (e.g., a batch update to the integration profile).
 */
export async function logAuditChanges(
  entries: AuditEntry[]
): Promise<void> {
 const safeEntries = entries.filter(
    (e) => !isSensitiveField(e.fieldPath)
  );

  if (safeEntries.length === 0) return;

  await db.auditLog.createMany({
    data: safeEntries.map((e) => ({
      hospitalId: e.hospitalId,
      action: 'FIELD_CHANGE',
      userId: e.userId ?? null,
      entityType: e.entityType,
      entityId: e.entityId ?? null,
      fieldPath: e.fieldPath,
      oldValue:
        e.oldValue !== undefined ? JSON.stringify(e.oldValue) : null,
      newValue:
        e.newValue !== undefined ? JSON.stringify(e.newValue) : null,
      actorEmail: e.actorEmail ?? null,
      actorRole: e.actorRole ?? null,
      requestId: e.requestId ?? null,
    })),
  });
}

/**
 * Retrieve audit logs for a hospital, optionally filtered by entity.
 */
export async function getAuditLogs(params: {
  hospitalId: string;
  entityType?: string;
  limit?: number;
  offset?: number;
}) {
  const { hospitalId, entityType, limit = 50, offset = 0 } = params;

  return db.auditLog.findMany({
    where: {
      hospitalId,
      ...(entityType ? { entityType } : {}),
    },
    orderBy: { createdAt: 'desc' },
    take: limit,
    skip: offset,
    select: {
      id: true,
      entityType: true,
      entityId: true,
      fieldPath: true,
      oldValue: true,
      newValue: true,
      actorEmail: true,
      actorRole: true,
      requestId: true,
      createdAt: true,
    },
  });
}
