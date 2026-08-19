/* ============================================================
   index.js — the caption backend.

     POST /api/transcribe        clip -> text + word timestamps
     POST /api/render            clip + lines + style -> burned-in MP4
     GET  /api/render/:id        progress
     GET  /api/render/:id/file   download
     GET  /api/health            what this server can actually do

   The studio works without any of this (Whisper runs in the browser).
   Point js/config.js -> api.baseUrl at this server to use it instead.
   ============================================================ */

import express from 'express';
import cors from 'cors';
import multer from 'multer';
import { config, ensureDirs, sttConfigured } from './config.js';
import { ffmpegVersion } from './lib/ffmpeg.js';
import { startCleanup } from './lib/jobs.js';
import { transcribeRouter } from './routes/transcribe.js';
import { renderRouter } from './routes/render.js';
import { translateRouter } from './routes/translate.js';

ensureDirs();

const app = express();
app.disable('x-powered-by');

app.use(cors({
  origin: config.allowedOrigins.includes('*') ? true : config.allowedOrigins,
  methods: ['GET', 'POST', 'OPTIONS']
}));
app.use(express.json({ limit: '4mb' }));

app.get('/api/health', async (req, res) => {
  const ffmpeg = await ffmpegVersion();
  res.json({
    ok: true,
    /* The studio reads these to decide what to offer. */
    transcribe: sttConfigured(),
    render: !!ffmpeg,
    translate: true,           // MyMemory needs no key, so this is always on
    ffmpeg: ffmpeg || null,
    sttProvider: sttConfigured() ? config.stt.provider : null,
    maxUploadMb: config.maxUploadMb
  });
});

app.use('/api', transcribeRouter);
app.use('/api', renderRouter);
app.use('/api', translateRouter);

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
  console.log(`  work dir   : ${config.workDir}`);
});

startCleanup();

for (const sig of ['SIGINT', 'SIGTERM']) {
  process.on(sig, () => server.close(() => process.exit(0)));
}
