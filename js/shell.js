/* ============================================================
   shell.js — renders the sidebar + topbar on every app page
   and guards pages that need a signed-in user.

   Usage inside an app page:
     UQ.shell.mount('dashboard', 'Dashboard');
   ============================================================ */

window.UQ = window.UQ || {};

UQ.shell = {
  user: null,

  /* Redirects to login.html when nobody is signed in, remembering where
     they were headed so login can send them back instead of dumping
     everyone on the dashboard. UQ.start() has already awaited Firebase's
     auth state by the time this runs, so a null user here means really
     signed out — not "not resolved yet". */
  requireUser() {
    const u = UQ.db.currentUser();
    if (!u) {
      const here = location.pathname.split('/').pop() || 'dashboard.html';
      const dest = here.replace(/\.html$/, '');
      location.replace('login.html?redirect=' + encodeURIComponent(dest));
      return null;
    }
    this.user = u;
    document.documentElement.removeAttribute('data-auth-pending');
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
          this.avatarHtml(32) +
          '<div class="grow"><div style="font-size:12.5px;font-weight:700">' + UQ.ui.esc(u.name) + '</div>' +
            '<div class="who__mail">' + UQ.ui.esc(u.email) + '</div></div>' +
          '<button data-signout title="Sign out" style="color:var(--faint);font-size:13px">⏻</button>' +
        '</div>' +
        /* The app pages have a sidebar, not a footer, so the legal links
           live here — every signed-in page needs to reach them, and
           Razorpay expects them reachable from anywhere on the site. */
        '<div class="sidebar__legal">' +
          '<a href="privacy.html">Privacy</a><a href="terms.html">Terms</a>' +
          '<a href="refund.html">Refunds</a><a href="contact.html">Contact</a>' +
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
      this.avatarHtml(34);

    host.querySelector('[data-burger]').addEventListener('click', () => this.openMenu());

    let scrim = UQ.ui.el('.scrim');
    if (!scrim) {
      scrim = UQ.ui.make('div', { class: 'scrim' });
      document.body.appendChild(scrim);
      scrim.addEventListener('click', () => this.closeMenu());
    }
  },

  initial() { return (this.user && this.user.name ? this.user.name.trim().charAt(0) : 'U').toUpperCase(); },

  /* Google's profile photo when signed in that way and it loaded; the
     plain letter circle otherwise — same as before this existed. */
  avatarHtml(size) {
    const url = this.user && this.user.photoURL;
    if (!url) return this._letterAvatarHtml(size);
    return '<img src="' + UQ.ui.esc(url) + '" alt="" referrerpolicy="no-referrer" data-avatar-size="' + size + '" ' +
      'style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;object-fit:cover;flex-shrink:0" ' +
      'onerror="UQ.shell.onAvatarError(this)" />';
  },
  /* Broken/blocked photo URL (deleted account, offline, etc.) — swap back
     to the letter circle rather than showing a broken-image icon. */
  onAvatarError(img) {
    img.outerHTML = this._letterAvatarHtml(Number(img.dataset.avatarSize) || 32);
  },
  _letterAvatarHtml(size) {
    return '<div class="avatar" style="width:' + size + 'px;height:' + size + 'px;border-radius:50%;background:var(--grad);' +
      'color:#fff;display:grid;place-items:center;font-size:' + Math.round(size * 0.39) + 'px;font-weight:700;flex-shrink:0">' +
      this.initial() + '</div>';
  },
  openMenu() { UQ.ui.el('#sidebar').classList.add('is-open'); UQ.ui.el('.scrim').classList.add('is-open'); },
  closeMenu() { UQ.ui.el('#sidebar').classList.remove('is-open'); UQ.ui.el('.scrim').classList.remove('is-open'); }
};
