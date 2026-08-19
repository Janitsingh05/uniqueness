/* ============================================================
   plans.js — the one place that knows what a plan actually costs
   and how many minutes it grants.

   Mirrors js/config.js's packs/monthly. Mirrored rather than shared
   because the client must never be trusted to say how much to charge
   or how many minutes to grant itself — the browser sends a plan id,
   this file decides the amount and the minutes, same as any real
   checkout works.

   monthly[tier].planId is a Razorpay recurring Plan id — created by
   scripts/setup-razorpay-plans.js, one plan per tier, paid every
   month via the Subscriptions API. packs have no planId; they are
   one-time Orders.

   Keep this in sync by hand when js/config.js's prices/minutes change.
   ============================================================ */

export const PLANS = {
  monthly: {
    Starter: { name: 'Starter', amount: 29900, minutes: 120, unlimited: false, planId: 'plan_TRVweKmLAkkDGA' },
    Creator: { name: 'Creator', amount: 49900, minutes: 900, unlimited: false, planId: 'plan_TRVwebi09f80F9' },
    Studio: { name: 'Studio', amount: 129900, minutes: 99999, unlimited: true, planId: 'plan_TRVwerd5z6W7yN' }
  },
  packs: {
    Starter: { name: 'Starter pack', amount: 29900, minutes: 120, unlimited: false },
    Creator: { name: 'Creator pack', amount: 119900, minutes: 900, unlimited: false },
    Studio: { name: 'Studio pack', amount: 299900, minutes: 99999, unlimited: true }
  }
};

export function lookupPlan(billing, tier) {
  const table = PLANS[billing];
  return (table && table[tier]) || null;
}

/* Reverse lookup for webhooks — Razorpay hands back a plan_id, not a
   tier name, so subscription.charged etc. need to work backwards. */
export function planByRazorpayId(planId) {
  for (const [tier, plan] of Object.entries(PLANS.monthly)) {
    if (plan.planId === planId) return { tier, ...plan };
  }
  return null;
}
