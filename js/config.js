/* ============================================================
   config.js — everything you are most likely to edit.
   Brand strings, caption templates, pricing, defaults.
   Loaded first on every page; exposes window.UQ.config.
   ============================================================ */

window.UQ = window.UQ || {};

UQ.config = {
  brand: {
    name: 'uniqueness',
    domain: 'uniqueness.online',
    logo: 'assets/images/uniqueness-logo.png',
    tagline: "Captions that look like nobody else's"
  },

  /* New accounts start with this much credit (in minutes). */
  freeMinutes: 3,

  /* Caption templates. `mode` drives the timing engine:
     word = one word on screen, line = whole line, type = typewriter. */
  templates: [
    { id: 'punch',     name: 'Punch',     kind: 'One word',   mode: 'word', desc: 'One giant word, hard scale-in.',            tag: 'POPULAR' },
    { id: 'karaoke',   name: 'Karaoke',   kind: 'Highlight',  mode: 'line', desc: 'Line holds, the spoken word lights up.',    tag: 'POPULAR' },
    { id: 'chip',      name: 'Chip',      kind: 'Boxed',      mode: 'line', desc: 'Solid block behind the active word.' },
    { id: 'neon',      name: 'Neon',      kind: 'Glow',       mode: 'word', desc: 'Soft glow, night-shoot energy.' },
    { id: 'build',     name: 'Build',     kind: 'Build-up',   mode: 'line', desc: "The line assembles as it's spoken." },
    { id: 'type',      name: 'Type',      kind: 'Typewriter', mode: 'type', desc: 'Characters type out behind a caret.' },
    { id: 'bounce',    name: 'Bounce',    kind: 'Pop',        mode: 'word', desc: 'Springy pop — the short-form default.',     tag: 'NEW' },
    { id: 'meme',      name: 'Meme',      kind: 'Outline',    mode: 'line', desc: 'Fat outline, hard offset shadow.' },
    { id: 'sweep',     name: 'Sweep',     kind: 'Gradient',   mode: 'line', desc: 'Colour travels across the line.' },
    { id: 'bar',       name: 'Bar',       kind: 'Subtitle',   mode: 'line', desc: 'Classic bottom subtitle plate.' },
    { id: 'editorial', name: 'Editorial', kind: 'Serif',      mode: 'line', desc: 'Calm serif for voice-over and brand work.' }
  ],

  /* Default caption look for a new project. */
  defaultStyle: {
    tpl: 'punch',
    font: 'jakarta',
    size: 8,              // % of stage height
    pos: 16,              // % from the bottom
    color: '#FFFFFF',
    hl: '#A78BFA',
    stroke: 4,            // 0-10
    shadow: true,
    speed: 1,             // .5 - 2
    wpl: 3,               // words per line
    emoji: '',
    upper: true,
    ratio: '9:16'
  },

  /* Caption fonts clients can pick (15). `stack` is the CSS font-family. */
  captionFonts: [
    { id: 'jakarta',    name: 'Jakarta',    stack: "'Plus Jakarta Sans', sans-serif" },
    { id: 'outfit',     name: 'Outfit',     stack: "'Outfit', sans-serif" },
    { id: 'montserrat', name: 'Montserrat', stack: "'Montserrat', sans-serif" },
    { id: 'poppins',    name: 'Poppins',    stack: "'Poppins', sans-serif" },
    { id: 'dm',         name: 'DM Sans',    stack: "'DM Sans', sans-serif" },
    { id: 'space',      name: 'Space',      stack: "'Space Grotesk', sans-serif" },
    { id: 'oswald',     name: 'Oswald',     stack: "'Oswald', sans-serif" },
    { id: 'barlow',     name: 'Barlow',     stack: "'Barlow Condensed', sans-serif" },
    { id: 'bebas',      name: 'Bebas',      stack: "'Bebas Neue', sans-serif" },
    { id: 'anton',      name: 'Anton',      stack: "'Anton', sans-serif" },
    { id: 'archivo',    name: 'Archivo',    stack: "'Archivo Black', sans-serif" },
    { id: 'bangers',    name: 'Bangers',    stack: "'Bangers', cursive" },
    { id: 'playfair',   name: 'Playfair',   stack: "'Playfair Display', serif" },
    { id: 'serif',      name: 'Serif',      stack: "var(--serif)" },
    { id: 'mono',       name: 'Mono',       stack: "var(--mono)" }
  ],

  /* Sticker / emoji pack for captions. */
  captionEmojis: [
    '', '🔥', '💯', '👀', '😭', '😂', '🤣', '😍', '🥰', '😎',
    '🤩', '😱', '😤', '🥺', '💀', '🤯', '🫡', '😏', '🤔', '😌',
    '✨', '⭐', '💫', '💥', '❤️', '🧡', '💛', '💚', '💙', '💜',
    '🖤', '🤍', '👍', '👎', '👏', '🙌', '💪', '✌️', '🤝', '🙏',
    '🎉', '🎊', '🚀', '💡', '🎯', '✅', '❌', '💬', '🎤', '🎬',
    '📱', '💸', '🤑', '🏆', '👑', '🌶️', '😈', '🗣️', '📌', '⚠️'
  ],

  /* Words removed when "cut filler" is on. */
  fillerWords: /^(um|uh|uhh|hmm|like|basically|actually)[,.!?]?$/i,

  /* Credit packs (one-time) and monthly plans.
     `add` = minutes granted, `tier` = stored on the user record. */
  packs: [
    { name: 'Free', tier: 'Free', add: 0, price: '₹0', unit: '', rate: 'No card needed', minutes: '3 minutes of captioning', free: true,
      blurb: 'Enough to caption your first few clips.',
      features: ['All 11 kinetic styles', 'Word-level timing', 'SRT, VTT & TXT exports', '720p export with corner mark'] },
    { name: 'Starter pack', tier: 'Starter', add: 60, price: '₹299', unit: 'one-time', rate: '₹5 per minute', minutes: '60 minutes of credit',
      blurb: 'A month of posting, roughly.',
      features: ['Watermark-free exports', '1080p export', 'Filler-word auto-cut', 'Credits never expire'] },
    { name: 'Creator pack', tier: 'Creator', add: 300, price: '₹1,199', unit: 'one-time', rate: '₹4 per minute — save 20%', minutes: '300 minutes of credit', hot: true, badge: 'BEST VALUE',
      blurb: 'For creators posting most days.',
      features: ['Everything in Starter', '4K export', 'Saved brand style presets', 'Priority render queue'] },
    { name: 'Studio pack', tier: 'Studio', add: 1000, price: '₹2,999', unit: 'one-time', rate: '₹3 per minute — save 40%', minutes: '1,000 minutes of credit',
      blurb: 'Agencies and multi-client work.',
      features: ['Everything in Creator', 'Team seats & shared presets', 'Early access to new styles', 'Email support in 24h'] }
  ],
  monthly: [
    { name: 'Free', tier: 'Free', add: 0, price: '₹0', unit: '/mo', rate: 'No card needed', minutes: '3 minutes every month', free: true,
      blurb: 'Resets every month, forever.',
      features: ['All 11 kinetic styles', 'Word-level timing', 'SRT, VTT & TXT exports', '720p export with corner mark'] },
    { name: 'Lite monthly', tier: 'Lite', add: 30, price: '₹199', unit: '/mo', rate: '30 min/month · ₹6.6 per min', minutes: '30 minutes every month',
      blurb: 'One clip a day, comfortably.',
      features: ['Watermark-free exports', '1080p export', 'Filler-word auto-cut', 'Cancel any time'] },
    { name: 'Creator monthly', tier: 'Creator', add: 150, price: '₹599', unit: '/mo', rate: '150 min/month · ₹4 per min', minutes: '150 minutes every month', hot: true, badge: 'MOST POPULAR',
      blurb: 'Daily posting with room to spare.',
      features: ['Everything in Lite', '4K export', 'Saved brand style presets', 'Rollover up to 60 min'] },
    { name: 'Studio monthly', tier: 'Studio', add: 500, price: '₹1,499', unit: '/mo', rate: '500 min/month · ₹3 per min', minutes: '500 minutes every month',
      blurb: 'Client volume, every week.',
      features: ['Everything in Creator', 'Team seats & shared presets', 'Early access to new styles', 'Email support in 24h'] }
  ],

  /* Referral economics. */
  referral: { freeMinutesForFriend: 30, sharePercent: 20, payoutPerConversion: 240, minPayout: 500 },

  /* Editor plugin roadmap. */
  integrations: [
    { key: 'pr', short: 'PR', name: 'Premiere Pro' },
    { key: 'dv', short: 'DV', name: 'DaVinci Resolve' },
    { key: 'fc', short: 'FC', name: 'Final Cut Pro' },
    { key: 'cc', short: 'CC', name: 'CapCut Desktop' }
  ],

  /* Voice-detection defaults for the auto vocal sync engine. */
  vocalSync: {
    enabled: true,
    sensitivity: 5,       // 1-10, higher catches quieter speech
    frameSeconds: 0.02,   // analysis window
    mergeGap: 0.22,       // pauses shorter than this join two segments
    minSegment: 0.12      // ignore blips shorter than this
  },

  /* Speech-to-text language codes.
     Uses Google Chrome / Edge Web Speech API (free, no key).
     That API is powered by Google's speech recogniser in-browser. */
  speechLangs: { 'Auto-detect': 'en-IN', English: 'en-IN', Hindi: 'hi-IN', Hinglish: 'hi-IN' },

  /* Optional later: Razorpay keys for real UPI/card checkout.
     Leave blank = demo checkout (credits still add, no real charge). */
  razorpay: { keyId: '', enabled: false },

  /* Sidebar navigation — add a page here and it appears everywhere. */
  nav: [
    { group: 'Studio', items: [
      { id: 'dashboard', label: 'Dashboard',      icon: '⌂', href: 'dashboard.html' },
      { id: 'editor',    label: 'Caption editor', icon: '▦', href: 'editor.html' },
      { id: 'templates', label: 'Templates',      icon: '◨', href: 'templates.html' },
      { id: 'search',    label: 'Search',         icon: '⌕', href: 'search.html' }
    ]},
    { group: 'Account', items: [
      { id: 'credits',  label: 'Credits & plans', icon: '◔', href: 'credits.html' },
      { id: 'refer',    label: 'Refer & earn',    icon: '◎', href: 'refer.html' },
      { id: 'plugins',  label: 'Plugins',         icon: '⌸', href: 'plugins.html' },
      { id: 'settings', label: 'Settings',        icon: '⚙', href: 'settings.html' }
    ]}
  ]
};
