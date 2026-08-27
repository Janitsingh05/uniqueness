/* ============================================================
   Account routes — everything that needs a verified signed-in user.

   POST /api/spend    { minutes, reason }  -> { minutes, charged }
   GET  /api/balance                       -> { minutes, plan }

   The browser used to write users/{uid}.minutes itself, which meant the
   credit balance was editable from devtools. firestore.rules now refuses
   client writes to that field, and this is the replacement path: the uid
   comes from a verified Firebase ID token, never from the request body.
   ============================================================ */

import { Router } from 'express';
import { requireUser } from '../lib/auth.js';
import { spendMinutes, getUserPlan } from '../lib/credits.js';
import { db, adminConfigured } from '../lib/firebase-admin.js';

export const accountRouter = Router();

accountRouter.post('/spend', requireUser, async (req, res) => {
  const minutes = Number(req.body && req.body.minutes);
  if (!Number.isFinite(minutes) || minutes < 0) {
    return res.status(400).json({ error: 'minutes must be a positive number.' });
  }
  /* A single clip cannot plausibly cost more than this; a wild number is
     a bug or a probe, and either way should not touch the balance. */
  if (minutes > 600) {
    return res.status(400).json({ error: 'That is more minutes than any single clip can use.' });
  }

  const result = await spendMinutes(req.uid, minutes, {
    reason: String((req.body && req.body.reason) || 'caption export').slice(0, 80)
  });

  if (!result.ok) {
    const status = result.code === 'INSUFFICIENT_CREDIT' ? 402 : 400;
    return res.status(status).json({ error: result.reason, code: result.code, minutes: result.minutes });
  }
  res.json({ minutes: result.minutes, charged: result.charged || 0, unlimited: !!result.unlimited });
});

accountRouter.get('/balance', requireUser, async (req, res) => {
  if (!adminConfigured()) return res.status(503).json({ error: 'Accounts are not configured.' });
  try {
    const snap = await db().collection('users').doc(req.uid).get();
    const data = snap.exists ? snap.data() || {} : {};
    res.json({ minutes: Number(data.minutes) || 0, plan: (await getUserPlan(req.uid)) || 'Free' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
