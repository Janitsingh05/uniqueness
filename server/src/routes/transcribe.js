/* ============================================================
   POST /api/transcribe
   multipart: clip=<video|audio>, language=<optional>

   -> { text, words: [{text,start,end}], duration, chunks, note }

   Returns the same shape the browser engine produces, so
   js/editor.js can use either source without branching.
   ============================================================ */

import { Router } from 'express';
import fs from 'node:fs/promises';
import { transcribe } from '../lib/stt.js';
import { sttConfigured, dirs } from '../config.js';
import { upload } from '../lib/upload.js';

export const transcribeRouter = Router();

transcribeRouter.post('/transcribe', upload.single('clip'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No clip uploaded. Send it as multipart field "clip".' });
  }
  if (!sttConfigured()) {
    await fs.unlink(req.file.path).catch(() => {});
    return res.status(503).json({
      error: 'Speech-to-text is not configured on this server. Set OPENAI_API_KEY in server/.env.',
      code: 'STT_NOT_CONFIGURED'
    });
  }

  const started = Date.now();
  try {
    const result = await transcribe(req.file.path, {
      language: req.body.language,
      audioDir: dirs.audio,
      id: req.file.filename
    });

    const seconds = ((Date.now() - started) / 1000).toFixed(1);
    res.json({
      ...result,
      note: result.words.length
        ? `${result.words.length} words locked to the voice · ${result.duration.toFixed(1)}s clip`
        : 'No speech heard in this clip. Paste lyrics/script and hit Apply to captions.',
      tookSeconds: Number(seconds)
    });
  } catch (err) {
    console.error('[transcribe]', err.message);
    res.status(502).json({ error: err.message });
  } finally {
    /* The clip is only needed for transcription; rendering re-uploads it. */
    await fs.unlink(req.file.path).catch(() => {});
  }
});
