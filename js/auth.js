/* ============================================================
   auth.js — powers login.html (sign in + create account).
   ============================================================ */

window.UQ = window.UQ || {};

UQ.auth = {
  mode: 'signin',

  init() {
    if (UQ.db.currentUser()) { location.href = 'dashboard.html'; return; }
    const params = new URLSearchParams(location.search);
    if (params.get('mode') === 'signup') this.mode = 'signup';
    /* The referral link points at the homepage, not straight here — see
       landing.js's captureReferral() for why a stored code is checked
       when this page's own URL has none. */
    const ref = params.get('r') || localStorage.getItem('uq_ref_code');
    if (ref) this.presetRef = ref.toUpperCase();

    this.form = UQ.ui.el('#authForm');
    this.error = UQ.ui.el('#authError');

    UQ.ui.el('#tabSignin').addEventListener('click', () => this.setMode('signin'));
    UQ.ui.el('#tabSignup').addEventListener('click', () => this.setMode('signup'));
    UQ.ui.el('#authSwitch').addEventListener('click', () => this.setMode(this.mode === 'signup' ? 'signin' : 'signup'));
    this.form.addEventListener('submit', e => { e.preventDefault(); this.submit(); });

    const googleBtn = UQ.ui.el('#googleSignIn');
    if (googleBtn) googleBtn.addEventListener('click', () => this.googleSignIn());

    this.setMode(this.mode);
  },

  setMode(mode) {
    this.mode = mode;
    const signup = mode === 'signup';
    UQ.ui.el('#tabSignin').classList.toggle('is-on', !signup);
    UQ.ui.el('#tabSignup').classList.toggle('is-on', signup);
    UQ.ui.els('[data-signup-only]').forEach(el => el.classList.toggle('hidden', !signup));
    UQ.ui.el('#authTitle').textContent = signup ? 'Create your studio' : 'Welcome back';
    UQ.ui.el('#authSubmit').textContent = signup ? 'Create account' : 'Sign in';
    UQ.ui.el('#authSwitchText').textContent = signup ? 'Already have an account?' : 'New here?';
    UQ.ui.el('#authSwitch').textContent = signup ? 'Sign in' : 'Create one free';
    if (signup && this.presetRef) UQ.ui.el('#fRef').value = this.presetRef;
    this.showError('');
  },

  showError(msg) {
    this.error.textContent = msg || '';
    this.error.classList.toggle('hidden', !msg);
  },

  async submit() {
    const name = UQ.ui.el('#fName').value;
    const email = UQ.ui.el('#fEmail').value.trim();
    const pw = UQ.ui.el('#fPw').value;
    const pw2 = UQ.ui.el('#fPw2').value;
    const referral = UQ.ui.el('#fRef').value;
    const btn = UQ.ui.el('#authSubmit');

    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return this.showError('Enter a valid email address.');
    if (pw.length < 6) return this.showError('Password needs at least 6 characters.');
    if (this.mode === 'signup') {
      if (!name.trim()) return this.showError('What should we call you?');
      if (pw !== pw2) return this.showError('The two passwords do not match.');
    }

    btn.classList.add('btn--busy');
    btn.textContent = 'Please wait…';
    this.showError('');

    try {
      if (this.mode === 'signup') {
        await UQ.db.signUp({ name, email, password: pw, referral });
        localStorage.removeItem('uq_ref_code');
        location.href = 'credits.html?welcome=1';
      } else {
        await UQ.db.signIn(email, pw);
        location.href = 'dashboard.html';
      }
    } catch (err) {
      btn.classList.remove('btn--busy');
      btn.textContent = this.mode === 'signup' ? 'Create account' : 'Sign in';
      this.showError(err.message || 'Something went wrong.');
    }
  },

  async googleSignIn() {
    const btn = UQ.ui.el('#googleSignIn');
    const label = btn.textContent;
    btn.classList.add('btn--busy');
    btn.textContent = 'Opening Google…';
    this.showError('');

    try {
      const { isNew } = await UQ.db.signInWithGoogle(this.presetRef);
      if (isNew) localStorage.removeItem('uq_ref_code');
      location.href = isNew ? 'credits.html?welcome=1' : 'dashboard.html';
    } catch (err) {
      btn.classList.remove('btn--busy');
      btn.textContent = label;
      this.showError(err.message || 'Could not sign in with Google.');
    }
  }
};

UQ.start(() => UQ.auth.init());
