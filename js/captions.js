/* ============================================================
   captions.js — the timing engine.

   Pure functions, no DOM. Given a transcript (+ optional voice
   segments from audio-sync.js) it produces caption lines with
   real start/end times, and renders the active line into a stage.
   ============================================================ */

window.UQ = window.UQ || {};

UQ.captions = {
  /* Split a transcript into words, optionally dropping filler. */
  words(transcript, cutFiller) {
    let list = (transcript || '').trim().split(/\s+/).filter(Boolean);
    if (cutFiller) list = list.filter(w => !UQ.config.fillerWords.test(w));
    return list;
  },

  fillerCount(transcript) {
    const all = (transcript || '').trim().split(/\s+/).filter(Boolean);
    return all.length - all.filter(w => !UQ.config.fillerWords.test(w)).length;
  },

  /* Map a position on the "speech timeline" back to real clip time. */
  speechToReal(segments, pos) {
    let acc = 0;
    for (const s of segments) {
      const d = s.end - s.start;
      if (pos <= acc + d) return s.start + (pos - acc);
      acc += d;
    }
    return segments.length ? segments[segments.length - 1].end : pos;
  },

  /* Build caption lines.
     opts: { words, wordsPerLine, duration, segments, speechTotal, timedWords, energy }
     Priority:
       1. timedWords (Whisper word timestamps) — exact voice match
       2. segments + energy — words land on louder speech
       3. even spacing fallback */
  lines(opts) {
    const n = Math.max(1, opts.wordsPerLine);

    if (opts.timedWords && opts.timedWords.length) {
      return this.linesFromTimed(opts.timedWords, n, opts.cutFiller);
    }

    const w = opts.words;
    if (!w || !w.length) return [];

    const segs = opts.segments;
    if (segs && segs.length && opts.speechTotal > 0.3) {
      return this.linesFromSegments(w, n, segs, opts.speechTotal, opts.energy);
    }

    const chunks = [];
    for (let i = 0; i < w.length; i += n) chunks.push(w.slice(i, i + n));
    const dur = opts.duration || Math.max(2, w.length * 0.42);
    const per = dur / chunks.length;
    return chunks.map((ws, i) => ({ words: ws, start: i * per, end: (i + 1) * per, i }));
  },

  /* Exact lyrics timing from ASR word timestamps. */
  linesFromTimed(timedWords, n, cutFiller) {
    let list = timedWords.map(w => ({
      text: String(w.text || '').trim(),
      start: w.start,
      end: w.end
    })).filter(w => w.text);
    if (cutFiller) list = list.filter(w => !UQ.config.fillerWords.test(w.text));
    if (!list.length) return [];
    const out = [];
    for (let i = 0; i < list.length; i += n) {
      const group = list.slice(i, i + n);
      out.push({
        words: group.map(g => g.text),
        start: group[0].start,
        end: Math.max(group[group.length - 1].end, group[0].start + 0.08),
        i: out.length,
        wordTimes: group.map(g => ({ start: g.start, end: g.end }))
      });
    }
    return out;
  },

  /* Distribute words across speech segments; prefer energy mass when available. */
  linesFromSegments(w, n, segs, speechTotal, energy) {
    const counts = segs.map(s => Math.max(0, Math.round((s.end - s.start) / (speechTotal / w.length))));
    let diff = w.length - counts.reduce((a, b) => a + b, 0);
    const order = segs.map((s, i) => i).sort((a, b) => (segs[b].end - segs[b].start) - (segs[a].end - segs[a].start));
    let guard = 0;
    while (diff !== 0 && order.length && guard++ < w.length * 4 + 40) {
      const i = order[guard % order.length];
      if (diff > 0) { counts[i]++; diff--; }
      else if (counts[i] > 1) { counts[i]--; diff++; }
    }
    const out = [];
    let cursor = 0;
    segs.forEach((seg, si) => {
      const take = w.slice(cursor, cursor + counts[si]);
      cursor += counts[si];
      if (!take.length) return;
      const stamps = this._stampWords(take, seg, energy);
      for (let j = 0; j < take.length; j += n) {
        const group = take.slice(j, j + n);
        const times = stamps.slice(j, j + group.length);
        out.push({
          words: group,
          start: times[0].start,
          end: times[times.length - 1].end,
          i: out.length,
          wordTimes: times
        });
      }
    });
    const rest = w.slice(cursor);
    if (rest.length && out.length) {
      let t = out[out.length - 1].end;
      for (let j = 0; j < rest.length; j += n) {
        const group = rest.slice(j, j + n);
        out.push({ words: group, start: t, end: t + .4 * group.length, i: out.length });
        t += .4 * group.length;
      }
    }
    return out;
  },

  /* Place words inside a segment by cumulative audio energy (falls back to even). */
  _stampWords(words, seg, energy) {
    const span = Math.max(0.05, seg.end - seg.start);
    if (!energy || !energy.frames || !energy.frames.length) {
      const per = span / words.length;
      return words.map((_, i) => ({
        start: seg.start + i * per,
        end: seg.start + (i + 1) * per
      }));
    }
    const frameSec = energy.frameSec || 0.02;
    const i0 = Math.max(0, Math.floor(seg.start / frameSec));
    const i1 = Math.min(energy.frames.length - 1, Math.ceil(seg.end / frameSec));
    const slice = energy.frames.slice(i0, i1 + 1);
    const total = slice.reduce((a, b) => a + b, 0) || slice.length;
    const target = total / words.length;
    const stamps = [];
    let acc = 0, wi = 0, startF = 0;
    for (let i = 0; i < slice.length && wi < words.length; i++) {
      acc += slice[i];
      const last = wi === words.length - 1 && i === slice.length - 1;
      if (acc >= target * (wi + 1) || last) {
        const s = seg.start + startF * frameSec;
        const e = seg.start + (i + 1) * frameSec;
        stamps.push({ start: s, end: Math.max(s + 0.06, Math.min(seg.end, e)) });
        startF = i + 1;
        wi++;
      }
    }
    while (stamps.length < words.length) {
      const last = stamps[stamps.length - 1];
      const s = last ? last.end : seg.start;
      stamps.push({ start: s, end: Math.min(seg.end, s + span / words.length) });
    }
    return stamps;
  },

  /* Which line + word is on screen at time t.
     Uses per-word timestamps when present for exact karaoke match. */
  activeAt(lines, t) {
    if (!lines.length) return null;
    let line = lines.find(l => l.start <= t && t < l.end), gap = false;
    if (!line) {
      gap = true;
      if (t < lines[0].start) return null;
      let prev = null;
      for (const l of lines) { if (l.end <= t) prev = l; else break; }
      line = prev || lines[0];
    }

    if (line.wordTimes && line.wordTimes.length === line.words.length) {
      let index = 0;
      for (let i = 0; i < line.wordTimes.length; i++) {
        if (t >= line.wordTimes[i].start) index = i;
      }
      if (gap && line.end <= t) index = line.words.length - 1;
      const wt = line.wordTimes[index];
      const progress = wt && wt.end > wt.start
        ? Math.min(.999, Math.max(0, (t - wt.start) / (wt.end - wt.start)))
        : 0;
      return { line, index, progress };
    }

    const p = gap
      ? (line.end <= t ? .999 : 0)
      : Math.min(.999, Math.max(0, (t - line.start) / Math.max(.001, line.end - line.start)));
    return { line, index: Math.min(line.words.length - 1, Math.floor(p * line.words.length)), progress: p };
  },

  /* Stretch / shrink word timings so a new script still sits on the same voice window. */
  fitWordsToSpan(wordList, t0, t1) {
    const words = (wordList || []).filter(Boolean);
    if (!words.length) return [];
    const start = isFinite(t0) ? t0 : 0;
    const end = isFinite(t1) && t1 > start ? t1 : start + Math.max(0.4, words.length * 0.32);
    const span = Math.max(0.12, end - start);
    /* Slight ease: longer words get a touch more time. */
    const weights = words.map(w => Math.max(0.6, Math.min(2.2, String(w).replace(/[^\p{L}\p{N}]/gu, '').length / 4 || 1)));
    const sum = weights.reduce((a, b) => a + b, 0) || words.length;
    const out = [];
    let cursor = start;
    words.forEach((text, i) => {
      const dur = span * (weights[i] / sum);
      const next = i === words.length - 1 ? end : cursor + dur;
      out.push({ text, start: cursor, end: Math.max(cursor + 0.05, next) });
      cursor = next;
    });
    return out;
  },

  /* When the client edits lyrics, keep captions on the spoken timeline. */
  retimefromScript(transcript, opts) {
    opts = opts || {};
    const raw = (transcript || '').trim().split(/\s+/).filter(Boolean);
    if (!raw.length) return null;

    if (opts.timedWords && opts.timedWords.length) {
      /* Same word count means the edit was a rewrite in place — a spelling
         fix, casing, punctuation. Those words are still the words that were
         spoken, so relabel the existing stamps and keep the exact timing.
         Re-fitting here would trade Whisper's per-word times for an even
         spread across the span, which visibly drifts off the voice. */
      if (opts.timedWords.length === raw.length) {
        return opts.timedWords.map((w, i) => ({ text: raw[i], start: w.start, end: w.end }));
      }
      const t0 = opts.timedWords[0].start;
      const t1 = opts.timedWords[opts.timedWords.length - 1].end;
      return this.fitWordsToSpan(raw, t0, t1);
    }

    if (opts.segments && opts.segments.length && opts.speechTotal > 0.2) {
      /* Place words across speech segments by duration share. */
      const segs = opts.segments;
      const total = opts.speechTotal;
      const counts = segs.map(s => Math.max(0, Math.round(((s.end - s.start) / total) * raw.length)));
      let diff = raw.length - counts.reduce((a, b) => a + b, 0);
      let i = 0;
      while (diff !== 0 && segs.length) {
        const idx = i % segs.length;
        if (diff > 0) { counts[idx]++; diff--; }
        else if (counts[idx] > 1) { counts[idx]--; diff++; }
        i++;
        if (i > raw.length * 4) break;
      }
      const out = [];
      let cursor = 0;
      segs.forEach((seg, si) => {
        const slice = raw.slice(cursor, cursor + counts[si]);
        cursor += counts[si];
        if (!slice.length) return;
        out.push.apply(out, this.fitWordsToSpan(slice, seg.start, seg.end));
      });
      if (cursor < raw.length && out.length) {
        const rest = raw.slice(cursor);
        const last = out[out.length - 1].end;
        out.push.apply(out, this.fitWordsToSpan(rest, last, last + rest.length * 0.35));
      }
      return out.length ? out : null;
    }

    const dur = opts.duration || Math.max(2, raw.length * 0.42);
    return this.fitWordsToSpan(raw, 0, dur);
  },

  fontStack(key) {
    const fonts = (UQ.config && UQ.config.captionFonts) || [];
    const hit = fonts.find(f => f.id === key);
    if (hit) return hit.stack;
    if (key === 'serif') return 'var(--serif)';
    if (key === 'mono') return 'var(--mono)';
    return 'var(--font)';
  },

  /* Apply the style controls to the stage as CSS variables. */
  applyStyle(stageEl, style) {
    const tpl = UQ.config.templates.find(t => t.id === style.tpl) || UQ.config.templates[0];
    const sizeScale = tpl.id === 'punch' ? 1.7 : tpl.id === 'editorial' ? .95 : tpl.id === 'bar' ? .7 : 1;
    stageEl.style.setProperty('--cap-size', (style.size * sizeScale) + 'cqh');
    stageEl.style.setProperty('--cap-pos', style.pos + 'cqh');
    stageEl.style.setProperty('--cap-color', style.color);
    stageEl.style.setProperty('--cap-hl', style.hl);
    stageEl.style.setProperty('--cap-stroke', (style.stroke * .012).toFixed(3) + 'em');
    stageEl.style.setProperty('--cap-shadow', style.shadow ? '0 .06em .18em rgba(0,0,0,.6)' : 'none');
    stageEl.style.setProperty('--cap-font', this.fontStack(style.font));
    stageEl.style.setProperty('--cap-dur', (0.34 / (style.speed || 1)).toFixed(2) + 's');
  },

  /* Rough advance width per character as a fraction of the font size.
     Neither this preview nor libass breaks inside a word, so a word wider
     than the caption box spills off the frame — "TRANSFORMATION" showing
     up as "ANSFORMATIO". _fitToBox shrinks the line just enough to fit.
     server/src/lib/ass.js carries the same table so the burned-in MP4
     shrinks identically — change both together or the two drift apart. */
  _NARROW: 'IJfijlt.,:;!\'"`()[]{}|-',
  _WIDE: 'MW@%',

  _charEm(ch) {
    if (ch === ' ') return 0.28;
    if (this._NARROW.indexOf(ch) >= 0) return 0.34;
    if (this._WIDE.indexOf(ch) >= 0) return 0.95;
    if (ch >= 'a' && ch <= 'z') return 0.58;
    return 0.66;
  },

  _textEm(s) {
    let n = 0;
    const str = String(s == null ? '' : s);
    for (let i = 0; i < str.length; i++) n += this._charEm(str[i]);
    return n;
  },

  /* The widest single word decides the fit — everything shorter wraps. */
  _fitToBox(capEl, words) {
    capEl.style.fontSize = '';
    const cs = getComputedStyle(capEl);
    const px = parseFloat(cs.fontSize) || 0;
    /* The stroke is drawn outside the glyphs, so it eats into the box —
       subtracted here exactly as ass.js subtracts its outline, which is
       what keeps the preview and the burned-in MP4 on the same size. */
    const outline = (parseFloat(cs.getPropertyValue('--cap-stroke')) || 0) * px;
    const box = capEl.clientWidth
      - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0)
      - outline * 2;
    if (!(box > 0) || !px) return;
    let widest = 0;
    for (const w of words) widest = Math.max(widest, this._textEm(w));
    const needed = widest * px;
    if (widest && needed > box) capEl.style.fontSize = Math.max(8, Math.floor(px * (box / needed))) + 'px';
  },

  /* Render the caption for time t into `capEl` (a .cap element).
     Rebuilds only when the visible word changes, so CSS animations
     restart exactly once per word. */
  render(capEl, state) {
    const tpl = UQ.config.templates.find(t => t.id === state.style.tpl) || UQ.config.templates[0];
    const active = this.activeAt(state.lines, state.time);
    capEl.className = 'cap tpl-' + tpl.id;
    if (!active) { capEl.innerHTML = ''; return; }

    const cased = s => (state.style.upper ? s.toUpperCase() : s);
    // Typewriter needs progress across the WHOLE line, not the current word —
    // active.progress resets to ~0 at the start of every word, which made the
    // typed text jump back and re-type from near-scratch each word instead of
    // advancing smoothly across the line.
    const lineProgress = tpl.mode === 'type'
      ? Math.min(.999, Math.max(0, (state.time - active.line.start) / Math.max(.001, active.line.end - active.line.start)))
      : 0;
    /* The box width rides along in the key so resizing the stage re-fits
       the text — nothing else about the caption has changed. */
    const key = (tpl.mode === 'type'
      ? active.line.i + ':' + Math.ceil(lineProgress * 40)
      : active.line.i + ':' + active.index) + '@' + capEl.clientWidth;
    if (capEl.dataset.key === key) return;
    capEl.dataset.key = key;

    if (tpl.mode === 'type') {
      const full = cased(active.line.words.join(' '));
      const shown = full.slice(0, Math.ceil(lineProgress * full.length));
      capEl.innerHTML = '<span class="typed">' + UQ.ui.esc(shown) + '<span class="caret">|</span></span>';
    } else {
      const parts = active.line.words.map((w, i) => {
        if (tpl.mode === 'word' && i !== active.index) return '';
        const cls = 'w' + (i === active.index ? ' on' : i < active.index ? ' past' : '');
        return '<span class="' + cls + '">' + UQ.ui.esc(cased(w)) + '</span>';
      });
      capEl.innerHTML = parts.join('');
    }
    /* Match ass.js: 'word' templates show one word alone so each is sized
       on its own, while line templates hold the whole line and take one
       size for it. */
    this._fitToBox(capEl, tpl.mode === 'word'
      ? [cased(active.line.words[active.index] || '')]
      : active.line.words.map(cased));
    if (state.style.emoji) capEl.insertAdjacentHTML('beforeend', '<span class="emoji">' + state.style.emoji + '</span>');
  }
};
