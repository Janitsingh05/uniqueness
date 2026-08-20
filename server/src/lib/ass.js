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

/* Per-word times, falling back to an even split when the engine could not
   produce them (no speech detected, hand-typed script). */
function wordTimes(line) {
  if (line.wordTimes && line.wordTimes.length === line.words.length) return line.wordTimes;
  const start = Number(line.start) || 0;
  const end = Math.max(start + 0.2, Number(line.end) || start + 0.4);
  const per = (end - start) / Math.max(1, line.words.length);
  return line.words.map((_, i) => ({ start: start + i * per, end: start + (i + 1) * per }));
}

export function buildAss({ lines, style, width, height, template }) {
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
    '',
    '[Events]',
    'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text'
  ].join('\n');

  const events = [];
  const push = (start, end, text) => {
    if (!(end > start)) return;
    events.push(`Dialogue: 0,${assTime(start)},${assTime(end)},Cap,,0,0,0,,${text}`);
  };

  for (const line of lines || []) {
    if (!line || !Array.isArray(line.words) || !line.words.length) continue;
    const times = wordTimes(line);

    for (let i = 0; i < line.words.length; i++) {
      const t = times[i];
      if (!t) continue;

      if (mode === 'word') {
        /* Punch / Neon / Bounce: one word owns the frame. */
        push(t.start, t.end, `{\\c${highlight}}` + assText(cased(line.words[i])) + assText(sticker));
        continue;
      }

      if (mode === 'type') {
        /* Typewriter: the line grows one word at a time. */
        const shown = line.words.slice(0, i + 1).join(' ');
        push(t.start, t.end, `{\\c${base}}` + assText(cased(shown)) + assText(sticker));
        continue;
      }

      /* Line templates: hold the line, tint the word being spoken. */
      const parts = line.words.map((w, j) =>
        (j === i ? `{\\c${highlight}}` : `{\\c${base}}`) + assText(cased(w))
      );
      push(t.start, t.end, parts.join(' ') + assText(sticker));
    }
  }

  return { content: header + '\n' + events.join('\n') + '\n', events: events.length };
}
