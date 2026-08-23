import { NextRequest, NextResponse } from 'next/server';
import { executeWorkflow } from '@/lib/pmjay';

// ─── POST: Execute Workflow ────────────────────────────────────────────

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { hospitalId, workflowType, payload } = body;

    if (!hospitalId || typeof hospitalId !== 'string') {
      return NextResponse.json(
        { error: 'hospitalId is required' },
        { status: 400 }
      );
    }

    if (!workflowType || typeof workflowType !== 'string') {
      return NextResponse.json(
        { error: 'workflowType is required' },
        { status: 400 }
      );
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return NextResponse.json(
        { error: 'payload must be a non-null object' },
        { status: 400 }
      );
    }

    const result = await executeWorkflow(hospitalId, workflowType, payload);

    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
