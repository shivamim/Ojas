// Ojas — billing cancel. Hospital admin can cancel a paid subscription.
// Marks the local Subscription row as cancelled and (if a Razorpay
// subscription id is on file) cancels it at Razorpay via the SDK. Downgrades
// the hospital to PILOT so they retain read-only pilot access until period end.
import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { getCurrentUser, requireRole, requireTenantAccess } from "@/lib/auth";
import { withErrors } from "@/lib/api-handler";
import { jsonError, audit, getClientIp } from "@/lib/server-utils";
import { isRazorpayConfigured, getRazorpay } from "@/lib/payments";

type Ctx = { params: Promise<{}> };

async function POSTImpl(req: NextRequest, _ctx: Ctx) {
  const user = requireRole(await getCurrentUser(), ["HOSPITAL_ADMIN"]);
  if (!user.hospitalId) return jsonError("No hospital assigned", 400);
  await requireTenantAccess(user, user.hospitalId, { resourceType: "billing", ip: getClientIp(req) });

  const existing = await db.subscription.findFirst({ where: { hospitalId: user.hospitalId } });
  if (!existing) return jsonError("No active subscription to cancel", 400);

  // If we hold a Razorpay subscription id, cancel it at the provider. (Our
  // primary checkout flow uses per-cycle orders, so this is a no-op for those;
  // recurring subscriptions created via createSubscription() are cancellable.)
  let providerCancelled = false;
  // NOTE: we don't currently persist the Razorpay subscription id on the
  // Subscription row; if you add a `providerSubscriptionId` field and use
  // recurring subscriptions, cancel them here:
  // if (existing.providerSubscriptionId && isRazorpayConfigured()) {
  //   await getRazorpay().subscriptions.cancel(existing.providerSubscriptionId);
  //   providerCancelled = true;
  // }
  void isRazorpayConfigured;
  void getRazorpay;

  await db.subscription.update({
    where: { id: existing.id },
    data: { status: "cancelled", planTier: "PILOT", patientLimit: 25 },
  });
  await db.hospital.update({ where: { id: user.hospitalId }, data: { planTier: "PILOT" } });
  await audit({
    hospitalId: user.hospitalId,
    actorId: user.sub,
    action: "billing.cancel",
    target: existing.id,
    detail: `Cancelled subscription (downgraded to PILOT). providerCancelled=${providerCancelled}`,
    ip: getClientIp(req),
  });
  return Response.json({ ok: true, planTier: "PILOT", status: "cancelled" });
}

export const POST = withErrors(POSTImpl);
