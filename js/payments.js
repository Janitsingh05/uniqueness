/* ============================================================
   payments.js — Razorpay checkout.

   The Key ID here is meant to be public (Checkout needs it in the
   browser); the Key Secret never appears anywhere in this repo — it
   lives only in server/.env, and every peso this flow moves is
   verified there, not trusted from a client callback.

   Flow: create an order on the backend (server prices it, not us) →
   open Razorpay Checkout with that order → on success, verify the
   signature on the backend → only then call opts.onSuccess, which is
   what credits.js uses to actually grant minutes.
   ============================================================ */

window.UQ = window.UQ || {};

UQ.payments = {
  ready() {
    const p = UQ.config && UQ.config.payments;
    return !!(p && p.enabled && p.keyId && String(p.keyId).length > 8);
  },

  /* checkout(plan, { billing, method, onSuccess, onDismiss, onError }) */
  async checkout(plan, opts) {
    opts = opts || {};
    if (!this.ready()) {
      const err = new Error('Payment gateway not connected — add Razorpay keyId and set payments.enabled = true in js/config.js');
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

    let order;
    try {
      const res = await fetch(UQ.api.url('/api/payments/create-order'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ billing: opts.billing, tier: plan.tier })
      });
      order = await UQ.api._json(res);
    } catch (err) {
      if (opts.onError) opts.onError(err);
      throw err;
    }

    const rzp = new Razorpay({
      key: order.keyId || UQ.config.payments.keyId,
      amount: order.amount,
      currency: order.currency || 'INR',
      order_id: order.orderId,
      name: (UQ.config.brand && UQ.config.brand.name) || 'uniqueness',
      description: plan.name,
      theme: { color: '#7C4DFF' },
      handler: async function (response) {
        try {
          const vres = await fetch(UQ.api.url('/api/payments/verify'), {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature,
              billing: opts.billing,
              tier: plan.tier
            })
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
    });

    rzp.on('payment.failed', function (resp) {
      const msg = (resp && resp.error && resp.error.description) || 'Payment failed.';
      if (opts.onError) opts.onError(new Error(msg));
    });

    rzp.open();
  }
};
