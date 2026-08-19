/* ============================================================
   POST /api/payments/create-order   { billing, tier } -> order
   POST /api/payments/verify         { razorpay_order_id, razorpay_payment_id,
                                        razorpay_signature, billing, tier }
                                      -> { verified, plan }

   The amount is always looked up server-side from lib/plans.js —
   the client says *which* plan, never *how much*.
   ============================================================ */

import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import { createOrder, verifyPaymentSignature, paymentsConfigured } from '../lib/razorpay.js';
import { lookupPlan } from '../lib/plans.js';
import { config } from '../config.js';

export const paymentsRouter = Router();

paymentsRouter.post('/payments/create-order', async (req, res) => {
  if (!paymentsConfigured()) {
    return res.status(503).json({
      error: 'Payments are not configured on this server. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.',
      code: 'PAYMENTS_NOT_CONFIGURED'
    });
  }

  const { billing, tier } = req.body || {};
  const plan = lookupPlan(billing, tier);
  if (!plan) return res.status(400).json({ error: 'Unknown plan — cannot price this order.' });

  try {
    const order = await createOrder({
      amount: plan.amount,
      currency: 'INR',
      receipt: randomUUID(),
      notes: { billing, tier }
    });
    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: config.razorpay.keyId,
      planName: plan.name
    });
  } catch (err) {
    console.error('[payments] create-order', err.message);
    res.status(502).json({ error: err.message || 'Could not create the payment order.' });
  }
});

paymentsRouter.post('/payments/verify', (req, res) => {
  if (!paymentsConfigured()) {
    return res.status(503).json({ error: 'Payments are not configured on this server.' });
  }

  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, billing, tier } = req.body || {};
  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return res.status(400).json({ error: 'Missing payment details to verify.', verified: false });
  }

  const plan = lookupPlan(billing, tier);
  if (!plan) return res.status(400).json({ error: 'Unknown plan.', verified: false });

  const ok = verifyPaymentSignature({
    orderId: razorpay_order_id,
    paymentId: razorpay_payment_id,
    signature: razorpay_signature
  });

  if (!ok) return res.status(400).json({ error: 'Payment signature could not be verified.', verified: false });
  res.json({ verified: true, billing, tier, plan: plan.name });
});
