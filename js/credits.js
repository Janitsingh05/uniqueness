/* ============================================================
   credits.js — credits.html
   Plan cards, the checkout modal and billing history.

   💳 To go live: replace `pay()` with your payment gateway
   (Razorpay / Stripe). On a successful webhook, call
   UQ.db.addMinutes + UQ.db.addOrder exactly as it does here.
   ============================================================ */

window.UQ = window.UQ || {};

UQ.credits = {
  billing: 'packs',
  method: 'upi',

  init() {
    const user = UQ.shell.mount('credits', 'Credits & plans');
    if (!user) return;
    this.user = user;

    if (new URLSearchParams(location.search).get('welcome')) {
      const box = UQ.ui.el('#welcome');
      box.classList.remove('hidden');
      UQ.ui.el('#welcomeText').textContent =
        'Welcome, ' + (user.name || '').split(' ')[0] + ' — ' + user.minutes +
        ' free minutes are already in your account. Pick a pack when you need more.';
      UQ.ui.el('#dismissWelcome').addEventListener('click', () => box.classList.add('hidden'));
    }

    UQ.ui.els('[data-billing]').forEach(b => b.addEventListener('click', () => {
      this.billing = b.dataset.billing;
      UQ.ui.els('[data-billing]').forEach(x => x.classList.toggle('is-on', x === b));
      this.renderPlans();
    }));

    this.renderPlans();
    this.renderHistory();
  },

  plans() { return this.billing === 'packs' ? UQ.config.packs : UQ.config.monthly; },

  renderPlans() {
    const u = this.user;
    UQ.ui.el('#plans').innerHTML = this.plans().map((p, i) => {
      const own = p.free ? u.plan === 'Free' : u.plan === p.tier;
      const badge = own ? 'YOUR PLAN' : (p.badge || '');
      const badgeCls = own ? 'plan__badge plan__badge--own' : p.hot ? 'plan__badge plan__badge--hot' : 'plan__badge';
      return '<div class="plan' + (p.hot ? ' plan--hot' : '') + '">' +
        (badge ? '<span class="' + badgeCls + '">' + badge + '</span>' : '') +
        '<div class="plan__name">' + p.name + '</div>' +
        '<div class="plan__blurb">' + p.blurb + '</div>' +
        '<div class="plan__price"><b>' + p.price + '</b><span class="faint" style="font-size:12.5px">' + p.unit + '</span></div>' +
        '<div class="plan__rate">' + p.rate + '</div>' +
        '<div class="plan__mins">' + p.minutes + '</div>' +
        '<div class="plan__feats">' + p.features.map(f => '<div class="plan__feat"><i>✓</i><span>' + f + '</span></div>').join('') + '</div>' +
        '<button class="btn btn--block ' + (own || p.free ? 'btn--quiet' : 'btn--primary') + '"' +
          (own || p.free ? ' disabled' : ' data-buy="' + i + '"') + '>' +
          (own ? 'Current plan' : p.free ? 'Free forever' : 'Buy ' + p.add + ' minutes') +
        '</button>' +
      '</div>';
    }).join('');

    UQ.ui.els('[data-buy]').forEach(b =>
      b.addEventListener('click', () => this.openCheckout(this.plans()[parseInt(b.dataset.buy, 10)])));
  },

  renderHistory() {
    const orders = UQ.db.orders(this.user.id);
    const card = UQ.ui.el('#history');
    if (!orders.length) { card.classList.add('hidden'); return; }
    card.classList.remove('hidden');
    UQ.ui.el('#historyRows').innerHTML = orders.map(o =>
      '<div class="list-row" style="cursor:default">' +
        '<span class="feed-item__icon">✦</span>' +
        '<span class="grow"><span class="list-row__name">' + UQ.ui.esc(o.name) + '</span>' +
        '<span class="list-row__meta">' + UQ.ui.date(o.at) + ' · ' + (o.method || 'upi').toUpperCase() + '</span></span>' +
        '<span class="badge badge--teal">+' + o.minutes + ' min</span>' +
        '<span style="font-size:13.5px;font-weight:700">' + o.price + '</span>' +
      '</div>').join('');
  },

  openCheckout(plan) {
    this.method = 'upi';
    const modal = UQ.ui.modal(
      '<div class="spread" style="margin-bottom:18px"><span class="modal__title">Checkout</span>' +
        '<button data-x style="color:var(--faint);font-size:14px">✕</button></div>' +
      '<div class="spread" style="padding:15px;border-radius:15px;background:#F9F6FF;border:1px solid #E7E3F8;margin-bottom:16px">' +
        '<div><div style="font-size:14px;font-weight:700;margin-bottom:4px">' + plan.name + '</div>' +
        '<div style="font-size:12px;color:var(--mut)">' + plan.add + ' minutes of credit</div></div>' +
        '<div style="font-size:22px;font-weight:800;letter-spacing:-.03em">' + plan.price + '</div></div>' +
      '<div class="eyebrow" style="margin-bottom:10px">Pay with</div>' +
      '<div class="row" style="gap:7px;margin-bottom:14px">' +
        '<button class="chip is-on" data-m="upi">UPI</button><button class="chip" data-m="card">Card</button></div>' +
      '<div data-fields></div>' +
      '<div class="inset-row" style="margin-bottom:16px"><span class="muted">Total</span><b>' + plan.price + ' incl. GST</b></div>' +
      '<button class="btn btn--primary btn--block" data-pay>Pay ' + plan.price + '</button>' +
      '<div style="font-size:11.5px;color:var(--faint);margin-top:12px;line-height:1.55">Demo checkout — no real charge is made. Credits land in your account immediately.</div>',
      { dismissible: true }
    );

    const fields = modal.querySelector('[data-fields]');
    const paint = () => {
      fields.innerHTML = this.method === 'upi'
        ? '<input class="input" placeholder="yourname@bank" style="margin-bottom:14px" />'
        : '<input class="input" placeholder="Card number" style="margin-bottom:9px" />' +
          '<div class="row" style="gap:9px;margin-bottom:14px"><input class="input" placeholder="MM / YY" />' +
          '<input class="input" placeholder="CVV" style="width:110px" /></div>';
    };
    paint();

    modal.querySelectorAll('[data-m]').forEach(b => b.addEventListener('click', () => {
      this.method = b.dataset.m;
      modal.querySelectorAll('[data-m]').forEach(x => x.classList.toggle('is-on', x === b));
      paint();
    }));
    modal.querySelector('[data-x]').addEventListener('click', () => modal.remove());
    modal.querySelector('[data-pay]').addEventListener('click', e => this.pay(plan, modal, e.currentTarget));
  },

  pay(plan, modal, btn) {
    btn.classList.add('btn--busy');
    btn.textContent = 'Processing…';
    setTimeout(() => {
      this.user = UQ.db.addMinutes(this.user.id, plan.add);
      this.user = UQ.db.updateUser(this.user.id, { plan: plan.tier });
      UQ.db.addOrder(this.user.id, { name: plan.name, price: plan.price, minutes: plan.add, method: this.method });
      UQ.db.addEvent(this.user.id, { icon: '✦', tone: 'teal', text: plan.name + ' bought — ' + plan.add + ' minutes added' });

      modal.querySelector('.modal').innerHTML =
        '<div style="text-align:center"><div class="tick">✓</div>' +
        '<div class="modal__title" style="margin-bottom:8px">Payment successful</div>' +
        '<div class="modal__sub" style="margin-bottom:20px">' + plan.add + ' minutes added. Watermark is off and exports are clean from now on.</div>' +
        '<div class="inset-row" style="margin-bottom:18px"><span class="muted">Balance now</span><b>' + this.user.minutes + ' min</b></div>' +
        '<a class="btn btn--primary btn--block" href="editor.html" style="margin-bottom:9px">Back to the editor</a>' +
        '<button class="btn btn--quiet btn--block" data-close>Stay on this page</button></div>';
      modal.querySelector('[data-close]').addEventListener('click', () => modal.remove());

      UQ.shell.refresh('credits', 'Credits & plans');
      this.renderPlans();
      this.renderHistory();
    }, 1400);
  }
};

UQ.start(() => UQ.credits.init());
