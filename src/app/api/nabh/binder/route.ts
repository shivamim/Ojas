// Ojas — P1.6 NABH Entry Level Evidence Binder API.
// Returns the auto-generated compliance binder for the requesting hospital.
// Hospital admin only — the binder is for accreditation prep.
import { NextRequest } from "next/server";
import { getCurrentUser, requireRole } from "@/lib/auth";
import { withErrors } from "@/lib/api-handler";
import { audit, getClientIp, jsonError } from "@/lib/server-utils";
import { generateNabhBinder } from "@/lib/nabh-binder";

type Ctx = { params: Promise<{}> };

async function GETImpl(_req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);

  const binder = await generateNabhBinder(user.hospitalId);

  // Audit the access — binder generation is a compliance-relevant event.
  await audit({
    hospitalId: user.hospitalId,
    actorId: user.sub,
    action: "NABH_BINDER_VIEWED",
    target: `hospital:${user.hospitalId}`,
    detail: `complianceScore=${binder.complianceScore}% met=${binder.metCount}/${binder.totalCount} core=${binder.coreMetCount}/${binder.coreTotalCount} (${binder.coreComplianceScore}%)`,
    ip: getClientIp(_req),
  });

  return Response.json(binder);
}

export const GET = withErrors(GETImpl);
