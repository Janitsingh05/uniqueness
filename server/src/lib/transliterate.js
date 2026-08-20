/* ============================================================
   transliterate.js — Devanagari script -> Roman ("Hinglish") text.

   Server-side port of js/transliterate.js (same rules, same tests) —
   see that file for the full explanation of the algorithm. This copy
   exists as a render-time safety net: burned-in captions go through
   libass on the render machine, which has no Devanagari glyphs, so any
   Devanagari that reaches ass.js renders as empty boxes in the final
   MP4. The client already converts Hindi to Hinglish as soon as a
   transcript comes in, but a project saved before that existed (or any
   other path that lands Devanagari text here) would otherwise still
   burn in as tofu. Running the same conversion again here is a no-op
   for text that is already Hinglish, so it is safe to always apply.
   ============================================================ */

const NUKTA_MARK = '़';

const OVERRIDES = {
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
  'मिनिमम': 'minimum', 'रैंक': 'rank', 'रूल': 'rule',
  'का': 'ka', 'मतलब': 'matlab'
};

const CONJUNCTS = { 'क्ष': 'ksh', 'ज्ञ': 'gy', 'श्र': 'shr', 'त्र': 'tr' };
const VOWELS = { 'अ': 'a', 'आ': 'aa', 'इ': 'i', 'ई': 'ee', 'उ': 'u', 'ऊ': 'oo', 'ऋ': 'ri', 'ए': 'e', 'ऐ': 'ai', 'ओ': 'o', 'औ': 'au' };
const MATRAS = { 'ा': 'aa', 'ि': 'i', 'ी': 'ee', 'ु': 'u', 'ू': 'oo', 'ृ': 'ri', 'े': 'e', 'ै': 'ai', 'ो': 'o', 'ौ': 'au' };
const CONSONANTS = {
  'क': 'k', 'ख': 'kh', 'ग': 'g', 'घ': 'gh', 'ङ': 'n',
  'च': 'ch', 'छ': 'chh', 'ज': 'j', 'झ': 'jh', 'ञ': 'n',
  'ट': 't', 'ठ': 'th', 'ड': 'd', 'ढ': 'dh', 'ण': 'n',
  'त': 't', 'थ': 'th', 'द': 'd', 'ध': 'dh', 'न': 'n',
  'प': 'p', 'फ': 'ph', 'ब': 'b', 'भ': 'bh', 'म': 'm',
  'य': 'y', 'र': 'r', 'ल': 'l', 'व': 'v',
  'श': 'sh', 'ष': 'sh', 'स': 's', 'ह': 'h', 'ळ': 'l'
};
const NUKTA = { 'क': 'q', 'ख': 'kh', 'ग': 'g', 'ज': 'z', 'ड': 'r', 'ढ': 'rh', 'फ': 'f' };
const DIGITS = { '०': '0', '१': '1', '२': '2', '३': '3', '४': '4', '५': '5', '६': '6', '७': '7', '८': '8', '९': '9' };

function wordToRoman(word) {
  const clean = word.replace(/[।॥,.!?:;]+$/, '');
  const trail = word.slice(clean.length).replace(/।+|॥+/g, '.');
  if (OVERRIDES[clean]) return OVERRIDES[clean] + trail;

  const s = clean.normalize('NFC');
  let out = '';
  let i = 0;

  while (i < s.length) {
    const three = s.slice(i, i + 3);
    const isConjunct = Object.prototype.hasOwnProperty.call(CONJUNCTS, three);
    const isNukta = !isConjunct && CONSONANTS[s[i]] !== undefined && s[i + 1] === NUKTA_MARK;
    const isPlain = !isConjunct && !isNukta && CONSONANTS[s[i]] !== undefined;

    if (isConjunct || isNukta || isPlain) {
      const consumed = isConjunct ? 3 : isNukta ? 2 : 1;
      out += isConjunct ? CONJUNCTS[three] : isNukta ? NUKTA[s[i]] : CONSONANTS[s[i]];
      const next = s[i + consumed];
      if (next === '्') { i += consumed + 1; continue; }
      if (MATRAS[next]) {
        const wordFinal = i + consumed + 1 >= s.length;
        out += (next === 'ी' && wordFinal) ? 'i' : MATRAS[next];
        i += consumed + 1; continue;
      }
      if (i + consumed >= s.length) { i += consumed; continue; }
      out += 'a'; i += consumed; continue;
    }

    const c = s[i];
    if (VOWELS[c]) { out += VOWELS[c]; i += 1; continue; }
    if (DIGITS[c]) { out += DIGITS[c]; i += 1; continue; }
    if (c === 'ं' || c === 'ँ') { out += 'n'; i += 1; continue; }
    if (c === 'ः') { out += 'h'; i += 1; continue; }
    if (c === '्' || c === NUKTA_MARK) { i += 1; continue; }
    out += c; i += 1;
  }
  return out + trail;
}

const HAS_DEVANAGARI = /[ऀ-ॿ]/;

export function toHinglish(text) {
  if (!text || !HAS_DEVANAGARI.test(text)) return text;
  return text.split(/(\s+)/).map(tok => (HAS_DEVANAGARI.test(tok) ? wordToRoman(tok) : tok)).join('');
}
