/* ============================================================
   landing.js — index.html public page controller.
   Renders live style tiles, pricing preview, and FAQ from config.
   ============================================================ */

window.UQ = window.UQ || {};

UQ.landing = {
  init() {
    this.renderStyles();
    this.renderPricing();
    this.renderFaq();
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

  renderPricing() {
    const host = document.getElementById('pricingPreview');
    if (!host) return;
    const plans = UQ.config.monthly || [];
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

  renderFaq() {
    const host = document.getElementById('faqList');
    if (!host) return;
    const items = UQ.config.faq || [];
    host.innerHTML = items.map((item, i) =>
      '<div class="faq-item">' +
        '<button class="faq-item__q" type="button" aria-expanded="false" data-faq="' + i + '">' +
          '<span>' + item.q + '</span><span class="faq-item__icon">+</span>' +
        '</button>' +
        '<div class="faq-item__a hidden">' + item.a + '</div>' +
      '</div>'
    ).join('');

    host.querySelectorAll('[data-faq]').forEach(btn => {
      btn.addEventListener('click', () => {
        const open = btn.getAttribute('aria-expanded') === 'true';
        host.querySelectorAll('[data-faq]').forEach(b => {
          b.setAttribute('aria-expanded', 'false');
          b.parentElement.querySelector('.faq-item__a').classList.add('hidden');
          b.querySelector('.faq-item__icon').textContent = '+';
        });
        if (!open) {
          btn.setAttribute('aria-expanded', 'true');
          btn.parentElement.querySelector('.faq-item__a').classList.remove('hidden');
          btn.querySelector('.faq-item__icon').textContent = '−';
        }
      });
    });
  }
};

document.addEventListener('DOMContentLoaded', () => UQ.landing.init());
