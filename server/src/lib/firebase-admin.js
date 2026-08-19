/* ============================================================
   firebase-admin.js — server-side Firestore access.

   Needed for exactly one reason: a webhook has no browser attached.
   When Razorpay calls /api/payments/webhook days or weeks after
   checkout to report a renewal charge, there is no client-side
   UQ.db.grant() to call — this server has to write the credit
   itself, directly to the same Firestore project js/db.js reads.

   FIREBASE_SERVICE_ACCOUNT holds the full service-account JSON (one
   line) from Firebase Console -> Project settings -> Service accounts
   -> Generate new private key. Until it's set, server-side crediting
   reports itself unavailable rather than throwing — webhooks still
   verify signatures and log what they would have done.
   ============================================================ */

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

let firestore = null;
let attempted = false;

function init() {
  if (attempted) return;
  attempted = true;
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return;
  try {
    const serviceAccount = JSON.parse(raw);
    const app = initializeApp({ credential: cert(serviceAccount) });
    firestore = getFirestore(app);
  } catch (e) {
    console.error('[firebase-admin] FIREBASE_SERVICE_ACCOUNT is set but invalid:', e.message);
  }
}

export function adminConfigured() {
  init();
  return !!firestore;
}

export function db() {
  init();
  return firestore;
}
