// Ojas — demo-credentials endpoint.
// Returns the pre-seeded demo login ONLY when:
//   1. NODE_ENV !== "production" (never exposed in prod builds), AND
//   2. NEXT_PUBLIC_DEMO_MODE === "true" (explicit demo opt-in).
// Otherwise responds 404 so the client shows no demo hint.
//
// This keeps the literal demo password out of the client JS bundle (it lived
// in src/components/pages/login.tsx before — visible to anyone who downloaded
// the production bundle even when DEMO_MODE was unset). Now the client fetches
// it at runtime from this gated server endpoint instead.
import { withErrors } from "@/lib/api-handler";
import { jsonError } from "@/lib/server-utils";

type Ctx = { params: Promise<{}> };

async function GETImpl(_req: Request, _ctx: Ctx) {
  const isProduction = process.env.NODE_ENV === "production";
  const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
  if (isProduction || !demoMode) {
    return jsonError("Not found", 404);
  }
  // Mirror the credentials created by prisma/seed.ts (the bootstrap seed that
  // runs against the dev DB). NOTE: src/app/api/seed/route.ts is a separate
  // runtime seed endpoint that uses different creds — the canonical demo login
  // is the one created by prisma/seed.ts (hospitaladmin@ojas.care / ojas321).
  return Response.json({
    email: "hospitaladmin@ojas.care",
    password: "ojas321",
    role: "HOSPITAL_ADMIN",
    note: "Dev/staging only. Disabled in production and when NEXT_PUBLIC_DEMO_MODE is not 'true'.",
  });
}

export const GET = withErrors(GETImpl);
