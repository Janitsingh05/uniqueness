/* ============================================================
   db.js — the data layer.

   Two modes:
     local    — localStorage (default, zero setup)
     firebase — Google Firebase Auth + Firestore (free Spark)

   Fill js/firebase-config.js to switch. Method names and return
   shapes stay the same so the rest of the app does not change.

   Always call UQ.start(fn) on each page so auth is ready first.
   ============================================================ */

window.UQ = window.UQ || {};

UQ.db = {
  KEY: 'uq_studio_db_v1',
  mode: 'local',          // 'local' | 'firebase'
  _user: null,            // firebase: hydrated profile
  _projects: [],
  _events: [],
  _orders: [],
  _referrals: [],
  _ready: null,
  _auth: null,
  _fs: null,

  /* ---------- boot ---------- */
  ready() {
    if (this._ready) return this._ready;
    this._ready = this._boot();
    return this._ready;
  },

  async _boot() {
    if (!UQ.firebaseEnabled() || typeof firebase === 'undefined') {
      this.mode = 'local';
      return 'local';
    }
    try {
      if (!firebase.apps.length) firebase.initializeApp(UQ.firebaseConfig);
      this._auth = firebase.auth();
      this._fs = firebase.firestore();
      this.mode = 'firebase';
      await new Promise(resolve => {
        const unsub = this._auth.onAuthStateChanged(async user => {
          unsub();
          if (user) await this._hydrate(user.uid);
          else this._clearCache();
          resolve();
        });
      });
      return 'firebase';
    } catch (err) {
      console.warn('Firebase failed — falling back to localStorage.', err);
      this.mode = 'local';
      return 'local';
    }
  },

  _clearCache() {
    this._user = null;
    this._projects = [];
    this._events = [];
    this._orders = [];
    this._referrals = [];
  },

  async _hydrate(uid) {
    const snap = await this._fs.collection('users').doc(uid).get();
    if (!snap.exists) {
      this._clearCache();
      return;
    }
    this._user = Object.assign({ id: uid }, snap.data());
    const [proj, ev, ord] = await Promise.all([
      this._fs.collection('users').doc(uid).collection('projects').orderBy('at', 'desc').limit(30).get(),
      this._fs.collection('users').doc(uid).collection('events').orderBy('at', 'desc').limit(12).get(),
      this._fs.collection('orders').where('user', '==', uid).limit(40).get()
    ]);
    this._projects = proj.docs.map(d => Object.assign({ id: d.id }, d.data()));
    this._events = ev.docs.map(d => Object.assign({ id: d.id }, d.data()));
    this._orders = ord.docs.map(d => Object.assign({ id: d.id }, d.data()))
      .sort((a, b) => (b.at || 0) - (a.at || 0));
    if (this._user.code) {
      try {
        const refs = await this._fs.collection('referralHits').doc(this._user.code).collection('members').limit(50).get();
        this._referrals = refs.docs.map(d => Object.assign({ id: d.id }, d.data()));
      } catch (e) {
        this._referrals = [];
      }
    }
  },

  /* Passwords are salted + SHA-256 hashed before they are stored.
     Firebase Auth hashes server-side — this is only for local mode. */
  async hash(password, salt) {
    const text = salt + '::' + password;
    try {
      const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
      return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (e) {
      let h = 0;
      for (let i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) | 0;
      return 'f' + (h >>> 0).toString(16);
    }
  },

  uid(prefix) { return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); },

  /* ---------- local helpers ---------- */
  read() {
    try {
      const raw = localStorage.getItem(this.KEY);
      const d = raw ? JSON.parse(raw) : null;
      return d && d.users ? d : this.blank();
    } catch (e) { return this.blank(); }
  },
  blank() { return { users: {}, projects: {}, events: {}, orders: [], session: null }; },
  write(d) { try { localStorage.setItem(this.KEY, JSON.stringify(d)); } catch (e) {} return d; },

  findByEmail(email) {
    const d = this.read(), mail = (email || '').trim().toLowerCase();
    return Object.values(d.users).find(u => u.email === mail) || null;
  },

  _makeCode(name) {
    return ((name || 'UQ').trim().split(/\s+/)[0] || 'UQ').toUpperCase().slice(0, 6) + (Math.floor(Math.random() * 90) + 10);
  },

  /* ---------- accounts ---------- */
  async signUp({ name, email, password, referral }) {
    if (this.mode === 'firebase') return this._fbSignUp({ name, email, password, referral });
    const d = this.read(), mail = (email || '').trim().toLowerCase();
    if (this.findByEmail(mail)) throw new Error('An account with this email already exists — sign in instead.');
    const salt = Math.random().toString(36).slice(2, 12);
    const user = {
      id: this.uid('usr'),
      name: (name || '').trim(),
      email: mail,
      salt,
      pw: await this.hash(password, salt),
      minutes: UQ.config.freeMinutes,
      plan: 'Free',
      code: this._makeCode(name),
      referredBy: (referral || '').trim().toUpperCase() || null,
      created: Date.now()
    };
    d.users[user.id] = user;
    d.session = user.id;
    d.events[user.id] = [{ icon: '✦', tone: 'teal', text: 'Account created — ' + user.minutes + ' free minutes added', at: Date.now() }];
    this.write(d);
    return user;
  },

  async _fbSignUp({ name, email, password, referral }) {
    const mail = (email || '').trim().toLowerCase();
    let cred;
    try {
      cred = await this._auth.createUserWithEmailAndPassword(mail, password);
    } catch (err) {
      if (err.code === 'auth/email-already-in-use') throw new Error('An account with this email already exists — sign in instead.');
      if (err.code === 'auth/weak-password') throw new Error('Password needs at least 6 characters.');
      throw new Error(err.message || 'Could not create account.');
    }
    const uid = cred.user.uid;
    const code = this._makeCode(name);
    const referredBy = (referral || '').trim().toUpperCase() || null;
    const profile = {
      name: (name || '').trim(),
      email: mail,
      minutes: referredBy ? (UQ.config.referral.freeMinutesForFriend || UQ.config.freeMinutes) : UQ.config.freeMinutes,
      plan: 'Free',
      code,
      referredBy,
      created: Date.now()
    };
    await this._fs.collection('users').doc(uid).set(profile);
    await this._fs.collection('codes').doc(code).set({ uid, at: Date.now() });
    await this._fs.collection('users').doc(uid).collection('events').add({
      icon: '✦', tone: 'teal', text: 'Account created — ' + profile.minutes + ' free minutes added', at: Date.now()
    });
    if (referredBy) {
      try {
        await this._fs.collection('referralHits').doc(referredBy).collection('members').doc(uid).set({
          name: profile.name,
          plan: profile.plan,
          created: profile.created
        });
      } catch (e) {}
    }
    await this._hydrate(uid);
    return this._user;
  },

  async signIn(email, password) {
    if (this.mode === 'firebase') return this._fbSignIn(email, password);
    const user = this.findByEmail(email);
    if (!user) throw new Error('No account with that email. Create one first.');
    if (await this.hash(password, user.salt) !== user.pw) throw new Error('Wrong password — try again.');
    const d = this.read();
    d.session = user.id;
    this.write(d);
    return user;
  },

  async _fbSignIn(email, password) {
    try {
      const cred = await this._auth.signInWithEmailAndPassword((email || '').trim().toLowerCase(), password);
      await this._hydrate(cred.user.uid);
      return this._user;
    } catch (err) {
      if (err.code === 'auth/user-not-found' || err.code === 'auth/invalid-credential')
        throw new Error('No account with that email. Create one first.');
      if (err.code === 'auth/wrong-password') throw new Error('Wrong password — try again.');
      throw new Error(err.message || 'Could not sign in.');
    }
  },

  /* One popup covers both "new visitor" and "returning user" — Firebase
     doesn't distinguish sign-up from sign-in for Google, so this checks
     Firestore itself and only writes a fresh profile the first time a
     given Google account shows up, exactly like _fbSignUp does. */
  async signInWithGoogle(referral) {
    if (this.mode !== 'firebase') {
      /* User-facing string: the fix is ours, not theirs. The operator note
         belongs in the console. */
      console.error('[auth] Google sign-in unavailable — Firebase is not connected (js/firebase-config.js).');
      throw new Error('Google sign-in is unavailable right now. Use your email and password instead.');
    }

    const provider = new firebase.auth.GoogleAuthProvider();
    let cred;
    try {
      cred = await this._auth.signInWithPopup(provider);
    } catch (err) {
      if (err.code === 'auth/popup-closed-by-user') throw new Error('Sign-in was closed before finishing.');
      if (err.code === 'auth/popup-blocked') throw new Error('Your browser blocked the sign-in popup — allow popups for this site and try again.');
      if (err.code === 'auth/account-exists-with-different-credential') throw new Error('An account with this email already exists using a different sign-in method — sign in with email/password instead.');
      /* The Google provider has to be switched on by hand in the Firebase
         console. Until it is, every click lands here — so say something
         useful and let auth.js take the dead button off the page. */
      if (err.code === 'auth/operation-not-allowed' || err.code === 'auth/configuration-not-found') {
        const e = new Error('Google sign-in is not available yet — create an account with your email instead, it takes a moment.');
        e.providerDisabled = true;
        throw e;
      }
      throw new Error(err.message || 'Could not sign in with Google.');
    }

    const uid = cred.user.uid;
    const snap = await this._fs.collection('users').doc(uid).get();
    const isNew = !snap.exists;
    if (isNew) {
      const name = cred.user.displayName || (cred.user.email || '').split('@')[0] || 'Creator';
      const code = this._makeCode(name);
      const referredBy = (referral || '').trim().toUpperCase() || null;
      const profile = {
        name,
        email: (cred.user.email || '').toLowerCase(),
        photoURL: cred.user.photoURL || null,
        minutes: referredBy ? (UQ.config.referral.freeMinutesForFriend || UQ.config.freeMinutes) : UQ.config.freeMinutes,
        plan: 'Free',
        code,
        referredBy,
        provider: 'google',
        created: Date.now()
      };
      await this._fs.collection('users').doc(uid).set(profile);
      await this._fs.collection('codes').doc(code).set({ uid, at: Date.now() });
      await this._fs.collection('users').doc(uid).collection('events').add({
        icon: '✦', tone: 'teal', text: 'Account created — ' + profile.minutes + ' free minutes added', at: Date.now()
      });
      if (referredBy) {
        try {
          await this._fs.collection('referralHits').doc(referredBy).collection('members').doc(uid).set({
            name: profile.name, plan: profile.plan, created: profile.created
          });
        } catch (e) {}
      }
    } else if (cred.user.photoURL && snap.data().photoURL !== cred.user.photoURL) {
      /* Backfill/refresh for accounts created before avatars were stored,
         and pick up a changed Google photo on any later sign-in. */
      await this._fs.collection('users').doc(uid).update({ photoURL: cred.user.photoURL }).catch(() => {});
    }
    await this._hydrate(uid);
    return { user: this._user, isNew };
  },

  signOut() {
    if (this.mode === 'firebase' && this._auth) {
      this._clearCache();
      this._auth.signOut();
      return;
    }
    const d = this.read();
    d.session = null;
    this.write(d);
  },

  /* Firebase sends the reset mail; we never see or set the password.
     Deliberately does not say whether the address exists — that would turn
     this box into a way to test which emails have accounts. */
  async sendPasswordReset(email) {
    if (this.mode !== 'firebase' || !this._auth) {
      throw new Error('Password reset needs the live account system. Email support and we will sort it out.');
    }
    try {
      await this._auth.sendPasswordResetEmail(String(email || '').trim());
    } catch (err) {
      const code = (err && err.code) || '';
      /* user-not-found is swallowed on purpose — see above. */
      if (code === 'auth/user-not-found' || code === 'auth/invalid-email') return;
      if (code === 'auth/too-many-requests') throw new Error('Too many attempts. Wait a few minutes and try again.');
      throw new Error('Could not send the reset email. Check the address and try again.');
    }
  },

  currentUser() {
    if (this.mode === 'firebase') return this._user;
    const d = this.read();
    return d.session ? d.users[d.session] || null : null;
  },

  updateUser(id, patch) {
    if (this.mode === 'firebase') {
      if (!this._user || this._user.id !== id) return null;
      this._user = Object.assign({}, this._user, patch);
      const safe = Object.assign({}, patch);
      delete safe.id;
      delete safe.pw;
      delete safe.salt;
      this._fs.collection('users').doc(id).update(safe).catch(console.warn);
      return this._user;
    }
    const d = this.read();
    if (!d.users[id]) return null;
    d.users[id] = Object.assign({}, d.users[id], patch);
    this.write(d);
    return d.users[id];
  },

  /* ---------- credits ---------- */
  addMinutes(id, minutes) {
    const u = this.mode === 'firebase' ? this._user : this.read().users[id];
    if (!u) return null;
    return this.updateUser(id, { minutes: Math.round((u.minutes + minutes) * 10) / 10 });
  },
  /* Spending is the server's call, not ours. users/{uid}.minutes is
     server-only in firestore.rules, so writing it from here would simply
     be rejected — and before that lock it was not, which made the whole
     credit model editable from devtools. The real deduction happens
     inside POST /api/render, which charges before it burns anything and
     refunds if the render fails; this only mirrors the balance the
     server reported back so the sidebar is not stale.

     `minutes` here is the server's NEW balance, not an amount to
     subtract. In local demo mode (no Firebase, no backend) there is no
     server to ask, so it falls back to the old local arithmetic. */
  applyServerBalance(id, minutes) {
    if (!Number.isFinite(minutes)) return this.currentUser();
    if (this.mode === 'firebase') {
      if (!this._user || this._user.id !== id) return this._user;
      this._user = Object.assign({}, this._user, { minutes });
      return this._user;
    }
    return this.updateUser(id, { minutes: Math.max(0, Math.round(minutes * 10) / 10) });
  },

  /* Local demo mode only — see applyServerBalance. */
  spendMinutesLocal(id, minutes) {
    const u = this.mode === 'firebase' ? this._user : this.read().users[id];
    if (!u) return null;
    return this.updateUser(id, { minutes: Math.max(0, Math.round((u.minutes - minutes) * 10) / 10) });
  },

  /* A fresh Firebase ID token for the API. null when signed out or in
     local mode — callers treat that as "not signed in". */
  async idToken() {
    if (this.mode !== 'firebase' || !this._auth || !this._auth.currentUser) return null;
    try { return await this._auth.currentUser.getIdToken(); } catch (e) { return null; }
  },

  /* ---------- orders ---------- */
  addOrder(userId, order) {
    if (this.mode === 'firebase') {
      const row = Object.assign({ user: userId, at: Date.now() }, order);
      const id = this.uid('ord');
      this._orders.unshift(Object.assign({ id }, row));
      this._fs.collection('orders').doc(id).set(row).catch(console.warn);
      return this._orders;
    }
    const d = this.read();
    d.orders.unshift(Object.assign({ id: this.uid('ord'), user: userId, at: Date.now() }, order));
    this.write(d);
    return d.orders;
  },
  orders(userId) {
    if (this.mode === 'firebase') return this._orders.filter(o => o.user === userId);
    return this.read().orders.filter(o => o.user === userId);
  },

  /* ---------- projects ---------- */
  saveProject(userId, project) {
    if (this.mode === 'firebase') {
      const list = this._projects.slice();
      const i = project.id ? list.findIndex(p => p.id === project.id) : -1;
      const id = i >= 0 ? list[i].id : this.uid('prj');
      const row = Object.assign({}, i >= 0 ? list[i] : {}, project, { at: Date.now() });
      delete row.id;
      if (i >= 0) list[i] = Object.assign({ id }, row);
      else list.unshift(Object.assign({ id }, row));
      this._projects = list.slice(0, 30);
      this._fs.collection('users').doc(userId).collection('projects').doc(id).set(row).catch(console.warn);
      return this._projects;
    }
    const d = this.read();
    const list = d.projects[userId] || [];
    const i = project.id ? list.findIndex(p => p.id === project.id) : -1;
    if (i >= 0) list[i] = Object.assign({}, list[i], project, { at: Date.now() });
    else list.unshift(Object.assign({ id: this.uid('prj') }, project, { at: Date.now() }));
    d.projects[userId] = list.slice(0, 30);
    this.write(d);
    return d.projects[userId];
  },
  projects(userId) {
    if (this.mode === 'firebase') return this._projects;
    return this.read().projects[userId] || [];
  },
  project(userId, id) { return this.projects(userId).find(p => p.id === id) || null; },
  deleteProject(userId, id) {
    if (this.mode === 'firebase') {
      this._projects = this._projects.filter(p => p.id !== id);
      this._fs.collection('users').doc(userId).collection('projects').doc(id).delete().catch(console.warn);
      return this._projects;
    }
    const d = this.read();
    d.projects[userId] = (d.projects[userId] || []).filter(p => p.id !== id);
    this.write(d);
    return d.projects[userId];
  },

  /* ---------- activity feed ---------- */
  addEvent(userId, event) {
    if (this.mode === 'firebase') {
      const row = Object.assign({ at: Date.now() }, event);
      const id = this.uid('evt');
      this._events = [Object.assign({ id }, row)].concat(this._events).slice(0, 12);
      this._fs.collection('users').doc(userId).collection('events').doc(id).set(row).catch(console.warn);
      return this._events;
    }
    const d = this.read();
    d.events[userId] = [Object.assign({ at: Date.now() }, event)].concat(d.events[userId] || []).slice(0, 12);
    this.write(d);
    return d.events[userId];
  },
  events(userId) {
    if (this.mode === 'firebase') return this._events;
    return this.read().events[userId] || [];
  },

  /* ---------- referrals ---------- */
  referrals(code) {
    if (this.mode === 'firebase') return this._referrals;
    if (!code) return [];
    return Object.values(this.read().users).filter(u => u.referredBy === code);
  },

  /* ---------- payouts ----------
     referralAvailable/referralEarned only ever move server-side (a
     signature-verified Razorpay payment, see server/src/lib/credits.js
     creditReferral) — firestore.rules blocks writing them from here.
     A payout request just asks to be paid; nothing moves automatically,
     it's reviewed and marked paid by hand.

     Doc id is the user's own uid, not an auto id — firestore.rules only
     allows *creating* at a path with nothing there yet, so this is what
     makes "one pending request at a time" a database guarantee rather
     than something only this page's disabled button enforces. */
  async requestPayout(userId, amount) {
    if (this.mode !== 'firebase') throw new Error('Payouts need Firebase to be connected.');
    await this._fs.collection('payoutRequests').doc(userId).set({
      uid: userId, amount, status: 'requested', requestedAt: Date.now()
    });
    return userId;
  },
  async pendingPayoutRequest(userId) {
    if (this.mode !== 'firebase') return null;
    const snap = await this._fs.collection('payoutRequests').doc(userId).get();
    return snap.exists ? snap.data() : null;
  }
};

/* Wait for Firebase/local boot, then run the page controller. */
UQ.start = function (fn) {
  document.addEventListener('DOMContentLoaded', () => {
    UQ.db.ready().then(() => fn()).catch(err => {
      console.error(err);
      document.body.insertAdjacentHTML('afterbegin',
        '<div style="padding:14px 18px;background:#FEF2F2;color:#991B1B;font:13px/1.4 system-ui">Studio failed to start. Check the browser console.</div>');
    });
  });
};
