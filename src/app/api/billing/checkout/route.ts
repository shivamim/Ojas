// Ojas — billing checkout. Creates a Razorpay order for a paid plan
// (GROWTH). Returns the order id + key id + amount so the client can open the
// Razorpay Checkout modal. PILOT is free (no checkout); ENTERPRISE is custom.
//
// On a successful payment the client posts the result to /api/billing/verify
// for server-side signature verification, and the Razorpay webhook is the
// authoritative source of truth for subscription lifecycle.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole, requireTenantAccess } from "@/lib/auth";
import { withErrors } from "@/lib/api-handler";
import { jsonError, audit, getClientIp } from "@/lib/server-utils";
import { parseBody, billingCheckoutSchema, ValidationError } from "@/lib/validation";
import { createOrder, isRazorpayConfigured, PLAN_PRICES_INR, RazorpayNotConfiguredError } from "@/lib/payments";

type Ctx = { params: Promise<{}> };

async function POSTImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);
  let body: { planTier: "PILOT" | "GROWTH" | "ENTERPRISE"; patientLimit?: number };
  try {
    body = await parseBody(req, billingCheckoutSchema);
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid body", 400);
  }
  const planTier = body.planTier;
  // PILOT is free — no checkout needed. The client should call /api/billing
  // POST directly for PILOT. ENTERPRISE is custom (contact sales).
  if (planTier === "PILOT") return jsonError("PILOT is free — activate via POST /api/billing without checkout.", 400);
  if (planTier === "ENTERPRISE") return jsonError("ENTERPRISE is a custom plan — contact sales to upgrade.", 400);

  if (!isRazorpayConfigured()) {
    return jsonError(
      "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in the environment to enable checkout.",
      503
    );
  }

  const hospital = await db.hospital.findUnique({ where: { id: user.hospitalId }, select: { id: true, name: true } });
  if (!hospital) return jsonError("Hospital not found", 404);
  await requireTenantAccess(user, hospital.id, { resourceType: "hospital", resourceId: hospital.id, ip: getClientIp(req) });

  const amount = PLAN_PRICES_INR[planTier];
  const receipt = `ojas-${hospital.id.slice(-8)}-${planTier}-${Date.now()}`;
  try {
    const order = await createOrder({
      amountInPaise: amount,
      currency: "INR",
      receipt,
      notes: { hospitalId: hospital.id, planTier, hospitalName: hospital.name },
    });
    await audit({
      hospitalId: hospital.id,
      actorId: user.sub,
      action: "billing.checkout.created",
      target: order.id,
      detail: `Created Razorpay order for ${planTier} (₹${amount / 100} INR, receipt ${receipt})`,
      ip: getClientIp(req),
    });
    return Response.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      planTier,
      hospitalName: hospital.name,
    });
  } catch (err) {
    if (err instanceof RazorpayNotConfiguredError) return jsonError(err.message, 503);
    const msg = err instanceof Error ? err.message : "Razorpay order creation failed";
    return jsonError(`Checkout failed: ${msg}`, 502);
  }
}

export const POST = withErrors(POSTImpl);
