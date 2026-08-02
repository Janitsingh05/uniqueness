/* ============================================================
   search.js — search.html
   Searches saved project names and their transcripts.
   ============================================================ */

window.UQ = window.UQ || {};

UQ.search = {
  init() {
    const user = UQ.shell.mount('search', 'Search');
    if (!user) return;
    this.user = user;
    this.input = UQ.ui.el('#q');
    this.input.addEventListener('input', () => this.run());
    this.run();
  },

  /* Rebuild caption lines for a project so we can show timecodes. */
  linesFor(project) {
    return UQ.captions.lines({
      words: UQ.captions.words(project.transcript, true),
      wordsPerLine: UQ.config.defaultStyle.wpl,
      duration: 0
    });
  },

  run() {
    const q = this.input.value.trim().toLowerCase();
    const projects = UQ.db.projects(this.user.id);
    const hits = [];

    projects.forEach(p => {
      if (!q || p.name.toLowerCase().includes(q)) {
        hits.push({ time: p.dur || '—', text: p.name, src: 'Project · ' + UQ.ui.ago(p.at), href: 'editor.html?project=' + p.id });
      }
      if (q) {
        this.linesFor(p).forEach(l => {
          const text = l.words.join(' ');
          if (text.toLowerCase().includes(q)) {
            hits.push({ time: UQ.ui.clock(l.start), text, src: p.name, href: 'editor.html?project=' + p.id });
          }
        });
      }
    });

    UQ.ui.el('#resultLabel').textContent = q
      ? hits.length + ' result' + (hits.length === 1 ? '' : 's') + ' for “' + this.input.value.trim() + '”'
      : 'YOUR SAVED PROJECTS';

    UQ.ui.el('#results').innerHTML = hits.length
      ? hits.slice(0, 40).map(h =>
        '<a class="card" style="display:flex;gap:14px;align-items:center;padding:15px 17px" href="' + h.href + '">' +
          '<span class="mono" style="font-size:11px;color:#6D34E8;flex-shrink:0">' + h.time + '</span>' +
          '<span class="grow"><span style="display:block;font-size:13.5px;margin-bottom:3px">' + UQ.ui.esc(h.text) + '</span>' +
          '<span style="display:block;font-size:11.5px;color:var(--faint)">' + UQ.ui.esc(h.src) + '</span></span>' +
          '<span style="color:var(--faint)">→</span></a>').join('')
      : '<div class="card empty"><div class="empty__title">' + (q ? 'No lines with that phrase' : 'Nothing saved yet') + '</div>' +
        '<div class="empty__body">' + (q ? 'Try a shorter keyword.' : 'Save a project in the editor and it becomes searchable here.') + '</div></div>';
  }
};

UQ.start(() => UQ.search.init());
