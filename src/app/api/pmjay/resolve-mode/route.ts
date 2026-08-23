import { NextRequest, NextResponse } from 'next/server';
import { resolvePmjayProviderModeForHospital } from '@/lib/pmjay';

// ─── POST: Resolve PM-JAY mode for a hospital ─────────────────────────
//
// Demonstrates hospital-specific PM-JAY mode resolution.
// In production, hospitalId comes from auth — for demo, accepts it in body.

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { hospitalId } = body;

    if (!hospitalId || typeof hospitalId !== 'string') {
      return NextResponse.json(
        { error: 'hospitalId is required' },
        { status: 400 }
      );
    }

    const resolution = await resolvePmjayProviderModeForHospital(hospitalId);

    return NextResponse.json({
      hospitalId,
      mode: resolution.mode,
      source: resolution.source,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
