# uniqueness — Caption Studio

Word-level caption studio for short-form video. Upload a clip, the browser
detects where the voice is, and captions land on the beat in one of 11
kinetic styles. Export a subtitle file or a burned-in MP4.

Live pages: landing → sign up → dashboard → editor → credits.

---

## Run it

No build step, no npm. It is plain HTML + CSS + JS.

```bash
# any static server works
cd site
python3 -m http.server 8080
# open http://localhost:8080
```

> Open it through a server, not by double-clicking the files.
> The microphone and clipboard APIs need `http://localhost` or HTTPS.

Deploy: upload the whole `site/` folder to Netlify, Vercel, Cloudflare
Pages, GitHub Pages or any shared host. Nothing else to configure.

### Launch on Google (free Firebase)

1. Fill `js/firebase-config.js` with your Firebase web keys
   (console.firebase.google.com → Project settings → Web app).
2. Enable **Authentication → Email/Password** and create a
   **Firestore** database. Paste `firestore.rules` into the Rules tab.
3. Install CLI and deploy:

```bash
npm i -g firebase-tools
firebase login
# edit .firebaserc → set your project id
firebase deploy
```

Speech-to-text already uses **Google Web Speech** (Chrome/Edge) — free, no key.
Until Firebase keys are pasted, the app keeps working on localStorage.

---

## File structure

```
site/
├── index.html            Landing page (public)
├── login.html            Sign in + create account
├── dashboard.html        Home after login: upload, stats, projects, styles
├── editor.html           The caption editor (the core product)
├── templates.html        Library of all 11 caption styles
├── search.html           Search saved projects and transcripts
├── credits.html          Plans, checkout, billing history
├── refer.html            Referral link, stats, payout request
├── plugins.html          Editor integrations roadmap
├── settings.html         Workspace defaults + profile
│
├── assets/
│   └── images/
│       └── uniqueness-logo.png
│
├── css/
│   ├── tokens.css        ⭐ brand colours, fonts, radii, shadows — edit here first
│   ├── base.css          reset, typography, utility classes
│   ├── layout.css        app shell: sidebar, topbar, page grids, mobile drawer
│   ├── components.css    buttons, cards, chips, inputs, switches, modals, toasts
│   ├── captions.css      the 11 caption styles + preview tiles + keyframes
│   └── pages.css         page-specific styling (landing, auth, editor, pricing…)
│
└── js/
    ├── config.js         ⭐ brand strings, templates, pricing, defaults, nav
    ├── db.js             ⭐ data layer (localStorage today, your API later)
    ├── ui.js             DOM helpers, formatting, progress modal, toasts
    ├── handoff.js        carries an uploaded clip from dashboard → editor
    ├── shell.js          renders sidebar + topbar, guards signed-out users
    ├── auth.js           login.html controller
    ├── captions.js       timing engine: words → lines → active word
    ├── audio-sync.js     auto vocal sync (voice detection from the audio track)
    ├── speech.js         browser speech-to-text (Chrome/Edge)
    ├── exporter.js       SRT / VTT / TXT download + MP4 render queue
    ├── preview-tiles.js  animated style previews shared by 2 pages
    ├── editor.js         editor.html controller (the biggest file)
    ├── dashboard.js      dashboard.html controller
    ├── templates-page.js templates.html controller
    ├── search.js         search.html controller
    ├── credits.js        credits.html: plans, checkout modal, history
    └── account.js        refer.html + plugins.html + settings.html
```

Load order on every app page: `config → db → ui → shell → (feature files) → page controller`.

---

## Where to change things

| I want to change… | Open |
| --- | --- |
| Brand colours, fonts, corner radius | `css/tokens.css` |
| Product name, domain, logo path | `js/config.js` → `brand` |
| Prices, minutes per pack, plan names | `js/config.js` → `packs`, `monthly` |
| Free minutes for new accounts | `js/config.js` → `freeMinutes` |
| Caption style list, names, descriptions | `js/config.js` → `templates` |
| Words per line a style groups by | `js/config.js` → `templates` → `wpl` |
| How a caption style *looks* | `css/captions.css` → `.tpl-<id>` |
| Sidebar menu items | `js/config.js` → `nav` |
| Default caption look for new clips | `js/config.js` → `defaultStyle` |
| Voice detection tuning | `js/config.js` → `vocalSync` |
| Filler words that get cut | `js/config.js` → `fillerWords` |
| Referral rewards | `js/config.js` → `referral` |

### Adding a 12th caption style

1. Add an entry to `templates` in `js/config.js` (`id`, `name`, `kind`, `mode`, `wpl`, `desc`).
2. Add `.tpl-<id> .w { … }` rules in `css/captions.css`.
3. Add a preview snippet in `js/preview-tiles.js` → `markup`.

That's it — the dropdown, the library, the dashboard tiles and the filters all read from config.

---

## How the captioning works

1. **Voice detection** (`audio-sync.js`) — decodes the clip's audio with
   Web Audio, measures loudness in 20 ms frames, and returns the segments
   where somebody is talking. Runs on the user's machine; nothing uploads.
2. **Timing** (`captions.js`) — spreads the transcript across those segments,
   so lines break where the speaker pauses and each line starts on the voice.
   With no segments it falls back to even spacing.
3. **Rendering** (`captions.js` + `captions.css`) — the active word gets the
   `.on` class and the template's CSS animation. The DOM is rebuilt only when
   the visible word changes, so animations restart exactly once per word.

---

## What is real vs. what needs a backend

**Real, working today**
- Accounts, salted SHA-256 password hashing, sessions that survive reload
- Credit balance, plan tiers, purchase records, saved projects, activity feed
- Video upload + playback, all 11 caption styles, every style control
- Auto vocal sync, filler-word cutting, safe-area guides
- SRT / VTT / TXT export (real files)
- Speech-to-text via the browser's recogniser (Chrome/Edge, microphone)

**Needs a server before launch**
| Feature | File to change | What to do |
| --- | --- | --- |
| Shared accounts across devices | `js/firebase-config.js` | Paste Firebase web keys — Auth + Firestore turn on automatically. |
| Real payments | `js/credits.js` → `pay()` | Call Razorpay / Stripe. On success, same `addMinutes` + `addOrder` + `addEvent`. |
| Higher-accuracy file STT | `js/speech.js` | Optional later: Google Cloud Speech via Cloud Function. Web Speech (free) works today. |
| Burned-in MP4 | `js/exporter.js` → `renderVideo()` | POST the clip + caption JSON to an ffmpeg worker; poll progress. |

Data currently lives under the localStorage key `uq_studio_db_v1`
(plus `uq_settings_v1` and `uq_plugin_waitlist`). Clearing site data resets the app.

---

## Browser support

Chrome, Edge, Safari and Firefox for everything except speech-to-text,
which is Chrome/Edge only (Web Speech API). Auto vocal sync, playback and
exports work everywhere.

---

© 2026 uniqueness.online
