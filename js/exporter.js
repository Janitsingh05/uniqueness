/* ============================================================
   exporter.js — caption files + the burned-in video render.

   SRT / VTT / TXT are generated in the browser and downloaded.

   MP4 rendering needs FFmpeg, which a browser does not have. With a
   backend configured (see js/api.js) the clip and the caption lines
   are sent to it and a real burned-in MP4 comes back. Without one,
   renderVideo runs a demo that produces no file — and says so, rather
   than pretending it rendered something.
   ============================================================ */

window.UQ = window.UQ || {};

UQ.exporter = {
  STEPS: ['Getting your video ready', 'Adding your captions', 'Rendering the final video', 'Almost there'],

  stamp(t, comma) {
    const h = String(Math.floor(t / 3600)).padStart(2, '0');
    const m = String(Math.floor((t % 3600) / 60)).padStart(2, '0');
    const s = String(Math.floor(t % 60)).padStart(2, '0');
    const ms = String(Math.floor((t % 1) * 1000)).padStart(3, '0');
    return h + ':' + m + ':' + s + (comma ? ',' : '.') + ms;
  },

  download(filename, body, type) {
    const url = URL.createObjectURL(new Blob([body], { type: type || 'text/plain' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  },

  basename(name) { return (name || 'uniqueness-captions').replace(/\.[^.]+$/, ''); },

  /* kind: 'srt' | 'vtt' | 'txt' */
  captionFile(kind, lines, opts) {
    const upper = opts && opts.upper;
    const text = w => (upper ? w.toUpperCase() : w);
    const base = this.basename(opts && opts.filename);

    if (kind === 'txt') {
      return this.download(base + '.txt', lines.map(l => l.words.join(' ')).join('\n'));
    }
    const comma = kind === 'srt';
    const body = lines.map((l, i) =>
      (comma ? (i + 1) + '\n' : '') +
      this.stamp(l.start, comma) + ' --> ' + this.stamp(l.end, comma) + '\n' +
      text(l.words.join(' '))
    ).join('\n\n');
    this.download(base + '.' + kind, (comma ? '' : 'WEBVTT\n\n') + body + '\n');
  },

  minutesFor(duration) { return Math.max(0.5, Math.round((duration || 30) / 6) / 10); },

  /* Is a real render possible right now? */
  async canRender() {
    if (!UQ.api || !UQ.api.configured()) return false;
    const health = await UQ.api.health();
    return !!health.render;
  },

  /* Translation needs no API key server-side, so it is available
     whenever a backend is configured and reachable at all. */
  async canTranslate() {
    if (!UQ.api || !UQ.api.configured()) return false;
    const health = await UQ.api.health();
    return !!health.translate;
  },

  /* renderVideo({ file, lines, style, template, filename, duration,
                   onProgress, onDone, onError })
     onProgress(pct, stepIndex) · onDone(minutesUsed, result) */
  async renderVideo(opts) {
    const fail = msg => {
      if (opts.onError) opts.onError(new Error(msg));
      else UQ.ui.toast(msg);
    };

    if (!(await this.canRender())) return this.simulate(opts);
    if (!opts.file) return fail('Load a clip before rendering.');
    if (!opts.lines || !opts.lines.length) return fail('Generate captions before rendering.');

    try {
      opts.onProgress(3, 0);
      /* No uid in here any more — the server reads it from the signed ID
         token instead, because a uid in the body was something anyone
         could swap for a paid account's. */
      const job = await UQ.api.startRender(opts.file, {
        lines: opts.lines,
        style: opts.style,
        template: opts.template,
        filename: opts.filename
      });

      const done = await UQ.api.waitForRender(job.id, j => {
        /* Server steps map onto the four the modal already shows. */
        const step = j.progress < 8 ? 0 : j.progress < 90 ? 1 : j.progress < 100 ? 2 : 3;
        opts.onProgress(Math.max(3, j.progress), step);
      });

      opts.onProgress(100, 3);
      const url = UQ.api.downloadUrl(done);
      /* job.minutes is the balance the server landed on after charging
         this render — passed through so the caller mirrors it instead of
         deducting a second time locally. */
      opts.onDone(done.durationMinutes || this.minutesFor(opts.duration),
        { url, filename: done.filename, minutes: job.minutes });
    } catch (err) {
      console.warn('[render]', err);
      fail(err.message || 'Render failed.');
    }
  },

  /* No backend: run the old progress animation, but hand back no file so
     the caller can tell the user what is actually needed. */
  simulate(opts) {
    let pct = 0;
    const tick = setInterval(() => {
      pct += 3 + Math.random() * 6;
      if (pct >= 100) {
        clearInterval(tick);
        opts.onProgress(100, 3);
        setTimeout(() => opts.onDone(this.minutesFor(opts.duration), { demo: true }), 600);
        return;
      }
      opts.onProgress(pct, pct < 28 ? 0 : pct < 58 ? 1 : pct < 86 ? 2 : 3);
    }, 220);
    return () => clearInterval(tick);
  }
};
