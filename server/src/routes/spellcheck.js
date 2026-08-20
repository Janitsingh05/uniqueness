/* ============================================================
   POST /api/polish-hinglish     JSON: { words: [...] }
     -> { words: [...corrected...], changed }

   No file upload, no key required from the client — reuses the
   server's own Groq key (same one STT can use). Needs no auth beyond
   what the rest of this API has: the words are already public in the
   editor, nothing sensitive crosses this endpoint.
   ============================================================ */

import { Router } from 'express';
import { polishHinglishWords } from '../lib/spellcheck.js';

export const spellcheckRouter = Router();

spellcheckRouter.post('/polish-hinglish', async (req, res) => {
  const { words } = req.body || {};
  if (!Array.isArray(words) || !words.length) {
    return res.status(400).json({ error: 'words is required — an array of Hinglish words to polish.' });
  }
  if (words.length > 500) {
    return res.status(400).json({ error: 'Too many words in one request (max 500) — send one line/caption chunk at a time.' });
  }

  const result = await polishHinglishWords(words);
  res.json(result);
});
