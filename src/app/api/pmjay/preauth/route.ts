import { NextRequest, NextResponse } from 'next/server';
import { createPreAuth } from '@/lib/pmjay';

// ─── POST: Create Pre-Authorization ────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { hospitalId, beneficiaryId, packageCode, estimatedAmount } = body;

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

    if (!packageCode || typeof packageCode !== 'string') {
      return NextResponse.json(
        { error: 'packageCode is required' },
        { status: 400 }
      );
    }

    if (typeof estimatedAmount !== 'number' || estimatedAmount <= 0) {
      return NextResponse.json(
        { error: 'estimatedAmount must be a positive number' },
        { status: 400 }
      );
    }

    const result = await createPreAuth(
      hospitalId,
      beneficiaryId,
      packageCode,
      estimatedAmount
    );

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
