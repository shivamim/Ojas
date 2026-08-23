import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { integrationProfileUpdateSchema } from '@/lib/validators';
import { logAuditChanges } from '@/lib/audit';
import { computeReadiness, refreshReadinessTimestamp } from '@/lib/readiness';
import { isAdmin, getServerSession, AuthError, resolveHospitalFromAuth, resolveHospitalForSuperAdmin } from '@/lib/auth-server-context';

// ─── GET: Fetch integration profile + readiness ────────────────────────

export async function GET(_request: NextRequest) {
  try {
    const auth = await getServerSession();

    if (!isAdmin(auth.role)) {
      return NextResponse.json(
        { error: 'Forbidden: requires HOSPITAL_ADMIN or SUPER_ADMIN role' },
        { status: 403 }
      );
    }

    // Hospital Admin: must use their own hospital from session
    let hospitalId: string;
    if (auth.role === 'HOSPITAL_ADMIN') {
      hospitalId = await resolveHospitalFromAuth(auth);
    } else {
      // SUPER_ADMIN requires a target hospital — but we don't
    // accept it from the client. For integration-profile,
      // even SUPER_ADMIN must have a hospital assignment.
      if (!auth.hospitalId) {
        return NextResponse.json(
          { error: 'Super admin must have a hospital context for integration profile' },
          { status: 400 }
        );
      }
      hospitalId = await resolveHospitalForSuperAdmin(auth.hospitalId);
    }

    const profile = await db.hospitalIntegrationProfile.findUnique({
      where: { hospitalId },
    });

    if (!profile) {
      return NextResponse.json(
        { error: 'Integration profile not found for this hospital' },
        { status: 404 }
      );
    }

    const readiness = computeReadiness(profile);

    return NextResponse.json({ profile, readiness });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ─── PUT: Update integration profile ───────────────────────────────────

export async function PUT(request: NextRequest) {
  try {
    const auth = await getServerSession();

    if (!isAdmin(auth.role)) {
      return NextResponse.json(
        { error: 'Forbidden: requires HOSPITAL_ADMIN or SUPER_ADMIN role' },
        { status: 403 }
      );
    }

    let hospitalId: string;
    if (auth.role === 'HOSPITAL_ADMIN') {
      hospitalId = await resolveHospitalFromAuth(auth);
    } else {
      if (!auth.hospitalId) {
        return NextResponse.json(
          { error: 'Super admin must have a hospital context for integration profile' },
          { status: 400 }
        );
      }
      hospitalId = await resolveHospitalForSuperAdmin(auth.hospitalId);
    }

    const body = await request.json();

    const parsed = integrationProfileUpdateSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: 'Validation failed', details: parsed.error.flatten().fieldErrors },
        { status: 400 }
      );
    }

    const updateData = parsed.data;

    const existingProfile = await db.hospitalIntegrationProfile.findUnique({
      where: { hospitalId },
    });

    if (!existingProfile) {
      return NextResponse.json(
        { error: 'Integration profile not found for this hospital' },
        { status: 404 }
      );
    }

    const prismaUpdate: Record<string, unknown> = {};
    const auditEntries: Array<{
      hospitalId: string;
      userId: string;
      entityType: string;
      entityId: string;
      fieldPath: string;
      oldValue: unknown;
      newValue: unknown;
      actorRole: string;
      actorEmail: string;
    }> = [];

    for (const [key, newValue] of Object.entries(updateData)) {
      if (newValue === undefined) continue;

      const oldValue = (existingProfile as unknown as Record<string, unknown>)[key];

      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        auditEntries.push({
          hospitalId,
          userId: auth.userId,
          entityType: 'HospitalIntegrationProfile',
          entityId: existingProfile.id,
          fieldPath: key,
          oldValue,
          newValue,
          actorRole: auth.role,
          actorEmail: auth.email,
        });
      }

      prismaUpdate[key] = newValue;
    }

    if (Object.keys(prismaUpdate).length === 0) {
      const readiness = computeReadiness(existingProfile);
      return NextResponse.json({
        profile: existingProfile,
        readiness,
        message: 'No changes detected',
      });
    }

    await db.hospitalIntegrationProfile.update({
      where: { hospitalId },
      data: prismaUpdate,
    });

    if (auditEntries.length > 0) {
      await logAuditChanges(auditEntries);
    }

    await refreshReadinessTimestamp(hospitalId);

    const finalProfile = await db.hospitalIntegrationProfile.findUnique({
      where: { hospitalId },
    });

    const readiness = computeReadiness(finalProfile);

    return NextResponse.json({
      profile: finalProfile,
      readiness,
      changesLogged: auditEntries.length,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
