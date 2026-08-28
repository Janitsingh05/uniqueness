/* ============================================================
   landing.js — index.html public page controller.
   Renders live style tiles, pricing preview, and FAQ from config;
   drives the mobile nav drawer, sticky-nav shadow, scroll reveals,
   stat counters, and the monthly/one-time pricing toggle.
   ============================================================ */

window.UQ = window.UQ || {};

UQ.landing = {
  billing: 'monthly',

  init() {
    this.captureReferral();
    this.renderStyles();
    this.renderCompare();
    this.renderPricing();
    this.renderFaq();
    this.renderVoices();
    this.bindPricingToggle();
    this.bindNav();
    this.bindReveal();
    this.bindCounters();
    this.bindPreviewIdling();
  },

  /* Only animate the previews that are actually on screen. Eight loop on
     the homepage and eleven in the style gallery; running them all at once
     is real battery on the mid-range Android phones this audience uses.
     No IntersectionObserver (very old browser) means everything animates,
     which is exactly the behaviour this replaces — so nothing regresses. */
  bindPreviewIdling() {
    const tiles = document.querySelectorAll('.preview');
    if (!tiles.length) return;
    if (!('IntersectionObserver' in window)) return;

    tiles.forEach(t => t.classList.add('is-idle'));
    const io = new IntersectionObserver(entries => {
      entries.forEach(e => e.target.classList.toggle('is-idle', !e.isIntersecting));
    }, { rootMargin: '120px' });
    tiles.forEach(t => io.observe(t));
  },

  /* A refer-and-earn link points here (root domain + ?r=CODE), not
     straight at login.html — a visitor lands on this page first, then
     clicks through to actually sign up, and the query param does not
     ride along with that click by itself. Stash it in localStorage so
     it survives that navigation; login.html's auth.js reads it back if
     the URL it landed on has no ?r= of its own. Cleared once actually
     used for a signup (see auth.js), so it can't linger and attribute a
     later, unrelated account on the same browser. */
  captureReferral() {
    const ref = new URLSearchParams(location.search).get('r');
    if (ref) localStorage.setItem('uq_ref_code', ref.toUpperCase());
  },

  renderStyles() {
    const host = document.getElementById('styleGrid');
    if (!host || !UQ.previews) return;
    const list = UQ.config.templates.slice(0, 8);
    host.innerHTML = list.map(t =>
      '<a class="land-style" href="login.html?mode=signup&tpl=' + t.id + '">' +
        UQ.previews.box(t.id, true) +
        '<span class="land-style__name">' + t.name + '</span>' +
        '<span class="land-style__kind">' + t.kind + '</span>' +
      '</a>'
    ).join('');
  },

  /* The "before / after" strip on the compare section reuses the real
     preview engine — same markup the style gallery renders, so it's
     never out of sync with what the studio actually produces. */
  renderCompare() {
    const host = document.getElementById('compareAfter');
    if (!host || !UQ.previews) return;
    host.innerHTML = UQ.previews.box('bounce', true);
  },

  /* Both price tables are in the HTML now (see index.html) so they are
     readable with JavaScript off and by crawlers. This only chooses which
     one is on screen — it no longer builds the cards, which is what used
     to make the prices invisible to anything that does not run JS. */
  renderPricing() {
    const shown = this.billing === 'packs' ? 'packs' : 'monthly';
    document.querySelectorAll('[data-plans]').forEach(el => {
      el.classList.toggle('hidden', el.dataset.plans !== shown);
    });
  },

  /* Testimonials, if there are any. An empty UQ.config.testimonials leaves
     the section removed from the DOM entirely — the page is honest about
     having no social proof yet rather than filling the space with quotes
     nobody said. Populate the config and this renders itself. */
  renderVoices() {
    const section = document.getElementById('voices');
    if (!section) return;
    const list = (UQ.config.testimonials || []).filter(t => t && t.quote && t.name);
    if (!list.length) { section.remove(); return; }

    const esc = s => String(s).replace(/[&<>"]/g, c =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

    document.getElementById('voicesGrid').innerHTML = list.map(t =>
      '<figure class="card card--pad" style="margin:0">' +
        '<blockquote style="font-size:14px;line-height:1.65;color:var(--body);margin:0 0 14px">' +
          esc(t.quote) +
        '</blockquote>' +
        '<figcaption class="row" style="gap:10px">' +
          (t.avatar ? '<img src="' + esc(t.avatar) + '" alt="" width="34" height="34" loading="lazy" style="border-radius:50%;object-fit:cover" />' : '') +
          '<span><b style="display:block;font-size:13px">' + esc(t.name) + '</b>' +
          '<span style="font-size:12px;color:var(--mut)">' +
            [t.handle, t.role].filter(Boolean).map(esc).join(' · ') +
          '</span></span>' +
        '</figcaption>' +
      '</figure>').join('');
    section.classList.remove('hidden');
  },

  bindPricingToggle() {
    const host = document.getElementById('pricingToggle');
    if (!host) return;
    host.querySelectorAll('[data-billing]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (btn.dataset.billing === this.billing) return;
        this.billing = btn.dataset.billing;
        host.querySelectorAll('[data-billing]').forEach(b => b.classList.toggle('is-on', b === btn));
        this.renderPricing();
      });
    });
  },

  /* The FAQ is a list of <details> in the HTML — open/close is native, so
     there is nothing to bind and nothing to build. Kept as a no-op rather
     than deleted because init() calls it; the answers used to be injected
     here, which meant they were not in the page for crawlers to read.
     Only one panel open at a time, which is the one thing <details> does
     not do by itself. */
  renderFaq() {
    const items = Array.from(document.querySelectorAll('details.faq-item'));
    items.forEach(d => d.addEventListener('toggle', () => {
      if (!d.open) return;
      items.forEach(other => { if (other !== d) other.open = false; });
    }));
  },

  /* Sticky nav shadow on scroll + the mobile drawer. Both are optional —
     pages without these elements (there are none today, but future
     embeds might reuse landing.js) just skip straight past. */
  bindNav() {
    const nav = document.getElementById('siteNav');
    if (nav) {
      const onScroll = () => nav.classList.toggle('is-scrolled', window.scrollY > 8);
      onScroll();
      window.addEventListener('scroll', onScroll, { passive: true });
    }

    const burger = document.getElementById('navBurger');
    const drawer = document.getElementById('navDrawer');
    if (!burger || !drawer) return;
    const closeBtn = document.getElementById('navDrawerClose');
    const scrim = drawer.querySelector('.nav-drawer__scrim');

    const open = () => {
      drawer.classList.add('is-open');
      burger.classList.add('is-on');
      burger.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
    };
    const close = () => {
      drawer.classList.remove('is-open');
      burger.classList.remove('is-on');
      burger.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    };

    burger.addEventListener('click', () => (drawer.classList.contains('is-open') ? close() : open()));
    if (closeBtn) closeBtn.addEventListener('click', close);
    if (scrim) scrim.addEventListener('click', close);
    drawer.querySelectorAll('a').forEach(a => a.addEventListener('click', close));
    window.addEventListener('keydown', e => { if (e.key === 'Escape') close(); });
    window.addEventListener('resize', () => { if (window.innerWidth > 860) close(); });
  },

  /* Sections fade/slide in as they cross into view. Purely progressive:
     the "pending" (hidden) class is only ever applied here, in JS, so a
     page with JS disabled or IntersectionObserver missing just shows
     everything already-visible instead of stuck invisible. */
  bindReveal() {
    const els = document.querySelectorAll('.reveal');
    if (!els.length || !('IntersectionObserver' in window)) return;
    els.forEach(el => el.classList.add('reveal-pending'));
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        entry.target.classList.remove('reveal-pending');
        entry.target.classList.add('is-visible');
        io.unobserve(entry.target);
      });
    }, { threshold: 0.12, rootMargin: '0px 0px -60px 0px' });
    els.forEach(el => io.observe(el));
  },

  /* Counts stat numbers up from 0 the first time they scroll into view. */
  bindCounters() {
    const els = document.querySelectorAll('[data-count]');
    if (!els.length || !('IntersectionObserver' in window)) return;
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (!entry.isIntersecting) return;
        io.unobserve(entry.target);
        const target = parseInt(entry.target.dataset.count, 10) || 0;
        if (!target) return;
        const dur = 900;
        const start = performance.now();
        const step = (now) => {
          const p = Math.min(1, (now - start) / dur);
          const eased = 1 - Math.pow(1 - p, 3);
          entry.target.textContent = Math.round(eased * target);
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      });
    }, { threshold: 0.4 });
    els.forEach(el => io.observe(el));
  }
};

document.addEventListener('DOMContentLoaded', () => UQ.landing.init());
