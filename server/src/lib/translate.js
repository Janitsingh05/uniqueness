/* ============================================================
   translate.js — turns the studio's caption lines into another
   language via MyMemory (free, no API key, ~5000 words/day).

   One request per line rather than one big batch: line-by-line
   keeps translation quality high (context isn't lost splitting a
   giant blob back apart) and means a bad line fails on its own
   instead of corrupting the whole clip.
   ============================================================ */

const ENDPOINT = 'https://api.mymemory.translated.net/get';

async function translateText(text, source, target) {
  const url = `${ENDPOINT}?q=${encodeURIComponent(text)}&langpair=${encodeURIComponent(source)}|${encodeURIComponent(target)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Translation service returned ${res.status}`);
  const data = await res.json();
  if (data.responseStatus && Number(data.responseStatus) !== 200) {
    throw new Error(data.responseDetails || 'Translation failed for this line.');
  }
  const out = data.responseData && data.responseData.translatedText;
  if (!out) throw new Error('Translation service returned nothing for this line.');
  return out;
}

/* Word count changes across languages, so word-level timing cannot carry
   over — spread the translated words evenly across the original span,
   the same fallback the ASS writer uses for hand-typed lines. */
function respace(words, start, end) {
  const span = Math.max(0.2, (Number(end) || 0) - (Number(start) || 0));
  const per = span / Math.max(1, words.length);
  return words.map((_, i) => ({ start: start + i * per, end: start + (i + 1) * per }));
}

/* translateLines(lines, { source, target, concurrency })
   -> { lines: [...same shape, translated...], failures } */
export async function translateLines(lines, opts = {}) {
  const source = opts.source || 'en';
  const target = opts.target;
  if (!target) throw new Error('target language is required.');

  const out = new Array(lines.length);
  let cursor = 0;
  let failures = 0;

  async function worker() {
    for (;;) {
      const i = cursor++;
      if (i >= lines.length) return;
      const line = lines[i];
      const text = Array.isArray(line.words) ? line.words.join(' ') : '';
      if (!text) { out[i] = line; continue; }
      try {
        const translated = await translateText(text, source, target);
        const words = translated.split(/\s+/).filter(Boolean);
        out[i] = words.length
          ? { ...line, words, wordTimes: respace(words, line.start, line.end) }
          : line;
      } catch (e) {
        failures++;
        out[i] = line; // leave the original line rather than dropping it
      }
    }
  }

  const workers = Math.max(1, Math.min(opts.concurrency || 4, lines.length));
  await Promise.all(Array.from({ length: workers }, worker));
  return { lines: out, failures };
}
