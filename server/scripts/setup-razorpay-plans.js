/* ============================================================
   setup-razorpay-plans.js — one-time script: creates the three
   monthly recurring Plans on Razorpay and prints the plan_ids
   to paste into src/lib/plans.js.

   Run once: node scripts/setup-razorpay-plans.js
   Safe to re-run — it checks for an existing plan with the same
   name+amount before creating a duplicate.
   ============================================================ */

import 'dotenv/config';
import Razorpay from 'razorpay';

const keyId = process.env.RAZORPAY_KEY_ID;
const keySecret = process.env.RAZORPAY_KEY_SECRET;
if (!keyId || !keySecret) {
  console.error('Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in server/.env first.');
  process.exit(1);
}

const rzp = new Razorpay({ key_id: keyId, key_secret: keySecret });

/* Mirrors js/config.js's monthly array and server/src/lib/plans.js. */
const MONTHLY = [
  { tier: 'Starter', name: 'Starter — monthly', amount: 29900 },
  { tier: 'Creator', name: 'Creator — monthly', amount: 49900 },
  { tier: 'Studio', name: 'Studio — monthly', amount: 129900 }
];

async function findExisting(name, amount) {
  /* Razorpay has no "get by name" — page through and match by hand.
     Plan counts here are tiny (3), so this is cheap even unpaginated
     past the first page. */
  let skip = 0;
  for (;;) {
    const page = await rzp.plans.all({ count: 100, skip });
    const hit = page.items.find(p => p.item.name === name && p.item.amount === amount);
    if (hit) return hit;
    if (page.items.length < 100) return null;
    skip += 100;
  }
}

async function main() {
  console.log(`\nCreating monthly Plans on Razorpay (${keyId.startsWith('rzp_live_') ? 'LIVE' : 'test'} mode)\n`);
  const results = {};

  for (const plan of MONTHLY) {
    const existing = await findExisting(plan.name, plan.amount);
    if (existing) {
      console.log(`[exists] ${plan.tier.padEnd(8)} ${existing.id}`);
      results[plan.tier] = existing.id;
      continue;
    }
    const created = await rzp.plans.create({
      period: 'monthly',
      interval: 1,
      item: {
        name: plan.name,
        amount: plan.amount,
        currency: 'INR',
        description: `uniqueness — ${plan.tier} monthly captioning plan`
      },
      notes: { tier: plan.tier, app: 'uniqueness' }
    });
    console.log(`[created] ${plan.tier.padEnd(8)} ${created.id}`);
    results[plan.tier] = created.id;
  }

  console.log('\nPaste these into server/src/lib/plans.js (monthly[tier].planId):\n');
  console.log(JSON.stringify(results, null, 2));
  console.log('');
}

main().catch(err => {
  console.error('\nFailed:', err.error || err.message || err);
  process.exit(1);
});
