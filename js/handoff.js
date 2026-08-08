/* ============================================================
   handoff.js — carries an uploaded clip between pages.

   A File object cannot travel in a URL, and it does not survive
   a page navigation. IndexedDB can store a Blob as-is, so the
   dashboard parks the dropped file here and the editor picks it
   up on load — no re-picking, no server.
   ============================================================ */

window.UQ = window.UQ || {};

UQ.handoff = {
  DB: 'uq_handoff_v1',
  STORE: 'files',
  KEY: 'pending',

  supported() { return typeof indexedDB !== 'undefined'; },

  _open() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(this.DB, 1);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(this.STORE)) db.createObjectStore(this.STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  },

  _tx(mode, run) {
    return this._open().then(db => new Promise((resolve, reject) => {
      const tx = db.transaction(this.STORE, mode);
      const store = tx.objectStore(this.STORE);
      let out;
      const req = run(store);
      if (req) req.onsuccess = () => { out = req.result; };
      tx.oncomplete = () => { db.close(); resolve(out); };
      tx.onerror = () => { db.close(); reject(tx.error); };
    }));
  },

  /* Park a file for the next page. Resolves true when it is safely stored. */
  async put(file) {
    if (!file || !this.supported()) return false;
    try {
      await this._tx('readwrite', store => store.put({ file, name: file.name, at: Date.now() }, this.KEY));
      return true;
    } catch (e) {
      console.warn('Handoff store failed', e);
      return false;
    }
  },

  /* Read the parked file and clear it, so a refresh does not re-load it.
     Anything older than 5 minutes is treated as stale. */
  async take() {
    if (!this.supported()) return null;
    let row = null;
    try {
      row = await this._tx('readonly', store => store.get(this.KEY));
      await this._tx('readwrite', store => store.delete(this.KEY));
    } catch (e) {
      return null;
    }
    if (!row || !row.file) return null;
    if (Date.now() - (row.at || 0) > 5 * 60 * 1000) return null;
    return row.file;
  },

  /* Accept anything the browser calls video/audio, and fall back to the
     extension — Windows hands over some clips with an empty MIME type. */
  isMedia(file) {
    if (!file) return false;
    if (/^(video|audio)\//i.test(file.type || '')) return true;
    return /\.(mp4|m4v|mov|webm|mkv|avi|mpg|mpeg|3gp|m4a|mp3|wav|aac|ogg|oga|opus|flac)$/i.test(file.name || '');
  }
};
