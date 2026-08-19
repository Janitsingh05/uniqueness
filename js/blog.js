/* ============================================================
   blog.js — nav drawer + scroll-reveal for /blog/ pages.
   Deliberately separate from landing.js: blog pages don't need
   the style-grid/pricing/FAQ rendering, just the shared nav chrome.
   ============================================================ */

window.UQ = window.UQ || {};

UQ.blog = {
  init() {
    this.bindNav();
    this.bindReveal();
  },

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
    }, { threshold: 0.1, rootMargin: '0px 0px -60px 0px' });
    els.forEach(el => io.observe(el));
  }
};

document.addEventListener('DOMContentLoaded', () => UQ.blog.init());
