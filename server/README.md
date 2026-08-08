# uniqueness — caption backend

Optional Node/Express service that adds the two things a browser cannot do well:

1. **Server-side speech-to-text** — OpenAI `whisper-1` with word-level timestamps. More accurate than the in-browser model and no ~40MB download for the user.
2. **Burned-in MP4 rendering** — FFmpeg draws the captions into the video. This is the part the studio could not do at all before; the old export button was a progress animation that produced no file.

**The studio works without this server.** Leave `UQ.config.api.baseUrl` empty and everything runs in the browser exactly as it does today. Every call here fails soft: if the server is down, misconfigured or slow, the editor falls back to browser Whisper and tells the user.

---

## The flow

```
User
 ↓  picks a clip
Studio (vanilla JS, static)
 ↓  POST /api/transcribe        multipart: clip
Express
 ↓  ffmpeg -vn -ac 1 -ar 16000  → mono 48kbps mp3 (~0.36 MB/min)
 ↓  split if over 20MB, keeping each chunk's time offset
OpenAI whisper-1                verbose_json + timestamp_granularities[]=word
 ↓
{ text, words: [{ text, start, end }] }
 ↓
Caption editor                  js/captions.js groups words into lines,
                                the user edits the script and picks a style
 ↓  POST /api/render            multipart: clip + { lines, style, template }
Express
 ↓  build .ass from the lines the editor is already previewing
 ↓  ffmpeg -vf subtitles=…      burn in, progress parsed from ffmpeg's time=
 ↓  GET /api/render/:id         poll → GET /api/render/:id/file
Final captioned MP4
```

**Why the client sends the lines.** Timing, grouping and styling already exist in the browser (`js/captions.js`, `js/config.js`). Re-deriving them on the server would mean two engines that drift apart, and a burned-in file that does not match the preview. The server is deliberately a renderer, not a second source of truth.

---

## Setup

Needs **Node 20+** and **FFmpeg** on PATH (`ffmpeg -version` should work).

```bash
cd server
npm install
cp .env.example .env      # then paste your OpenAI key into .env
npm run check             # verifies FFmpeg, the key, and the work dir
npm start
```

Then point the studio at it. For local work, add `?api=` to the editor URL — it is remembered in `localStorage` from then on:

```
http://localhost:8777/editor.html?api=http://localhost:8080
```

Use `?api=` (blank) to switch back off. For a deployed backend, set it permanently in `js/config.js` instead:

```js
api: { baseUrl: 'https://your-app.onrender.com', … }
```

> Do not put `http://localhost` in the committed config. The live studio is served over HTTPS, and browsers block an HTTPS page from calling `http://` — that is exactly what the `?api=` override is for, since a local page on `http://localhost:8777` has no such problem.

Open the editor, upload a clip, and the **Export** tab's *Render burned-in MP4* now produces a real file.

### Rendering works without an API key

The two halves are independent. FFmpeg burn-in needs no key and no credit, so a server with `OPENAI_API_KEY` empty (or out of credit) still gives you real burned-in MP4s while transcription quietly falls back to browser Whisper. The editor says which one it used, and a quota or key error switches server transcription off for the rest of the session rather than re-uploading every clip just to be rejected again.

`npm run check` output on a ready machine:

```
[  ok  ] FFmpeg — ffmpeg version 9.0 …
[  ok  ] Speech-to-text — openai · whisper-1
[  ok  ] Work directory — …/server/work
```

---

## API

| Route | Purpose |
| --- | --- |
| `GET /api/health` | What this server can do: `{ transcribe, render, ffmpeg, maxUploadMb }`. The studio calls this before offering either feature. |
| `POST /api/transcribe` | multipart `clip` (+ optional `language`) → `{ text, words: [{text,start,end}], duration, note }` |
| `POST /api/render` | multipart `clip` + `payload` JSON `{ lines, style, template, filename }` → `202 { id, status }` |
| `GET /api/render/:id` | `{ status, progress, step, downloadUrl }` — poll while `status` is `queued`/`working` |
| `GET /api/render/:id/file` | the finished MP4 |

Renders are held in memory and on disk, then deleted after `RETENTION_MINUTES` (default 60).

---

## Cost

`whisper-1` is about **$0.006 per minute** of audio — roughly ₹0.50/min, so a 60-second Reel costs well under a rupee. Rendering costs only CPU.

---

## Deploying

`Dockerfile` and `render.yaml` are included. The image is Debian-based rather than Alpine because it needs FFmpeg built with **libass**, which is what draws the `.ass` captions.

```bash
docker build -t uniqueness-backend ./server
docker run -p 8080:8080 --env-file server/.env uniqueness-backend
```

On Render.com: **New → Blueprint**, pick this repo, then set `OPENAI_API_KEY` in the dashboard and `ALLOWED_ORIGINS` to your studio's origin.

Two things to know before you deploy:

- **GitHub Pages cannot host this.** It serves static files only. The studio stays on Pages; this server needs Render, Railway, Fly, or a VPS.
- **Free tiers are poor at FFmpeg.** Encoding is CPU-bound, and free instances sleep and are throttled. `render.yaml` asks for `starter` for that reason. A 60-second 1080p clip takes a few seconds on a normal machine and can take minutes on a shared free CPU.

---

## Fonts

libass uses fonts installed on the render machine. The studio offers Google fonts (Anton, Bebas Neue, Plus Jakarta Sans…) which a bare container does not have, so libass substitutes something else and the burned text will not match the preview exactly. To fix it, install the families you actually offer into the image:

```dockerfile
COPY fonts/ /usr/share/fonts/truetype/uniqueness/
RUN fc-cache -f
```

**Emoji stickers render in one colour.** libass draws glyph outlines, so a
colour-emoji font (Noto Color Emoji and friends, which use CBDT/COLR bitmap
tables) comes out as a flat silhouette in the caption colour — the 🔥 sticker
burns in as a purple flame, not an orange one. The preview in the browser is
full colour, so this is the one place the render and the preview differ. If
that matters, overlay the emoji as a PNG with an `overlay` filter instead of
putting it in the subtitle.

---

## Extending

- **Another STT provider** — add a branch in `src/lib/stt.js`. Everything else talks to `transcribe()` and does not care.
- **More than one instance** — `src/lib/jobs.js` is an in-memory `Map`. Move it to Redis and put renders on a real queue.
- **Persisted output** — renders currently live on local disk and expire. Push finished files to S3/R2 and return signed URLs.
