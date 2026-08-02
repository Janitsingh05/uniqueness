/* ============================================================
   payments.js — payment gateway hook (Razorpay reserved).

   Wire-up later:
     1. Set UQ.config.payments.keyId = 'rzp_live_…' (or test key)
     2. Set UQ.config.payments.enabled = true
     3. Load Razorpay checkout.js on credits.html
     4. Fill in checkout() to open Razorpay and, on success,
        call the same grant() path credits.js uses today.

   Until then, credits.js runs demo checkout (no real charge).
   ============================================================ */

window.UQ = window.UQ || {};

UQ.payments = {
  ready() {
    const p = UQ.config && UQ.config.payments;
    return !!(p && p.enabled && p.keyId && String(p.keyId).length > 8);
  },

  /* checkout(plan, { method, onSuccess, onDismiss, onError })
     Implement Razorpay here when keys are live. */
  async checkout(plan, opts) {
    opts = opts || {};
    if (!this.ready()) {
      const err = new Error('Payment gateway not connected — add Razorpay keyId and set payments.enabled = true in js/config.js');
      if (opts.onError) opts.onError(err);
      throw err;
    }

    /* --- PASTE RAZORPAY INTEGRATION BELOW ---
       Example shape (do not enable until keyId is set):

       const rzp = new Razorpay({
         key: UQ.config.payments.keyId,
         amount: …, // paise — compute from plan.price server-side in production
         currency: 'INR',
         name: UQ.config.brand.name,
         description: plan.name,
         handler: function (response) { opts.onSuccess && opts.onSuccess(response); },
         modal: { ondismiss: function () { opts.onDismiss && opts.onDismiss(); } }
       });
       rzp.open();
    --- */

    const err = new Error('Razorpay checkout is reserved — finish UQ.payments.checkout() when you connect the gateway.');
    if (opts.onError) opts.onError(err);
    throw err;
  }
};
