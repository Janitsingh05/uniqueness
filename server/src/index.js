/* ============================================================
   index.js — the caption backend.

     POST /api/transcribe        clip -> text + word timestamps
     POST /api/render            clip + lines + style -> burned-in MP4
     GET  /api/render/:id        progress
     GET  /api/render/:id/file   download
     POST /api/spend             deduct caption credit (signed-in)
     GET  /api/balance           credit balance (signed-in)
     GET  /api/health            what this server can actually do

   The studio works without any of this (Whisper runs in the browser).
   Point js/config.js -> api.baseUrl at this server to use it instead.
   ============================================================ */

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { config, ensureDirs, sttConfigured, paymentsConfigured } from './config.js';
import { ffmpegVersion } from './lib/ffmpeg.js';
import { startCleanup } from './lib/jobs.js';
import { transcribeRouter } from './routes/transcribe.js';
import { renderRouter } from './routes/render.js';
import { translateRouter } from './routes/translate.js';
import { paymentsRouter } from './routes/payments.js';
import { webhookRouter } from './routes/webhook.js';
import { spellcheckRouter } from './routes/spellcheck.js';
import { accountRouter } from './routes/account.js';
import { adminConfigured } from './lib/firebase-admin.js';

ensureDirs();

const app = express();
app.disable('x-powered-by');

app.use(cors({
  origin: config.allowedOrigins.includes('*') ? true : config.allowedOrigins,
  methods: ['GET', 'POST', 'OPTIONS']
}));

/* Razorpay signs the exact raw request bytes, so the webhook route needs
   express.raw() instead of the JSON parser below — and has to be wired
   up before that global parser touches the body. */
app.use('/api', webhookRouter);

app.use(express.json({ limit: '4mb' }));

app.get('/api/health', async (req, res) => {
  const ffmpeg = await ffmpegVersion();
  res.json({
    ok: true,
    /* The studio reads these to decide what to offer. */
    transcribe: sttConfigured(),
    render: !!ffmpeg,
    translate: true,           // MyMemory needs no key, so this is always on
    payments: paymentsConfigured(),
    accounts: adminConfigured(),   // server-side crediting (webhooks need this)
    ffmpeg: ffmpeg || null,
    sttProvider: sttConfigured() ? config.stt.provider : null,
    spellcheck: !!config.groq.apiKey,   // AI polish pass over Hinglish captions
    maxUploadMb: config.maxUploadMb
  });
});

app.use('/api', transcribeRouter);
app.use('/api', renderRouter);
app.use('/api', translateRouter);
app.use('/api', paymentsRouter);
app.use('/api', spellcheckRouter);
app.use('/api', accountRouter);

app.use((req, res) => res.status(404).json({ error: 'Not found: ' + req.method + ' ' + req.path }));

/* Multer's own errors are useful — surface them instead of a bare 500. */
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    const msg = err.code === 'LIMIT_FILE_SIZE'
      ? `That clip is over the ${config.maxUploadMb}MB limit.`
      : err.message;
    return res.status(413).json({ error: msg });
  }
  console.error('[server]', err);
  res.status(500).json({ error: err.message || 'Server error' });
});

const server = app.listen(config.port, () => {
  console.log(`uniqueness backend listening on http://localhost:${config.port}`);
  console.log(`  transcribe : ${sttConfigured() ? 'ready (' + config.stt.provider + ')' : 'OFF — set OPENAI_API_KEY'}`);
  ffmpegVersion().then(v => console.log(`  render     : ${v ? 'ready — ' + v.slice(0, 48) : 'OFF — FFmpeg not found on PATH'}`));
  console.log('  translate  : ready (MyMemory, no key needed)');
  console.log(`  payments   : ${paymentsConfigured() ? 'ready (razorpay)' : 'OFF — set RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET'}`);
  console.log(`  accounts   : ${adminConfigured() ? 'ready (firebase-admin)' : 'OFF — set FIREBASE_SERVICE_ACCOUNT (needed for webhook crediting)'}`);
  console.log(`  work dir   : ${config.workDir}`);
});

startCleanup();

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
