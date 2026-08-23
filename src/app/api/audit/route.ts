// Ojas — audit log viewer (scoped by hospital; superadmin sees all).
//
// P1 (auditability): supports filters by action, actor, date range, and
// patient target — so hospital admins / coordinators can investigate
// "who accessed this patient's data and when" for DPDP compliance.
// The previous version only supported `action` contains + limit. This
// version adds `from` (ISO date), `to` (ISO date), `target` (patient id
// or resource id), and `actorId` filters, plus pagination via `cursor`.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireAuth } from "@/lib/auth";
import { jsonError } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";

type Ctx = { params: Promise<{}> };

async function GETImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireAuth(await getCurrentUser());
  const { searchParams } = new URL(req.url);
  const limit = Math.min(parseInt(searchParams.get("limit") || "100", 10), 500);
  const cursor = searchParams.get("cursor") || undefined;

  const where: Record<string, unknown> = {};
  // Tenant scoping: superadmin sees all (optionally filtered by hospitalId);
  // everyone else is scoped to their own hospital.
  if (user.role !== "SUPER_ADMIN") {
    where.hospitalId = user.hospitalId;
  } else if (searchParams.get("hospitalId")) {
    where.hospitalId = searchParams.get("hospitalId");
  }

  // Action filter (substring match, e.g. "auth" matches "auth.login").
  if (searchParams.get("action")) {
    where.action = { contains: searchParams.get("action") };
  }

  // Actor filter (exact id match).
  if (searchParams.get("actorId")) {
    where.actorId = searchParams.get("actorId");
  }

  // Target filter (exact match on the resource id, e.g. a patient id).
  if (searchParams.get("target")) {
    where.target = searchParams.get("target");
  }

  // Date-range filters (ISO 8601). `from` is inclusive, `to` is inclusive.
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  if (from || to) {
    where.createdAt = {};
    if (from) (where.createdAt as { gte?: Date }).gte = new Date(from);
    if (to) (where.createdAt as { lte?: Date }).lte = new Date(to);
  }

  // Cursor-based pagination for "load more" — uses createdAt + id to break
  // ties when two events share the same timestamp.
  if (cursor) {
    try {
      const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf-8"));
      if (decoded.createdAt && decoded.id) {
        where.OR = [
          { createdAt: { lt: new Date(decoded.createdAt) } },
          { createdAt: new Date(decoded.createdAt), id: { lt: decoded.id } },
        ];
      }
    } catch {
      // Invalid cursor — ignore, return first page.
    }
  }

  const logs = await db.auditLog.findMany({
    where,
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: limit + 1, // +1 to detect if there are more pages
    include: {
      actor: { select: { name: true, email: true } },
      hospital: { select: { name: true } },
    },
  });

  const hasMore = logs.length > limit;
  const page = hasMore ? logs.slice(0, limit) : logs;
  const nextCursor = hasMore && page.length > 0
    ? Buffer.from(JSON.stringify({
        createdAt: page[page.length - 1]!.createdAt.toISOString(),
        id: page[page.length - 1]!.id,
      })).toString("base64url")
    : null;

  return Response.json({ logs: page, hasMore, nextCursor, count: page.length });
}

export const GET = withErrors(GETImpl);
