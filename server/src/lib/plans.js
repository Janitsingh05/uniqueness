/* ============================================================
   plans.js — the one place that knows what a plan actually costs.

   Mirrors js/config.js's packs/monthly, in paise. Mirrored rather
   than shared because the client must never be trusted to say how
   much to charge — the browser sends a plan id, this file decides
   the amount, same as prices work on any real checkout.

   Keep this in sync by hand when js/config.js's prices change.
   ============================================================ */

export const PLANS = {
  monthly: {
    Starter: { name: 'Starter', amount: 29900 },
    Creator: { name: 'Creator', amount: 49900 },
    Studio: { name: 'Studio', amount: 129900 }
  },
  packs: {
    Starter: { name: 'Starter pack', amount: 29900 },
    Creator: { name: 'Creator pack', amount: 119900 },
    Studio: { name: 'Studio pack', amount: 299900 }
  }
};

export function lookupPlan(billing, tier) {
  const table = PLANS[billing];
  return (table && table[tier]) || null;
}
