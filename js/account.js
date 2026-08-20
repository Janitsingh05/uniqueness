/* ============================================================
   account.js — refer.html, plugins.html, settings.html
   Three small pages sharing one file.
   ============================================================ */

window.UQ = window.UQ || {};

/* ---------------- Refer & earn ----------------
   referralAvailable/referralEarned live on the user doc in paise, written
   only by the server (server/src/lib/credits.js creditReferral) the moment
   a Razorpay payment from someone this account referred is signature-
   verified — firestore.rules blocks writing those two fields from the
   client entirely. Nothing here computes or trusts an earned amount on
   its own; this page only ever displays what the server already decided. */
UQ.refer = {
  async init() {
    const user = UQ.shell.mount('refer', 'Refer & earn');
    if (!user) return;
    const cfg = UQ.config.referral;
    const link = 'https://' + UQ.config.brand.domain + '/?r=' + user.code;
    const refs = UQ.db.referrals(user.code);
    const converted = refs.filter(r => r.converted).length;
    const availablePaise = Number(user.referralAvailable) || 0;
    const earnedPaise = Number(user.referralEarned) || 0;
    const available = Math.round(availablePaise / 100);
    const earned = Math.round(earnedPaise / 100);

    UQ.ui.el('#refLink').value = link;
    UQ.ui.el('#refCode').textContent = user.code;
    UQ.ui.el('#mJoined').textContent = refs.length;
    UQ.ui.el('#mPaid').textContent = converted;
    UQ.ui.el('#mAvailable').textContent = UQ.ui.money(available);
    UQ.ui.el('#mLifetime').textContent = UQ.ui.money(earned);

    UQ.ui.el('#copyLink').addEventListener('click', async e => {
      try { await navigator.clipboard.writeText(link); } catch (err) {}
      e.currentTarget.textContent = 'Copied ✓';
      e.currentTarget.classList.add('btn--done');
      setTimeout(() => { e.currentTarget.textContent = 'Copy link'; e.currentTarget.classList.remove('btn--done'); }, 1800);
    });

    const payout = UQ.ui.el('#payoutBtn');
    const setIdle = () => { payout.textContent = available >= cfg.minPayout ? 'Request ' + UQ.ui.money(available) : 'Nothing to withdraw yet'; };
    setIdle();

    let pending = null;
    try { pending = await UQ.db.pendingPayoutRequest(user.id); } catch (err) {}
    if (pending) {
      payout.textContent = UQ.ui.money(Math.round((Number(pending.amount) || 0) / 100)) + ' requested — clears in 3 days';
      payout.classList.add('btn--done');
      payout.disabled = true;
    }

    payout.addEventListener('click', async () => {
      if (payout.disabled) return;
      if (available < cfg.minPayout) return UQ.ui.toast('Minimum payout is ' + UQ.ui.money(cfg.minPayout));
      payout.disabled = true;
      payout.textContent = 'Requesting…';
      try {
        await UQ.db.requestPayout(user.id, availablePaise);
        payout.textContent = UQ.ui.money(available) + ' requested — clears in 3 days';
        payout.classList.add('btn--done');
      } catch (err) {
        payout.disabled = false;
        setIdle();
        UQ.ui.toast(err.message || 'Could not submit the payout request.');
      }
    });
  }
};

/* ---------------- Plugins ---------------- */
UQ.plugins = {
  init() {
    if (!UQ.shell.mount('plugins', 'Plugins')) return;
    const saved = JSON.parse(localStorage.getItem('uq_plugin_waitlist') || '{}');
    UQ.ui.el('#integrations').innerHTML = UQ.config.integrations.map(i =>
      '<div class="integration"><div class="integration__logo">' + i.short + '</div>' +
      '<div class="grow"><div style="font-size:13.5px;font-weight:700">' + i.name + '</div>' +
      '<div style="font-size:11.5px;color:var(--faint)" data-status="' + i.key + '">' + (saved[i.key] ? 'On the list' : 'Roadmap') + '</div></div>' +
      '<button class="btn btn--sm ' + (saved[i.key] ? 'btn--done' : 'btn--quiet') + '" data-notify="' + i.key + '">' +
      (saved[i.key] ? 'Added ✓' : 'Notify me') + '</button></div>').join('');

    UQ.ui.els('[data-notify]').forEach(b => b.addEventListener('click', () => {
      const key = b.dataset.notify;
      saved[key] = !saved[key];
      localStorage.setItem('uq_plugin_waitlist', JSON.stringify(saved));
      b.textContent = saved[key] ? 'Added ✓' : 'Notify me';
      b.className = 'btn btn--sm ' + (saved[key] ? 'btn--done' : 'btn--quiet');
      UQ.ui.el('[data-status="' + key + '"]').textContent = saved[key] ? 'On the list' : 'Roadmap';
    }));
  }
};

/* ---------------- Settings ---------------- */
UQ.settings = {
  KEY: 'uq_settings_v1',
  defaults: { auto: true, filler: true, hd: true, reduce: false, lang: 'Auto-detect' },

  init() {
    const user = UQ.shell.mount('settings', 'Settings');
    if (!user) return;
    this.user = user;
    this.values = Object.assign({}, this.defaults, JSON.parse(localStorage.getItem(this.KEY) || '{}'));

    const rows = [
      { key: 'auto', name: 'Auto-caption on upload', desc: 'Analyse the voice the moment a clip lands.' },
      { key: 'filler', name: 'Pre-select filler words', desc: 'Mark “um”, “uh”, “like” for cutting.' },
      { key: 'hd', name: 'Highest quality export', desc: 'Use the max bitrate your plan allows.' },
      { key: 'reduce', name: 'Reduce motion', desc: 'Calmer transitions across the interface.' }
    ];
    UQ.ui.el('#toggles').innerHTML = rows.map(r =>
      '<div class="setting"><div class="grow"><div class="setting__name">' + r.name + '</div>' +
      '<div class="setting__desc">' + r.desc + '</div></div>' +
      '<button class="switch' + (this.values[r.key] ? ' is-on' : '') + '" data-key="' + r.key + '"><span></span></button></div>').join('') +
      '<div class="setting"><div class="grow"><div class="setting__name">Transcription language</div>' +
      '<div class="setting__desc">Auto-detect recognises the language on its own — Hindi audio is captioned in Hinglish automatically. Only pick one below if a clip needs a hint.</div></div>' +
      '<select class="select" id="langSelect" style="width:auto">' +
      Object.keys(UQ.config.speechLangs).map(l => '<option' + (l === this.values.lang ? ' selected' : '') + '>' + l + '</option>').join('') +
      '</select></div>';

    UQ.ui.els('[data-key]').forEach(b => b.addEventListener('click', () => {
      this.values[b.dataset.key] = !this.values[b.dataset.key];
      b.classList.toggle('is-on', this.values[b.dataset.key]);
      this.save();
    }));
    UQ.ui.el('#langSelect').addEventListener('change', e => { this.values.lang = e.target.value; this.save(); });

    UQ.ui.el('#profileInitial').textContent = (user.name || 'U').charAt(0).toUpperCase();
    UQ.ui.el('#profileName').textContent = user.name;
    UQ.ui.el('#profileEmail').textContent = user.email;
    UQ.ui.el('#profilePlan').textContent = user.plan;
    UQ.ui.el('#profileMinutes').textContent = user.minutes;
    UQ.ui.el('#profileSince').textContent = UQ.ui.date(user.created);
    UQ.ui.el('#defaultStyle').textContent = (UQ.config.templates.find(t => t.id === UQ.config.defaultStyle.tpl) || {}).name || '—';
    UQ.ui.el('#signOutBtn').addEventListener('click', () => { UQ.db.signOut(); location.href = 'index.html'; });
  },

  save() { localStorage.setItem(this.KEY, JSON.stringify(this.values)); UQ.ui.toast('Settings saved'); }
};
