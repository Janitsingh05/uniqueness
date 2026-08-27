/* ============================================================
   auth.js — who is actually calling.

   Until this existed the API took the caller's word for it: /api/render
   read `payload.uid` straight out of the request body and looked up that
   account's plan to decide the watermark. A uid is not a secret — it
   shows up in the client's own Firestore traffic — so sending someone
   else's was enough to render watermark-free on a Free account.

   A Firebase ID token is signed by Google and verified here against the
   project's public keys, so the uid that comes out of it is one the
   caller actually proved they own. Every route that spends money, spends
   credit, or unlocks a paid feature must take the uid from here and
   never from the body.

   Needs FIREBASE_SERVICE_ACCOUNT (same one lib/credits.js uses). Without
   it there is no way to verify anything, so requireUser() refuses the
   request rather than falling back to trusting the body.
   ============================================================ */

import { getAuth } from 'firebase-admin/auth';
import { adminConfigured } from './firebase-admin.js';

/* verifyToken(req) -> uid, or null when there is no usable token.
   Never throws: a malformed or expired token is just "not signed in". */
export async function verifyToken(req) {
  if (!adminConfigured()) return null;
  const header = String(req.get('authorization') || '');
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  if (!match) return null;
  try {
    const decoded = await getAuth().verifyIdToken(match[1].trim());
    return decoded && decoded.uid ? decoded.uid : null;
  } catch (err) {
    return null;
  }
}

/* Express middleware. Puts the verified uid on req.uid or ends the
   request — routes behind this can treat req.uid as trustworthy. */
export async function requireUser(req, res, next) {
  if (!adminConfigured()) {
    return res.status(503).json({
      error: 'Accounts are not configured on this server.',
      code: 'ACCOUNTS_UNAVAILABLE'
    });
  }
  const uid = await verifyToken(req);
  if (!uid) {
    return res.status(401).json({
      error: 'Please sign in again — your session could not be verified.',
      code: 'AUTH_REQUIRED'
    });
  }
  req.uid = uid;
  next();
}
