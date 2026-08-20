/* ============================================================
   credits.js — server-side crediting.

   Writes to the exact same Firestore shape js/db.js already uses
   (users/{uid}.minutes, orders/{id}, users/{uid}/events/{id}), so
   the app doesn't care whether a credit came from the browser's
   demo path or a verified server-side payment — same documents,
   same reads.

   Idempotent by Razorpay payment id: a subscription's very first
   charge fires both the client's verify() call AND a later
   subscription.charged webhook for that same payment. Without a
   dedup key both would credit the user — this uses the payment id
   as the orders/{id} document id, inside a transaction, so whichever
   path gets there first wins and the second is a safe no-op.
   ============================================================ */

import { db, adminConfigured } from './firebase-admin.js';
import { config } from '../config.js';

const inr = paise => '₹' + (paise / 100).toLocaleString('en-IN');
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

/* creditUser(uid, { tier, planName, minutes, unlimited, amount, method,
                      source, paymentId }) — paymentId is required; it is
   the whole idempotency mechanism. */
export async function creditUser(uid, opts) {
  if (!adminConfigured()) return { ok: false, reason: 'firebase-admin not configured' };
  if (!uid) return { ok: false, reason: 'no uid to credit' };
  if (!opts.paymentId) return { ok: false, reason: 'no paymentId — refusing to credit without an idempotency key' };

  const firestore = db();
  const userRef = firestore.collection('users').doc(uid);
  /* Razorpay payment ids (pay_...) are already unique and URL-safe, so
     they work directly as a Firestore document id. */
  const orderRef = firestore.collection('orders').doc(opts.paymentId);

  try {
    const result = await firestore.runTransaction(async (tx) => {
      const [userSnap, orderSnap] = await Promise.all([tx.get(userRef), tx.get(orderRef)]);
      if (!userSnap.exists) throw new Error('no such user: ' + uid);
      if (orderSnap.exists) return { already: true, minutes: userSnap.data().minutes };

      const current = userSnap.data() || {};
      const nextMinutes = opts.unlimited
        ? 99999
        : Math.round(((Number(current.minutes) || 0) + Number(opts.minutes || 0)) * 10) / 10;

      tx.update(userRef, { minutes: nextMinutes, plan: opts.tier || current.plan || 'Free' });
      tx.set(orderRef, {
        user: uid,
        at: Date.now(),
        name: opts.planName || opts.tier || 'Plan',
        price: opts.amount != null ? inr(opts.amount) : '',
        minutes: opts.unlimited ? 99999 : Number(opts.minutes || 0),
        unlimited: !!opts.unlimited,
        method: opts.method || 'razorpay',
        source: opts.source || 'verify', // 'verify' | 'webhook'
        razorpayPaymentId: opts.paymentId
      });
      const eventRef = userRef.collection('events').doc();
      tx.set(eventRef, {
        icon: '✦', tone: 'teal', at: Date.now(),
        text: (opts.planName || opts.tier || 'Plan') + ' activated — ' +
          (opts.unlimited ? 'unlimited captions' : (opts.minutes + ' minutes added'))
      });
      return { already: false, minutes: nextMinutes };
    });

    return { ok: true, deduped: result.already, minutes: result.minutes };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}

/* subscription.halted / .cancelled have no payment to credit — they log
   an event and, for halted (payments failing), drop the user to Free so
   access actually reflects lost billing rather than silently staying paid. */
export async function logSubscriptionEvent(uid, { text, downgrade }) {
  if (!adminConfigured() || !uid) return { ok: false };
  const firestore = db();
  const userRef = firestore.collection('users').doc(uid);
  const snap = await userRef.get();
  if (!snap.exists) return { ok: false, reason: 'no such user: ' + uid };

  if (downgrade) await userRef.update({ plan: 'Free' });
  await userRef.collection('events').add({ icon: '⚠', tone: 'purple', at: Date.now(), text });
  return { ok: true };
}

/* Looks a user up by their Razorpay subscription id, stashed on the user
   doc when the subscription was created — webhooks only carry Razorpay's
   own ids, never our uid, so this is how a renewal finds who to credit. */
export async function findUserBySubscriptionId(subscriptionId) {
  if (!adminConfigured() || !subscriptionId) return null;
  const snap = await db().collection('users').where('razorpaySubscriptionId', '==', subscriptionId).limit(1).get();
  return snap.empty ? null : { id: snap.docs[0].id, ...snap.docs[0].data() };
}

export async function attachSubscriptionId(uid, subscriptionId) {
  if (!adminConfigured() || !uid) return;
  await db().collection('users').doc(uid).update({ razorpaySubscriptionId: subscriptionId });
}

/* creditReferral(payingUid, { amount, paymentId }) — the referral
   commission for one verified payment, credited to whoever referred the
   paying user. amount is in paise, same unit as creditUser().

   Server-only by design: firestore.rules blocks the client from ever
   writing referralAvailable/referralEarned directly, so the only way a
   balance moves is through here, gated on a signature-verified payment —
   that is the whole "100% verification" guarantee. Idempotent by payment
   id (referralCredits/{paymentId}), same pattern and same reason as
   creditUser's orders/{paymentId}: verify() and a webhook can both fire
   for one payment. Skips silently (not an error) for a payment with no
   referrer, a self-referral, or one outside the 12-month window the
   referral program promises. */
export async function creditReferral(payingUid, opts) {
  if (!adminConfigured()) return { ok: false, reason: 'firebase-admin not configured' };
  if (!payingUid || !opts || !opts.paymentId) return { ok: false, reason: 'missing uid or paymentId' };

  const firestore = db();
  const payingUserRef = firestore.collection('users').doc(payingUid);
  const creditRef = firestore.collection('referralCredits').doc(opts.paymentId);

  try {
    const result = await firestore.runTransaction(async (tx) => {
      const [payingSnap, creditSnap] = await Promise.all([tx.get(payingUserRef), tx.get(creditRef)]);
      if (!payingSnap.exists) return { skipped: 'no such paying user' };
      if (creditSnap.exists) return { skipped: 'already credited' };

      const payingUser = payingSnap.data() || {};
      const code = payingUser.referredBy;
      if (!code) return { skipped: 'not a referred user' };

      const codeSnap = await tx.get(firestore.collection('codes').doc(code));
      const referrerUid = codeSnap.exists ? codeSnap.data().uid : null;
      if (!referrerUid || referrerUid === payingUid) return { skipped: 'no valid referrer' };

      if (Date.now() - (Number(payingUser.created) || 0) > YEAR_MS) {
        return { skipped: 'outside the 12-month referral window' };
      }

      const referrerRef = firestore.collection('users').doc(referrerUid);
      const referrerSnap = await tx.get(referrerRef);
      if (!referrerSnap.exists) return { skipped: 'referrer account no longer exists' };

      const commission = Math.round((Number(opts.amount) || 0) * (config.referral.sharePercent || 0) / 100);
      if (commission <= 0) return { skipped: 'zero commission' };

      const referrer = referrerSnap.data() || {};
      tx.update(referrerRef, {
        referralAvailable: Math.round((Number(referrer.referralAvailable) || 0) + commission),
        referralEarned: Math.round((Number(referrer.referralEarned) || 0) + commission)
      });
      tx.set(creditRef, {
        payingUser: payingUid, referrer: referrerUid, code,
        amount: commission, at: Date.now(), paymentId: opts.paymentId
      });
      tx.set(referrerRef.collection('events').doc(), {
        icon: '◎', tone: 'teal', at: Date.now(),
        text: 'Referral bonus — ' + inr(commission) + ' from someone you referred'
      });
      /* Lets the referrer's own stats show a real conversion, not just a
         signup — same doc the "Bought credits" count in refer.html reads. */
      tx.set(firestore.collection('referralHits').doc(code).collection('members').doc(payingUid),
        { converted: true, convertedAt: Date.now() }, { merge: true });

      return { credited: true, commission, referrerUid };
    });

    return { ok: true, ...result };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
}
