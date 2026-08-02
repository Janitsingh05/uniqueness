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
     opts: { words, wordsPerLine, duration, segments, speechTotal }
     With segments, lines break where the speaker pauses and start
     exactly on the voice. Without, words spread evenly. */
  lines(opts) {
    const w = opts.words, n = Math.max(1, opts.wordsPerLine);
    if (!w.length) return [];

    const segs = opts.segments;
    if (segs && segs.length && opts.speechTotal > 0.3) {
      const perWord = opts.speechTotal / w.length;
      const counts = segs.map(s => Math.max(0, Math.round((s.end - s.start) / perWord)));
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
        const per = (seg.end - seg.start) / take.length;
        for (let j = 0; j < take.length; j += n) {
          const group = take.slice(j, j + n);
          out.push({ words: group, start: seg.start + j * per, end: seg.start + (j + group.length) * per, i: out.length });
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
      if (out.length) return out;
    }

    const chunks = [];
    for (let i = 0; i < w.length; i += n) chunks.push(w.slice(i, i + n));
    const dur = opts.duration || Math.max(2, w.length * 0.42);
    const per = dur / chunks.length;
    return chunks.map((ws, i) => ({ words: ws, start: i * per, end: (i + 1) * per, i }));
  },

  /* Which line + word is on screen at time t.
     During a pause it holds the last spoken line (never flashes ahead). */
  activeAt(lines, t) {
    if (!lines.length) return null;
    let line = lines.find(l => l.start <= t && t < l.end), gap = false;
    if (!line) {
      gap = true;
      let prev = null;
      for (const l of lines) { if (l.end <= t) prev = l; else break; }
      line = prev || lines[0];
    }
    const p = gap
      ? (line.end <= t ? .999 : 0)
      : Math.min(.999, Math.max(0, (t - line.start) / Math.max(.001, line.end - line.start)));
    return { line, index: Math.min(line.words.length - 1, Math.floor(p * line.words.length)), progress: p };
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

  /* Render the caption for time t into `capEl` (a .cap element).
     Rebuilds only when the visible word changes, so CSS animations
     restart exactly once per word. */
  render(capEl, state) {
    const tpl = UQ.config.templates.find(t => t.id === state.style.tpl) || UQ.config.templates[0];
    const active = this.activeAt(state.lines, state.time);
    capEl.className = 'cap tpl-' + tpl.id;
    if (!active) { capEl.innerHTML = ''; return; }

    const cased = s => (state.style.upper ? s.toUpperCase() : s);
    const key = tpl.mode === 'type'
      ? active.line.i + ':' + Math.ceil(active.progress * 40)
      : active.line.i + ':' + active.index;
    if (capEl.dataset.key === key) return;
    capEl.dataset.key = key;

    if (tpl.mode === 'type') {
      const full = cased(active.line.words.join(' '));
      const shown = full.slice(0, Math.ceil(active.progress * full.length));
      capEl.innerHTML = '<span class="typed">' + UQ.ui.esc(shown) + '<span class="caret">|</span></span>';
    } else {
      const parts = active.line.words.map((w, i) => {
        if (tpl.mode === 'word' && i !== active.index) return '';
        const cls = 'w' + (i === active.index ? ' on' : i < active.index ? ' past' : '');
        return '<span class="' + cls + '">' + UQ.ui.esc(cased(w)) + '</span>';
      });
      capEl.innerHTML = parts.join('');
    }
    if (state.style.emoji) capEl.insertAdjacentHTML('beforeend', '<span class="emoji">' + state.style.emoji + '</span>');
  }
};
