/* ============================================================
   config.js — every knob the server reads, in one place.
   Values come from the environment; see .env.example.
   ============================================================ */

import 'dotenv/config';
import path from 'node:path';
import fs from 'node:fs';

const root = path.resolve(import.meta.dirname, '..');

const num = (v, fallback) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const config = {
  port: num(process.env.PORT, 8080),

  /* Comma-separated list, or "*" while developing. The studio is a static
     site on another origin, so it always needs CORS. */
  allowedOrigins: (process.env.ALLOWED_ORIGINS || '*')
    .split(',').map(s => s.trim()).filter(Boolean),

  /* Where uploads, extracted audio and finished renders live. */
  workDir: process.env.WORK_DIR || path.join(root, 'work'),

  /* Largest clip we accept, in MB. */
  maxUploadMb: num(process.env.MAX_UPLOAD_MB, 500),

  /* Finished files are deleted after this many minutes. */
  retentionMinutes: num(process.env.RETENTION_MINUTES, 60),

  ffmpeg: {
    /* Leave unset to use whatever is on PATH. */
    bin: process.env.FFMPEG_PATH || 'ffmpeg',
    probeBin: process.env.FFPROBE_PATH || 'ffprobe',
    /* x264 speed/size trade-off for the burn-in. */
    preset: process.env.FFMPEG_PRESET || 'veryfast',
    crf: num(process.env.FFMPEG_CRF, 20)
  },

  stt: {
    provider: process.env.STT_PROVIDER || 'openai',
    apiKey: process.env.OPENAI_API_KEY || '',
    model: process.env.STT_MODEL || 'whisper-1',
    baseUrl: process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1',
    /* OpenAI rejects audio over 25MB, so long clips are split. Stay under it. */
    maxAudioMb: num(process.env.STT_MAX_AUDIO_MB, 20),
    chunkSeconds: num(process.env.STT_CHUNK_SECONDS, 600)
  }
};

export const dirs = {
  uploads: path.join(config.workDir, 'uploads'),
  audio: path.join(config.workDir, 'audio'),
  output: path.join(config.workDir, 'output')
};

export function ensureDirs() {
  for (const dir of Object.values(dirs)) fs.mkdirSync(dir, { recursive: true });
}

export function sttConfigured() {
  return config.stt.provider === 'openai' && !!config.stt.apiKey;
}
