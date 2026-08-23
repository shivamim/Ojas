import { NextRequest, NextResponse } from 'next/server';
import { checkEligibility } from '@/lib/pmjay';

// ─── POST: Check Eligibility ─────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { hospitalId, beneficiaryId, schemeId } = body;

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

    const result = await checkEligibility(hospitalId, beneficiaryId, schemeId);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
