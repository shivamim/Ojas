// Ojas — Razorpay payment integration (real, not stubbed).
//
// Wraps the official `razorpay` Node SDK for order creation + subscription
// creation, and uses Node `crypto` directly for HMAC-SHA256 signature
// verification (same rigor as the WhatsApp inbound handler). Every function
// fails with a clear error when RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET are
// unset rather than silently no-op'ing.
//
// ── Prerequisites (set in .env) ──────────────────────────────────────────────
//   RAZORPAY_KEY_ID          — your Razorpay Key ID
//   RAZORPAY_KEY_SECRET      — your Razorpay Key Secret
//   RAZORPAY_WEBHOOK_SECRET  — the secret configured on your Razorpay webhook
//
// Plan pricing (mirrors /api/billing PLAN_TIERS):
//   PILOT       — Free (30-day trial, 25 patients) — no checkout, direct activation
//   GROWTH      — ₹14,999 / month (500 patients) — paid via createOrder per cycle
//   ENTERPRISE  — Custom (contact sales) — no automated checkout
import Razorpay from "razorpay";
import { createHmac, timingSafeEqual } from "crypto";

export const PLAN_PRICES_INR = {
  PILOT: 0,
  GROWTH: 1499900, // ₹14,999.00 in paise
  ENTERPRISE: 0, // custom — not purchasable via checkout
} as const;

export class RazorpayNotConfiguredError extends Error {
  constructor() {
    super(
      "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in the environment to process payments."
    );
    this.name = "RazorpayNotConfiguredError";
  }
}

export function isRazorpayConfigured(): boolean {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

/** Lazily-created Razorpay SDK instance. Throws if not configured. */
let instance: Razorpay | null = null;
export function getRazorpay(): Razorpay {
  if (instance) return instance;
  const keyId = process.env.RAZORPAY_KEY_ID;
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keyId || !keySecret) {
    throw new RazorpayNotConfiguredError();
  }
  instance = new Razorpay({ key_id: keyId, key_secret: keySecret });
  return instance;
}

export interface OrderResult {
  id: string;
  amount: number; // paise
  currency: string;
  status: string;
  receipt?: string;
}

/** Create a one-time Razorpay order for the given plan cycle. */
export async function createOrder(args: {
  amountInPaise: number;
  currency?: string;
  receipt: string;
  notes?: Record<string, string>;
}): Promise<OrderResult> {
  const rp = getRazorpay();
  const order = await rp.orders.create({
    amount: args.amountInPaise,
    currency: args.currency ?? "INR",
    receipt: args.receipt,
    notes: args.notes ?? {},
  });
  return {
    id: order.id,
    amount: Number(order.amount),
    currency: order.currency,
    status: order.status,
    receipt: order.receipt ?? args.receipt,
  };
}

/**
 * Verify a Razorpay payment signature (client-side checkout success callback).
 * signature = HMAC_SHA256(orderId + "|" + paymentId, key_secret) — compared in
 * constant time. Returns true iff the signature is valid.
 */
export function verifyPaymentSignature(args: {
  orderId: string;
  paymentId: string;
  signature: string;
}): boolean {
  const keySecret = process.env.RAZORPAY_KEY_SECRET;
  if (!keySecret) throw new RazorpayNotConfiguredError();
  const expected = createHmac("sha256", keySecret)
    .update(`${args.orderId}|${args.paymentId}`)
    .digest("hex");
  const provided = args.signature;
  if (expected.length !== provided.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
  } catch {
    return false;
  }
}

/**
 * Verify a Razorpay WEBHOOK signature (HMAC-SHA256 of the raw request body,
 * using RAZORPAY_WEBHOOK_SECRET). Returns true iff the signature is valid.
 */
export function verifyWebhookSignature(args: {
  rawBody: string;
  signature: string;
}): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) {
    // If no webhook secret is configured, reject all webhooks (fail closed).
    return false;
  }
  const expected = createHmac("sha256", secret).update(args.rawBody).digest("hex");
  const provided = args.signature;
  if (expected.length !== provided.length) return false;
  try {
    return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
  } catch {
    return false;
  }
}

export interface SubscriptionResult {
  id: string;
  status: string;
  planId?: string;
}

/**
 * Create a Razorpay recurring Subscription. Requires a `plan_id` pre-created in
 * the Razorpay dashboard (Razorpay Subscription plans cannot be created inline
 * without billing cycle metadata — the dashboard is the standard path).
 */
export async function createSubscription(args: {
  planId: string;
  customerName?: string;
  customerEmail?: string;
  customerContact?: string;
  notes?: Record<string, string>;
}): Promise<SubscriptionResult> {
  const rp = getRazorpay();
  const sub = await rp.subscriptions.create({
    plan_id: args.planId,
    customer_notify: 1,
    total_count: 12, // monthly for 12 cycles
    customer_name: args.customerName,
    customer_email: args.customerEmail,
    customer_contact: args.customerContact,
    notes: args.notes ?? {},
  } as never); // SDK typing for createSubscription is incomplete; cast to never
  return {
    id: sub.id,
    status: sub.status,
    planId: args.planId,
  };
}

/** Fetch a Razorpay payment by id (used by the webhook to confirm capture). */
export async function fetchPayment(paymentId: string) {
  const rp = getRazorpay();
  return rp.payments.fetch(paymentId);
}
