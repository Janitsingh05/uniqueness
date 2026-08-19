/* ============================================================
   transliterate.js — Devanagari script -> Roman ("Hinglish") text.

   This is script conversion, not translation: "पुलिस ने खुद" becomes
   "pulis ne khud", same words, same meaning, just typed the way most
   people actually text Hindi. Runs entirely client-side, no API, no
   network — it's a rule-based mapping over Unicode Devanagari
   (U+0900–U+097F), plus a short list of very common words where
   letter-by-letter rules read oddly ("men" for में instead of the
   expected "mein"). English words already in the script (as in real
   Hinglish sentences) pass through untouched.

   Nukta consonants (क़ ख़ ग़ ज़ ड़ ढ़ फ़) and conjuncts (क्ष ज्ञ श्र त्र)
   are resolved to a single "consonant unit" before the vowel-matra
   lookahead runs, and the nukta mark (U+093C) is matched explicitly
   by codepoint rather than by typing the combined glyph in this file
   — a source file can silently save "ड़" as the decomposed pair
   (ड + nukta mark) instead of the one precomposed codepoint, which
   would make a plain string-key lookup miss it. Getting that lookahead
   right is what lets a vowel sign correctly attach to these units
   (गाड़ी -> "gaari", not a half-converted "gaada़ी" with stray
   Devanagari left in the output).

   Not a full linguistic transliterator — schwa deletion and
   nasalization are handled for the common cases, not exhaustively.
   Good enough for captions; don't expect it to match everyone's
   personal spelling habit for every word.
   ============================================================ */

window.UQ = window.UQ || {};

const NUKTA_MARK = '़';

UQ.transliterate = {
  OVERRIDES: {
    'में': 'mein', 'मैं': 'main', 'क्या': 'kya', 'नहीं': 'nahi',
    'कुछ': 'kuch', 'हुआ': 'hua', 'हुई': 'hui', 'हुए': 'hue',
    'कहा': 'kaha', 'लिए': 'liye', 'किए': 'kiye', 'किये': 'kiye',
    'गए': 'gaye', 'गई': 'gayi', 'गयी': 'gayi',
    'और': 'aur', 'है': 'hai', 'हैं': 'hain',
    'था': 'tha', 'थी': 'thi', 'थे': 'the',
    'हो': 'ho', 'यह': 'yeh', 'वह': 'woh',
    'क्यों': 'kyun', 'कैसे': 'kaise', 'कोई': 'koi',
    'सकते': 'sakte', 'सकता': 'sakta', 'सकती': 'sakti',
    'रहे': 'rahe', 'रहा': 'raha', 'रही': 'rahi'
  },

  /* Two- and three-consonant conjuncts that read better as one memorized
     unit than as their pieces run through the general rules. */
  CONJUNCTS: { 'क्ष': 'ksh', 'ज्ञ': 'gy', 'श्र': 'shr', 'त्र': 'tr' },

  VOWELS: { 'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo', 'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au' },
  MATRAS: { 'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au' },
  CONSONANTS: {
    'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n',
    'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'n',
    'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
    'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
    'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
    'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v',
    'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h', 'ळ': 'l'
  },
  /* Base consonant + nukta mark -> the borrowed/retroflex sound it
     actually represents. Keyed by the plain base letter; the mark
     itself is matched separately (see wordToRoman) rather than by
     trying to match a combined glyph as one string key. */
  NUKTA: { 'क': 'q', 'ख': 'kh', 'ग': 'g', 'ज': 'z', 'ड': 'r', 'ढ': 'rh', 'फ': 'f' },
  DIGITS: { '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9' },

  wordToRoman(word) {
    const clean = word.replace(/[।॥,.!?:;]+$/, '');
    // Danda/double-danda are Devanagari punctuation (U+0964/U+0965) — roman-ize
    // them too, else a stray Devanagari mark survives an otherwise Roman line.
    const trail = word.slice(clean.length).replace(/।+|॥+/g, '.');
    if (this.OVERRIDES[clean]) return this.OVERRIDES[clean] + trail;

    const s = clean.normalize('NFC');
    let out = '';
    let i = 0;

    while (i < s.length) {
      const three = s.slice(i, i + 3);
      const isConjunct = Object.prototype.hasOwnProperty.call(this.CONJUNCTS, three);
      const isNukta = !isConjunct && this.CONSONANTS[s[i]] !== undefined && s[i + 1] === NUKTA_MARK;
      const isPlain = !isConjunct && !isNukta && this.CONSONANTS[s[i]] !== undefined;

      if (isConjunct || isNukta || isPlain) {
        const consumed = isConjunct ? 3 : isNukta ? 2 : 1;
        out += isConjunct ? this.CONJUNCTS[three] : isNukta ? this.NUKTA[s[i]] : this.CONSONANTS[s[i]];
        const next = s[i + consumed];
        /* Whatever follows this consonant unit — virama, a vowel matra,
           or nothing (word end) — decides what happens to its inherent
           'a'. Runs the same way regardless of which of the three cases
           above produced the unit. */
        if (next === '्') { i += consumed + 1; continue; }
        if (this.MATRAS[next]) { out += this.MATRAS[next]; i += consumed + 1; continue; }
        if (i + consumed >= s.length) { i += consumed; continue; } // word-final: drop inherent 'a'
        out += 'a'; i += consumed; continue;                        // mid-word: keep inherent 'a'
      }

      const c = s[i];
      if (this.VOWELS[c]) { out += this.VOWELS[c]; i += 1; continue; }
      if (this.DIGITS[c]) { out += this.DIGITS[c]; i += 1; continue; }
      if (c === 'ं' || c === 'ँ') { out += 'n'; i += 1; continue; }
      if (c === 'ः') { out += 'h'; i += 1; continue; }
      if (c === '्' || c === NUKTA_MARK) { i += 1; continue; } // stray virama / orphan nukta mark
      out += c; i += 1;                                        // pass through
    }
    return out + trail;
  },

  /* toHinglish(text) — word by word, so English words already mixed
     into the sentence (real Hinglish) are left exactly as typed. */
  toHinglish(text) {
    if (!text) return text;
    return text.split(/(\s+)/).map(tok =>
      /[ऀ-ॿ]/.test(tok) ? this.wordToRoman(tok) : tok
    ).join('');
  }
};
