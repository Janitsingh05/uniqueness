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
  /* Whole-word spellings for cases where letter-by-letter rules read
     oddly, or where real Hinglish drops a vowel the strict phonetic
     rules would keep (होना -> "hona", not "honaa"; निकालते -> "nikalte",
     not the "nikaalate" plain consonant-by-consonant rules would give).
     Kept to the words common enough that a shared spelling actually
     matters — this is not an attempt at full schwa-deletion. */
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
    'रहे': 'rahe', 'रहा': 'raha', 'रही': 'rahi',

    'इसे': 'ise', 'इसको': 'isko', 'इसकी': 'iski', 'इसका': 'iska', 'इसके': 'iske',
    'उसे': 'use', 'उसको': 'usko', 'उसकी': 'uski', 'उसका': 'uska', 'उसके': 'uske',
    'उनके': 'unke', 'उनकी': 'unki', 'उनका': 'unka', 'उन्हें': 'unhe',
    'अपने': 'apne', 'अपना': 'apna', 'अपनी': 'apni',
    'मुझे': 'mujhe', 'मेरा': 'mera', 'मेरी': 'meri', 'मेरे': 'mere',
    'तुम्हें': 'tumhe', 'तुम्हारा': 'tumhara', 'तुम्हारी': 'tumhari', 'तुम्हारे': 'tumhare',
    'हमें': 'hamein', 'हमारा': 'hamara', 'हमारी': 'hamari', 'हमारे': 'hamare',
    'आपका': 'aapka', 'आपकी': 'aapki', 'आपके': 'aapke', 'आपको': 'aapko',
    'वाला': 'wala', 'वाले': 'wale', 'वाली': 'wali', 'वालों': 'walon',
    'सबसे': 'sabse', 'सभी': 'sabhi', 'बहुत': 'bahut', 'ज्यादा': 'zyada',
    'थोड़ा': 'thoda', 'थोड़ी': 'thodi', 'अभी': 'abhi', 'कभी': 'kabhi',
    'यहाँ': 'yahan', 'यहां': 'yahan', 'वहाँ': 'wahan', 'वहां': 'wahan',
    'लेकिन': 'lekin', 'मगर': 'magar', 'क्योंकि': 'kyunki', 'शायद': 'shayad',
    'जरूर': 'zaroor', 'ज़रूर': 'zaroor', 'बिना': 'bina', 'फिर': 'phir',
    'ऊपर': 'upar', 'नीचे': 'neeche', 'अंदर': 'andar', 'बाहर': 'bahar',
    'सामने': 'saamne', 'पीछे': 'peeche', 'लोग': 'log', 'लोगों': 'logon',
    'बात': 'baat', 'साथ': 'saath', 'पास': 'paas', 'चीज़': 'cheez', 'चीज': 'cheez',
    'काम': 'kaam', 'समय': 'samay', 'अलावा': 'alawa', 'शुरू': 'shuru',
    'ज़रूरी': 'zaroori', 'जरूरी': 'zaroori', 'ज़बरदस्ती': 'zabardasti', 'जबरदस्ती': 'zabardasti',
    'वही': 'wahi', 'यही': 'yahi',

    /* English loanwords Whisper transcribes phonetically when it hears
       them inside Hindi speech — spelled back out as the real English
       word instead of a literal (and odd-looking) phonetic reading. */
    'शोल्डर': 'shoulder', 'स्टार': 'star',

    'करना': 'karna', 'होना': 'hona', 'जाना': 'jaana', 'देना': 'dena', 'लेना': 'lena',
    'रखना': 'rakhna', 'देखना': 'dekhna', 'सुनना': 'sunna', 'कहना': 'kehna',
    'पढ़ना': 'padhna', 'लिखना': 'likhna', 'समझना': 'samajhna', 'बताना': 'batana',
    'मिलना': 'milna', 'खेलना': 'khelna', 'चलना': 'chalna', 'बनाना': 'banana',
    'निकालना': 'nikalna', 'रोकना': 'rokna', 'डालना': 'daalna', 'बोलना': 'bolna', 'सोचना': 'sochna',
    'करते': 'karte', 'करता': 'karta', 'करती': 'karti',
    'जाते': 'jaate', 'जाता': 'jaata', 'जाती': 'jaati',
    'देखते': 'dekhte', 'देखता': 'dekhta', 'देखती': 'dekhti',
    'निकालते': 'nikalte', 'निकालता': 'nikalta', 'निकालती': 'nikalti',
    'समझते': 'samajhte', 'समझता': 'samajhta', 'समझती': 'samajhti',
    'बनाते': 'banate', 'बनाता': 'banata', 'बनाती': 'banati',
    'बताते': 'batate', 'बताता': 'batata', 'बताती': 'batati',
    'दिखाते': 'dikhate', 'दिखाता': 'dikhata', 'दिखाती': 'dikhati',
    'होता': 'hota', 'होती': 'hoti', 'होते': 'hote',
    'काटने': 'katne', 'काटना': 'katna', 'काटता': 'katta', 'काटती': 'katti', 'काटते': 'katte',
    'जिसके': 'jiske', 'जिसका': 'jiska', 'जिसकी': 'jiski', 'जिसे': 'jise',
    'देखकर': 'dekhkar', 'सुनकर': 'sunkar', 'करके': 'karke', 'जाकर': 'jaakar',

    /* English loanword, common misreading otherwise: "minimam"/"raink". */
    'मिनिमम': 'minimum', 'रैंक': 'rank', 'रूल': 'rule',

    'का': 'ka', 'मतलब': 'matlab'
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
        if (this.MATRAS[next]) {
          /* Word-final ी reads as real Hinglish types it — "zaroori",
             "koi bhi", "chaabi" — not the "ee" the letter-for-letter
             rule gives everywhere else ("deep" mid-word, say). */
          const wordFinal = i + consumed + 1 >= s.length;
          out += (next === 'ी' && wordFinal) ? 'i' : this.MATRAS[next];
          i += consumed + 1; continue;
        }
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
    /* Callers join the result straight into caption text, so this always
       hands back a string — it used to return null unchanged. */
    if (text == null) return '';
    if (!text) return text;
    return text.split(/(\s+)/).map(tok =>
      /[ऀ-ॿ]/.test(tok) ? this.wordToRoman(tok) : tok
    ).join('');
  }
};
