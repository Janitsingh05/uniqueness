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
    /* x264 speed/size trade-off for the burn-in. ultrafast over veryfast —
       the free Render tier's CPU is the bottleneck, not file size, and for
       short social clips the size difference is a few hundred KB. */
    preset: process.env.FFMPEG_PRESET || 'ultrafast',
    crf: num(process.env.FFMPEG_CRF, 20)
  },

  /* STT_PROVIDER=openai (default, paid, ~$0.006/min) or =groq (free tier,
     no card — get a key at console.groq.com/keys). Groq's API is
     OpenAI-compatible for /audio/transcriptions, so provider only changes
     which key/URL/default model get used — see lib/stt.js. */
  stt: (() => {
    const provider = process.env.STT_PROVIDER || 'openai';
    const isGroq = provider === 'groq';
    return {
      provider,
      apiKey: (isGroq ? process.env.GROQ_API_KEY : process.env.OPENAI_API_KEY) || '',
      model: process.env.STT_MODEL || (isGroq ? 'whisper-large-v3' : 'whisper-1'),
      baseUrl: process.env.STT_BASE_URL || (isGroq ? 'https://api.groq.com/openai/v1' : 'https://api.openai.com/v1'),
      /* OpenAI rejects audio over 25MB, so long clips are split. Groq's
         limit is higher on paid tiers but 20MB is a safe default either way. */
      maxAudioMb: num(process.env.STT_MAX_AUDIO_MB, 20),
      chunkSeconds: num(process.env.STT_CHUNK_SECONDS, 600)
    };
  })(),

  /* Decoupled from stt.apiKey on purpose — that one only holds a Groq key
     when STT_PROVIDER=groq, but the spelling-polish pass (lib/spellcheck.js)
     wants Groq's chat models regardless of which provider transcription is
     using. Same free Groq key as STT; get one at console.groq.com/keys. */
  groq: {
    apiKey: process.env.GROQ_API_KEY || '',
    chatModel: process.env.GROQ_CHAT_MODEL || 'openai/gpt-oss-120b',
    baseUrl: 'https://api.groq.com/openai/v1'
  },

  /* keyId is public (the client needs it to open Checkout); keySecret must
     never leave this server — it signs orders and verifies payments.
     webhookSecret is a separate value Razorpay gives you when you add
     the webhook URL in the dashboard — not the same as keySecret. */
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID || '',
    keySecret: process.env.RAZORPAY_KEY_SECRET || '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || ''
  },

  /* Mirrors js/config.js's referral.sharePercent — this copy is the one
     that actually pays it out (lib/credits.js creditReferral), the
     client's is only for its own display math. Keep them equal by hand. */
  referral: { sharePercent: num(process.env.REFERRAL_SHARE_PERCENT, 20) }
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
  return !!config.stt.apiKey;
}

export function paymentsConfigured() {
  return !!(config.razorpay.keyId && config.razorpay.keySecret);
}
