/* ============================================================
   templates-page.js — templates.html (the style library)
   ============================================================ */

window.UQ = window.UQ || {};

UQ.templatesPage = {
  filter: 'All',

  init() {
    if (!UQ.shell.mount('templates', 'Templates')) return;
    this.renderFilters();
    this.renderGrid();
  },

  kinds() { return ['All'].concat(UQ.config.templates.map(t => t.kind)); },

  renderFilters() {
    UQ.ui.el('#filters').innerHTML = this.kinds()
      .map(k => '<button class="chip' + (k === this.filter ? ' is-on' : '') + '" data-filter="' + k + '">' + k + '</button>').join('');
    UQ.ui.els('[data-filter]').forEach(b => b.addEventListener('click', () => {
      this.filter = b.dataset.filter;
      this.renderFilters();
      this.renderGrid();
    }));
  },

  /* The 11 cards are in templates.html now, so this only decides which
     are on screen. Building them here was what kept every style name out
     of the HTML — a style library that a crawler sees as an empty div. */
  renderGrid() {
    document.querySelectorAll('#tplGrid .tpl-card').forEach(card => {
      const show = this.filter === 'All' || card.dataset.kind === this.filter;
      card.classList.toggle('hidden', !show);
    });
  }
};

UQ.start(() => UQ.templatesPage.init());
