// Ojas — billing payment verification. After the Razorpay Checkout modal
// returns a successful payment on the client, the client posts the result here
// for server-side HMAC-SHA256 signature verification. On a valid signature,
// the Subscription is upserted (planTier, patientLimit, currentPeriodEnd
// +30d, status active). The Razorpay webhook remains the authoritative source
// for renewals/cancellations; this endpoint provides immediate UX feedback.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole, requireTenantAccess } from "@/lib/auth";
import { withErrors } from "@/lib/api-handler";
import { jsonError, audit, getClientIp } from "@/lib/server-utils";
import { parseBody, billingVerifyRequestSchema, ValidationError } from "@/lib/validation";
import { verifyPaymentSignature, isRazorpayConfigured } from "@/lib/payments";

type Ctx = { params: Promise<{}> };

async function POSTImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);
  let body: {
    orderId: string;
    paymentId: string;
    signature: string;
    planTier: "PILOT" | "GROWTH" | "ENTERPRISE";
  };
  try {
    body = await parseBody(req, billingVerifyRequestSchema);
  } catch (e) {
    if (e instanceof ValidationError) return jsonError(e.issues, 400);
    return jsonError("Invalid body", 400);
  }
  const { orderId, paymentId, signature, planTier } = body;
  if (!isRazorpayConfigured()) {
    return jsonError("Razorpay is not configured. Cannot verify payment.", 503);
  }
  await requireTenantAccess(user, user.hospitalId, { resourceType: "billing", ip: getClientIp(req) });

  const valid = verifyPaymentSignature({ orderId, paymentId, signature });
  if (!valid) {
    await audit({
      hospitalId: user.hospitalId,
      actorId: user.sub,
      action: "billing.verify.failed",
      target: orderId,
      detail: `Payment signature verification FAILED for ${planTier} (paymentId=${paymentId})`,
      ip: getClientIp(req),
    });
    return jsonError("Payment signature verification failed. The payment was not recorded.", 400);
  }

  // Signature valid — activate the subscription.
  const limit = planTier === "GROWTH" ? 500 : planTier === "ENTERPRISE" ? 5000 : 25;
  const periodEnd = new Date(Date.now() + 30 * 86400 * 1000);
  const existing = await db.subscription.findFirst({ where: { hospitalId: user.hospitalId } });
  if (existing) {
    await db.subscription.update({
      where: { id: existing.id },
      data: { planTier: planTier as "PILOT" | "GROWTH" | "ENTERPRISE", patientLimit: limit, status: "active", currentPeriodEnd: periodEnd },
    });
  } else {
    await db.subscription.create({
      data: { hospitalId: user.hospitalId!, planTier: planTier as "PILOT" | "GROWTH" | "ENTERPRISE", patientLimit: limit, status: "active", currentPeriodEnd: periodEnd },
    });
  }
  await db.hospital.update({ where: { id: user.hospitalId }, data: { planTier: planTier as "PILOT" | "GROWTH" | "ENTERPRISE" } });

  await audit({
    hospitalId: user.hospitalId,
    actorId: user.sub,
    action: "billing.verify.success",
    target: orderId,
    detail: `Verified + activated ${planTier} subscription (paymentId=${paymentId}, periodEnd=${periodEnd.toISOString()})`,
    ip: getClientIp(req),
  });
  return Response.json({ ok: true, planTier, currentPeriodEnd: periodEnd.toISOString() });
}

export const POST = withErrors(POSTImpl);
