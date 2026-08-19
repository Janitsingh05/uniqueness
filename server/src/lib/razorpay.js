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

/* True only if this exact order+payment pair was signed by Razorpay with
   our Key Secret — the one check that turns a client callback into proof. */
export function verifyPaymentSignature({ orderId, paymentId, signature }) {
  if (!paymentsConfigured()) return false;
  const expected = crypto
    .createHmac('sha256', config.razorpay.keySecret)
    .update(orderId + '|' + paymentId)
    .digest('hex');
  try {
    return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature || ''));
  } catch (e) {
    return false; // length mismatch etc. — definitely not a match
  }
}
