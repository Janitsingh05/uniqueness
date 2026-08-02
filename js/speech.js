/* ============================================================
   speech.js — Google speech-to-text (FREE).

   Uses the Web Speech API in Chrome / Edge. Google powers the
   recogniser — no API key, no Cloud billing, works on HTTPS
   and localhost.

   Two modes:
     'clip' — plays the clip out loud and listens through the mic
     'mic'  — you dictate the script yourself

   ⚠ For higher accuracy on uploaded files (no mic loopback),
   later swap this for Google Cloud Speech-to-Text via a tiny
   Cloud Function. Feed returned text into the same onText()
   hook — captions.js + audio-sync.js stay unchanged.
   ============================================================ */

window.UQ = window.UQ || {};

UQ.speech = {
  rec: null,
  timer: null,

  supported() { return !!(window.SpeechRecognition || window.webkitSpeechRecognition); },
  listening() { return !!this.rec; },

  /* start({ mode, lang, video, duration, onText, onState })
     onText(fullTranscript, isInterim)
     onState(state, note) — state: listening | stopped | error */
  async start(opts) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
      opts.onState('error', 'Speech-to-text needs Chrome or Edge. Voice sync works in every browser.');
      return;
    }
    if (this.rec) return this.stop();

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach(t => t.stop());
    } catch (e) {
      opts.onState('error', 'Microphone access is needed — it listens while the clip plays. Allow the mic, or paste your script and use Analyse audio to sync it.');
      return;
    }

    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = UQ.config.speechLangs[opts.lang] || 'en-IN';

    let finals = '';
    rec.onresult = e => {
      let interim = '';
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finals += r[0].transcript + ' ';
        else interim += r[0].transcript;
      }
      opts.onText((finals + interim).replace(/\s+/g, ' ').trim(), !!interim);
    };
    rec.onerror = ev => opts.onState('error', ev.error === 'not-allowed'
      ? 'Microphone permission was blocked — allow it and try again.'
      : 'Listening stopped: ' + ev.error);
    rec.onend = () => {
      this.rec = null;
      clearTimeout(this.timer);
      if (opts.mode === 'clip' && opts.video) opts.video.pause();
      opts.onState('stopped', finals
        ? 'Transcript captured — analysing audio to lock the timing…'
        : 'Nothing was heard — check the mic and try again.');
    };

    this.rec = rec;
    opts.onState('listening', opts.mode === 'clip'
      ? 'Playing the clip out loud and listening — keep your speakers up and the room quiet.'
      : 'Listening… speak your script now.');
    try { rec.start(); } catch (e) {}

    if (opts.mode === 'clip' && opts.video) {
      opts.video.currentTime = 0;
      opts.video.muted = false;
      opts.video.volume = 1;
      opts.video.play().catch(() => {});
      this.timer = setTimeout(() => this.stop(), ((opts.duration || 8) + 1.5) * 1000);
    }
  },

  stop() {
    clearTimeout(this.timer);
    if (this.rec) { try { this.rec.stop(); } catch (e) {} }
  }
};
