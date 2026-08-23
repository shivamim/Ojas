import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { isAdmin, getServerSession, AuthError } from '@/lib/auth-server-context';

export async function GET(_request: NextRequest) {
  try {
    const auth = await getServerSession();

    if (!isAdmin(auth.role)) {
      return NextResponse.json(
        { error: 'Forbidden: requires HOSPITAL_ADMIN or SUPER_ADMIN role' },
        { status: 403 }
      );
    }

    const hospitals = await db.hospital.findMany({
      include: {
        integrationProfile: {
          select: { pmjayMode: true, overallReadiness: true },
        },
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({
      hospitals: hospitals.map((h) => ({
        id: h.id, name: h.name, code: h.code,
        email: h.email, phone: h.phone, address: h.address,
        isActive: h.isActive, createdAt: h.createdAt,
        integrationProfile: h.integrationProfile
          ? { pmjayMode: h.integrationProfile.pmjayMode, overallReadiness: h.integrationProfile.overallReadiness }
          : null,
      })),
    });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
