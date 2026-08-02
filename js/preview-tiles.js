/* ============================================================
   preview-tiles.js — the animated caption previews used on the
   dashboard ("Start from a style") and the templates library.
   One place to edit the demo copy for all 11 styles.
   ============================================================ */

window.UQ = window.UQ || {};

UQ.previews = {
  markup: {
    punch:     '<span class="pv-punch">MONEY</span>',
    karaoke:   '<span class="pv-karaoke"><span>this</span> <span>changes</span> <span>everything</span></span>',
    chip:      '<span class="pv-chip"><span>watch</span><span>this</span><span>part</span></span>',
    neon:      '<span class="pv-neon">after hours</span>',
    build:     '<span class="pv-build"><span>one</span> <span>word</span> <span>at</span> <span>a</span> <span>time</span></span>',
    type:      '<span class="pv-type"><i>so here is the thing</i><b>_</b></span>',
    bounce:    '<span class="pv-bounce"><span>no</span> <span>way</span> <span>that</span> <span>worked</span></span>',
    meme:      '<span class="pv-meme">SAY LESS</span>',
    sweep:     '<span class="pv-sweep">go viral twice</span>',
    bar:       '<span class="pv-bar">clean, readable, broadcast-safe</span>',
    editorial: '<span class="pv-editorial">the quiet part, <em>out loud</em></span>'
  },

  /* A preview box for one template id. `tall` = library size. */
  box(id, tall) {
    const cls = 'preview' + (tall ? ' preview--tall' : '') + (id === 'bar' ? ' preview--bottom' : '');
    return '<div class="' + cls + '">' + (this.markup[id] || '') + '</div>';
  },

  /* Small card used on the dashboard. */
  tile(tpl) {
    return '<button class="tile" data-tpl="' + tpl.id + '">' +
      this.box(tpl.id, false) +
      '<div class="tile__cap"><span>' + tpl.name + '</span><span class="tile__kind">' + tpl.kind + '</span></div>' +
    '</button>';
  },

  /* Full card used in the templates library. */
  card(tpl) {
    const tag = tpl.tag === 'NEW'
      ? '<span class="badge badge--teal">NEW</span>'
      : tpl.tag ? '<span class="badge badge--grad">POPULAR</span>' : '';
    return '<div class="tpl-card" data-kind="' + tpl.kind + '">' +
      this.box(tpl.id, true) +
      '<div class="tpl-card__body">' +
        '<div class="spread"><span class="tpl-card__name">' + tpl.name + '</span>' + tag + '</div>' +
        '<div class="tpl-card__desc">' + tpl.desc + '</div>' +
        '<button class="btn btn--ghost btn--block btn--sm" data-tpl="' + tpl.id + '">Use style</button>' +
      '</div>' +
    '</div>';
  }
};
