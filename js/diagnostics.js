/* ============================================================
   diagnostics.js — "why did my captions not generate?"

   Auto-captioning depends on a handful of browser features and
   two CDNs. When any of them is missing the old build failed
   almost silently. This checks each one and prints a report the
   user can copy straight into a support message.
   ============================================================ */

window.UQ = window.UQ || {};

UQ.diag = {
  /* Remembered by editor.js so the report shows what actually broke. */
  lastError: null,
  note(err) { this.lastError = err ? (err.message || String(err)) : null; },

  async check(url, label) {
    const t0 = performance.now();
    try {
      /* no-cors still tells us reachable vs blocked, and avoids CORS noise. */
      await fetch(url, { method: 'GET', mode: 'no-cors', cache: 'no-store' });
      return { label, ok: true, ms: Math.round(performance.now() - t0) };
    } catch (e) {
      return { label, ok: false, ms: Math.round(performance.now() - t0), err: e.message || String(e) };
    }
  },

  async audioProbe(file) {
    if (!file) return { ok: null, note: 'no clip loaded' };
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return { ok: false, note: 'AudioContext missing in this browser' };
    const ctx = new Ctx();
    try {
      const buf = await file.arrayBuffer();
      const decoded = await ctx.decodeAudioData(buf);
      return {
        ok: true,
        note: decoded.duration.toFixed(1) + 's · ' + decoded.numberOfChannels + 'ch · ' + decoded.sampleRate + 'Hz'
      };
    } catch (e) {
      return { ok: false, note: 'this clip has no readable audio track (' + (e.message || e.name) + ')' };
    } finally {
      try { ctx.close(); } catch (e) {}
    }
  },

  async run(file) {
    const rows = [];
    const add = (label, ok, note) => rows.push({ label, ok, note: note || '' });

    add('Page address', location.protocol !== 'file:', location.href.split('?')[0]);
    add('Browser', true, navigator.userAgent.slice(0, 110));
    add('WebAssembly', typeof WebAssembly === 'object', typeof WebAssembly === 'object' ? 'available' : 'MISSING — Whisper cannot run');
    add('Audio decoding', !!(window.AudioContext || window.webkitAudioContext), 'AudioContext');
    const idb = UQ.handoff ? UQ.handoff.supported() : false;
    add('IndexedDB (upload handoff)', idb, idb ? 'available' : 'MISSING — clips dropped on the dashboard cannot reach the editor');

    const cdn = await this.check('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/package.json', 'Speech engine CDN (jsdelivr)');
    add(cdn.label, cdn.ok, cdn.ok ? cdn.ms + 'ms' : 'UNREACHABLE — ' + cdn.err);

    const hf = await this.check('https://huggingface.co/Xenova/whisper-tiny/resolve/main/config.json', 'Speech model host (huggingface)');
    add(hf.label, hf.ok, hf.ok ? hf.ms + 'ms' : 'UNREACHABLE — ' + hf.err);

    /* Not yet loaded is normal before the first clip — never a failure. */
    const loaded = !!(UQ.whisper && UQ.whisper.pipe);
    add('Speech model loaded', loaded ? true : null, loaded ? 'cached in this browser' : 'not loaded yet — the first clip downloads ~40MB');

    if (file) {
      add('Clip', true, file.name + ' · ' + (file.size / 1048576).toFixed(1) + 'MB · ' + (file.type || 'unknown type'));
      const audio = await this.audioProbe(file);
      add('Audio track in clip', audio.ok, audio.note);
    } else {
      add('Clip', false, 'no clip loaded — upload one first');
    }

    if (this.lastError) add('Last error', false, this.lastError);
    return rows;
  },

  asText(rows) {
    return rows.map(r => (r.ok === false ? '[FAIL] ' : r.ok === true ? '[ ok ] ' : '[ -- ] ') + r.label + ': ' + r.note).join('\n');
  },

  /* Opens the report in a modal with a copy button. */
  async open(file) {
    const scrim = UQ.ui.modal(
      '<div class="modal__title" style="margin-bottom:7px">Caption diagnostics</div>' +
      '<div class="modal__sub" style="margin-bottom:16px">Checking everything auto-captioning needs…</div>' +
      '<div id="diagRows" style="font-size:12.5px;line-height:1.6">Running…</div>',
      { className: 'modal--narrow' }
    );
    const rows = await this.run(file);
    const body = scrim.querySelector('#diagRows');
    const failed = rows.filter(r => r.ok === false);
    body.innerHTML =
      '<div class="stack" style="gap:7px;text-align:left">' +
        rows.map(r =>
          '<div class="row" style="gap:9px;align-items:flex-start">' +
            '<span style="flex-shrink:0;width:16px;color:' + (r.ok === false ? 'var(--danger)' : r.ok === true ? 'var(--teal-text)' : 'var(--faint)') + '">' +
              (r.ok === false ? '✕' : r.ok === true ? '✓' : '–') + '</span>' +
            '<span class="grow"><b style="font-size:12.5px">' + UQ.ui.esc(r.label) + '</b>' +
            (r.note ? '<div style="font-size:11.5px;color:var(--mut);word-break:break-word">' + UQ.ui.esc(r.note) + '</div>' : '') +
            '</span>' +
          '</div>').join('') +
      '</div>' +
      '<div class="alert ' + (failed.length ? 'alert--error' : 'alert--info') + '" style="margin-top:16px;text-align:left">' +
        (failed.length
          ? 'Blocking captions: ' + UQ.ui.esc(failed.map(f => f.label).join(', ')) + '.'
          : 'Everything auto-captioning needs is working. If a clip still produces nothing, it likely has no clear speech — paste your script in the Text tab and hit “Re-match to voice”.') +
      '</div>' +
      '<div class="row" style="gap:8px;margin-top:14px">' +
        '<button class="btn btn--primary grow" data-copy>Copy report</button>' +
        '<button class="btn btn--quiet" data-close>Close</button>' +
      '</div>';

    const text = this.asText(rows);
    body.querySelector('[data-copy]').addEventListener('click', e => {
      navigator.clipboard.writeText(text).then(
        () => { e.target.textContent = 'Copied ✓'; },
        () => { e.target.textContent = 'Press Ctrl+C'; }
      );
    });
    body.querySelector('[data-close]').addEventListener('click', () => scrim.remove());
    console.log('[uniqueness diagnostics]\n' + text);
  }
};
