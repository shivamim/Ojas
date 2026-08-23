import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { computeReadiness } from '@/lib/readiness';
import { getServerSession, AuthError, resolveHospitalFromAuth, resolveHospitalForSuperAdmin } from '@/lib/auth-server-context';

export async function GET(_request: NextRequest) {
  try {
    const auth = await getServerSession();

    let hospitalId: string;
    if (auth.role === 'HOSPITAL_ADMIN') {
      hospitalId = await resolveHospitalFromAuth(auth);
    } else if (auth.hospitalId) {
      hospitalId = await resolveHospitalForSuperAdmin(auth.hospitalId);
    } else {
      return NextResponse.json(
        { error: 'No hospital associated with this user' },
        { status: 400 }
      );
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

    return NextResponse.json({ hospitalId, readiness });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
