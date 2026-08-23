// Ojas — messages API (comms log). Scoped by hospital.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireAuth } from "@/lib/auth";
import { jsonError } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";

type Ctx = { params: Promise<{}> };

async function GETImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireAuth(await getCurrentUser());
  const { searchParams } = new URL(req.url);
  const patientId = searchParams.get("patientId");
  const where: Record<string, unknown> = {};
  if (user.role !== "SUPER_ADMIN") where.hospitalId = user.hospitalId;
  if (patientId) where.patientId = patientId;
  const messages = await db.message.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 200,
    include: { patient: { select: { fullName: true } } },
  });
  return Response.json({ messages });
}

export const GET = withErrors(GETImpl);
