/* ============================================================
   api.js — optional backend client.

   The studio is designed to work with nothing behind it: Whisper runs
   in the browser and subtitle files are generated locally. A backend
   adds two things the browser cannot do well — server-side speech-to-
   text, and a real burned-in MP4 via FFmpeg.

   Set UQ.config.api.baseUrl to switch it on. Everything here fails
   soft: if the server is missing, slow or misconfigured, callers fall
   back to the in-browser path and the user never hits a dead end.
   ============================================================ */

window.UQ = window.UQ || {};

UQ.api = {
  _health: null,
  _sttOff: null,          // reason server transcription was given up on
  OVERRIDE_KEY: 'uq_api_base',

  /* Resolution order: ?api= on the URL, then a saved override, then
     config. The URL param is how you point a local page at a local
     server without committing localhost into the deployed config —
     an https:// site cannot call http://localhost anyway. */
  base() {
    const cfg = (UQ.config && UQ.config.api) || {};
    let saved = '';
    try {
      const param = new URLSearchParams(location.search).get('api');
      if (param !== null) {
        if (param) localStorage.setItem(this.OVERRIDE_KEY, param);
        else localStorage.removeItem(this.OVERRIDE_KEY);
      }
      saved = localStorage.getItem(this.OVERRIDE_KEY) || '';
    } catch (e) {}
    return String(saved || cfg.baseUrl || '').replace(/\/+$/, '');
  },

  /* Called when the server's speech-to-text is configured but unusable
     (no credit, bad key). Without this every clip would be uploaded in
     full, rejected, then transcribed in the browser anyway. */
  disableTranscribe(reason) {
    this._sttOff = reason || 'unavailable';
    if (this._health) this._health.transcribe = false;
  },
  transcribeDisabled() { return this._sttOff; },

  configured() { return !!this.base(); },

  url(path) { return this.base() + path; },

  /* Ask the server what it can do. Cached for the page's lifetime, and
     never throws — a dead backend just reports everything off. */
  async health(force) {
    if (!this.configured()) return { ok: false, transcribe: false, render: false, reason: 'no backend configured' };
    if (this._health && !force) {
      if (this._sttOff) this._health.transcribe = false;
      return this._health;
    }

    const timeoutMs = ((UQ.config.api && UQ.config.api.healthTimeoutMs) || 4000);
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), timeoutMs);
      const res = await fetch(this.url('/api/health'), { signal: ctrl.signal });
      clearTimeout(timer);
      if (!res.ok) throw new Error('health ' + res.status);
      this._health = Object.assign({ ok: true }, await res.json());
    } catch (e) {
      this._health = { ok: false, transcribe: false, render: false, reason: e.name === 'AbortError' ? 'timed out' : e.message };
    }
    if (this._sttOff) this._health.transcribe = false;
    return this._health;
  },

  /* A quota or key problem will not fix itself mid-session; a network
     blip might. Only the former stops us trying again. */
  isPermanentSttError(err) {
    return /quota|credit|billing|API key|not configured/i.test((err && err.message) || '');
  },

  async _json(res) {
    const body = await res.text();
    let data = null;
    try { data = body ? JSON.parse(body) : null; } catch (e) {}
    if (!res.ok) throw new Error((data && data.error) || `Server returned ${res.status}`);
    return data;
  },

  /* transcribe(file, { language, onProgress })
     -> { text, timedWords: [{text,start,end}], duration, note }
     Shaped exactly like UQ.whisper.transcribe so editor.js can swap them. */
  async transcribe(file, opts) {
    opts = opts || {};
    const form = new FormData();
    form.append('clip', file, file.name);
    if (opts.language) form.append('language', opts.language);

    /* Upload progress is the only part we can measure, so XHR beats
       fetch here — fetch cannot report request progress. */
    const data = await new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open('POST', this.url('/api/transcribe'));
      xhr.responseType = 'text';
      xhr.upload.onprogress = e => {
        if (!e.lengthComputable || !opts.onProgress) return;
        opts.onProgress(Math.round((e.loaded / e.total) * 55), 0);
      };
      xhr.onload = () => {
        let parsed = null;
        try { parsed = JSON.parse(xhr.responseText || 'null'); } catch (e) {}
        if (xhr.status >= 200 && xhr.status < 300) return resolve(parsed);
        reject(Object.assign(
          new Error((parsed && parsed.error) || `Server returned ${xhr.status}`),
          { code: parsed && parsed.code }
        ));
      };
      xhr.onerror = () => reject(new Error('Could not reach the caption server.'));
      xhr.ontimeout = () => reject(new Error('The caption server took too long.'));
      xhr.timeout = (UQ.config.api && UQ.config.api.transcribeTimeoutMs) || 15 * 60 * 1000;
      if (opts.onProgress) opts.onProgress(4, 0);
      xhr.send(form);
    });

    if (opts.onProgress) opts.onProgress(95, 2);
    return {
      text: (data && data.text) || '',
      timedWords: (data && data.words) || [],
      duration: (data && data.duration) || 0,
      note: (data && data.note) || ''
    };
  },

  /* startRender(file, { lines, style, template, filename }) -> job */
  async startRender(file, payload) {
    const form = new FormData();
    form.append('clip', file, file.name);
    form.append('payload', JSON.stringify(payload));
    const res = await fetch(this.url('/api/render'), { method: 'POST', body: form });
    return this._json(res);
  },

  async renderStatus(id) {
    const res = await fetch(this.url('/api/render/' + encodeURIComponent(id)));
    return this._json(res);
  },

  downloadUrl(job) {
    return job && job.downloadUrl ? this.base() + job.downloadUrl : null;
  },

  /* Poll a render to completion. onTick(job) fires on every poll. */
  async waitForRender(id, onTick) {
    const every = (UQ.config.api && UQ.config.api.pollMs) || 1500;
    for (;;) {
      const job = await this.renderStatus(id);
      if (onTick) onTick(job);
      if (job.status === 'done') return job;
      if (job.status === 'error') throw new Error(job.error || 'Render failed.');
      await new Promise(r => setTimeout(r, every));
    }
  }
};
