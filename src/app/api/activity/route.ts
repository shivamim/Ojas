// Ojas — lightweight activity feed API. Returns the 5 most recent TimelineEvent
// entries for the user's hospital (or all for SUPER_ADMIN), including patient name.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireAuth } from "@/lib/auth";
import { withErrors } from "@/lib/api-handler";

type Ctx = { params: Promise<{}> };

async function GETImpl(_req: NextRequest, _ctx: Ctx) {
  const user = requireAuth(await getCurrentUser());

  const where =
    user.role === "SUPER_ADMIN"
      ? {}
      : user.hospitalId != null
        ? { hospitalId: user.hospitalId }
        : {};

  const activities = await db.timelineEvent.findMany({
    where,
    orderBy: { occurredAt: "desc" },
    take: 5,
    include: { patient: { select: { fullName: true } } },
  });

  return Response.json({
    activities: activities.map((a) => ({
      id: a.id,
      eventType: a.eventType,
      title: a.title,
      detail: a.detail,
      occurredAt: a.occurredAt,
      patientName: a.patient?.fullName ?? null,
    })),
  });
}

export const GET = withErrors(GETImpl);
