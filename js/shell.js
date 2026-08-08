/* ============================================================
   shell.js — renders the sidebar + topbar on every app page
   and guards pages that need a signed-in user.

   Usage inside an app page:
     UQ.shell.mount('dashboard', 'Dashboard');
   ============================================================ */

window.UQ = window.UQ || {};

UQ.shell = {
  user: null,

  /* Redirects to login.html when nobody is signed in. */
  requireUser() {
    const u = UQ.db.currentUser();
    if (!u) { location.href = 'login.html'; return null; }
    this.user = u;
    return u;
  },

  mount(activeId, title) {
    const u = this.requireUser();
    if (!u) return null;
    this.renderSidebar(activeId);
    this.renderTopbar(title);
    return u;
  },

  refresh(activeId, title) {
    this.user = UQ.db.currentUser();
    this.renderSidebar(activeId);
    this.renderTopbar(title);
  },

  renderSidebar(activeId) {
    const host = UQ.ui.el('#sidebar');
    if (!host) return;
    const u = this.user, cfg = UQ.config;
    const pct = Math.max(3, Math.min(100, (u.minutes / Math.max(u.minutes, 60)) * 100));

    host.innerHTML =
      '<div class="sidebar__logo">' +
        '<button data-home><img src="' + cfg.brand.logo + '" alt="' + cfg.brand.name + ' — dashboard" /></button>' +
        '<button class="sidebar__close" data-close>✕</button>' +
      '</div>' +
      '<div class="sidebar__cta"><button class="btn btn--primary btn--block" data-upload><span>↑</span> Upload media</button></div>' +
      cfg.nav.map(section =>
        '<div class="sidebar__group">' + section.group.toUpperCase() + '</div>' +
        '<nav class="sidebar__nav">' +
          section.items.map(it =>
            '<a class="nav-item' + (it.id === activeId ? ' is-active' : '') + '" href="' + it.href + '">' +
              '<span class="ico">' + it.icon + '</span> ' + it.label +
            '</a>').join('') +
        '</nav>').join('') +
      '<div class="sidebar__foot">' +
        '<div class="credit-card">' +
          '<div class="row" style="margin-bottom:9px"><span style="color:var(--purple)">✦</span>' +
            '<span style="font-size:13px;font-weight:700">' + UQ.ui.esc(u.plan) + ' plan</span></div>' +
          '<div style="display:flex;align-items:baseline;gap:5px;margin-bottom:9px">' +
            '<span style="font-size:21px;font-weight:800;letter-spacing:-.03em;color:var(--purple-deep)">' + u.minutes + '</span>' +
            '<span style="font-size:11.5px;color:var(--mut)">minutes left</span></div>' +
          '<div class="credit-card__meter"><div class="credit-card__fill" style="width:' + pct + '%"></div></div>' +
          '<a class="btn btn--primary btn--block btn--sm" href="credits.html">Top up minutes</a>' +
        '</div>' +
        '<div class="who">' +
          '<div class="avatar" style="width:32px;height:32px;border-radius:50%;background:var(--grad);color:#fff;display:grid;place-items:center;font-size:12.5px;font-weight:700;flex-shrink:0">' + this.initial() + '</div>' +
          '<div class="grow"><div style="font-size:12.5px;font-weight:700">' + UQ.ui.esc(u.name) + '</div>' +
            '<div class="who__mail">' + UQ.ui.esc(u.email) + '</div></div>' +
          '<button data-signout title="Sign out" style="color:var(--faint);font-size:13px">⏻</button>' +
        '</div>' +
      '</div>';

    host.querySelector('[data-home]').addEventListener('click', () => { location.href = 'dashboard.html'; });
    host.querySelector('[data-close]').addEventListener('click', () => this.closeMenu());
    host.querySelector('[data-signout]').addEventListener('click', () => {
      UQ.db.signOut();
      location.href = 'index.html';
    });
    host.querySelector('[data-upload]').addEventListener('click', () => {
      /* Open the picker right here when this page owns one — the click is a
         real user gesture, and Chrome refuses to open a file dialog without
         one. Only pages with no picker of their own navigate to the editor. */
      const input = document.getElementById('fileInput');
      if (input) { input.click(); return; }
      location.href = 'editor.html?pick=1';
    });
  },

  renderTopbar(title) {
    const host = UQ.ui.el('#topbar');
    if (!host) return;
    const u = this.user;
    host.innerHTML =
      '<button class="topbar__burger" data-burger>☰</button>' +
      '<span class="topbar__title">' + UQ.ui.esc(title) + '</span>' +
      '<div class="grow"></div>' +
      '<a href="credits.html" style="display:flex;align-items:center;gap:8px;padding:7px 13px;border:1px solid #E7E3F8;border-radius:99px;background:#F7F3FF">' +
        '<span style="color:var(--purple);font-size:11px">✦</span>' +
        '<span style="font-size:12px;font-weight:700;color:var(--purple-deep)">' + u.minutes + ' min</span></a>' +
      '<div style="width:34px;height:34px;border-radius:50%;background:var(--grad);color:#fff;display:grid;place-items:center;font-size:13px;font-weight:700">' + this.initial() + '</div>';

    host.querySelector('[data-burger]').addEventListener('click', () => this.openMenu());

    let scrim = UQ.ui.el('.scrim');
    if (!scrim) {
      scrim = UQ.ui.make('div', { class: 'scrim' });
      document.body.appendChild(scrim);
      scrim.addEventListener('click', () => this.closeMenu());
    }
  },

  initial() { return (this.user && this.user.name ? this.user.name.trim().charAt(0) : 'U').toUpperCase(); },
  openMenu() { UQ.ui.el('#sidebar').classList.add('is-open'); UQ.ui.el('.scrim').classList.add('is-open'); },
  closeMenu() { UQ.ui.el('#sidebar').classList.remove('is-open'); UQ.ui.el('.scrim').classList.remove('is-open'); }
};
