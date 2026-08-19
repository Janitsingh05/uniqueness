/* ============================================================
   razorpay.js — order creation + payment verification.

   Two halves of why this cannot live in the browser:
     1. Creating an order needs the Key Secret.
     2. A "payment succeeded" callback from the client can be faked
        by anyone with devtools open. The signature Razorpay sends
        back is only trustworthy once verified here, with the same
        Key Secret, via HMAC-SHA256 — that is the whole point of
        checkout running through a server at all.
   ============================================================ */

import RazorpaySDK from 'razorpay';
import crypto from 'node:crypto';
import { config, paymentsConfigured } from '../config.js';

let client = null;
function getClient() {
  if (!paymentsConfigured()) return null;
  if (!client) {
    client = new RazorpaySDK({ key_id: config.razorpay.keyId, key_secret: config.razorpay.keySecret });
  }
  return client;
}

export { paymentsConfigured };

export async function createOrder({ amount, currency = 'INR', receipt, notes }) {
  const rzp = getClient();
  if (!rzp) throw new Error('Payments are not configured on this server.');
  return rzp.orders.create({ amount, currency, receipt, notes });
}

/* total_count: 120 monthly cycles (10 years) — Razorpay subscriptions need
   a finite count; this is effectively "until cancelled" for a real user. */
export async function createSubscription({ planId, notes, customerNotify = 1 }) {
  const rzp = getClient();
  if (!rzp) throw new Error('Payments are not configured on this server.');
  return rzp.subscriptions.create({
    plan_id: planId,
    customer_notify: customerNotify,
    total_count: 120,
    notes
  });
}

function hmacHex(payload) {
  return crypto.createHmac('sha256', config.razorpay.keySecret).update(payload).digest('hex');
}
function safeEqual(expected, actual) {
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(actual || ''));
  } catch (e) {
    return false; // length mismatch etc. — definitely not a match
  }
}

/* True only if this exact order+payment pair was signed by Razorpay with
   our Key Secret — the one check that turns a client callback into proof. */
export function verifyPaymentSignature({ orderId, paymentId, signature }) {
  if (!paymentsConfigured()) return false;
  return safeEqual(hmacHex(orderId + '|' + paymentId), signature);
}

/* Subscriptions sign a different pair — payment_id|subscription_id,
   not order_id|payment_id, because there is no order for a subscription. */
export function verifySubscriptionSignature({ subscriptionId, paymentId, signature }) {
  if (!paymentsConfigured()) return false;
  return safeEqual(hmacHex(paymentId + '|' + subscriptionId), signature);
}

/* Webhooks sign the raw request body, not an id pair — Razorpay's own
   secret for this (set when you add the webhook URL) is separate from
   the Key Secret and lives in RAZORPAY_WEBHOOK_SECRET. */
export function verifyWebhookSignature({ rawBody, signature }) {
  if (!config.razorpay.webhookSecret) return false;
  const expected = crypto.createHmac('sha256', config.razorpay.webhookSecret).update(rawBody).digest('hex');
  return safeEqual(expected, signature);
}
