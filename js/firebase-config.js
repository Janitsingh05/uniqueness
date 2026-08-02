/* ============================================================
   firebase-config.js — Google Firebase (FREE Spark plan)

   HOW TO TURN THIS ON (5 minutes):
   1. Open https://console.firebase.google.com → Create project
      name it "uniqueness" (or anything).
   2. Build → Authentication → Get started → Email/Password → Enable.
   3. Build → Firestore Database → Create database → Start in
      production mode → pick a region (asia-south1 for India).
   4. Project settings (gear) → Your apps → Web (</>) → register
      app "uniqueness web" → copy the firebaseConfig object.
   5. Paste the values below (replace the empty strings).
   6. Firestore → Rules → paste contents of firestore.rules → Publish.
   7. Deploy: npm i -g firebase-tools && firebase login
      && firebase use --add  &&  firebase deploy

   Until apiKey + projectId are filled, the app stays on
   localStorage (works offline, single-browser only).
   ============================================================ */

window.UQ = window.UQ || {};

UQ.firebaseConfig = {
  apiKey: '',
  authDomain: '',
  projectId: '',
  storageBucket: '',
  messagingSenderId: '',
  appId: ''
};

/* true when the keys above are filled in */
UQ.firebaseEnabled = function () {
  const c = UQ.firebaseConfig;
  return !!(c && c.apiKey && c.projectId && c.apiKey.length > 10);
};
