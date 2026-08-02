/* ============================================================
   exporter.js — caption files + the burned-in video queue.

   SRT / VTT / TXT are generated for real and downloaded.
   MP4 rendering is a queue simulation: burning captions into a
   video needs a server (ffmpeg) or WebCodecs. Swap `renderVideo`
   for a call to your render API and keep the same callbacks.
   ============================================================ */

window.UQ = window.UQ || {};

UQ.exporter = {
  STEPS: ['Preparing frames', 'Burning in captions', 'Encoding video', 'Finishing up'],

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

  /* renderVideo({ duration, onProgress, onDone })
     onProgress(pct, stepIndex) · onDone(minutesUsed) */
  renderVideo(opts) {
    let pct = 0;
    const tick = setInterval(() => {
      pct += 3 + Math.random() * 6;
      if (pct >= 100) {
        clearInterval(tick);
        opts.onProgress(100, 4);
        const minutes = Math.max(0.5, Math.round((opts.duration || 30) / 6) / 10);
        setTimeout(() => opts.onDone(minutes), 800);
        return;
      }
      opts.onProgress(pct, pct < 28 ? 0 : pct < 58 ? 1 : pct < 86 ? 2 : 3);
    }, 220);
    return () => clearInterval(tick);
  }
};
