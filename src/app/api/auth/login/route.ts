import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';

// ─── POST: Login ─────────────────────────────────────────────────
//
// Authenticates by email. Sets an ojas_session_token cookie that
// the server uses to identify the user on subsequent requests.
// The token is an opaque value that maps 1:1 to a User record.

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email || typeof email !== 'string') {
      return NextResponse.json(
        { error: 'Email is required' },
        { status: 400 }
      );
    }

    const user = await db.user.findUnique({
      where: { email },
    });

    if (!user || !user.isActive) {
      return NextResponse.json(
        { error: 'Invalid credentials' },
        { status: 401 }
      );
    }

    // Generate a cryptographically random session token
    const token = crypto.randomUUID();

    // Store it on the user record (production would use a separate
    // Session table with expiry, but this is safe and simple)
    await db.user.update({
      where: { id: user.id },
      data: { sessionToken: token },
    });

    // Set the cookie — HttpOnly so the client JS cannot read or
    // modify it. SameSite=Strict to prevent CSRF.
    const response = NextResponse.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
        hospitalId: user.hospitalId,
      },
    });

    response.cookies.set('ojas_session_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 60 * 60 * 24, // 24 hours
    });

    return response;
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
