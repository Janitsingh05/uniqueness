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
