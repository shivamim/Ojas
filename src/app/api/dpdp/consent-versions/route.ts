// Ojas — Consent version management.
// GET /api/dpdp/consent-versions — list all consent versions (latest per purpose).
// POST /api/dpdp/consent-versions — create a new version (requires HOSPITAL_ADMIN).
//        When a new version is created, patients with old versions are flagged
//        for re-consent on next check-in.
//
// CONSENT TENANCY: ConsentVersion is intentionally GLOBAL (product-wide).
// The consent TEXT and its versioning are shared across all hospitals — this
// ensures consistent DPDP compliance language. The actual patient consent
// records (ConsentRecord model) ARE hospital-scoped with tenant isolation.
// A hospital cannot see or modify another hospital's consent records.
import { NextRequest } from "next/server";
import { z } from "zod";
import { db } from "@/lib/db";
import { getCurrentUser, requireAuth, requireRole } from "@/lib/auth";
import { audit, getClientIp, jsonError } from "@/lib/server-utils";
import { withErrors } from "@/lib/api-handler";
import { hashConsentText, seedConsentVersions, findPatientsNeedingReconsent } from "@/lib/dpdp";

type Ctx = { params: Promise<{}> };

async function GETImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireAuth(await getCurrentUser());
  // Ensure defaults exist.
  await seedConsentVersions();
  const versions = await db.consentVersion.findMany({
    orderBy: [{ purpose: "asc" }, { effectiveAt: "desc" }],
  });
  // Group by purpose — return latest + history.
  const byPurpose: Record<string, { current: typeof versions[0]; history: typeof versions }> = {};
  for (const v of versions) {
    if (!byPurpose[v.purpose]) byPurpose[v.purpose] = { current: v, history: [] };
    else byPurpose[v.purpose].history.push(v);
  }
  // Re-consent queue: how many patients in this hospital have outdated consent.
  let reconsentQueueCount = 0;
  if (user.hospitalId) {
    for (const purpose of Object.keys(byPurpose)) {
      const patients = await findPatientsNeedingReconsent(user.hospitalId, purpose);
      reconsentQueueCount += patients.length;
    }
  }
  return Response.json({ byPurpose, reconsentQueueCount });
}

const createSchema = z.object({
  purpose: z.string().min(1),
  version: z.string().min(1),
  content: z.string().min(10),
});

async function POSTImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN", "SUPER_ADMIN"]);
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return jsonError("Invalid body", 400);
  const { purpose, version, content } = parsed.data;

  // Check for existing version with same purpose+version.
  const existing = await db.consentVersion.findUnique({
    where: { purpose_version: { purpose, version } },
  }).catch(() => null);
  if (existing) return jsonError("Version already exists for this purpose", 409);

  const created = await db.consentVersion.create({
    data: { purpose, version, content, hash: hashConsentText(content), createdBy: user.sub },
  });
  await audit({
    hospitalId: user.hospitalId, actorId: user.sub, action: "CONSENT_VERSION_CREATED",
    target: purpose, detail: `version=${version} hash=${created.hash.slice(0, 16)}…`,
    ip: getClientIp(req),
  });
  return Response.json({ consentVersion: created }, { status: 201 });
}

export const GET = withErrors(GETImpl);
export const POST = withErrors(POSTImpl);
