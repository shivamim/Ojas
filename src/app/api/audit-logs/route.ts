import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isAdmin, getServerSession, AuthError, resolveHospitalFromAuth, resolveHospitalForSuperAdmin } from '@/lib/auth-server-context';

export async function GET(request: NextRequest) {
  try {
    const auth = await getServerSession();

    if (!isAdmin(auth.role)) {
      return NextResponse.json(
        { error: 'Forbidden: requires HOSPITAL_ADMIN or SUPER_ADMIN role' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(request.url);
    const queryHospitalId = searchParams.get('hospitalId');
    const entityType = searchParams.get('entityType') || undefined;
    const fieldPath = searchParams.get('fieldPath') || undefined;
    const limitParam = parseInt(searchParams.get('limit') || '50', 10);
    const offsetParam = parseInt(searchParams.get('offset') || '0', 10);

    const limit = Math.min(Math.max(limitParam, 1), 200);
    const offset = Math.max(offsetParam, 0);

    let effectiveHospitalId: string;

    if (auth.role === 'HOSPITAL_ADMIN') {
      // HOSPITAL_ADMIN: always use their own hospital, never trust query param
      effectiveHospitalId = await resolveHospitalFromAuth(auth);
    } else {
      // SUPER_ADMIN
      if (queryHospitalId) {
        effectiveHospitalId = await resolveHospitalForSuperAdmin(queryHospitalId);
      } else {
        // No hospital filter → return all hospitals' logs
        const where: Record<string, unknown> = {};
        if (entityType) where.entityType = entityType;
        if (fieldPath) where.fieldPath = fieldPath;

        const [logs, total] = await Promise.all([
          db.auditLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            take: limit,
            skip: offset,
            select: {
              id: true, hospitalId: true, entityType: true, entityId: true,
              fieldPath: true, oldValue: true, newValue: true,
              actorEmail: true, actorRole: true, requestId: true, createdAt: true,
            },
          }),
          db.auditLog.count({ where }),
        ]);
        return NextResponse.json({ logs, total });
      }
    }

    const where: Record<string, unknown> = { hospitalId: effectiveHospitalId };
    if (entityType) where.entityType = entityType;
    if (fieldPath) where.fieldPath = fieldPath;

    const [logs, total] = await Promise.all([
      db.auditLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        skip: offset,
        select: {
          id: true, hospitalId: true, entityType: true, entityId: true,
          fieldPath: true, oldValue: true, newValue: true,
          actorEmail: true, actorRole: true, requestId: true, createdAt: true,
        },
      }),
      db.auditLog.count({ where }),
    ]);

    return NextResponse.json({ logs, total });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
