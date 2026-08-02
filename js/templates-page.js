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

  renderGrid() {
    const list = UQ.config.templates.filter(t => this.filter === 'All' || t.kind === this.filter);
    UQ.ui.el('#tplGrid').innerHTML = list.map(t => UQ.previews.card(t)).join('');
    UQ.ui.els('[data-tpl]', UQ.ui.el('#tplGrid')).forEach(b =>
      b.addEventListener('click', () => { location.href = 'editor.html?tpl=' + b.dataset.tpl; }));
  }
};

UQ.start(() => UQ.templatesPage.init());
