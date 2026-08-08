/* ============================================================
   whisper.js — on-device speech-to-text from the uploaded file.

   Uses Hugging Face Transformers.js + Whisper (runs in the
   browser, free, no API key). Returns word-level timestamps so
   captions lock to the exact voice.

   First run downloads the model once (~40MB) and caches it.
   ============================================================ */

window.UQ = window.UQ || {};

UQ.whisper = {
  pipe: null,
  loading: null,

  STEPS: [
    'Reading your clip',
    'Downloading speech model (one-time)',
    'Listening to every word',
    'Locking captions to the voice'
  ],

  langMap: {
    'Auto-detect': null,
    English: 'english',
    Hindi: 'hindi',
    Hinglish: 'hindi'
  },

  cfg() {
    return (UQ.config && UQ.config.autoCaption) || {
      onUpload: true,
      model: 'Xenova/whisper-tiny'
    };
  },

  async ensure(onProgress) {
    if (this.pipe) return this.pipe;
    if (this.loading) return this.loading;
    this.loading = (async () => {
      if (onProgress) onProgress(12, 1);
      const mod = await import('https://cdn.jsdelivr.net/npm/@xenova/transformers@2.17.2/+esm');
      if (mod.env) {
        mod.env.allowLocalModels = false;
        mod.env.useBrowserCache = true;
      }
      if (onProgress) onProgress(28, 1);
      this.pipe = await mod.pipeline('automatic-speech-recognition', this.cfg().model, {
        progress_callback: (p) => {
          if (!onProgress || !p) return;
          if (p.status === 'progress' && p.total) {
            const frac = Math.min(1, (p.loaded || 0) / p.total);
            onProgress(28 + Math.round(frac * 22), 1);
          }
        }
      });
      return this.pipe;
    })();
    try {
      return await this.loading;
    } finally {
      this.loading = null;
    }
  },

  /* Decode any video/audio file → mono Float32 @ 16 kHz for Whisper. */
  async decodeMono16k(file) {
    const raw = await file.arrayBuffer();
    const Ctx = window.AudioContext || window.webkitAudioContext;
    const ctx = new Ctx();
    let decoded;
    try {
      decoded = await ctx.decodeAudioData(raw.slice(0));
    } catch (e) {
      await ctx.close();
      throw new Error('Could not read audio from this file. Try MP4, MOV, M4A or WAV.');
    }
    await ctx.close();

    const targetRate = 16000;
    const frames = Math.ceil(decoded.duration * targetRate);
    const offline = new OfflineAudioContext(1, Math.max(1, frames), targetRate);
    const src = offline.createBufferSource();
    /* Mixdown: OfflineAudioContext with 1 channel downmixes automatically
       when the buffer has multiple channels. */
    src.buffer = decoded;
    src.connect(offline.destination);
    src.start(0);
    const rendered = await offline.startRendering();
    return {
      audio: rendered.getChannelData(0),
      duration: decoded.duration
    };
  },

  /* One clip at a time — the ONNX session is not safe to run twice at once,
     so a second upload queues behind the first instead of corrupting it. */
  _queue: Promise.resolve(),

  transcribe(file, opts) {
    const next = this._queue.then(
      () => this._transcribe(file, opts),
      () => this._transcribe(file, opts)
    );
    this._queue = next.catch(() => {});
    return next;
  },

  /* _transcribe(file, { lang, onProgress })
     -> { text, timedWords: [{text,start,end}], note } */
  async _transcribe(file, opts) {
    opts = opts || {};
    const step = (pct, i) => { if (opts.onProgress) opts.onProgress(pct, i); };

    step(6, 0);
    const { audio, duration } = await this.decodeMono16k(file);
    step(18, 0);

    const pipe = await this.ensure(opts.onProgress);
    step(52, 2);

    const settings = JSON.parse(localStorage.getItem('uq_settings_v1') || '{}');
    const langKey = opts.lang || settings.lang || 'Auto-detect';
    const language = this.langMap[langKey];

    const result = await pipe(audio, {
      return_timestamps: 'word',
      chunk_length_s: 30,
      stride_length_s: 5,
      language: language || undefined,
      task: 'transcribe'
    });

    step(88, 3);

    const timedWords = this._chunksToWords(result);
    const text = (result.text || timedWords.map(w => w.text).join(' ')).replace(/\s+/g, ' ').trim();

    if (!text) {
      return {
        text: '',
        timedWords: [],
        duration,
        note: 'No speech heard in this clip. Paste lyrics/script and hit Apply to captions.'
      };
    }

    step(100, 3);
    return {
      text,
      timedWords,
      duration,
      note: timedWords.length
        ? timedWords.length + ' words locked to the voice · ' + duration.toFixed(1) + 's clip'
        : 'Transcript ready — timing will follow the detected voice.'
    };
  },

  _chunksToWords(result) {
    const chunks = result && result.chunks;
    if (!Array.isArray(chunks) || !chunks.length) return [];
    const out = [];
    chunks.forEach(c => {
      const raw = (c.text || '').trim();
      if (!raw) return;
      const ts = c.timestamp || [0, 0];
      let start = Number(ts[0]);
      let end = Number(ts[1]);
      if (!isFinite(start)) start = out.length ? out[out.length - 1].end : 0;
      if (!isFinite(end) || end <= start) end = start + 0.28;
      /* Some models return multi-word chunks — split evenly. */
      const parts = raw.split(/\s+/).filter(Boolean);
      if (parts.length === 1) {
        out.push({ text: parts[0], start, end });
      } else {
        const span = Math.max(0.05, end - start);
        const per = span / parts.length;
        parts.forEach((p, i) => out.push({
          text: p,
          start: start + i * per,
          end: start + (i + 1) * per
        }));
      }
    });
    return out;
  }
};
