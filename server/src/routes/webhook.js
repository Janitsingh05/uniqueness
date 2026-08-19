/* ============================================================
   POST /api/payments/webhook

   Razorpay -> this server, no browser involved. Two jobs:

   1. subscription.charged / .cancelled / .halted — the actual
      lifecycle events Razorpay only ever reports here, since a
      renewal happens whether or not anyone has the site open.

   2. payment.captured — a reliability backstop for the one-time
      pack flow. The browser's own verify() call is the normal path;
      this exists for the closed-tab/crashed-network case, using the
      uid stashed in the order's notes at creation time.

   Registered with its own express.raw() BEFORE the app-wide
   express.json() in index.js — Razorpay signs the exact raw bytes,
   so this cannot go through a JSON-parsed body without breaking
   signature verification.
   ============================================================ */

import { Router } from 'express';
import express from 'express';
import { verifyWebhookSignature } from '../lib/razorpay.js';
import { planByRazorpayId, lookupPlan } from '../lib/plans.js';
import { creditUser, findUserBySubscriptionId, logSubscriptionEvent } from '../lib/credits.js';
import { config } from '../config.js';

export const webhookRouter = Router();

webhookRouter.post('/payments/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  if (!config.razorpay.webhookSecret) {
    console.warn('[webhook] received an event but RAZORPAY_WEBHOOK_SECRET is not set — ignoring.');
    return res.status(503).json({ error: 'Webhook secret not configured.' });
  }

  const signature = req.headers['x-razorpay-signature'];
  const raw = req.body; // Buffer, thanks to express.raw() above
  if (!verifyWebhookSignature({ rawBody: raw, signature })) {
    console.warn('[webhook] signature did not match — rejecting.');
    return res.status(400).json({ error: 'Invalid webhook signature.' });
  }

  let event;
  try {
    event = JSON.parse(raw.toString('utf8'));
  } catch (e) {
    return res.status(400).json({ error: 'Malformed webhook body.' });
  }

  /* Acknowledge fast — Razorpay retries on non-2xx and on timeout, and
     none of this work needs to hold the connection open. */
  res.status(200).json({ ok: true });

  try {
    await handleEvent(event);
  } catch (err) {
    /* Already responded 200; Razorpay does not see this failure. Logged
       so it is not silently lost — check these logs if a customer says
       "I paid but nothing happened". */
    console.error('[webhook] handler error for', event && event.event, err.message);
  }
});

async function handleEvent(event) {
  const type = event.event;
  console.log('[webhook]', type);

  if (type === 'subscription.charged') {
    const sub = event.payload?.subscription?.entity;
    const payment = event.payload?.payment?.entity;
    if (!sub || !payment) return;

    const user = await findUserBySubscriptionId(sub.id);
    if (!user) return console.warn('[webhook] subscription.charged for unknown subscription', sub.id);

    const plan = planByRazorpayId(sub.plan_id);
    if (!plan) return console.warn('[webhook] subscription.charged for unknown plan_id', sub.plan_id);

    const result = await creditUser(user.id, {
      tier: plan.tier,
      planName: plan.name,
      minutes: plan.minutes,
      unlimited: plan.unlimited,
      amount: plan.amount,
      method: 'razorpay-subscription',
      source: 'webhook',
      paymentId: payment.id
    });
    console.log('[webhook] credited', user.id, result);
    return;
  }

  if (type === 'subscription.cancelled') {
    const sub = event.payload?.subscription?.entity;
    if (!sub) return;
    const user = await findUserBySubscriptionId(sub.id);
    if (!user) return;
    await logSubscriptionEvent(user.id, {
      text: 'Subscription cancelled — access continues until the current billing period ends.',
      downgrade: false
    });
    return;
  }

  if (type === 'subscription.halted') {
    const sub = event.payload?.subscription?.entity;
    if (!sub) return;
    const user = await findUserBySubscriptionId(sub.id);
    if (!user) return;
    await logSubscriptionEvent(user.id, {
      text: 'Subscription payments failed and were halted by Razorpay — moved back to the Free plan until billing is fixed.',
      downgrade: true
    });
    return;
  }

  if (type === 'payment.captured') {
    /* Backstop only — the browser's own verify() call is the normal
       path for a one-time pack. Only act on payments that are clearly
       ours (notes.billing === 'packs') and carry a uid; anything else
       (including subscription-cycle payments, already handled above
       via subscription.charged) is left alone. */
    const payment = event.payload?.payment?.entity;
    const notes = payment && payment.notes;
    if (!notes || notes.billing !== 'packs' || !notes.uid || !notes.tier) return;

    const plan = lookupPlan('packs', notes.tier);
    if (!plan) return;

    const result = await creditUser(notes.uid, {
      tier: notes.tier,
      planName: plan.name,
      minutes: plan.minutes,
      unlimited: plan.unlimited,
      amount: plan.amount,
      method: 'razorpay',
      source: 'webhook',
      paymentId: payment.id
    });
    console.log('[webhook] backstop-credited', notes.uid, result);
  }
}
