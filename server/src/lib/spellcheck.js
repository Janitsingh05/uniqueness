/* ============================================================
   spellcheck.js — AI polish pass over rule-based Hinglish output.

   js/transliterate.js (and its server-side twin, transliterate.js in
   this folder) convert Devanagari to Roman letter-by-letter — correct,
   but not always how people actually type Hinglish: "लड़की" comes out
   "laraki" (ड़ is genuinely closer to an R sound) where every real
   Hinglish typist writes "ladki". Rules can chase individual words like
   that forever; an LLM already knows the convention for the ones that
   still slip through.

   Deliberately dumb and safe: one call, word-count preserved, and any
   failure — no key, bad response, wrong length, network hiccup — just
   returns the input unchanged. This is a polish pass, never a
   dependency; auto-caption already works without it.
   ============================================================ */

import { config } from '../config.js';

const SYSTEM_PROMPT = `You correct Hinglish (Hindi typed in Roman/English letters) spelling to match how Hindi speakers actually type it casually — the way real Instagram/WhatsApp captions look, not a strict letter-by-letter transliteration.

Examples of the kind of fix to make:
"laraki" -> "ladki", "laraka" / "larka" -> "ladka", "honaa" -> "hona", "kartaa" -> "karta", "zarooree" -> "zaroori", "vaalaa" -> "wala", "sholdar" -> "shoulder" (an English word Whisper misheard phonetically).

Rules:
- You get a JSON object {"words": [...]}, a Hindi sentence already in Roman script, one array element per word (in order).
- Return a JSON object of the exact same shape {"words": [...]} with EXACTLY the same number of strings, in the same order — one corrected word per input word.
- Never merge, split, add, remove, translate, or reorder words.
- Words that are already correct English (mixed into the sentence, as real Hinglish does) must come back completely unchanged.
- If a word already looks like natural Hinglish, return it unchanged.
- Match each input word's capitalisation style (all-caps stays all-caps, etc).
- Output ONLY the JSON object — no explanation, no markdown fences, nothing else.`;

/* polishHinglishWords(words: string[]) -> { words: string[], changed: number } */
export async function polishHinglishWords(words) {
  if (!config.groq.apiKey || !Array.isArray(words) || !words.length) {
    return { words, changed: 0 };
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10000);

  try {
    const res = await fetch(`${config.groq.baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.groq.apiKey}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({
        model: config.groq.chatModel,
        temperature: 0,
        max_tokens: Math.max(300, words.join(' ').length * 3),
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: JSON.stringify({ words }) }
        ]
      })
    });
    if (!res.ok) return { words, changed: 0 };

    const data = await res.json();
    const raw = data?.choices?.[0]?.message?.content;
    if (!raw) return { words, changed: 0 };

    const parsed = JSON.parse(raw);
    const fixed = parsed?.words;
    if (!Array.isArray(fixed) || fixed.length !== words.length || !fixed.every(w => typeof w === 'string' && w.length)) {
      return { words, changed: 0 };
    }

    const changed = fixed.reduce((n, w, i) => n + (w !== words[i] ? 1 : 0), 0);
    return { words: fixed, changed };
  } catch (err) {
    return { words, changed: 0 };
  } finally {
    clearTimeout(timeout);
  }
}
