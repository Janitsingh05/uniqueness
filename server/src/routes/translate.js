/* ============================================================
   POST /api/translate        JSON: { lines, source, target }
     -> { lines: [...translated...], target, note }

   No file upload — just the lines the editor already has, same
   shape /api/render expects. Needs no API key (unlike STT), so
   it works even while server-side transcription is off.
   ============================================================ */

import { Router } from 'express';
import { translateLines } from '../lib/translate.js';

export const translateRouter = Router();

translateRouter.post('/translate', async (req, res) => {
  const { lines, source, target } = req.body || {};
  if (!Array.isArray(lines) || !lines.length) {
    return res.status(400).json({ error: 'lines is required — generate captions before translating.' });
  }
  if (!target) {
    return res.status(400).json({ error: 'target language is required.' });
  }
  /* An unrecognised code used to come back 200 with the text untouched —
     indistinguishable from a successful translation, so the editor happily
     offered an English .srt labelled Tamil. Fail loudly instead. */
  if (!/^[a-z]{2}(-[A-Za-z]{2,4})?$/.test(String(target))) {
    return res.status(400).json({ error: `"${String(target).slice(0, 20)}" is not a language code we recognise.` });
  }
  if (source && String(source) === String(target)) {
    return res.status(400).json({ error: 'Source and target languages are the same.' });
  }

  try {
    const result = await translateLines(lines, { source: source || 'en', target });
    res.json({
      lines: result.lines,
      target,
      note: result.failures
        ? `${result.failures} of ${lines.length} line(s) could not be translated and were left as-is.`
        : `${lines.length} line(s) translated.`
    });
  } catch (err) {
    console.error('[translate]', err.message);
    res.status(502).json({ error: err.message });
  }
});
