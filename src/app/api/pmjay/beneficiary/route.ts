import { NextRequest, NextResponse } from 'next/server';
import { lookupBeneficiary } from '@/lib/pmjay';

// ─── POST: Beneficiary Lookup ─────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { hospitalId, beneficiaryId, aadhaar } = body;

    if (!hospitalId || typeof hospitalId !== 'string') {
      return NextResponse.json(
        { error: 'hospitalId is required' },
        { status: 400 }
      );
    }

    if (!beneficiaryId || typeof beneficiaryId !== 'string') {
      return NextResponse.json(
        { error: 'beneficiaryId is required' },
        { status: 400 }
      );
    }

    const result = await lookupBeneficiary(hospitalId, beneficiaryId, aadhaar);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
