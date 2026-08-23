import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { hashPassword } from '@/lib/auth';

// Demo password for all seeded admin users. Used ONLY by the dev/demo seed
// route. Production never seeds users. Login at /?view=login with this password.
const DEMO_PASSWORD = 'ojas1234';

// ─── POST: Seed Demo Data ─────────────────────────────────────────────
//
// Creates 4 demo hospitals, admin users, and integration profiles.
// Idempotent: uses upsert where possible, skips if already exists.

interface SeedResult {
  hospitals: { id: string; code: string; name: string; adminEmail: string }[];
  errors: string[];
}

export async function POST(_request: NextRequest) {
  const errors: string[] = [];
  const hospitals: SeedResult['hospitals'] = [];

  try {
    // Compute a real bcrypt hash once so login actually works via the secure
    // /api/auth route (which calls verifyPassword against passwordHash).
    const demoHash = await hashPassword(DEMO_PASSWORD);

    // ── Hospital A: MANUAL_PORTAL ──
    const hospA = await db.hospital.upsert({
      where: { code: 'HOSP_A' },
      update: {},
      create: {
        name: 'City General Hospital',
        slug: 'city-general-hospital',
        code: 'HOSP_A',
        address: '123 MG Road, Mumbai, Maharashtra 400001',
        phone: '+91-22-12345678',
        email: 'info@citygeneral.localhost',
      },
    });

    await db.user.upsert({
      where: { email: 'admin.a@citygeneral.in' },
      update: { passwordHash: demoHash },
      create: {
        email: 'admin.a@citygeneral.in',
        name: 'Hospital A Admin',
        role: 'HOSPITAL_ADMIN',
        passwordHash: demoHash,
        hospitalId: hospA.id,
      },
    });

    await db.hospitalIntegrationProfile.upsert({
      where: { hospitalId: hospA.id },
      update: {},
      create: {
        hospitalId: hospA.id,
        hfrId: 'HFR-MH-001234',
        pmjayFacilityId: 'PMJ-MH-CGH-001',
        shaCode: 'MHSHA',
        hemStatus: 'COMPLETED',
        wasaAuditStatus: 'NOT_STARTED',
        pmjayMode: 'MANUAL_PORTAL',
        readinessLastEval: new Date(),
      },
    });

    hospitals.push({
      id: hospA.id,
      code: 'HOSP_A',
      name: 'City General Hospital',
      adminEmail: 'admin.a@citygeneral.in',
    });

    // ── Hospital B: SANDBOX ──
    const hospB = await db.hospital.upsert({
      where: { code: 'HOSP_B' },
      update: {},
      create: {
        name: 'District Medical Center',
        slug: 'district-medical-center',
        code: 'HOSP_B',
        address: '456 Station Road, Pune, Maharashtra 411001',
        phone: '+91-20-23456789',
        email: 'info@districtmed.localhost',
      },
    });

    await db.user.upsert({
      where: { email: 'admin.b@districtmed.in' },
      update: { passwordHash: demoHash },
      create: {
        email: 'admin.b@districtmed.in',
        name: 'Hospital B Admin',
        role: 'HOSPITAL_ADMIN',
        passwordHash: demoHash,
        hospitalId: hospB.id,
      },
    });

    await db.hospitalIntegrationProfile.upsert({
      where: { hospitalId: hospB.id },
      update: {},
      create: {
        hospitalId: hospB.id,
        hfrId: 'HFR-MH-005678',
        pmjayFacilityId: 'PMJ-MH-DMC-002',
        shaCode: 'MHSHA',
        hemStatus: 'COMPLETED',
        wasaAuditStatus: 'PASSED',
        wasaAuditDate: new Date('2024-06-15T10:00:00Z'),
        safeToHostCertRef: 'STH-MH-2024-00042',
        certExpiryDate: new Date('2025-12-31T23:59:59Z'),
        pmjayMode: 'SANDBOX',
        readinessLastEval: new Date(),
      },
    });

    hospitals.push({
      id: hospB.id,
      code: 'HOSP_B',
      name: 'District Medical Center',
      adminEmail: 'admin.b@districtmed.in',
    });

    // ── Hospital C: STATE_API ──
    const hospC = await db.hospital.upsert({
      where: { code: 'HOSP_C' },
      update: {},
      create: {
        name: 'Regional Cancer Institute',
        slug: 'regional-cancer-institute',
        code: 'HOSP_C',
        address: '789 Health Campus, Nagpur, Maharashtra 440001',
        phone: '+91-712-3456789',
        email: 'info@regionalcancer.localhost',
      },
    });

    await db.user.upsert({
      where: { email: 'admin.c@cancerinstitute.in' },
      update: { passwordHash: demoHash },
      create: {
        email: 'admin.c@cancerinstitute.in',
        name: 'Hospital C Admin',
        role: 'HOSPITAL_ADMIN',
        passwordHash: demoHash,
        hospitalId: hospC.id,
      },
    });

    await db.hospitalIntegrationProfile.upsert({
      where: { hospitalId: hospC.id },
      update: {},
      create: {
        hospitalId: hospC.id,
        hfrId: 'HFR-MH-009012',
        pmjayFacilityId: 'PMJ-MH-RCI-003',
        shaCode: 'MHSHA',
        hemStatus: 'COMPLETED',
        wasaAuditStatus: 'PASSED',
        wasaAuditDate: new Date('2024-03-20T10:00:00Z'),
        safeToHostCertRef: 'STH-MH-2024-00078',
        certExpiryDate: new Date('2025-09-30T23:59:59Z'),
        nhcxParticipantCode: 'NHCX-MH-RCI-001',
        pmjayMode: 'STATE_API',
        readinessLastEval: new Date(),
      },
    });

    hospitals.push({
      id: hospC.id,
      code: 'HOSP_C',
      name: 'Regional Cancer Institute',
      adminEmail: 'admin.c@cancerinstitute.in',
    });

    // ── Hospital D: No PM-JAY mode (will fall back to defaults) ──
    const hospD = await db.hospital.upsert({
      where: { code: 'HOSP_D' },
      update: {},
      create: {
        name: 'Primary Health Center Rural',
        slug: 'primary-health-center-rural',
        code: 'HOSP_D',
        address: '12 Village Road, Solapur, Maharashtra 413001',
        phone: '+91-217-234567',
        email: 'info@phcrural.localhost',
      },
    });

    await db.user.upsert({
      where: { email: 'admin.d@phcrural.in' },
      update: { passwordHash: demoHash },
      create: {
        email: 'admin.d@phcrural.in',
        name: 'Hospital D Admin',
        role: 'HOSPITAL_ADMIN',
        passwordHash: demoHash,
        hospitalId: hospD.id,
      },
    });

    await db.hospitalIntegrationProfile.upsert({
      where: { hospitalId: hospD.id },
      update: {},
      create: {
        hospitalId: hospD.id,
        hfrId: null,
        pmjayFacilityId: null,
        shaCode: null,
        hemStatus: 'NOT_STARTED',
        wasaAuditStatus: 'NOT_STARTED',
        // pmjayMode intentionally null — will use fallback
        readinessLastEval: new Date(),
      },
    });

    hospitals.push({
      id: hospD.id,
      code: 'HOSP_D',
      name: 'Primary Health Center Rural',
      adminEmail: 'admin.d@phcrural.in',
    });

    return NextResponse.json({
      success: true,
      message: 'Seed data created successfully',
      hospitals,
      errors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json(
      {
        success: false,
        error: message,
        hospitals,
        errors: [...errors, message],
      },
      { status: 500 }
    );
  }
}
