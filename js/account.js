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

    /* Real names from referralHits/{code}/members — same doc creditReferral
       marks converted:true on, so "Bought credits" here is the actual
       server-verified event, not a guess. No email shown (kept off this
       doc on purpose, see firestore.rules), but the name is usually enough
       to recognise who joined through the link. */
    const listHost = UQ.ui.el('#referralsList');
    listHost.innerHTML = refs.length
      ? refs.slice().sort((a, b) => (b.created || 0) - (a.created || 0)).map(r =>
          '<div class="list-row"><span class="grow">' +
            '<span class="list-row__name">' + UQ.ui.esc(r.name || 'Someone') + '</span>' +
            '<span class="list-row__meta">Joined ' + UQ.ui.ago(r.created || Date.now()) + '</span></span>' +
            '<span class="badge' + (r.converted ? ' badge--teal' : '') + '">' + (r.converted ? 'Bought credits' : 'Signed up') + '</span>' +
          '</div>').join('')
      : '<div class="empty"><div class="empty__title">No referrals yet</div>' +
        '<div class="empty__body">Share your link above — signups show up here the moment they join.</div></div>';

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

/* ---------------- Export & workflow ---------------- */
/* Was the "editor plugins" page: a waitlist for panels that do not exist.
   The page now leads with the exports that do work, so there is no list to
   build and nothing to store — mounting the shell is the whole job. */
UQ.plugins = {
  init() {
    UQ.shell.mount('plugins', 'Export & workflow');
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

/* One shared file, three pages — each page's own markup says which
   controller it needs. Matches every other page's own
   `UQ.start(() => UQ.xyz.init())` at the bottom of its controller file;
   this file just can't hardcode which one, so it picks by DOM instead. */
UQ.start(() => {
  if (document.getElementById('refLink')) return UQ.refer.init();
  if (document.getElementById('workflowPage')) return UQ.plugins.init();
  if (document.getElementById('toggles')) return UQ.settings.init();
});
