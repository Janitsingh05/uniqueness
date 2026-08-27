/* ============================================================
   payments.js — Razorpay checkout, two modes.

   The Key ID here is meant to be public (Checkout needs it in the
   browser); the Key Secret never appears anywhere in this repo — it
   lives only in server/.env, and every rupee this flow moves is
   verified there, not trusted from a client callback.

   packs (one-time)  -> create-order      -> Checkout w/ order_id
   monthly (recurring) -> create-subscription -> Checkout w/ subscription_id

   Either way: open Checkout with what the backend created → on
   success, verify the signature on the backend (which also credits
   the account server-side when Firebase Admin is configured there) →
   only then call opts.onSuccess, which is what credits.js uses to
   grant minutes locally as well, so the UI updates immediately either
   way.
   ============================================================ */

window.UQ = window.UQ || {};

UQ.payments = {
  ready() {
    const p = UQ.config && UQ.config.payments;
    return !!(p && p.enabled && p.keyId && String(p.keyId).length > 8);
  },

  /* checkout(plan, { billing, uid, method, onSuccess, onDismiss, onError })
     billing: 'monthly' -> subscription flow, anything else -> one-time order. */
  async checkout(plan, opts) {
    opts = opts || {};
    if (!this.ready()) {
      /* User-facing: this string reaches a toast. The operator-facing
         version of it belongs in the console, not on the page. */
      console.error('[payments] Razorpay is not configured — set payments.keyId and payments.enabled in js/config.js.');
      const err = new Error('Checkout is temporarily unavailable. Please try again shortly.');
      if (opts.onError) opts.onError(err);
      throw err;
    }
    if (!UQ.api || !UQ.api.configured()) {
      const err = new Error('Payment server is not reachable right now — try again in a moment.');
      if (opts.onError) opts.onError(err);
      throw err;
    }
    if (typeof Razorpay === 'undefined') {
      const err = new Error('Razorpay Checkout script did not load — check your connection and try again.');
      if (opts.onError) opts.onError(err);
      throw err;
    }

    const isSubscription = opts.billing === 'monthly';

    let created;
    try {
      const res = await fetch(UQ.api.url(isSubscription ? '/api/payments/create-subscription' : '/api/payments/create-order'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(isSubscription
          ? { tier: plan.tier, uid: opts.uid }
          : { billing: opts.billing, tier: plan.tier, uid: opts.uid })
      });
      created = await UQ.api._json(res);
    } catch (err) {
      if (opts.onError) opts.onError(err);
      throw err;
    }

    const checkoutOpts = {
      key: created.keyId || UQ.config.payments.keyId,
      name: (UQ.config.brand && UQ.config.brand.name) || 'uniqueness',
      description: plan.name,
      theme: { color: '#7C4DFF' },
      handler: async function (response) {
        try {
          const vres = await fetch(UQ.api.url('/api/payments/verify'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(Object.assign({
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              billing: opts.billing,
              tier: plan.tier,
              uid: opts.uid
            }, isSubscription
              ? { razorpay_subscription_id: response.razorpay_subscription_id }
              : { razorpay_order_id: response.razorpay_order_id }))
          });
          const verified = await UQ.api._json(vres);
          if (verified && verified.verified) {
            if (opts.onSuccess) opts.onSuccess(response);
          } else {
            if (opts.onError) opts.onError(new Error('Payment could not be verified — no charge was applied to your account here.'));
          }
        } catch (err) {
          if (opts.onError) opts.onError(err);
        }
      },
      modal: { ondismiss: function () { if (opts.onDismiss) opts.onDismiss(); } }
    };

    if (isSubscription) {
      checkoutOpts.subscription_id = created.subscriptionId;
    } else {
      checkoutOpts.order_id = created.orderId;
      checkoutOpts.amount = created.amount;
      checkoutOpts.currency = created.currency || 'INR';
    }

    const rzp = new Razorpay(checkoutOpts);
    rzp.on('payment.failed', function (resp) {
      const msg = (resp && resp.error && resp.error.description) || 'Payment failed.';
      if (opts.onError) opts.onError(new Error(msg));
    });
    rzp.open();
  }
};
