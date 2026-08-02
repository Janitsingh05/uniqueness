/* ============================================================
   ui.js — small shared helpers: DOM building, formatting,
   the progress modal, and toasts.
   ============================================================ */

window.UQ = window.UQ || {};

UQ.ui = {
  /* ---------- DOM ---------- */
  el(sel, root) { return (root || document).querySelector(sel); },
  els(sel, root) { return Array.from((root || document).querySelectorAll(sel)); },
  make(tag, attrs, html) {
    const n = document.createElement(tag);
    Object.entries(attrs || {}).forEach(([k, v]) => {
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') n.className = v;
      else if (k === 'text') n.textContent = v;
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2).toLowerCase(), v);
      else n.setAttribute(k, v);
    });
    if (html !== undefined) n.innerHTML = html;
    return n;
  },
  esc(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); },

  /* ---------- formatting ---------- */
  clock(t) {
    t = Math.max(0, t || 0);
    return Math.floor(t / 60) + ':' + String(Math.floor(t % 60)).padStart(2, '0');
  },
  ago(ts) {
    const s = Math.max(1, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return 'just now';
    if (s < 3600) return Math.floor(s / 60) + 'm ago';
    if (s < 86400) return Math.floor(s / 3600) + 'h ago';
    return Math.floor(s / 86400) + 'd ago';
  },
  date(ts) { return new Date(ts).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }); },
  money(n) { return '₹' + Number(n || 0).toLocaleString('en-IN'); },

  /* ---------- toast ---------- */
  toast(msg) {
    let t = document.querySelector('.toast');
    if (!t) { t = this.make('div', { class: 'toast' }); document.body.appendChild(t); }
    t.textContent = msg;
    requestAnimationFrame(() => t.classList.add('is-on'));
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => t.classList.remove('is-on'), 2200);
  },

  /* ---------- progress modal ----------
     UQ.ui.progress.open('Generating captions', 'sub copy', ['step 1', 'step 2'])
     UQ.ui.progress.set(percent, stepIndex)
     UQ.ui.progress.close()
  */
  progress: {
    node: null,
    open(title, sub, steps) {
      this.close();
      const wrap = UQ.ui.make('div', { class: 'modal-scrim', 'data-progress': '' });
      wrap.innerHTML =
        '<div class="modal modal--narrow">' +
          '<div class="ring">' +
            '<svg viewBox="0 0 100 100"><circle class="ring__track" cx="50" cy="50" r="42"></circle>' +
            '<circle class="ring__bar" cx="50" cy="50" r="42" stroke-dashoffset="264"></circle></svg>' +
            '<div class="ring__pct">0%</div>' +
          '</div>' +
          '<div class="modal__title" style="margin-bottom:7px"></div>' +
          '<div class="modal__sub" style="margin-bottom:20px"></div>' +
          '<div class="steps" style="margin-bottom:18px"></div>' +
          '<button class="btn btn--quiet btn--block" data-hide>Hide and keep working</button>' +
        '</div>';
      wrap.querySelector('.modal__title').textContent = title;
      wrap.querySelector('.modal__sub').textContent = sub;
      wrap.querySelector('.steps').innerHTML = steps
        .map(s => '<div class="step"><span class="step__dot"></span><span>' + UQ.ui.esc(s) + '</span></div>').join('');
      wrap.querySelector('[data-hide]').addEventListener('click', () => this.close());
      document.body.appendChild(wrap);
      this.node = wrap;
    },
    set(pct, stepIndex) {
      if (!this.node) return;
      const p = Math.max(0, Math.min(100, pct));
      this.node.querySelector('.ring__bar').setAttribute('stroke-dashoffset', String(264 - (p / 100) * 264));
      this.node.querySelector('.ring__pct').textContent = Math.round(p) + '%';
      UQ.ui.els('.step', this.node).forEach((el, i) => {
        el.classList.toggle('is-done', i < stepIndex);
        el.classList.toggle('is-active', i === stepIndex);
        el.querySelector('.step__dot').textContent = i < stepIndex ? '✓' : i === stepIndex ? '●' : '';
      });
    },
    close() { if (this.node) { this.node.remove(); this.node = null; } }
  },

  /* ---------- generic modal ----------
     Returns the scrim element; call .remove() to dismiss. */
  modal(innerHtml, opts) {
    const wrap = this.make('div', { class: 'modal-scrim' });
    wrap.innerHTML = '<div class="modal ' + ((opts && opts.className) || '') + '">' + innerHtml + '</div>';
    wrap.addEventListener('click', e => { if (e.target === wrap && (!opts || opts.dismissible !== false)) wrap.remove(); });
    document.body.appendChild(wrap);
    return wrap;
  }
};
