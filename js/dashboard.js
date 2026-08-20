/* ============================================================
   dashboard.js — dashboard.html
   Hero + dropzone, live stats, real projects, activity feed,
   and the "start from a style" tiles.
   ============================================================ */

window.UQ = window.UQ || {};

UQ.dashboard = {
  init() {
    const user = UQ.shell.mount('dashboard', 'Dashboard');
    if (!user) return;
    this.user = user;

    UQ.ui.el('#today').textContent = new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });

    const input = UQ.ui.el('#fileInput');
    const zone = UQ.ui.el('#dropzone');
    zone.addEventListener('click', () => input.click());
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('is-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('is-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('is-over');
      if (e.dataTransfer.files && e.dataTransfer.files[0]) this.handoff(e.dataTransfer.files[0]);
    });
    input.addEventListener('change', e => { if (e.target.files[0]) this.handoff(e.target.files[0]); });
    UQ.ui.el('#uploadBtn').addEventListener('click', () => input.click());

    this.renderProjects();
    this.renderActivity();
    this.renderTiles();
  },

  /* Park the clip in IndexedDB and open the editor, which picks it up
     and starts captioning straight away. Nothing is re-picked. */
  async handoff(file) {
    if (!UQ.handoff.isMedia(file)) {
      UQ.ui.toast('That file is not a video or audio clip — try MP4, MOV, WEBM, M4A or WAV');
      return;
    }
    UQ.ui.toast('Opening the editor — captions start automatically');
    const parked = await UQ.handoff.put(file);
    location.href = parked ? 'editor.html?from=upload' : 'editor.html?pick=1';
  },

  renderProjects() {
    const list = UQ.db.projects(this.user.id);
    const host = UQ.ui.el('#projects');
    if (!list.length) {
      host.innerHTML =
        '<div class="empty"><div class="empty__title">No projects yet</div>' +
        '<div class="empty__body">Upload a clip, style it, then hit Save project in the editor.</div>' +
        '<button class="btn btn--primary btn--sm" id="firstUpload">Upload your first clip</button></div>';
      UQ.ui.el('#firstUpload').addEventListener('click', () => { location.href = 'editor.html?pick=1'; });
      return;
    }
    host.innerHTML = list.map(p => {
      const tpl = UQ.config.templates.find(t => t.id === p.tpl) || UQ.config.templates[0];
      return '<a class="list-row" href="editor.html?project=' + p.id + '">' +
        '<span class="list-row__thumb">' + p.ratio + '</span>' +
        '<span class="grow"><span class="list-row__name">' + UQ.ui.esc(p.name) + '</span>' +
        '<span class="list-row__meta">' + tpl.name + ' · ' + p.lines + ' lines · ' + UQ.ui.ago(p.at) + '</span></span>' +
        '<span style="font-size:12px;color:var(--mut)">' + (p.dur || '—') + '</span>' +
        '<span class="badge ' + (p.synced ? 'badge--teal' : '') + '">' + (p.synced ? 'Voice-synced' : 'Even spacing') + '</span>' +
      '</a>';
    }).join('');
  },

  renderActivity() {
    const events = UQ.db.events(this.user.id);
    UQ.ui.el('#activity').innerHTML = events.length
      ? events.map(e =>
        '<div class="feed-item"><span class="feed-item__icon' + (e.tone === 'teal' ? ' feed-item__icon--teal' : '') + '">' + e.icon + '</span>' +
        '<span class="grow"><span class="feed-item__text">' + UQ.ui.esc(e.text) + '</span>' +
        '<span class="feed-item__when">' + UQ.ui.ago(e.at) + '</span></span></div>').join('')
      : '<div class="empty__body" style="margin:0">Your uploads, renders and purchases will show up here.</div>';
  },

  renderTiles() {
    UQ.ui.el('#styleTiles').innerHTML =
      UQ.config.templates.map(t => UQ.previews.tile(t)).join('') +
      '<a class="tile--more" href="templates.html"><span style="font-size:20px;color:var(--purple)">✦</span>' +
      '<span style="font-size:13px;font-weight:700">Compare all styles</span>' +
      '<span style="font-size:11.5px;color:var(--faint);line-height:1.45">Filter by motion type in the library</span></a>';

    UQ.ui.els('[data-tpl]', UQ.ui.el('#styleTiles')).forEach(b =>
      b.addEventListener('click', () => { location.href = 'editor.html?tpl=' + b.dataset.tpl; }));
  }
};

UQ.start(() => UQ.dashboard.init());
