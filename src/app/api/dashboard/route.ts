import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { computeReadiness } from '@/lib/readiness';
import type { PmjayProviderMode } from '@/lib/pmjay/types';
import { getServerSession, AuthError, resolveHospitalFromAuth, resolveHospitalForSuperAdmin } from '@/lib/auth-server-context';

function computeReadinessScore(fields: { status: string }[]): number {
  if (fields.length === 0) return 0;
  const readyCount = fields.filter(
    (f) => f.status === 'VERIFIED' || f.status === 'CONFIGURED'
  ).length;
  return Math.round((readyCount / fields.length) * 100);
}

export async function GET(_request: NextRequest) {
  try {
    const auth = await getServerSession();

    // ── HOSPITAL_ADMIN: return only their hospital's stats ──
    if (auth.role === 'HOSPITAL_ADMIN') {
      const hospitalId = await resolveHospitalFromAuth(auth);

      const hospital = await db.hospital.findUnique({
        where: { id: hospitalId },
        include: { integrationProfile: true },
      });

      if (!hospital) {
        return NextResponse.json({ error: 'Hospital not found' }, { status: 404 });
      }

      const readiness = computeReadiness(hospital.integrationProfile);
      const readinessScore = computeReadinessScore(readiness.fields);

      return NextResponse.json({
        totalHospitals: 1,
        totalProfiles: hospital.integrationProfile ? 1 : 0,
        readinessBreakdown: { [readiness.level]: 1 },
        pmjayModeDistribution: {
          [hospital.integrationProfile?.pmjayMode || 'NONE']: 1,
        },
        recentAuditCount: await db.auditLog.count({
          where: {
            hospitalId,
            createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) },
          },
        }),
        fullyReadyCount: readiness.level === 'READY' ? 1 : 0,
        hospitals: [{
          id: hospital.id, name: hospital.name, code: hospital.code,
          pmjayMode: hospital.integrationProfile?.pmjayMode || null,
          readinessLevel: readiness.level, readinessScore,
        }],
      });
    }

    // ── SUPER_ADMIN: return system-wide stats ──
    const hospitals = await db.hospital.findMany({
      where: { isActive: true },
      include: { integrationProfile: true },
    });

    const readinessBreakdown: Record<string, number> = {
      READY: 0, INCOMPLETE: 0, EXPIRED: 0, PENDING_VERIFICATION: 0,
      CONFIGURED: 0, MISSING: 0, EXPIRING_SOON: 0,
    };
    const pmjayModeDistribution: Record<string, number> = {
      MANUAL_PORTAL: 0, STATE_API: 0, OFFICIAL_API: 0, SANDBOX: 0, LOCAL: 0, NONE: 0,
    };
    let fullyReadyCount = 0;
    let totalProfiles = 0;
    const hospitalDetails: Array<{
      id: string; name: string; code: string | null;
      pmjayMode: PmjayProviderMode | null;
      readinessLevel: string; readinessScore: number;
    }> = [];

    for (const hospital of hospitals) {
      if (hospital.integrationProfile) totalProfiles++;
      const readiness = computeReadiness(hospital.integrationProfile);
      const readinessScore = computeReadinessScore(readiness.fields);

      const level = readiness.level;
      readinessBreakdown[level] = (readinessBreakdown[level] || 0) + 1;

      const mode = hospital.integrationProfile?.pmjayMode || 'NONE';
      pmjayModeDistribution[mode] = (pmjayModeDistribution[mode] || 0) + 1;

      if (readiness.level === 'READY') fullyReadyCount++;
      hospitalDetails.push({
        id: hospital.id, name: hospital.name, code: hospital.code,
        pmjayMode: hospital.integrationProfile?.pmjayMode || null,
        readinessLevel: readiness.level, readinessScore,
      });
    }

    const recentAuditCount = await db.auditLog.count({
      where: { createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } },
    });

    return NextResponse.json({
      totalHospitals: hospitals.length, totalProfiles,
      readinessBreakdown, pmjayModeDistribution, recentAuditCount,
      fullyReadyCount, hospitals: hospitalDetails,
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
