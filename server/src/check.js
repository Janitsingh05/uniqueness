/* ============================================================
   check.js — `npm run check`

   Answers "is this machine ready to caption?" before you waste time
   uploading a clip: FFmpeg present, API key set, work dirs writable.
   ============================================================ */

import fs from 'node:fs/promises';
import { config, dirs, ensureDirs, sttConfigured } from './config.js';
import { ffmpegVersion } from './lib/ffmpeg.js';

const tick = ok => (ok ? '  ok  ' : ' FAIL ');
let failed = 0;
const line = (ok, label, detail) => {
  if (!ok) failed++;
  console.log(`[${tick(ok)}] ${label}${detail ? ' — ' + detail : ''}`);
};

console.log('\nuniqueness backend — readiness check\n');

const ff = await ffmpegVersion();
line(!!ff, 'FFmpeg', ff || 'not found on PATH. Install it, or set FFMPEG_PATH in .env');

line(sttConfigured(), 'Speech-to-text',
  sttConfigured()
    ? `${config.stt.provider} · ${config.stt.model}`
    : 'OPENAI_API_KEY is empty in server/.env — transcription will return 503');

try {
  ensureDirs();
  const probe = dirs.output + '/.write-test';
  await fs.writeFile(probe, 'ok');
  await fs.unlink(probe);
  line(true, 'Work directory', config.workDir);
} catch (e) {
  line(false, 'Work directory', config.workDir + ' is not writable: ' + e.message);
}

line(true, 'Upload limit', config.maxUploadMb + 'MB');
line(true, 'CORS origins', config.allowedOrigins.join(', '));

console.log(failed
  ? `\n${failed} problem(s) above. The server still starts; affected features report themselves as off.\n`
  : '\nEverything is ready. Run: npm start\n');
