import { NextRequest, NextResponse } from 'next/server';
import { processSettlement } from '@/lib/pmjay';

// ─── POST: Process Settlement ─────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { hospitalId, claimIds } = body;

    if (!hospitalId || typeof hospitalId !== 'string') {
      return NextResponse.json(
        { error: 'hospitalId is required' },
        { status: 400 }
      );
    }

    if (!Array.isArray(claimIds) || claimIds.length === 0) {
      return NextResponse.json(
        { error: 'claimIds must be a non-empty array of strings' },
        { status: 400 }
      );
    }

    const result = await processSettlement(hospitalId, claimIds);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
