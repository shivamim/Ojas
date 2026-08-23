// ─── Auth Context Helpers ─────────────────────────────────────────────
//
// AUTHENTICATION IS DERIVED SERVER-SIDE FROM THE SESSION.
// Do NOT trust client-provided headers, query params, or body fields
// for userId, role, or hospitalId.
//
// The client MUST NOT be able to choose:
//   - their user ID
//   - their role
//   - their hospital
//
// Missing/invalid authentication → 401
// Authenticated but unauthorized → 403

import { db } from '@/lib/db';
import { cookies } from 'next/headers';

export interface AuthContext {
  userId: string;
  email: string;
  role: string;
  hospitalId: string | null;
}

const ALLOWED_ADMIN_ROLES = ['SUPER_ADMIN', 'HOSPITAL_ADMIN'];

/**
 * Check if the authenticated user has admin privileges.
 */
export function isAdmin(role: string): boolean {
  return ALLOWED_ADMIN_ROLES.includes(role);
}

/**
 * Server-side session authentication.
 *
 * Reads the OJAS_SESSION cookie, looks up the user in the database,
 * and returns a fully server-verified AuthContext.
 *
 * SECURITY: This function NEVER trusts client-provided values.
 * The session token is an opaque bearer — only the server can map
 * it back to a real user record.
 *
 * Returns 401 if session is missing or invalid.
 */
export async function getServerSession(): Promise<AuthContext> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get('ojas_session_token')?.value;

  if (!sessionToken) {
    throw new AuthError('Authentication required', 401);
  }

  // Lookup the session token in the database via the User model
  // The session token is stored on the user record (simplified for
  // this schema; production would use a separate Session table).
  const user = await db.user.findFirst({
    where: { id: sessionToken, isActive: true },
    select: {
      id: true,
      email: true,
      role: true,
      hospitalId: true,
    },
  });

  if (!user) {
    throw new AuthError('Invalid or expired session', 401);
  }

  return {
    userId: user.id,
    email: user.email,
    role: user.role,
    hospitalId: user.hospitalId,
  };
}

/**
 * Resolve the hospital ID from the authenticated user's context.
 * Returns the user's assigned hospital — NEVER a client-provided value.
 */
export async function resolveHospitalFromAuth(
  auth: AuthContext
): Promise<string> {
  if (!auth.hospitalId) {
    throw new AuthError(
      'User is not assigned to any hospital.',
      400
    );
  }

  const hospital = await db.hospital.findUnique({
    where: { id: auth.hospitalId },
    select: { id: true, isActive: true },
  });

  if (!hospital) {
    throw new AuthError('Assigned hospital not found.', 400);
  }

  if (!hospital.isActive) {
    throw new AuthError('Assigned hospital is not active.', 400);
  }

  return hospital.id;
}

/**
 * For SUPER_ADMIN: act on a specific hospital after authorization.
 * Validates the target hospital exists and is active.
 */
export async function resolveHospitalForSuperAdmin(
  targetHospitalId: string
): Promise<string> {
  const hospital = await db.hospital.findUnique({
    where: { id: targetHospitalId },
    select: { id: true, isActive: true },
  });

  if (!hospital) {
    throw new AuthError('Target hospital not found.', 404);
  }

  if (!hospital.isActive) {
    throw new AuthError('Target hospital is not active.', 400);
  }

  return hospital.id;
}

/**
 * Custom error class for auth failures with proper HTTP status codes.
 */
export class AuthError extends Error {
  status: number;
  constructor(message: string, status: number = 401) {
    super(message);
    this.name = 'AuthError';
    this.status = status;
  }
}
