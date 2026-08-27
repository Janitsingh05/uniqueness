/* ============================================================
   credits.js — credits.html
   Plan cards, checkout modal, billing history.

   Payment: UQ.payments (js/payments.js). When
   config.payments.enabled + keyId are set, pay() opens the
   gateway. Otherwise demo checkout grants minutes locally.
   ============================================================ */

window.UQ = window.UQ || {};

UQ.credits = {
  billing: 'monthly',
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
        ' free minutes are already in your account. Pick a plan when you need more.';
      UQ.ui.el('#dismissWelcome').addEventListener('click', () => box.classList.add('hidden'));
    }

    UQ.ui.els('[data-billing]').forEach(b => {
      b.classList.toggle('is-on', b.dataset.billing === this.billing);
      b.addEventListener('click', () => {
        this.billing = b.dataset.billing;
        UQ.ui.els('[data-billing]').forEach(x => x.classList.toggle('is-on', x === b));
        this.renderPlans();
      });
    });

    this.renderGatewayNote();
    this.renderPlans();
    this.renderHistory();
  },

  plans() { return this.billing === 'packs' ? UQ.config.packs : UQ.config.monthly; },

  renderGatewayNote() {
    const el = UQ.ui.el('#gatewayNote');
    if (!el) return;
    if (UQ.payments && UQ.payments.ready()) {
      el.textContent = 'Live checkout via ' + (UQ.config.payments.provider || 'Razorpay') + ' — UPI, cards & netbanking.';
    } else {
      /* Checkout is unreachable right now (gateway script blocked, or the
         key is not live). Say what that means for the reader — the fix is
         ours, not theirs, so the old build instructions that used to sit
         here did nothing but leak internals. */
      el.textContent = 'Checkout is temporarily unavailable. Your existing credits still work — please try again shortly, or get in touch and we will sort it out.';
    }
  },

  minutesLabel(plan) {
    if (plan.unlimited || plan.add < 0) return 'Unlimited';
    if (!plan.add) return 'Included free';
    return plan.add + ' minutes';
  },

  buyLabel(plan, own) {
    if (own) return 'Current plan';
    if (plan.free) return 'Free forever';
    if (plan.unlimited || plan.add < 0) return 'Get ' + plan.name;
    return 'Get ' + plan.name;
  },

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
          this.buyLabel(p, own) +
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
        '<span class="list-row__meta">' + UQ.ui.date(o.at) + ' · ' + (o.method || 'razorpay').toUpperCase() + '</span></span>' +
        '<span class="badge badge--teal">' + (o.unlimited ? 'Unlimited' : ('+' + o.minutes + ' min')) + '</span>' +
        '<span style="font-size:13.5px;font-weight:700">' + o.price + '</span>' +
      '</div>').join('');
  },

  openCheckout(plan) {
    /* Razorpay reports the method it actually took; until then this is
       just the label on the order row. */
    this.method = 'razorpay';
    const live = UQ.payments && UQ.payments.ready();
    const minsCopy = plan.unlimited || plan.add < 0
      ? 'Unlimited captioning'
      : this.minutesLabel(plan) + ' of credit';
    const note = live
      ? 'Secure checkout via ' + (UQ.config.payments.provider || 'Razorpay') + '.'
      : 'Checkout is temporarily unavailable — this run grants credit without a real charge.';

    const modal = UQ.ui.modal(
      '<div class="spread" style="margin-bottom:18px"><span class="modal__title">Checkout</span>' +
        '<button data-x style="color:var(--faint);font-size:14px">✕</button></div>' +
      '<div class="spread" style="padding:15px;border-radius:15px;background:#F9F6FF;border:1px solid #E7E3F8;margin-bottom:16px">' +
        '<div><div style="font-size:14px;font-weight:700;margin-bottom:4px">' + plan.name + '</div>' +
        '<div style="font-size:12px;color:var(--mut)">' + minsCopy + '</div></div>' +
        '<div style="font-size:22px;font-weight:800;letter-spacing:-.03em">' + plan.price + '</div></div>' +
      /* No payment fields here on purpose. This modal used to draw its own
         "Card number" and "CVV" inputs, and its own UPI box, none of which
         were ever read — Razorpay's checkout collects the real details on
         its own PCI-compliant page. Fields that look like they take a card
         number but silently discard it are both misleading and exactly the
         thing an audit flags, so the plan, the total and the button are all
         that belong here. */
      '<div style="font-size:12.5px;color:var(--mut);margin-bottom:16px;line-height:1.55">' +
        'UPI, cards, net banking and wallets are all accepted on the next screen.</div>' +
      /* No GST line: uniqueness is not GST-registered, so no tax is
         charged or collected and claiming a price is "inclusive of GST"
         would be a false statement on an invoice. Restore this only
         alongside a real GSTIN. */
      '<div class="inset-row" style="margin-bottom:16px"><span class="muted">Total</span><b>' + plan.price + '</b></div>' +
      '<button class="btn btn--primary btn--block" data-pay>' + (live ? 'Pay ' : 'Demo pay ') + plan.price + '</button>' +
      '<div style="font-size:11.5px;color:var(--faint);margin-top:12px;line-height:1.55">' + note + '</div>',
      { dismissible: true }
    );

    modal.querySelector('[data-x]').addEventListener('click', () => modal.remove());
    modal.querySelector('[data-pay]').addEventListener('click', e => this.pay(plan, modal, e.currentTarget));
  },

  /* After a real payment the server has already credited the account —
     server/src/lib/credits.js does it from the Razorpay verify call and
     again (idempotently) from the webhook. Adding the minutes here as
     well counted the same purchase twice, and firestore.rules now refuses
     the write anyway, so this reads the server's number instead.

     The local branch is the demo path only: no backend, no real charge. */
  async grant(plan) {
    const mins = (plan.unlimited || plan.add < 0) ? 99999 : plan.add;
    const server = await UQ.api.balance();
    if (server) {
      this.user = UQ.db.applyServerBalance(this.user.id, server.minutes);
      if (server.plan) this.user = Object.assign({}, this.user, { plan: server.plan });
    } else {
      this.user = UQ.db.addMinutes(this.user.id, mins);
      this.user = UQ.db.updateUser(this.user.id, { plan: plan.tier });
    }
    UQ.db.addOrder(this.user.id, {
      name: plan.name,
      price: plan.price,
      minutes: mins,
      unlimited: !!(plan.unlimited || plan.add < 0),
      method: this.method
    });
    UQ.db.addEvent(this.user.id, {
      icon: '◆',
      tone: 'teal',
      text: plan.name + ' activated — ' + ((plan.unlimited || plan.add < 0) ? 'unlimited captions' : (mins + ' minutes added'))
    });
  },

  showSuccess(plan, modal) {
    const bal = (plan.unlimited || plan.add < 0) ? 'Unlimited' : (this.user.minutes + ' min');
    modal.querySelector('.modal').innerHTML =
      '<div style="text-align:center"><div class="tick">✓</div>' +
      '<div class="modal__title" style="margin-bottom:8px">Payment successful</div>' +
      '<div class="modal__sub" style="margin-bottom:20px">Watermark is off and exports are clean from now on.</div>' +
      '<div class="inset-row" style="margin-bottom:18px"><span class="muted">Balance now</span><b>' + bal + '</b></div>' +
      '<a class="btn btn--primary btn--block" href="editor.html" style="margin-bottom:9px">Back to the editor</a>' +
      '<button class="btn btn--quiet btn--block" data-close>Stay on this page</button></div>';
    modal.querySelector('[data-close]').addEventListener('click', () => modal.remove());
    UQ.shell.refresh('credits', 'Credits & plans');
    this.renderPlans();
    this.renderHistory();
  },

  async pay(plan, modal, btn) {
    btn.classList.add('btn--busy');
    btn.textContent = 'Processing…';

    if (UQ.payments && UQ.payments.ready()) {
      try {
        await UQ.payments.checkout(plan, {
          billing: this.billing,
          uid: this.user.id,
          method: this.method,
          onSuccess: async () => {
            await this.grant(plan);
            this.showSuccess(plan, modal);
          },
          onDismiss: () => {
            btn.classList.remove('btn--busy');
            btn.textContent = 'Pay ' + plan.price;
          },
          onError: (err) => {
            btn.classList.remove('btn--busy');
            btn.textContent = 'Pay ' + plan.price;
            UQ.ui.toast((err && err.message) || 'Checkout failed');
          }
        });
      } catch (err) {
        btn.classList.remove('btn--busy');
        btn.textContent = 'Pay ' + plan.price;
        UQ.ui.toast((err && err.message) || 'Checkout failed');
      }
      return;
    }

    /* Demo path — gateway not connected yet */
    setTimeout(async () => {
      await this.grant(plan);
      this.showSuccess(plan, modal);
    }, 1100);
  }
};

UQ.start(() => UQ.credits.init());
