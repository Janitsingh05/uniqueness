/* ============================================================
   stt.js — speech-to-text with word-level timestamps.

   Two providers, same shape: OpenAI's whisper-1 (paid, ~$0.006/min)
   and Groq's whisper-large-v3 (free tier, no card). Groq's API is
   OpenAI-compatible for /audio/transcriptions — same multipart
   fields, same verbose_json + word timestamps — so one function
   serves both; only the base URL, key and model differ.

   config.stt.provider picks which one server/.env's key is for.
   Everything past transcribe() talks to one shape and does not care.
   ============================================================ */

import fs from 'node:fs/promises';
import path from 'node:path';
import { config } from '../config.js';
import { extractAudio, splitAudio, probe } from './ffmpeg.js';

/* Whisper takes a plain language name or ISO-639-1 code; the studio's
   picker uses friendly labels (js/config.js's speechLangs — keep both
   lists in sync). Whisper-large-v3 auto-detects among ~99 languages on
   its own, so Auto-detect already covers languages not listed here;
   an explicit code mainly helps short or accented clips. */
const LANGS = {
  'Auto-detect': undefined,
  English: 'en',
  Hindi: 'hi',
  Hinglish: 'hi',
  Marathi: 'mr',
  Punjabi: 'pa',
  Bengali: 'bn',
  Tamil: 'ta',
  Telugu: 'te',
  Gujarati: 'gu',
  Kannada: 'kn',
  Malayalam: 'ml',
  Urdu: 'ur',
  Odia: 'or',
  Nepali: 'ne',
  Spanish: 'es',
  French: 'fr',
  German: 'de',
  Portuguese: 'pt',
  Arabic: 'ar',
  Chinese: 'zh',
  Japanese: 'ja',
  Korean: 'ko',
  Russian: 'ru',
  Indonesian: 'id',
  Turkish: 'tr',
  Italian: 'it',
  Vietnamese: 'vi'
};

/* Whisper's verbose_json reports the language it heard as a full English
   name ("Hindi"), while this module's contract promises ISO-639-1 ('hi').
   LANGS above is already that mapping, just keyed the other way round. */
const CODE_BY_NAME = Object.fromEntries(
  Object.entries(LANGS)
    .filter(([name, code]) => code && name !== 'Hinglish')
    .map(([name, code]) => [name.toLowerCase(), code])
);

function toIsoCode(reported) {
  const raw = String(reported || '').trim();
  if (!raw) return '';
  /* Already a code (some providers return one) — pass it through. */
  if (/^[a-z]{2}$/i.test(raw)) return raw.toLowerCase();
  return CODE_BY_NAME[raw.toLowerCase()] || raw.toLowerCase();
}

async function callProvider(filePath, { language, prompt } = {}) {
  const bytes = await fs.readFile(filePath);
  const form = new FormData();
  form.append('file', new Blob([bytes], { type: 'audio/mpeg' }), path.basename(filePath));
  form.append('model', config.stt.model);
  form.append('response_format', 'verbose_json');
  /* Repeated field — this is what unlocks per-word start/end times.
     Both OpenAI and Groq support this the same way. */
  form.append('timestamp_granularities[]', 'word');
  if (language) form.append('language', language);
  if (prompt) form.append('prompt', prompt);

  const providerName = config.stt.provider === 'groq' ? 'Groq' : 'OpenAI';
  const keyEnvVar = config.stt.provider === 'groq' ? 'GROQ_API_KEY' : 'OPENAI_API_KEY';

  const res = await fetch(`${config.stt.baseUrl}/audio/transcriptions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${config.stt.apiKey}` },
    body: form
  });

  if (!res.ok) {
    const body = await res.text().catch(() => '');
    let detail = body.slice(0, 300);
    let code = '';
    try {
      const parsed = JSON.parse(body).error || {};
      detail = parsed.message || detail;
      code = parsed.code || parsed.type || '';
    } catch (e) {}

    if (res.status === 401) throw new Error(`Speech-to-text rejected the API key. Check ${keyEnvVar} in server/.env.`);

    /* 429 covers two very different problems. Out of credit/quota is a
       billing fix and will not pass on retry; a true rate limit will.
       The provider's own message names the exact page to visit, so pass
       it through rather than replacing it with something vaguer. */
    if (res.status === 429) {
      const noCredit = /insufficient_quota|credit_balance_exhausted/i.test(code) || /no credits|billing/i.test(detail);
      throw new Error(noCredit
        ? `No ${providerName} credit: ${detail}`
        : `Speech-to-text is rate limited, try again shortly: ${detail}`);
    }
    throw new Error(`Speech-to-text failed (${res.status}): ${detail}`);
  }
  return res.json();
}

/* Whisper returns { word, start, end }; the studio's engine wants
   { text, start, end } and absolute times across chunk boundaries. */
function normaliseWords(result, offset) {
  const words = Array.isArray(result.words) ? result.words : [];
  return words
    .map(w => ({
      text: String(w.word ?? w.text ?? '').trim(),
      start: Number(w.start) + offset,
      end: Number(w.end) + offset
    }))
    .filter(w => w.text && Number.isFinite(w.start) && Number.isFinite(w.end));
}

/* transcribe(videoPath, { language, onProgress })
   -> { text, words: [{text,start,end}], duration, chunks } */
export async function transcribe(videoPath, opts = {}) {
  const { onProgress = () => {}, language } = opts;
  const id = opts.id || path.parse(videoPath).name;
  const audioDir = opts.audioDir;

  onProgress(5, 'Reading the clip');
  const media = await probe(videoPath);
  if (!media.hasAudio) {
    throw new Error('This clip has no audio track, so there is nothing to transcribe.');
  }

  onProgress(15, 'Extracting the audio track');
  const audio = await extractAudio(videoPath, audioDir, id);

  /* One request unless the audio is too big for the API's limit. */
  const limit = config.stt.maxAudioMb * 1024 * 1024;
  const pieces = audio.size <= limit
    ? [{ path: audio.path, offset: 0 }]
    : await splitAudio(audio.path, audioDir, id, config.stt.chunkSeconds);

  const lang = LANGS[language] ?? (language || undefined);
  const words = [];
  const texts = [];
  let detectedLang = '';

  for (let i = 0; i < pieces.length; i++) {
    const pct = 25 + Math.round((i / pieces.length) * 65);
    onProgress(pct, pieces.length > 1
      ? `Transcribing part ${i + 1} of ${pieces.length}`
      : 'Listening to every word');

    const result = await callProvider(pieces[i].path, {
      language: lang,
      /* Feeding the tail of the previous chunk back in keeps names and
         spelling consistent across a split. */
      prompt: texts.length ? texts[texts.length - 1].slice(-220) : undefined
    });

    if (result.text) texts.push(String(result.text).trim());
    if (!detectedLang && result.language) detectedLang = result.language;
    words.push(...normaliseWords(result, pieces[i].offset));
  }

  onProgress(95, 'Locking captions to the voice');

  /* Clean up the audio we made; the caller still owns the video. */
  await Promise.allSettled([
    fs.unlink(audio.path),
    ...pieces.filter(p => p.path !== audio.path).map(p => fs.unlink(p.path))
  ]);

  const text = texts.join(' ').replace(/\s+/g, ' ').trim();
  return {
    text: text || words.map(w => w.text).join(' '),
    words,
    duration: media.duration,
    chunks: pieces.length,
    /* Whisper's own detected language (ISO-639-1, e.g. 'hi'), whether or
       not one was requested — lets the client romanize Hindi specifically
       without also catching Marathi/Nepali/Sanskrit, which share the same
       Devanagari script but shouldn't be forced into Hinglish spelling. */
    language: toIsoCode(detectedLang)
  };
}
