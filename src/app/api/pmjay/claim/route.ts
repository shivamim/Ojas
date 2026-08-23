import { NextRequest, NextResponse } from 'next/server';
import { submitClaim } from '@/lib/pmjay';

// ─── POST: Submit Claim ───────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { hospitalId, preAuthId, actualAmount, diagnosisCodes } = body;

    if (!hospitalId || typeof hospitalId !== 'string') {
      return NextResponse.json(
        { error: 'hospitalId is required' },
        { status: 400 }
      );
    }

    if (!preAuthId || typeof preAuthId !== 'string') {
      return NextResponse.json(
        { error: 'preAuthId is required' },
        { status: 400 }
      );
    }

    if (typeof actualAmount !== 'number' || actualAmount <= 0) {
      return NextResponse.json(
        { error: 'actualAmount must be a positive number' },
        { status: 400 }
      );
    }

    if (!Array.isArray(diagnosisCodes) || diagnosisCodes.length === 0) {
      return NextResponse.json(
        { error: 'diagnosisCodes must be a non-empty array of strings' },
        { status: 400 }
      );
    }

    const result = await submitClaim(
      hospitalId,
      preAuthId,
      actualAmount,
      diagnosisCodes
    );

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
