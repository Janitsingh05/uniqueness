/* ============================================================
   ass.js — turn the studio's caption lines into an .ass subtitle.

   The browser already owns the timing engine (js/captions.js) and the
   style controls, so it sends the finished lines and the style here.
   This file only draws them, which is what keeps the burned-in MP4
   matching the preview instead of drifting from it.

   One Dialogue event is emitted per active word, mirroring
   UQ.captions.activeAt(): 'word' templates show that word alone,
   'line' templates show the whole line with the spoken word tinted,
   and 'type' reveals the line as it is spoken.
   ============================================================ */

import { toHinglish } from './transliterate.js';

/* ASS wants &HAABBGGRR — alpha first, then blue/green/red. */
function assColor(hex, alpha = '00') {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex || '').trim());
  const rgb = m ? m[1] : 'FFFFFF';
  const r = rgb.slice(0, 2), g = rgb.slice(2, 4), b = rgb.slice(4, 6);
  return `&H${alpha}${b}${g}${r}`.toUpperCase();
}

function assTime(t) {
  const s = Math.max(0, t || 0);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${h}:${String(m).padStart(2, '0')}:${sec.toFixed(2).padStart(5, '0')}`;
}

/* Braces open override blocks in ASS, so they can never reach the text. */
function assText(s) {
  return String(s == null ? '' : s)
    .replace(/\\/g, '∖')
    .replace(/[{}]/g, c => (c === '{' ? '(' : ')'))
    .replace(/\r?\n/g, '\\N');
}

/* The studio's font ids map to real family names. libass substitutes
   anything the render machine does not have, so ship the fonts (or set
   FONTS_DIR) if you want an exact match. */
const FONTS = {
  jakarta: 'Plus Jakarta Sans', outfit: 'Outfit', montserrat: 'Montserrat',
  poppins: 'Poppins', dm: 'DM Sans', space: 'Space Grotesk', oswald: 'Oswald',
  barlow: 'Barlow Condensed', bebas: 'Bebas Neue', anton: 'Anton',
  archivo: 'Archivo Black', bangers: 'Bangers', playfair: 'Playfair Display',
  serif: 'Georgia', mono: 'Consolas'
};

/* Mirrors the sizeScale in UQ.captions.applyStyle so burned captions come
   out the same size as the preview. */
const SIZE_SCALE = { punch: 1.7, editorial: 0.95, bar: 0.7 };

/* Rough advance width per character, as a fraction of the font size, for
   the bold sans the studio ships. Both renderers break between words and
   neither breaks inside one, so a single word wider than the frame gets
   drawn straight off both edges — "TRANSFORMATION" burning in as
   "ANSFORMATIO". fitFontSize below shrinks the offending line just enough
   to fit. Kept deliberately generous: slightly small text reads fine,
   clipped text does not. UQ.captions._textEm is the same table — change
   both together or the preview and the export drift apart. */
const NARROW = 'IJfijlt.,:;!\'"`()[]{}|-';
const WIDE = 'MW@%';

function charEm(ch) {
  if (ch === ' ') return 0.28;
  if (NARROW.includes(ch)) return 0.34;
  if (WIDE.includes(ch)) return 0.95;
  if (ch >= 'a' && ch <= 'z') return 0.58;
  return 0.66;
}

function textEm(s) {
  let n = 0;
  for (const ch of String(s == null ? '' : s)) n += charEm(ch);
  return n;
}

/* The widest single word decides the fit — everything shorter wraps. */
function fitFontSize(words, fontSize, available) {
  let widest = 0;
  for (const w of words) widest = Math.max(widest, textEm(w));
  const needed = widest * fontSize;
  if (!widest || needed <= available || available <= 0) return fontSize;
  return Math.max(8, Math.floor(fontSize * (available / needed)));
}

/* Per-word times, falling back to an even split when the engine could not
   produce them (no speech detected, hand-typed script). */
function wordTimes(line) {
  if (line.wordTimes && line.wordTimes.length === line.words.length) return line.wordTimes;
  const start = Number(line.start) || 0;
  const end = Math.max(start + 0.2, Number(line.end) || start + 0.4);
  const per = (end - start) / Math.max(1, line.words.length);
  return line.words.map((_, i) => ({ start: start + i * per, end: start + (i + 1) * per }));
}

export function buildAss({ lines, style, width, height, template, duration, watermark }) {
  /* Safety net: libass on the render machine has no Devanagari glyphs, so
     any Hindi that reaches here as Devanagari would burn in as empty boxes.
     The editor already converts fresh transcripts to Hinglish, but a
     project saved before that existed still has the old script — catch it
     here too. No-op for text that's already Hinglish. */
  lines = (lines || []).map(line => (line && Array.isArray(line.words))
    ? { ...line, words: line.words.map(w => toHinglish(w)) }
    : line);

  const mode = template?.mode || 'line';
  const tplId = template?.id || style.tpl;

  const scale = SIZE_SCALE[tplId] || 1;
  /* style.size is a % of frame height, matching --cap-size in cqh. */
  const fontSize = Math.max(8, Math.round((Number(style.size) || 8) * scale / 100 * height));
  const marginV = Math.max(0, Math.round((Number(style.pos) || 16) / 100 * height));
  const sideMargin = Math.round(width * 0.06);      // .cap sits at left/right: 6%
  const outline = Math.max(0, +((Number(style.stroke) || 0) * 0.012 * fontSize).toFixed(1));
  const shadow = style.shadow ? Math.max(1, Math.round(fontSize * 0.06)) : 0;

  const base = assColor(style.color || '#FFFFFF');
  const highlight = assColor(style.hl || '#A78BFA');
  const font = FONTS[style.font] || 'Arial';
  const cased = s => (style.upper ? String(s).toUpperCase() : String(s));
  const sticker = style.emoji ? ' ' + style.emoji : '';

  const header = [
    '[Script Info]',
    'ScriptType: v4.00+',
    'WrapStyle: 0',
    'ScaledBorderAndShadow: yes',
    `PlayResX: ${width}`,
    `PlayResY: ${height}`,
    '',
    '[V4+ Styles]',
    'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour,' +
      ' Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline,' +
      ' Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
    /* Alignment 2 = bottom-centre, measured up by MarginV. */
    `Style: Cap,${font},${fontSize},${base},${highlight},&H00000000,&H80000000,` +
      `-1,0,0,0,100,100,0,0,1,${outline},${shadow},2,${sideMargin},${sideMargin},${marginV},1`,
    /* Free-plan watermark. BorderStyle 3 gives an opaque box (OutlineColour
       is the box fill here, not an outline) behind small white text —
       matches the corner badge the editor preview already shows. Alignment
       9 = top-right. */
    `Style: Mark,Arial,${Math.max(14, Math.round(height * 0.016))},&H30FFFFFF,&H30FFFFFF,&HB0000000,&HB0000000,` +
      `-1,0,0,0,100,100,0,0,3,0,0,9,${Math.round(width * 0.02)},${Math.round(width * 0.02)},${Math.round(height * 0.02)},1`,
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
  ].join('\n');

  const events = [];
  const push = (start, end, text) => {
    if (!(end > start)) return;
    events.push(`Dialogue: 0,${assTime(start)},${assTime(end)},Cap,,0,0,0,,${text}`);
  };

  /* What a line actually has room for: the frame less both side margins,
     less the outline that is drawn outside the glyphs. */
  const available = Math.max(1, width - sideMargin * 2 - outline * 2);

  for (const line of lines || []) {
    if (!line || !Array.isArray(line.words) || !line.words.length) continue;
    const times = wordTimes(line);

    /* Line templates hold the whole line on screen while the highlight
       moves along it, so they take one size for the line — sizing per word
       there would make the line jump about. 'word' templates show each
       word alone, so each is free to take the largest size that fits. */
    const sizeFor = ws => {
      const fitted = fitFontSize(ws, fontSize, available);
      return fitted < fontSize ? `\\fs${fitted}` : '';
    };
    const fs = mode === 'word' ? '' : sizeFor(line.words.map(cased));

    for (let i = 0; i < line.words.length; i++) {
      const t = times[i];
      if (!t) continue;

      if (mode === 'word') {
        /* Punch / Neon / Bounce: one word owns the frame. */
        const word = cased(line.words[i]);
        push(t.start, t.end, `{${sizeFor([word])}\\c${highlight}}` + assText(word) + assText(sticker));
        continue;
      }

      if (mode === 'type') {
        /* Typewriter: the line grows one word at a time. */
        const shown = line.words.slice(0, i + 1).join(' ');
        push(t.start, t.end, `{${fs}\\c${base}}` + assText(cased(shown)) + assText(sticker));
        continue;
      }

      /* Line templates: hold the line, tint the word being spoken. */
      const parts = line.words.map((w, j) =>
        `{${fs}` + (j === i ? `\\c${highlight}` : `\\c${base}`) + '}' + assText(cased(w))
      );
      push(t.start, t.end, parts.join(' ') + assText(sticker));
    }
  }

  /* Free-plan watermark, decided server-side by routes/render.js (looks up
     the account's real plan via Firebase Admin — never trust a client-sent
     flag for this, or removing it would be one devtools edit away). Spans
     the whole clip; layer 1 keeps it above captions if they ever overlap. */
  if (watermark) {
    const end = Number(duration) > 0 ? duration : (events.length ? Math.max(...lines.flatMap(l => wordTimes(l).map(t => t.end))) : 1);
    /* Lowercase, matching the editor's own corner mark and the brand. */
    events.push(`Dialogue: 1,${assTime(0)},${assTime(end)},Mark,,0,0,0,,uniqueness.online`);
  }

  return { content: header + '\n' + events.join('\n') + '\n', events: events.length };
}
