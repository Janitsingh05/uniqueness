/* ============================================================
   audio-sync.js — "auto vocal sync".

   Decodes the clip's audio in the browser, measures loudness in
   20 ms frames, and returns the segments where somebody is
   actually talking. captions.js then breaks lines on those
   pauses so captions land on the voice.

   No server, no upload — everything runs on the user's machine.
   ============================================================ */

window.UQ = window.UQ || {};

UQ.audioSync = {
  STEPS: ['Reading the clip', 'Decoding the audio track', 'Detecting the voice', 'Aligning captions to speech'],

  sleep(ms) { return new Promise(r => setTimeout(r, ms)); },

  /* analyse(file, { sensitivity, onProgress })
     -> { segments: [{start,end}], speechTotal, note } | { segments: null, note } */
  async analyse(file, opts) {
    opts = opts || {};
    const cfg = UQ.config.vocalSync;
    const sens = opts.sensitivity || cfg.sensitivity;
    const step = (pct, i) => { if (opts.onProgress) opts.onProgress(pct, i); };

    step(8, 0);
    await this.sleep(160);
    const buffer = await file.arrayBuffer();

    step(30, 1);
    await this.sleep(180);
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    let audio;
    try {
      audio = await ctx.decodeAudioData(buffer);
    } catch (e) {
      ctx.close();
      return { segments: null, speechTotal: 0, note: 'Could not read this audio track — try an MP4, MOV or M4A.' };
    }

    step(52, 2);
    await this.sleep(140);

    const rate = audio.sampleRate;
    const hop = Math.round(rate * cfg.frameSeconds);
    const left = audio.getChannelData(0);
    const right = audio.numberOfChannels > 1 ? audio.getChannelData(1) : null;
    const frames = [];
    for (let i = 0; i + hop < left.length; i += hop) {
      let sum = 0, count = 0;
      for (let j = i; j < i + hop; j += 4) {
        const v = right ? (left[j] + right[j]) * .5 : left[j];
        sum += v * v; count++;
      }
      frames.push(Math.sqrt(sum / Math.max(1, count)));
    }
    ctx.close();

    /* Threshold sits above the room noise floor but under the peaks.
       Higher sensitivity = lower threshold = quieter speech counts. */
    const sorted = frames.slice().sort((a, b) => a - b);
    const floor = sorted[Math.floor(sorted.length * .25)] || 0;
    const peak = sorted[Math.floor(sorted.length * .98)] || .01;
    const threshold = Math.max(floor * (3.6 - sens * .26), peak * (.16 - sens * .016), .0025);

    step(74, 2);
    await this.sleep(120);

    const frameSec = hop / rate;
    const raw = [];
    let open = null;
    frames.forEach((v, i) => {
      if (v > threshold) { if (open === null) open = i; }
      else if (open !== null) { raw.push({ start: open * frameSec, end: i * frameSec }); open = null; }
    });
    if (open !== null) raw.push({ start: open * frameSec, end: frames.length * frameSec });

    const merged = [];
    raw.forEach(seg => {
      const last = merged[merged.length - 1];
      if (last && seg.start - last.end < cfg.mergeGap) last.end = seg.end;
      else merged.push(Object.assign({}, seg));
    });
    const segments = merged.filter(s => s.end - s.start > cfg.minSegment);
    const speechTotal = segments.reduce((n, s) => n + (s.end - s.start), 0);

    if (!segments.length || speechTotal < .4) {
      return { segments: null, speechTotal: 0, note: 'No speech found — try raising the voice sensitivity, or keep even spacing.' };
    }

    step(92, 3);
    await this.sleep(200);
    step(100, 4);
    await this.sleep(600);

    return {
      segments,
      speechTotal,
      note: segments.length + ' speech segments detected · ' + speechTotal.toFixed(1) + 's of talking. Captions now follow the voice.'
    };
  }
};
