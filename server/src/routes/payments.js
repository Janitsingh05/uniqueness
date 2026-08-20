/* ============================================================
   POST /api/payments/create-order         { billing:'packs', tier } -> order
   POST /api/payments/create-subscription  { tier, uid } -> subscription
   POST /api/payments/verify                order or subscription payload -> { verified }

   The amount (and, for subscriptions, the plan_id) is always looked
   up server-side from lib/plans.js — the client says *which* plan,
   never *how much* or *which Razorpay plan record*.

   verify credits the account itself via lib/credits.js when the
   Firebase Admin service account is configured; otherwise it still
   verifies and reports back so the browser's existing UQ.db.grant()
   path can do it, same as it always has.
   ============================================================ */

import { Router } from 'express';
import { randomUUID } from 'node:crypto';
import {
  createOrder, createSubscription,
  verifyPaymentSignature, verifySubscriptionSignature,
  paymentsConfigured
} from '../lib/razorpay.js';
import { lookupPlan } from '../lib/plans.js';
import { creditUser, creditReferral, attachSubscriptionId } from '../lib/credits.js';
import { config } from '../config.js';

export const paymentsRouter = Router();

paymentsRouter.post('/payments/create-order', async (req, res) => {
  if (!paymentsConfigured()) {
    return res.status(503).json({
      error: 'Payments are not configured on this server. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.',
      code: 'PAYMENTS_NOT_CONFIGURED'
    });
  }

  const { billing, tier, uid } = req.body || {};
  const plan = lookupPlan(billing, tier);
  if (!plan) return res.status(400).json({ error: 'Unknown plan — cannot price this order.' });

  try {
    const order = await createOrder({
      amount: plan.amount,
      currency: 'INR',
      receipt: randomUUID(),
      /* uid rides along in notes so the payment.captured webhook backstop
         (in routes/webhook.js) can credit the right account even if the
         browser never completes its own verify() call — closed tab,
         crashed network, whatever. */
      notes: { billing, tier, uid: uid || '' }
    });
    res.json({
      orderId: order.id,
      amount: order.amount,
      currency: order.currency,
      keyId: config.razorpay.keyId,
      planName: plan.name
    });
  } catch (err) {
    console.error('[payments] create-order', err.message || err);
    res.status(502).json({ error: err.message || 'Could not create the payment order.' });
  }
});

paymentsRouter.post('/payments/create-subscription', async (req, res) => {
  if (!paymentsConfigured()) {
    return res.status(503).json({
      error: 'Payments are not configured on this server. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.',
      code: 'PAYMENTS_NOT_CONFIGURED'
    });
  }

  const { tier, uid } = req.body || {};
  const plan = lookupPlan('monthly', tier);
  if (!plan || !plan.planId) return res.status(400).json({ error: 'Unknown or unconfigured monthly plan.' });

  try {
    const sub = await createSubscription({
      planId: plan.planId,
      notes: { tier, uid: uid || '' }
    });
    /* Remember whose subscription this is so a renewal webhook — which
       only ever carries Razorpay ids, never our uid — can find them. */
    if (uid) await attachSubscriptionId(uid, sub.id).catch(err => console.warn('[payments] attachSubscriptionId', err.message));

    res.json({
      subscriptionId: sub.id,
      keyId: config.razorpay.keyId,
      planName: plan.name
    });
  } catch (err) {
    console.error('[payments] create-subscription', err.message || err);
    res.status(502).json({ error: err.message || 'Could not create the subscription.' });
  }
});

paymentsRouter.post('/payments/verify', async (req, res) => {
  if (!paymentsConfigured()) {
    return res.status(503).json({ error: 'Payments are not configured on this server.' });
  }

  const body = req.body || {};
  const { billing, tier, razorpay_payment_id } = body;
  const plan = lookupPlan(billing, tier);
  if (!plan) return res.status(400).json({ error: 'Unknown plan.', verified: false });

  const isSubscription = !!body.razorpay_subscription_id;
  let ok;
  if (isSubscription) {
    if (!body.razorpay_subscription_id || !razorpay_payment_id || !body.razorpay_signature) {
      return res.status(400).json({ error: 'Missing subscription payment details to verify.', verified: false });
    }
    ok = verifySubscriptionSignature({
      subscriptionId: body.razorpay_subscription_id,
      paymentId: razorpay_payment_id,
      signature: body.razorpay_signature
    });
  } else {
    if (!body.razorpay_order_id || !razorpay_payment_id || !body.razorpay_signature) {
      return res.status(400).json({ error: 'Missing payment details to verify.', verified: false });
    }
    ok = verifyPaymentSignature({
      orderId: body.razorpay_order_id,
      paymentId: razorpay_payment_id,
      signature: body.razorpay_signature
    });
  }

  if (!ok) return res.status(400).json({ error: 'Payment signature could not be verified.', verified: false });

  /* Credit server-side when we can — the browser still has its own
     grant() as a fallback for accounts without Firebase Admin wired. */
  let credited = null;
  if (body.uid) {
    credited = await creditUser(body.uid, {
      tier,
      planName: plan.name,
      minutes: plan.minutes,
      unlimited: plan.unlimited,
      amount: plan.amount,
      method: isSubscription ? 'razorpay-subscription' : 'razorpay',
      source: 'verify',
      paymentId: razorpay_payment_id
    }).catch(err => ({ ok: false, reason: err.message }));

    /* Independent of whether our own minute-crediting above succeeded —
       the payment itself is what's verified, and that's what the referral
       reward is for. */
    await creditReferral(body.uid, { amount: plan.amount, paymentId: razorpay_payment_id })
      .catch(err => console.error('[payments] creditReferral', err.message));
  }

  res.json({ verified: true, billing, tier, plan: plan.name, credited });
});
