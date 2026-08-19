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
    tagline: 'Captions that earn the scroll',
    pitch: 'Upload a clip. uniqueness times every word to your voice and animates it so people keep watching — short-form that looks directed, not subtitled.'
  },

  /* New accounts start with this much credit (in minutes). */
  freeMinutes: 3,

  /* Razorpay (or other) — leave enabled:false until you paste a key.
     Space reserved so the gateway drops in later without rewriting credits.js. */
  payments: {
    provider: 'razorpay',
    keyId: '',
    enabled: false
  },

  /* Caption templates. `mode` drives the timing engine:
     word = one word on screen, line = whole line, type = typewriter.
     `wpl` is the words-per-line the style is built for — picking a template
     regroups the generated captions to it. The slider still overrides. */
  templates: [
    { id: 'punch',     name: 'Punch',     kind: 'One word',   mode: 'word', wpl: 1, desc: 'One giant word, hard scale-in.',            tag: 'POPULAR' },
    { id: 'karaoke',   name: 'Karaoke',   kind: 'Highlight',  mode: 'line', wpl: 4, desc: 'Line holds, the spoken word lights up.',    tag: 'POPULAR' },
    { id: 'chip',      name: 'Chip',      kind: 'Boxed',      mode: 'line', wpl: 3, desc: 'Solid block behind the active word.' },
    { id: 'neon',      name: 'Neon',      kind: 'Glow',       mode: 'word', wpl: 1, desc: 'Soft glow, night-shoot energy.' },
    { id: 'build',     name: 'Build',     kind: 'Build-up',   mode: 'line', wpl: 4, desc: "The line assembles as it's spoken." },
    { id: 'type',      name: 'Type',      kind: 'Typewriter', mode: 'type', wpl: 5, desc: 'Characters type out behind a caret.' },
    { id: 'bounce',    name: 'Bounce',    kind: 'Pop',        mode: 'word', wpl: 1, desc: 'Springy pop — the short-form default.',     tag: 'NEW' },
    { id: 'meme',      name: 'Meme',      kind: 'Outline',    mode: 'line', wpl: 4, desc: 'Fat outline, hard offset shadow.' },
    { id: 'sweep',     name: 'Sweep',     kind: 'Gradient',   mode: 'line', wpl: 4, desc: 'Colour travels across the line.' },
    { id: 'bar',       name: 'Bar',       kind: 'Subtitle',   mode: 'line', wpl: 6, desc: 'Classic bottom subtitle plate.' },
    { id: 'editorial', name: 'Editorial', kind: 'Serif',      mode: 'line', wpl: 5, desc: 'Calm serif for voice-over and brand work.' }
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
     `add` = minutes granted (−1 / unlimited:true = no cap). */
  packs: [
    { name: 'Free', tier: 'Free', add: 0, price: '₹0', unit: '', rate: 'No card needed', minutes: '3 minutes of captioning', free: true,
      blurb: 'Caption your first clips, free.',
      features: ['Word-perfect captions, synced to every word', 'Every kinetic style unlocked', 'Ready-to-post 720p exports', 'SRT, VTT & TXT included'] },
    { name: 'Starter pack', tier: 'Starter', add: 120, price: '₹299', unit: 'one-time', rate: '2 hours · one-time', minutes: '120 minutes of credit',
      blurb: 'For getting started without a watermark.',
      features: ['Watermark-free 1080p exports', 'Auto-cut filler words', 'Credits never expire', '4K exports for premium clips'] },
    { name: 'Creator pack', tier: 'Creator', add: 900, price: '₹1,199', unit: 'one-time', rate: '15 hours · best value pack', minutes: '900 minutes of credit', hot: true, badge: 'BEST VALUE',
      blurb: 'For creators who post every week.',
      features: ['Everything in Starter', 'Crisp 4K, zero watermark', 'Hours of captions, not minutes', 'Priority render queue'] },
    { name: 'Studio pack', tier: 'Studio', add: 99999, unlimited: true, price: '₹2,999', unit: 'one-time', rate: 'Unlimited captioning', minutes: 'Unlimited captions',
      blurb: 'For power creators who publish all day.',
      features: ['Everything in Creator', 'Unlimited captions', 'Early access to new styles', 'Export-ready SRT · VTT · MP4'] }
  ],
  monthly: [
    { name: 'Free', tier: 'Free', add: 0, price: '₹0', unit: '/mo', rate: 'No card needed', minutes: '3 minutes every month', free: true,
      blurb: 'Caption your first clips, free.',
      features: ['Word-perfect captions, synced to every word', 'Every kinetic style unlocked', 'Ready-to-post 720p exports', 'Exports carry a watermark on Free'] },
    { name: 'Starter', tier: 'Starter', add: 120, price: '₹299', unit: '/mo', rate: 'just ₹10/day', minutes: '2 hours of captions, every month',
      blurb: 'For getting started without a watermark.',
      features: ['Everything in Free', '2 hours of captions a month', 'Watermark-free 1080p exports', 'Auto-cut filler words', 'Crisp 4K exports'] },
    { name: 'Creator', tier: 'Creator', add: 900, price: '₹499', unit: '/mo', rate: 'just ₹17/day · was ₹799', minutes: '15 hours of captions a month', hot: true, badge: 'MOST POPULAR',
      blurb: 'For creators who post every week.',
      features: ['Everything in Starter', 'Caption hours of video, not minutes', 'Crisp 4K exports, zero watermark', 'Auto-cut filler for tighter clips'] },
    { name: 'Studio', tier: 'Studio', add: 99999, unlimited: true, price: '₹1,299', unit: '/mo', rate: 'just ₹43/day · was ₹1,999', minutes: 'Unlimited captions — never watch a counter',
      blurb: 'For power creators who publish all day.',
      features: ['Everything in Creator', 'Unlimited captions, month after month', 'Sharpest 4K, zero watermark', 'Early access to new styles', 'Export-ready video, SRT & TXT'] }
  ],

  faq: [
    { q: 'Does it work with Hinglish and accents?', a: 'Yes — uniqueness handles English, Hindi, and natural Hinglish. Fast talkers and strong accents are fine; you can always edit the script and captions re-match the voice.' },
    { q: 'How do captions lock to my voice?', a: 'On upload we transcribe the clip on-device and lock every word to the moment it is spoken, then group lines by natural rhythm. Edit the script anytime — timing adjusts with it.' },
    { q: 'Which aspect ratios can I export?', a: '9:16 for Reels and Shorts, 1:1 for feed posts, and 16:9 for YouTube — plus clean SRT, VTT, and TXT.' },
    { q: 'How does billing work?', a: 'Every caption style is free. You only pay for captioning minutes and clean exports. Payment gateway hooks are ready — connect Razorpay when you go live. Until then checkout runs in demo mode.' },
    { q: 'Is my clip uploaded to a server?', a: 'Transcription and voice sync run in your browser. Clips stay on your device unless you later connect a cloud render worker.' }
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

  /* Upload → auto captions. Whisper runs in the browser (free, no key).
     First use downloads a ~40MB model once, then caches it. */
  autoCaption: {
    onUpload: true,
    model: 'Xenova/whisper-tiny'
  },

  /* Optional caption backend (server/), deployed at server/render.yaml's
     free-tier Render service. Leave baseUrl empty to force the whole
     studio back to running in the browser only.
     `preferServer` decides who transcribes when both are available.
     healthTimeoutMs is generous because the free plan sleeps after 15
     minutes idle — the instance that wakes it up eats a cold-start
     health check, so a short timeout would wrongly look "down" and
     silently fall back to the browser for that one request. */
  api: {
    baseUrl: 'https://uniqueness-backend.onrender.com',
    preferServer: true,
    pollMs: 1500,
    healthTimeoutMs: 20000,
    transcribeTimeoutMs: 900000
  },

  /* Speech-to-text language codes.
     Uses Google Chrome / Edge Web Speech API (free, no key).
     That API is powered by Google's speech recogniser in-browser. */
  speechLangs: { 'Auto-detect': 'en-IN', English: 'en-IN', Hindi: 'hi-IN', Hinglish: 'hi-IN' },

  /* Caption translation targets — server/src/lib/translate.js (MyMemory,
     free, no key). Codes are the ISO pairs MyMemory expects. */
  translateLangs: [
    { code: 'en', name: 'English' },
    { code: 'hi', name: 'Hindi' },
    { code: 'es', name: 'Spanish' },
    { code: 'pt', name: 'Portuguese' },
    { code: 'fr', name: 'French' },
    { code: 'ar', name: 'Arabic' },
    { code: 'id', name: 'Indonesian' },
    { code: 'de', name: 'German' },
    { code: 'ja', name: 'Japanese' },
    { code: 'ko', name: 'Korean' },
    { code: 'tr', name: 'Turkish' },
    { code: 'it', name: 'Italian' },
    { code: 'ru', name: 'Russian' },
    { code: 'bn', name: 'Bengali' },
    { code: 'ta', name: 'Tamil' },
    { code: 'ur', name: 'Urdu' }
  ],

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
