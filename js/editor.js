/* ============================================================
   editor.js — the caption editor page controller.

   Wires together: file loading, playback, the timing engine
   (captions.js), auto vocal sync (audio-sync.js), speech-to-text
   (speech.js) and exports (exporter.js).
   ============================================================ */

window.UQ = window.UQ || {};

UQ.editor = {
  DEMO: 'Most people scroll past the first two seconds. So I put the hook in the first three words and let the captions carry the rest. Watch how the words land on the beat.',

  /* Bumped on every new clip so a slower, older caption run can tell it lost. */
  _run: 0,

  state: {
    file: null, url: null, filename: '', duration: 0, time: 0, playing: false,
    transcript: '', draft: '', cutFiller: true, safe: true, tab: 'style',
    segments: null, speechTotal: 0, energy: null, timedWords: null,
    vocalSync: true, sensitivity: 5,
    note: '', live: '', failure: '', analysing: false, rendering: false, renderPct: 0, renderDone: false,
    renderUrl: null, renderName: null,
    translating: false, translatedLines: null, translatedLang: '',
    projectId: null, style: null, lines: []
  },

  init() {
    const user = UQ.shell.mount('editor', 'Caption editor');
    if (!user) return;
    this.user = user;
    this.state.style = Object.assign({}, UQ.config.defaultStyle);
    this.state.transcript = this.DEMO;
    this.state.draft = this.DEMO;
    this.state.vocalSync = UQ.config.vocalSync.enabled;

    this.stage = UQ.ui.el('#stage');
    this.cap = UQ.ui.el('#cap');
    this.video = UQ.ui.el('#video');
    this.input = UQ.ui.el('#fileInput');

    this.bindStatic();
    this.loadFromQuery();
    this.recompute();
    this.renderAll();

    const loop = () => {
      if (this.video && !this.video.paused && !this.video.ended) {
        this.state.time = this.video.currentTime;
        this.paintFrame();
      }
      requestAnimationFrame(loop);
    };
    requestAnimationFrame(loop);
  },

  /* ---------- setup ---------- */
  loadFromQuery() {
    const params = new URLSearchParams(location.search);
    if (params.get('tpl')) this.state.style.tpl = params.get('tpl');
    const pid = params.get('project');
    if (pid) {
      const p = UQ.db.project(this.user.id, pid);
      if (p) {
        this.state.projectId = p.id;
        this.state.filename = p.name;
        /* Projects saved before Hindi auto-converted to Hinglish still have
           raw Devanagari — romanize on load too, else it burns in as empty
           boxes on export (libass has no Devanagari glyphs). No timedWords
           are saved with a project, so this is the whole-text path either
           way, same as it already was for a saved project's timing. */
        const hi = this.hinglishify(p.transcript, null);
        this.state.transcript = hi ? hi.text : p.transcript;
        this.state.draft = this.state.transcript;
        this.state.style.tpl = p.tpl;
        this.state.style.ratio = p.ratio;
        if (hi) this.polishInBackground();
      }
    }
    this.applyTemplateRhythm(this.state.style.tpl);
    this.claimUpload(!!params.get('pick'));
  },

  /* A clip dropped on the dashboard is parked in IndexedDB — collect it and
     caption it immediately. Otherwise fall back to asking for a file. */
  async claimUpload(wantPick) {
    let file = null;
    try { file = await UQ.handoff.take(); } catch (e) { file = null; }
    if (file) { this.loadFile(file); return; }
    if (wantPick) this.promptForFile();
  },

  /* Chrome only opens a file dialog while a user gesture is still active, so
     after a navigation the call is silently ignored. Point at the button
     instead of leaving the editor looking broken. */
  promptForFile() {
    const act = navigator.userActivation;
    if (!act || act.isActive) {
      try { this.input.click(); return; } catch (e) {}
    }
    const btn = UQ.ui.el('#pickFile');
    if (btn) { btn.classList.add('is-waiting'); btn.focus({ preventScroll: true }); }
    this.state.note = 'Choose your clip to start — captions build themselves from the voice.';
    this.renderSyncCard();
    UQ.ui.toast('Choose a clip to caption');
  },

  /* Words per line follows the chosen style: one-word punch-ins group by one,
     a subtitle plate holds a full line. */
  applyTemplateRhythm(tplId) {
    const tpl = UQ.config.templates.find(t => t.id === tplId);
    if (!tpl || !tpl.wpl) return;
    this.state.style.wpl = tpl.wpl;
  },

  bindStatic() {
    this.input.addEventListener('change', e => this.loadFile(e.target.files && e.target.files[0]));
    UQ.ui.el('#pickFile').addEventListener('click', () => this.input.click());
    UQ.ui.el('#diagBtn').addEventListener('click', () => UQ.diag.open(this.state.file));
    UQ.ui.el('#saveProject').addEventListener('click', () => this.saveProject());
    UQ.ui.el('#playBtn').addEventListener('click', () => this.togglePlay());
    UQ.ui.el('#safeBtn').addEventListener('click', () => { this.state.safe = !this.state.safe; this.renderStage(); });
    UQ.ui.el('#scrub').addEventListener('click', e => {
      const r = e.currentTarget.getBoundingClientRect();
      this.seek(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * (this.state.duration || 8));
    });
    this.video.addEventListener('loadedmetadata', () => { this.state.duration = this.video.duration || 0; this.recompute(); this.renderAll(); });
    this.video.addEventListener('ended', () => { this.state.playing = false; this.renderTransport(); });

    UQ.ui.els('[data-ratio]').forEach(b => b.addEventListener('click', () => {
      this.state.style.ratio = b.dataset.ratio;
      this.renderStage();
      UQ.ui.els('[data-ratio]').forEach(x => x.classList.toggle('is-on', x === b));
    }));
    UQ.ui.els('[data-tab]').forEach(b => b.addEventListener('click', () => this.setTab(b.dataset.tab)));
    this.bindCapResize();
  },

  /* Drag the handle on the caption preview to resize it — mouse on desktop,
     finger on mobile, same code path either way via Pointer Events. Mirrors
     the size slider exactly (same clamp, same style key) so the two stay
     interchangeable. */
  bindCapResize() {
    const handle = UQ.ui.el('#capResize');
    if (!handle) return;
    const s = this.state;
    const range = UQ.ui.el('#sizeRange');
    const min = parseFloat(range.min), max = parseFloat(range.max);
    let startY = 0, startSize = 0, stageH = 0;

    const move = e => {
      const deltaSize = ((e.clientY - startY) / Math.max(1, stageH)) * 40;
      s.style.size = Math.max(min, Math.min(max, startSize + deltaSize));
      this.recompute();
      this.renderStage();
      this.renderStylePanel();
      this.renderTransport();
      this.paintFrame(true);
    };
    const up = e => {
      handle.classList.remove('is-dragging');
      handle.releasePointerCapture(e.pointerId);
      handle.removeEventListener('pointermove', move);
      handle.removeEventListener('pointerup', up);
      handle.removeEventListener('pointercancel', up);
    };
    handle.addEventListener('pointerdown', e => {
      e.preventDefault();
      startY = e.clientY;
      startSize = s.style.size;
      stageH = this.stage.getBoundingClientRect().height;
      handle.classList.add('is-dragging');
      handle.setPointerCapture(e.pointerId);
      handle.addEventListener('pointermove', move);
      handle.addEventListener('pointerup', up);
      handle.addEventListener('pointercancel', up);
    });
  },

  setTab(tab) {
    this.state.tab = tab;
    UQ.ui.els('[data-tab]').forEach(x => x.classList.toggle('is-on', x.dataset.tab === tab));
    UQ.ui.els('[data-panel]').forEach(p => p.classList.toggle('hidden', p.dataset.panel !== tab));
  },

  /* ---------- file ---------- */
  loadFile(file) {
    if (!file) return;
    if (!UQ.handoff.isMedia(file)) {
      UQ.ui.toast('That file is not a video or audio clip — try MP4, MOV, WEBM, M4A or WAV');
      return;
    }
    const btn = UQ.ui.el('#pickFile');
    if (btn) btn.classList.remove('is-waiting');
    this.showFailure(null);
    if (this.state.url) URL.revokeObjectURL(this.state.url);
    this.state.file = file;
    this.state.url = URL.createObjectURL(file);
    this.state.filename = file.name;
    this.state.time = 0;
    this.state.segments = null;
    this.state.speechTotal = 0;
    this.state.energy = null;
    this.state.timedWords = null;
    this.state.renderDone = false;
    this.state.renderPct = 0;
    this.state.transcript = '';
    this.state.draft = '';
    this.state.note = 'Clip loaded — building voice-matched captions…';
    this.video.src = this.state.url;
    this.recompute();
    this.renderAll();
    this.setTab('text');

    const auto = !(UQ.config.autoCaption && UQ.config.autoCaption.onUpload === false);
    if (auto) setTimeout(() => this.captionize(), 120);
    else setTimeout(() => this.analyse(), 150);
  },

  /* ---------- playback ---------- */
  togglePlay() {
    if (!this.state.url) return;
    if (this.video.paused) { this.video.play().catch(() => {}); this.state.playing = true; }
    else { this.video.pause(); this.state.playing = false; }
    this.renderTransport();
  },
  seek(t) {
    this.state.time = t;
    if (this.state.url) this.video.currentTime = t;
    this.paintFrame();
  },

  /* ---------- engine ---------- */
  recompute() {
    const s = this.state;
    s.lines = UQ.captions.lines({
      words: UQ.captions.words(s.transcript, s.cutFiller),
      wordsPerLine: s.style.wpl,
      duration: s.duration,
      segments: s.vocalSync ? s.segments : null,
      speechTotal: s.speechTotal,
      energy: s.vocalSync ? s.energy : null,
      timedWords: s.timedWords,
      cutFiller: s.cutFiller
    });
  },

  /* Full client pipeline: upload → hear voice → write lyrics → lock timing.
     A newer clip supersedes one still in flight — the older run's results are
     dropped rather than pasted onto the wrong video. */
  async captionize() {
    const s = this.state;
    if (!s.file) return;
    const run = ++this._run;
    const stale = () => this._run !== run;
    const file = s.file;
    s.analysing = true;
    s.timedWords = null;
    this.setTab('text');

    this.showFailure(null);
    UQ.diag.note(null);

    const steps = UQ.whisper.STEPS;
    UQ.ui.progress.open(
      'Building captions',
      'Reading the clip and matching every word to the voice.',
      steps
    );

    /* If nothing moves for a while the model download is almost certainly
       blocked or crawling — say so instead of spinning forever. */
    let beat = Date.now();
    const watchdog = setInterval(() => {
      if (stale() || Date.now() - beat < 45000) return;
      beat = Date.now();
      s.note = 'Still downloading the speech model — this is a one-time ~40MB download. If it never finishes, your network or an extension is blocking cdn.jsdelivr.net or huggingface.co.';
      this.renderSyncCard();
    }, 5000);

    try {
      /* 1) Voice regions + energy (fast, local) */
      UQ.ui.progress.set(8, 0);
      const voice = await UQ.audioSync.analyse(file, {
        sensitivity: s.sensitivity,
        onProgress: (pct) => { if (!stale()) UQ.ui.progress.set(Math.min(22, Math.round(pct * 0.22)), 0); }
      });
      if (stale()) return;
      s.segments = voice.segments;
      s.speechTotal = voice.speechTotal;
      s.energy = voice.energy || null;
      if (voice.segments) s.vocalSync = true;

      /* 2) Speech-to-text with word timestamps, from the file itself.
            The backend is used when one is configured and reachable;
            otherwise Whisper runs here in the browser exactly as before. */
      const onSttProgress = (pct, step) => {
        if (stale()) return;
        beat = Date.now();
        const mapped = 24 + Math.round((pct / 100) * 70);
        UQ.ui.progress.set(mapped, Math.min(steps.length - 1, (step || 0) + 1));
      };

      let result;
      let serverFailNote = null;
      const useServer = await this.serverCanTranscribe();
      if (useServer) {
        try {
          result = await UQ.api.transcribe(file, {
            language: (JSON.parse(localStorage.getItem('uq_settings_v1') || '{}') || {}).lang,
            onProgress: onSttProgress
          });
        } catch (err) {
          if (stale()) return;
          console.warn('Backend transcription failed, falling back to the browser.', err);
          UQ.diag.note(err);
          /* No credit or a bad key will not recover during this session, so
             stop re-uploading whole clips just to be rejected again. */
          if (UQ.api.isPermanentSttError(err)) UQ.api.disableTranscribe(err.message);
          serverFailNote = 'Caption server could not transcribe (' + err.message + ') — used your browser instead.';
          s.note = serverFailNote;
          this.renderSyncCard();
          result = null;
        }
      }
      if (!result) result = await UQ.whisper.transcribe(file, { onProgress: onSttProgress });
      if (stale()) return;

      /* The browser model is a weaker fallback (tiny, no language hint by
         default) — if it also comes up empty, that is worth keeping in
         view rather than burying the real reason under a generic note. */
      if (result.text) {
        const timed = result.timedWords && result.timedWords.length ? result.timedWords : null;
        /* Hindi is romanized to Hinglish immediately — no separate click.
           Other Devanagari-script languages (Marathi, Nepali, Sanskrit)
           share the same Unicode block but read differently, so this only
           fires on Whisper's own detected language when the server reports
           one; the browser-Whisper fallback has no such signal and falls
           back to converting any Devanagari it sees, same as before. */
        const isHindi = result.language ? result.language === 'hi' : true;
        const hi = isHindi ? this.hinglishify(result.text, timed) : null;
        s.transcript = hi ? hi.text : result.text;
        s.draft = s.transcript;
        s.timedWords = hi ? hi.timedWords : timed;
        s.note = serverFailNote ? serverFailNote + ' ' + result.note : result.note;
        if (hi) this.polishInBackground();
      } else {
        s.note = (serverFailNote ? serverFailNote + ' ' : '') + (result.note || voice.note);
        s.timedWords = null;
      }

      UQ.ui.progress.set(100, steps.length - 1);
      this.recompute();
      this.renderAll();

      const ta = UQ.ui.el('#transcript');
      if (ta) {
        ta.value = s.draft || s.transcript;
        ta.focus();
      }

      if (s.transcript) {
        UQ.ui.toast('Captions matched to voice — edit & Apply if needed');
        /* Auto-play a short preview so the client sees the match */
        this.seek(0);
        if (this.video) {
          this.video.play().catch(() => {});
          s.playing = true;
          this.renderTransport();
        }
      } else {
        this.showFailure(s.note || 'No speech was heard in this clip.');
        UQ.ui.toast('No speech found — paste lyrics and Apply');
      }
    } catch (err) {
      if (stale()) return;
      console.warn(err);
      UQ.diag.note(err);
      s.note = (err && err.message) || 'Auto-caption failed. Paste your script and hit Apply to captions.';
      this.showFailure(s.note);
      this.renderSyncCard();
      UQ.ui.toast('Could not auto-caption — paste script & Apply');
      /* Still try voice timing so a pasted script locks later */
      s.analysing = false;
      try { await this.analyse(); } catch (e) {}
    } finally {
      clearInterval(watchdog);
      /* A newer clip owns the modal and the state — leave both alone. */
      if (!stale()) {
        UQ.ui.progress.close();
        s.analysing = false;
        this.renderAll();
      }
    }
  },

  /* Backend is optional and must never block the studio, so a missing or
     unhealthy server just means "transcribe in the browser". */
  async serverCanTranscribe() {
    if (!UQ.api.configured()) return false;
    if (UQ.config.api && UQ.config.api.preferServer === false) return false;
    const health = await UQ.api.health();
    return !!health.transcribe;
  },

  /* One loud, persistent place that says why there are no captions.
     Pass null to clear it. */
  showFailure(why) {
    const box = UQ.ui.el('#captionAlert');
    if (!box) return;
    this.state.failure = why || '';
    box.classList.toggle('hidden', !why);
    if (why) UQ.ui.el('#captionAlertWhy').textContent = why;
  },

  async analyse() {
    const s = this.state;
    if (!s.file) { s.note = 'Load a clip first — then this locks the caption timing to its voice.'; this.renderSyncCard(); return; }
    if (s.analysing) return;
    s.analysing = true;
    UQ.ui.progress.open('Syncing to your voice', 'Finding exactly when each word is spoken.', UQ.audioSync.STEPS);
    const result = await UQ.audioSync.analyse(s.file, {
      sensitivity: s.sensitivity,
      onProgress: (pct, step) => UQ.ui.progress.set(pct, step)
    });
    UQ.ui.progress.close();
    s.analysing = false;
    s.segments = result.segments;
    s.speechTotal = result.speechTotal;
    s.energy = result.energy || null;
    /* Manual / re-analyse: drop Whisper times so energy + segments rebuild timing */
    if (!s.timedWords) s.note = result.note;
    if (result.segments) s.vocalSync = true;
    this.recompute();
    this.renderAll();
  },

  transcribe(mode) {
    const s = this.state;
    if (UQ.speech.listening()) return UQ.speech.stop();
    if (mode === 'clip' && !s.file) { s.note = 'Load a clip first, then hit Auto-transcribe.'; return this.renderSyncCard(); }
    this.setTab('text');
    UQ.speech.start({
      mode,
      lang: 'Auto-detect',
      video: this.video,
      duration: s.duration,
      onText: (text, interim) => {
        s.draft = text;
        s.transcript = text;
        s.live = interim ? text : '';
        const ta = UQ.ui.el('#transcript');
        if (ta) ta.value = text;
        this.recompute();
        this.renderSyncCard();
        this.renderTextPanel();
      },
      onState: (state, note) => {
        s.note = note;
        s.live = state === 'listening' ? s.live : '';
        this.renderSyncCard();
        if (state === 'stopped') {
          const hi = this.hinglishify(s.transcript, null);
          if (hi) { s.transcript = hi.text; s.draft = hi.text; this.polishInBackground(); }
          else s.draft = s.transcript;
          this.setTab('text');
          this.renderTextPanel();
          const ta = UQ.ui.el('#transcript');
          if (ta) { ta.focus(); ta.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
          UQ.ui.toast('Script ready — captions follow your edits live');
          if (s.file) this.analyse();
        }
      }
    });
  },

  /* Live: script text drives captions immediately; voice re-fit shortly after. */
  onScriptEdit() {
    const s = this.state;
    const ta = UQ.ui.el('#transcript');
    const text = ta ? ta.value : (s.draft || '');
    s.draft = text;
    s.transcript = text;
    s.timedWords = UQ.captions.retimefromScript(text, {
      timedWords: s.timedWords,
      segments: s.vocalSync ? s.segments : null,
      speechTotal: s.speechTotal,
      duration: s.duration
    });
    s.note = text.trim()
      ? 'Captions adjusted to your script — timing follows the voice window.'
      : 'Script cleared — paste lyrics or run Auto-caption.';
    this.recompute();
    this.renderTransport();
    this.renderSyncCard();
    this._paintScriptMeta();
    this.paintFrame(true);

    clearTimeout(this._scriptTimer);
    this._scriptTimer = setTimeout(() => this.softResyncFromScript(), 850);
  },

  /* Devanagari script -> Hinglish (Roman), text and (if given) timedWords
     kept in exact lockstep. Relabels each already-timed word in place
     instead of a whole-string convert-then-re-fit — transliteration never
     changes word count or order, so the original per-word timing
     (Whisper's, if this came from auto-caption) stays exactly right. A
     naive re-fit was silently downgrading precise word-level timestamps to
     a coarser voice-energy estimate on every conversion. Returns null when
     there is no Devanagari to convert. */
  hinglishify(text, timedWords) {
    if (!text || !/[ऀ-ॿ]/.test(text)) return null;
    if (timedWords && timedWords.length) {
      const relabeled = timedWords.map(w => Object.assign({}, w, { text: UQ.transliterate.wordToRoman(w.text) }));
      return { text: relabeled.map(w => w.text).join(' '), timedWords: relabeled };
    }
    return { text: UQ.transliterate.toHinglish(text), timedWords: timedWords || null };
  },

  /* Fire-and-forget AI pass over the rule-based Hinglish output — see
     server/src/lib/spellcheck.js. Never blocks the caller: hinglishify()
     already updated the UI instantly with the (correct, just sometimes
     unnatural-reading) rule-based text, and this quietly upgrades it a
     moment later if the polish call succeeds. A run counter guards
     against a slow response landing after a newer edit superseded it —
     same pattern as _run guards a stale transcription. */
  _polishRun: 0,
  async polishInBackground() {
    const s = this.state;
    const hasTimed = s.timedWords && s.timedWords.length > 0;
    const words = hasTimed ? s.timedWords.map(w => w.text) : (s.transcript || '').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return;

    const run = ++this._polishRun;
    let result;
    try { result = await UQ.api.polishHinglish(words); } catch (e) { return; }
    if (this._polishRun !== run) return;
    if (!result || !Array.isArray(result.words) || result.words.length !== words.length || !result.changed) return;

    if (hasTimed) {
      s.timedWords = s.timedWords.map((w, i) => Object.assign({}, w, { text: result.words[i] }));
      s.transcript = s.timedWords.map(w => w.text).join(' ');
    } else {
      s.transcript = result.words.join(' ');
    }
    s.draft = s.transcript;
    const ta = UQ.ui.el('#transcript');
    if (ta && document.activeElement !== ta) ta.value = s.transcript;
    this.recompute();
    this.renderTransport();
    this.renderSyncCard();
    this._paintScriptMeta();
    this.paintFrame(true);
    UQ.ui.toast('Spelling polished');
  },

  /* Manual button next to "Re-match to voice" — mainly for Devanagari typed
     or pasted straight into the script box, since auto-caption and dictation
     already convert automatically as soon as a transcript comes in. */
  convertToHinglish() {
    const s = this.state;
    const ta = UQ.ui.el('#transcript');
    const text = ta ? ta.value : (s.draft || s.transcript || '');
    const converted = this.hinglishify(text, s.timedWords);
    if (!converted) {
      UQ.ui.toast('No Hindi script here to convert');
      return;
    }

    s.draft = converted.text;
    s.transcript = converted.text;
    s.timedWords = converted.timedWords;
    if (ta) ta.value = converted.text;
    clearTimeout(this._scriptTimer);
    this.recompute();
    this.renderTransport();
    this.renderSyncCard();
    this._paintScriptMeta();
    this.paintFrame(true);
    UQ.ui.toast('Converted to Hinglish');
    this.polishInBackground();
  },

  /* After typing pauses, rebuild word timing from voice energy + latest script. */
  async softResyncFromScript() {
    const s = this.state;
    if (!s.file || s.analysing || !(s.draft || s.transcript).trim()) return;
    if (!s.segments || !s.energy) {
      try {
        const voice = await UQ.audioSync.analyse(s.file, { sensitivity: s.sensitivity });
        s.segments = voice.segments;
        s.speechTotal = voice.speechTotal;
        s.energy = voice.energy || null;
        if (voice.segments) s.vocalSync = true;
      } catch (e) { return; }
    }
    s.transcript = s.draft;
    s.timedWords = UQ.captions.retimefromScript(s.transcript, {
      segments: s.segments,
      speechTotal: s.speechTotal,
      duration: s.duration,
      timedWords: null
    });
    /* Prefer energy-based lines when we have segments — clearer voice match after edits */
    if (s.segments && s.speechTotal > 0.2) {
      s.timedWords = null;
    }
    s.note = 'Captions auto-adjusted to your script and the voice.';
    this.recompute();
    this.renderTransport();
    this.renderSyncCard();
    this._paintScriptMeta();
    this.paintFrame(true);
  },

  _paintScriptMeta() {
    const s = this.state;
    const dirtyEl = UQ.ui.el('#scriptDirty');
    if (dirtyEl) dirtyEl.classList.add('hidden');
    const stats = UQ.ui.el('#wordStats');
    if (stats) {
      stats.textContent =
        UQ.captions.words(s.transcript, s.cutFiller).length + ' words · ' + s.lines.length + ' lines · ' + s.style.wpl + ' per line · live adjust on';
    }
    const list = UQ.ui.el('#lineList');
    if (list) {
      list.innerHTML = s.lines.map(l =>
        '<button class="line-row" data-line="' + l.start.toFixed(3) + '"><time>' + UQ.ui.clock(l.start) + '</time><span>' + UQ.ui.esc(l.words.join(' ')) + '</span></button>'
      ).join('');
      UQ.ui.els('[data-line]', list).forEach(b => b.addEventListener('click', () => this.seek(parseFloat(b.dataset.line) + .01)));
    }
    const cut = UQ.ui.el('#cutCount');
    if (cut) cut.textContent = s.cutFiller ? UQ.captions.fillerCount(s.transcript) : 0;
  },

  /* Commit / force full re-sync to voice from the current script. */
  async applyScript() {
    const s = this.state;
    const ta = UQ.ui.el('#transcript');
    const text = (ta ? ta.value : s.draft || '').trim();
    if (!text) return UQ.ui.toast('Script is empty — paste or transcribe first');
    s.draft = text;
    s.transcript = text;
    clearTimeout(this._scriptTimer);

    s.timedWords = UQ.captions.retimefromScript(text, {
      timedWords: s.timedWords,
      segments: s.vocalSync ? s.segments : null,
      speechTotal: s.speechTotal,
      duration: s.duration
    });
    this.recompute();
    this.renderAll();

    if (s.file && s.vocalSync) {
      s.note = 'Re-matching your script to the voice…';
      this.renderSyncCard();
      await this.analyse();
      s.timedWords = UQ.captions.retimefromScript(s.transcript, {
        segments: s.segments,
        speechTotal: s.speechTotal,
        duration: s.duration
      });
      /* Use energy segment placement after analyse for best fit */
      if (s.segments && s.speechTotal > 0.2) s.timedWords = null;
      this.recompute();
      this.renderAll();
      UQ.ui.toast('Captions adjusted to your script');
    } else {
      UQ.ui.toast('Captions adjusted to your script');
    }
  },

  resetScript() {
    const s = this.state;
    s.draft = s.transcript;
    const ta = UQ.ui.el('#transcript');
    if (ta) ta.value = s.transcript;
    this.onScriptEdit();
    UQ.ui.toast('Edits discarded');
  },

  /* ---------- project ---------- */
  saveProject() {
    const s = this.state;
    const list = UQ.db.saveProject(this.user.id, {
      id: s.projectId,
      name: s.filename || 'Untitled draft',
      tpl: s.style.tpl,
      ratio: s.style.ratio,
      transcript: s.transcript,
      lines: s.lines.length,
      dur: UQ.ui.clock(s.duration),
      synced: !!(s.vocalSync && s.segments)
    });
    s.projectId = list[0].id;
    UQ.db.addEvent(this.user.id, { icon: '▤', tone: 'purple', text: 'Saved “' + (s.filename || 'Untitled draft') + '”' });
    UQ.ui.toast('Project saved');
  },

  /* ---------- render ---------- */
  renderAll() {
    this.renderHeader();
    this.renderStage();
    this.renderTransport();
    this.renderSyncCard();
    this.renderStylePanel();
    this.renderTextPanel();
    this.renderExportPanel();
    this.paintFrame(true);
  },

  renderHeader() {
    const tpl = UQ.config.templates.find(t => t.id === this.state.style.tpl);
    UQ.ui.el('#clipName').textContent = this.state.filename || 'Untitled draft';
    UQ.ui.el('#tplBadge').textContent = tpl.name + ' · ' + tpl.kind;
    UQ.ui.els('[data-ratio]').forEach(b => b.classList.toggle('is-on', b.dataset.ratio === this.state.style.ratio));
  },

  renderStage() {
    const s = this.state;
    const cls = { '9:16': 'stage--916', '1:1': 'stage--11', '16:9': 'stage--169' }[s.style.ratio];
    this.stage.className = 'stage ' + cls;
    UQ.captions.applyStyle(this.stage, s.style);
    UQ.ui.el('#stageEmpty').classList.toggle('hidden', !!s.url);
    this.video.classList.toggle('hidden', !s.url);
    UQ.ui.el('#capResize').classList.toggle('hidden', !s.url);
    UQ.ui.el('#safeBox').classList.toggle('hidden', !s.safe);
    UQ.ui.el('#watermark').classList.toggle('hidden', this.user.plan !== 'Free');
    UQ.ui.el('#safeBtn').classList.toggle('is-on', s.safe);
  },

  renderTransport() {
    const s = this.state;
    UQ.ui.el('#playBtn').textContent = s.playing ? '❚❚' : '▶';
    UQ.ui.el('#timeLabel').textContent = UQ.ui.clock(s.time) + ' / ' + UQ.ui.clock(s.duration || 8);
    const pct = Math.min(100, (s.time / (s.duration || 8)) * 100);
    UQ.ui.el('#scrubFill').style.width = pct + '%';
    UQ.ui.el('#scrubHead').style.left = 'calc(' + pct + '% - 7px)';

    const strip = UQ.ui.el('#voiceStrip');
    const on = !!(s.vocalSync && s.segments);
    strip.classList.toggle('hidden', !on);
    if (on) {
      UQ.ui.el('#voiceRail').innerHTML = s.segments.map(seg => {
        const left = (seg.start / (s.duration || 8)) * 100;
        const width = Math.max(.4, ((seg.end - seg.start) / (s.duration || 8)) * 100);
        return '<div class="voice-strip__seg" style="left:' + left + '%;width:' + width + '%"></div>';
      }).join('');
    }

    UQ.ui.el('#wordChips').innerHTML = s.lines.map(l =>
      l.words.map(w => '<button class="word-chip" data-seek="' + l.start.toFixed(3) + '">' + UQ.ui.esc(w) + '</button>').join('')
    ).join('');
    UQ.ui.els('[data-seek]', UQ.ui.el('#wordChips')).forEach(b =>
      b.addEventListener('click', () => this.seek(parseFloat(b.dataset.seek) + .01)));
  },

  renderSyncCard() {
    const s = this.state;
    const synced = !!(s.vocalSync && (s.timedWords || s.segments));
    UQ.ui.els('[data-sync-chip]').forEach(el => {
      el.textContent = s.timedWords ? 'Exact voice match' : synced ? 'Voice-synced' : 'Even spacing';
      el.className = 'badge ' + (synced || s.timedWords ? 'badge--teal' : '') + ' ';
      el.setAttribute('data-sync-chip', '');
    });
    UQ.ui.els('[data-sync-note]').forEach(el => {
      el.textContent = s.note || (s.timedWords
        ? 'Every word is locked to the spoken audio. Edit the script and Apply to re-match.'
        : synced ? 'Timing is locked to the detected voice.' : 'Captions stay evenly spaced until the audio is analysed.');
    });
    UQ.ui.el('#vocalToggle').classList.toggle('is-on', s.vocalSync);
    UQ.ui.el('#sensValue').textContent = s.sensitivity <= 3 ? 'Low — only clear speech' : s.sensitivity >= 8 ? 'High — catches quiet talking' : 'Balanced';
    UQ.ui.el('#analyseBtn').textContent = s.analysing ? 'Analysing…' : s.segments ? 'Re-analyse audio' : 'Analyse audio & sync';
    UQ.ui.el('#listenBtn').textContent = s.analysing ? 'Working…' : 'Auto-caption from clip';
    const live = UQ.ui.el('#liveText');
    live.classList.toggle('hidden', !s.live);
    live.textContent = s.live;
  },

  renderStylePanel() {
    const s = this.state, st = s.style;
    const sel = UQ.ui.el('#tplSelect');
    if (!sel.options.length) {
      sel.innerHTML = UQ.config.templates.map(t => '<option value="' + t.id + '">' + t.name + ' — ' + t.kind + '</option>').join('');
      sel.addEventListener('change', () => {
        st.tpl = sel.value;
        this.applyTemplateRhythm(st.tpl);   // regroup the captions for this style
        this.recompute();
        this.renderHeader();
        this.renderStage();
        this.renderStylePanel();
        this.renderTransport();
        this.renderTextPanel();
        this.paintFrame(true);
      });

      const fonts = UQ.ui.el('#fontPicker');
      fonts.innerHTML = (UQ.config.captionFonts || []).map(f =>
        '<button type="button" class="chip" data-font="' + f.id + '" style="font-family:' + f.stack + '">' + f.name + '</button>'
      ).join('');

      const emojis = UQ.ui.el('#emojiPicker');
      emojis.innerHTML = (UQ.config.captionEmojis || []).map(e =>
        '<button type="button" class="chip chip--emoji" data-emoji="' + e + '">' + (e || 'none') + '</button>'
      ).join('');

      const bind = (id, key, fn) => UQ.ui.el(id).addEventListener('input', e => {
        st[key] = fn(e.target.value);
        this.recompute();
        this.renderStage();
        this.renderStylePanel();
        this.renderTransport();
        this.paintFrame(true);
      });
      bind('#sizeRange', 'size', parseFloat);
      bind('#posRange', 'pos', parseInt);
      bind('#strokeRange', 'stroke', parseInt);
      bind('#speedRange', 'speed', parseFloat);
      bind('#wplRange', 'wpl', parseInt);

      fonts.addEventListener('click', e => {
        const b = e.target.closest('[data-font]');
        if (!b) return;
        st.font = b.dataset.font;
        this.renderStage();
        this.renderStylePanel();
        this.paintFrame(true);
      });
      emojis.addEventListener('click', e => {
        const b = e.target.closest('[data-emoji]');
        if (!b) return;
        st.emoji = b.dataset.emoji;
        this.renderStylePanel();
        this.paintFrame(true);
      });
      UQ.ui.els('[data-color]').forEach(b => b.addEventListener('click', () => { st.color = b.dataset.color; this.renderStage(); this.renderStylePanel(); }));
      UQ.ui.els('[data-hl]').forEach(b => b.addEventListener('click', () => { st.hl = b.dataset.hl; this.renderStage(); this.renderStylePanel(); }));
      UQ.ui.el('#shadowToggle').addEventListener('click', () => { st.shadow = !st.shadow; this.renderStage(); this.renderStylePanel(); });
      UQ.ui.el('#upperToggle').addEventListener('click', () => { st.upper = !st.upper; this.renderStylePanel(); this.paintFrame(true); });
    }

    sel.value = st.tpl;
    UQ.ui.el('#sizeRange').value = st.size;
    UQ.ui.el('#posRange').value = st.pos;
    UQ.ui.el('#strokeRange').value = st.stroke;
    UQ.ui.el('#speedRange').value = st.speed;
    UQ.ui.el('#wplRange').value = st.wpl;
    UQ.ui.el('#sizeValue').textContent = st.size + '%';
    UQ.ui.el('#posValue').textContent = st.pos + '%';
    UQ.ui.el('#strokeValue').textContent = st.stroke === 0 ? 'off' : st.stroke;
    UQ.ui.el('#speedValue').textContent = st.speed.toFixed(1) + '×';
    UQ.ui.el('#wplValue').textContent = st.wpl;
    UQ.ui.el('#shadowState').textContent = st.shadow ? 'on' : 'off';
    UQ.ui.el('#upperState').textContent = st.upper ? 'on' : 'off';
    UQ.ui.el('#shadowToggle').classList.toggle('is-on', st.shadow);
    UQ.ui.el('#upperToggle').classList.toggle('is-on', st.upper);
    UQ.ui.els('[data-font]').forEach(b => b.classList.toggle('is-on', b.dataset.font === st.font));
    UQ.ui.els('[data-color]').forEach(b => b.classList.toggle('is-on', b.dataset.color === st.color));
    UQ.ui.els('[data-hl]').forEach(b => b.classList.toggle('is-on', b.dataset.hl === st.hl));
    UQ.ui.els('[data-emoji]').forEach(b => b.classList.toggle('is-on', b.dataset.emoji === st.emoji));
  },

  renderTextPanel() {
    const s = this.state;
    const ta = UQ.ui.el('#transcript');
    if (!ta.dataset.bound) {
      ta.dataset.bound = '1';
      ta.value = s.draft || s.transcript;
      ta.addEventListener('input', () => this.onScriptEdit());
      UQ.ui.el('#applyScriptBtn').addEventListener('click', () => this.applyScript());
      UQ.ui.el('#hinglishBtn').addEventListener('click', () => this.convertToHinglish());
      UQ.ui.el('#resetScriptBtn').addEventListener('click', () => this.resetScript());
      UQ.ui.el('#fillerToggle').addEventListener('click', () => { s.cutFiller = !s.cutFiller; this.recompute(); this.renderAll(); });
      UQ.ui.el('#vocalToggle').addEventListener('click', () => {
        s.vocalSync = !s.vocalSync;
        s.note = s.vocalSync
          ? (s.segments ? 'Vocal sync back on — captions follow the voice.' : 'Vocal sync on — analysing the clip…')
          : 'Vocal sync off — captions are spread evenly across the clip.';
        if (s.vocalSync && !s.segments && s.file) this.analyse();
        this.recompute();
        this.renderAll();
      });
      const sens = UQ.ui.el('#sensRange');
      sens.addEventListener('input', () => { s.sensitivity = parseInt(sens.value, 10); this.renderSyncCard(); });
      sens.addEventListener('change', () => { if (s.file) this.analyse(); });
      UQ.ui.el('#analyseBtn').addEventListener('click', () => this.analyse());
      UQ.ui.el('#listenBtn').addEventListener('click', () => this.captionize());
      UQ.ui.el('#dictateBtn').addEventListener('click', () => this.transcribe('mic'));
      UQ.ui.el('#diagBtn2').addEventListener('click', () => UQ.diag.open(s.file));
    }
    if (document.activeElement !== ta) ta.value = s.draft || s.transcript;

    UQ.ui.el('#fillerToggle').classList.toggle('is-on', s.cutFiller);
    UQ.ui.el('#fillerState').textContent = s.cutFiller ? 'on' : 'off';
    UQ.ui.el('#sensRange').value = s.sensitivity;
    this._paintScriptMeta();
  },

  renderExportPanel() {
    const s = this.state, paid = this.user.plan !== 'Free';
    UQ.ui.el('#exportRatio').textContent = 'MP4 · ' + s.style.ratio;
    UQ.ui.el('#exportQuality').textContent = paid ? '4K · no watermark' : '720p · corner mark';
    UQ.ui.el('#exportNote').textContent = paid
      ? 'Clean export at up to 4K — no watermark, full bitrate.'
      : 'Free exports carry a small corner mark and cap at 720p. Any credit pack removes both.';
    UQ.ui.el('#renderFill').style.width = s.renderPct + '%';
    UQ.ui.el('#renderBtn').textContent = s.rendering
      ? 'Rendering ' + Math.round(s.renderPct) + '%'
      : s.renderDone && s.renderUrl ? 'Download MP4 again'
      : s.renderDone ? 'Render again' : 'Render burned-in MP4';
    UQ.ui.el('#renderCost').textContent = s.renderDone
      ? 'Done · ' + this.user.minutes + ' min left'
      : 'Uses ' + (Math.round((s.duration || 30) / 6) / 10 || 0.5) + ' min of credit';

    if (!UQ.ui.el('#renderBtn').dataset.bound) {
      UQ.ui.el('#renderBtn').dataset.bound = '1';
      UQ.ui.el('#renderBtn').addEventListener('click', () => this.render());
      const files = { srt: '#dlSrt', vtt: '#dlVtt', txt: '#dlTxt' };
      Object.entries(files).forEach(([kind, sel]) => UQ.ui.el(sel).addEventListener('click', () =>
        UQ.exporter.captionFile(kind, this.state.lines, { upper: this.state.style.upper, filename: this.state.filename })));
    }

    this.renderTranslatePanel();
  },

  renderTranslatePanel() {
    const s = this.state;
    const sel = UQ.ui.el('#translateLang');
    const btn = UQ.ui.el('#translateBtn');
    const note = UQ.ui.el('#translateNote');
    const dl = UQ.ui.el('#translateDownloads');
    if (!sel || !btn) return;

    if (!sel.dataset.bound) {
      sel.dataset.bound = '1';
      sel.innerHTML = (UQ.config.translateLangs || [])
        .map(l => '<option value="' + l.code + '">' + l.name + '</option>').join('');
      sel.value = 'hi';
      sel.addEventListener('change', () => {
        /* A different target invalidates whatever was translated before. */
        s.translatedLines = null;
        s.translatedLang = '';
        this.renderTranslatePanel();
      });
      btn.addEventListener('click', () => this.translateCaptions());
    }

    btn.disabled = s.translating || !s.lines.length;
    btn.textContent = s.translating ? 'Translating…'
      : !s.lines.length ? 'Generate captions first'
      : s.translatedLines ? 'Translate again'
      : 'Translate this clip’s captions';

    if (s.translatedLines && s.translatedLang === sel.value) {
      const langName = (UQ.config.translateLangs.find(l => l.code === s.translatedLang) || {}).name || s.translatedLang;
      note.textContent = 'Ready in ' + langName + ' — same timing, translated text.';
      dl.classList.remove('hidden');
      dl.innerHTML = ['srt', 'vtt', 'txt'].map(kind =>
        '<button class="dl-row" data-tkind="' + kind + '"><span>Download ' + langName + ' .' + kind + '</span><span style="color:#6D34E8">↓</span></button>'
      ).join('');
      dl.querySelectorAll('[data-tkind]').forEach(b => b.addEventListener('click', () =>
        UQ.exporter.captionFile(b.dataset.tkind, s.translatedLines, {
          upper: s.style.upper,
          filename: (s.filename || 'uniqueness-captions') + '-' + s.translatedLang
        })));
    } else {
      dl.classList.add('hidden');
      dl.innerHTML = '';
      note.textContent = 'Same voice timing, translated text — same clip, another language.';
    }
  },

  async translateCaptions() {
    const s = this.state;
    if (s.translating || !s.lines.length) return;
    const target = UQ.ui.el('#translateLang').value;

    s.translating = true;
    this.renderTranslatePanel();

    try {
      if (!(await UQ.exporter.canTranslate())) {
        throw new Error('Translation needs the caption server — it may be waking up (free plan), try again in a moment.');
      }
      const res = await UQ.api.translate(s.lines, { target });
      s.translatedLines = res.lines;
      s.translatedLang = target;
      UQ.ui.toast(res.note || 'Captions translated');
    } catch (err) {
      console.warn('[translate]', err);
      UQ.diag.note(err);
      UQ.ui.toast(err.message || 'Translation failed');
    } finally {
      s.translating = false;
      this.renderTranslatePanel();
    }
  },

  render() {
    const s = this.state;
    if (s.rendering) return;
    /* Second click on a finished render downloads it again. */
    if (s.renderDone) {
      if (s.renderUrl) return this.downloadRender();
      s.renderDone = false; s.renderPct = 0;
      return this.renderExportPanel();
    }
    s.rendering = true;
    s.renderUrl = null;
    UQ.ui.progress.open('Rendering your video', 'Your captions are being added to the video — you can keep this open.', UQ.exporter.STEPS);

    const tpl = UQ.config.templates.find(t => t.id === s.style.tpl) || UQ.config.templates[0];
    UQ.exporter.renderVideo({
      file: s.file,
      lines: s.lines,
      style: s.style,
      template: tpl,
      filename: s.filename,
      duration: s.duration,
      uid: this.user.id,
      onProgress: (pct, step) => { s.renderPct = pct; UQ.ui.progress.set(pct, step); this.renderExportPanel(); },
      onError: err => {
        UQ.ui.progress.close();
        s.rendering = false;
        s.renderPct = 0;
        UQ.diag.note(err);
        this.showFailure('Render failed — ' + (err.message || err));
        this.renderExportPanel();
        UQ.ui.toast('Render failed');
      },
      onDone: (minutes, result) => {
        UQ.ui.progress.close();
        s.rendering = false;
        s.renderDone = true;
        s.renderUrl = (result && result.url) || null;
        s.renderName = (result && result.filename) || null;
        this.user = UQ.db.spendMinutes(this.user.id, minutes);
        UQ.db.addEvent(this.user.id, { icon: '↓', tone: 'teal', text: 'Rendered a video — ' + minutes + ' min used' });
        UQ.shell.refresh('editor', 'Caption editor');
        this.renderExportPanel();

        if (s.renderUrl) {
          this.downloadRender();
          UQ.ui.toast('Render finished · ' + minutes + ' min used');
        } else {
          /* Demo mode produced no file — say so instead of implying one. */
          this.showFailure('This was a preview run — no MP4 was produced. Burning captions into video needs the render server (see server/README.md). Your SRT, VTT and TXT downloads are real.');
          UQ.ui.toast('Preview only — no render server connected');
        }
      }
    });
  },

  downloadRender() {
    const s = this.state;
    if (!s.renderUrl) return;
    const a = document.createElement('a');
    a.href = s.renderUrl;
    a.download = s.renderName || 'captioned.mp4';
    document.body.appendChild(a);
    a.click();
    a.remove();
  },

  paintFrame(force) {
    if (force) this.cap.dataset.key = '';
    UQ.captions.render(this.cap, { lines: this.state.lines, time: this.state.time, style: this.state.style });
    if (force) return;
    const pct = Math.min(100, (this.state.time / (this.state.duration || 8)) * 100);
    UQ.ui.el('#scrubFill').style.width = pct + '%';
    UQ.ui.el('#scrubHead').style.left = 'calc(' + pct + '% - 7px)';
    UQ.ui.el('#timeLabel').textContent = UQ.ui.clock(this.state.time) + ' / ' + UQ.ui.clock(this.state.duration || 8);
  }
};

UQ.start(() => UQ.editor.init());
