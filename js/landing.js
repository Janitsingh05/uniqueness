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
    this.bindPricingToggle();
    this.bindNav();
    this.bindReveal();
    this.bindCounters();
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

  renderPricing() {
    const host = document.getElementById('pricingPreview');
    if (!host) return;
    const plans = (this.billing === 'packs' ? UQ.config.packs : UQ.config.monthly) || [];
    host.innerHTML = plans.map(p =>
      '<article class="plan' + (p.hot ? ' plan--hot' : '') + '">' +
        (p.badge ? '<span class="plan__badge' + (p.hot ? ' plan__badge--hot' : '') + '">' + p.badge + '</span>' : '') +
        '<div class="plan__name">' + p.name + '</div>' +
        '<div class="plan__blurb">' + p.blurb + '</div>' +
        '<div class="plan__price"><b>' + p.price + '</b><span class="faint" style="font-size:12.5px">' + p.unit + '</span></div>' +
        '<div class="plan__rate">' + p.rate + '</div>' +
        '<div class="plan__mins">' + p.minutes + '</div>' +
        '<div class="plan__feats">' + p.features.slice(0, 4).map(f =>
          '<div class="plan__feat"><i>✓</i><span>' + f + '</span></div>'
        ).join('') + '</div>' +
        '<a class="btn btn--block ' + (p.free ? 'btn--quiet' : 'btn--primary') + '" href="' +
          (p.free ? 'login.html?mode=signup' : 'credits.html') + '">' +
          (p.free ? 'Start free' : 'Get ' + p.name) +
        '</a>' +
      '</article>'
    ).join('');
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

  renderFaq() {
    const host = document.getElementById('faqList');
    if (!host) return;
    const items = UQ.config.faq || [];
    host.innerHTML = items.map((item, i) =>
      '<div class="faq-item">' +
        '<button class="faq-item__q" type="button" aria-expanded="false" data-faq="' + i + '">' +
          '<span>' + item.q + '</span><span class="faq-item__icon">+</span>' +
        '</button>' +
        '<div class="faq-item__a"><div class="faq-item__a-inner">' + item.a + '</div></div>' +
      '</div>'
    ).join('');

    host.querySelectorAll('[data-faq]').forEach(btn => {
      btn.addEventListener('click', () => {
        const open = btn.getAttribute('aria-expanded') === 'true';
        host.querySelectorAll('[data-faq]').forEach(b => {
          b.setAttribute('aria-expanded', 'false');
          b.parentElement.classList.remove('is-open');
          b.querySelector('.faq-item__icon').textContent = '+';
        });
        if (!open) {
          btn.setAttribute('aria-expanded', 'true');
          btn.parentElement.classList.add('is-open');
          btn.querySelector('.faq-item__icon').textContent = '−';
        }
      });
    });
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
