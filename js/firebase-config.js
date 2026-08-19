/* ============================================================
   firebase-config.js — Google Firebase (FREE Spark plan)

   Project: uniqueness-studio. Firestore is live and the rules
   are deployed (see firestore.rules). One step is still manual —
   Google only exposes enabling an Auth sign-in provider through
   the console, not through any API a script can call:

     https://console.firebase.google.com/project/uniqueness-studio/authentication/providers
     -> Email/Password -> Enable -> Save. Takes about 10 seconds.

   Until that one click happens, UQ.firebaseEnabled() is true (so
   the app targets this project) but actual sign-in/sign-up calls
   will fail with "CONFIGURATION_NOT_FOUND" — js/db.js's firebase
   path surfaces that as a normal auth error, so the UI degrades
   to a clear "try again" message rather than breaking silently.
   ============================================================ */

window.UQ = window.UQ || {};

UQ.firebaseConfig = {
  apiKey: 'AIzaSyBLPd4dBaPr6NZ42LGVztY_Wq5nnVRpnzo',
  authDomain: 'uniqueness-studio.firebaseapp.com',
  projectId: 'uniqueness-studio',
  storageBucket: 'uniqueness-studio.firebasestorage.app',
  messagingSenderId: '1095203885032',
  appId: '1:1095203885032:web:785964b8e0a3acccd45e5d'
};

/* true when the keys above are filled in */
UQ.firebaseEnabled = function () {
  const c = UQ.firebaseConfig;
  return !!(c && c.apiKey && c.projectId && c.apiKey.length > 10);
};
