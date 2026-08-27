/* ============================================================
   POST /api/render        multipart: clip=<video>, payload=<json>
     payload: { lines, style, template, filename }
     -> { id, status, ... }   (render runs in the background)

   GET  /api/render/:id        -> job status + progress
   GET  /api/render/:id/file   -> the finished MP4

   The client sends the caption lines it is already previewing, so the
   burned-in file matches the editor rather than being re-derived.
   ============================================================ */

import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { upload } from '../lib/upload.js';
import { buildAss } from '../lib/ass.js';
import { probe, burnCaptions } from '../lib/ffmpeg.js';
import { createJob, getJob, updateJob, publicJob } from '../lib/jobs.js';
import { getUserPlan, spendMinutes, refundMinutes } from '../lib/credits.js';
import { verifyToken } from '../lib/auth.js';
import { dirs } from '../config.js';

export const renderRouter = Router();

function parsePayload(raw) {
  let payload;
  try {
    payload = typeof raw === 'string' ? JSON.parse(raw) : raw;
  } catch (e) {
    throw new Error('payload is not valid JSON.');
  }
  if (!payload || !Array.isArray(payload.lines) || !payload.lines.length) {
    throw new Error('payload.lines is required — generate captions before rendering.');
  }
  if (!payload.style) throw new Error('payload.style is required.');
  return payload;
}

renderRouter.post('/render', upload.single('clip'), async (req, res) => {
  if (!req.file) return res.status(400).json({ error: 'No clip uploaded. Send it as multipart field "clip".' });

  let payload;
  try {
    payload = parsePayload(req.body.payload);
  } catch (err) {
    await fs.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ error: err.message });
  }

  let media;
  try {
    media = await probe(req.file.path);
  } catch (err) {
    await fs.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ error: 'Could not read this video: ' + err.message });
  }

  const base = path.parse(payload.filename || req.file.originalname || 'clip').name
    .replace(/[^\w.-]+/g, '-').slice(0, 60) || 'clip';

  /* Burning an MP4 is the paid action, so this is where credit is taken.
     The uid comes from the signed ID token — the body's uid decides
     nothing any more. */
  const uid = await verifyToken(req);
  if (!uid) {
    await fs.unlink(req.file.path).catch(() => {});
    return res.status(401).json({
      error: 'Please sign in again — your session could not be verified.',
      code: 'AUTH_REQUIRED'
    });
  }

  const durationMinutes = Math.max(0.1, Math.round((media.duration / 60) * 10) / 10);
  const charge = await spendMinutes(uid, durationMinutes, { reason: `export · ${base}` });
  if (!charge.ok) {
    await fs.unlink(req.file.path).catch(() => {});
    const status = charge.code === 'INSUFFICIENT_CREDIT' ? 402 : 400;
    return res.status(status).json({ error: charge.reason, code: charge.code, minutes: charge.minutes });
  }

  const job = createJob({
    videoPath: req.file.path,
    filename: `${base}-captioned.mp4`,
    durationMinutes
  });

  /* Answer immediately; the client polls from here. The new balance rides
     along so the editor can show it without a second round trip. */
  res.status(202).json({ ...publicJob(job), minutes: charge.minutes });

  runRender(job.id, { payload, media, uid }).catch(async err => {
    console.error('[render]', err);
    updateJob(job.id, { status: 'error', error: err.message, step: 'Failed' });
    /* Nothing was delivered, so nothing should have been charged. */
    if (charge.charged) {
      await refundMinutes(uid, charge.charged, { reason: 'export failed' }).catch(() => {});
    }
  });
});

async function runRender(jobId, { payload, media, uid }) {
  const job = getJob(jobId);
  if (!job) return;

  updateJob(jobId, { status: 'working', progress: 2, step: 'Preparing captions' });

  /* Vertical clips with no probe data still need something sane. */
  const width = media.width || 1080;
  const height = media.height || 1920;

  /* The plan is looked up server-side, but that was only half the job:
     the uid it was looked up from came out of the request body, and a
     uid is not a secret. Anyone could paste a paid account's uid and
     render watermark-free. It now comes from the verified ID token
     (req.uid, set by requireUser) and the body's uid is ignored.
     No token still fails safe as Free: watermark stays on. */
  const plan = await getUserPlan(uid);
  const watermark = plan !== 'Starter' && plan !== 'Creator' && plan !== 'Studio';

  const { content, events } = buildAss({
    lines: payload.lines,
    style: payload.style,
    template: payload.template,
    width,
    height,
    duration: media.duration,
    watermark
  });
  if (!events) throw new Error('No caption events to burn — the lines were empty.');

  const assPath = path.join(dirs.output, jobId + '.ass');
  await fs.writeFile(assPath, content, 'utf8');
  updateJob(jobId, { assPath, progress: 6, step: `Burning ${events} caption cues` });

  const outPath = path.join(dirs.output, jobId + '.mp4');
  await burnCaptions({
    videoPath: job.videoPath,
    assPath,
    outPath,
    duration: media.duration,
    onProgress: pct => updateJob(jobId, { progress: Math.max(6, pct), step: 'Rendering video' })
  });

  updateJob(jobId, { status: 'done', progress: 100, step: 'Ready', file: outPath });

  /* The source clip is no longer needed once it is burned. */
  await fs.unlink(job.videoPath).catch(() => {});
  await fs.unlink(assPath).catch(() => {});
  updateJob(jobId, { videoPath: null, assPath: null });
}

renderRouter.get('/render/:id', (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'No such render job. It may have expired.' });
  res.json(publicJob(job));
});

renderRouter.get('/render/:id/file', async (req, res) => {
  const job = getJob(req.params.id);
  if (!job) return res.status(404).json({ error: 'No such render job. It may have expired.' });
  if (job.status !== 'done' || !job.file) {
    return res.status(409).json({ error: `Render is ${job.status}.`, progress: job.progress });
  }
  try {
    await fs.access(job.file);
  } catch (e) {
    return res.status(410).json({ error: 'This render has already been cleaned up. Render again.' });
  }
  res.setHeader('Content-Type', 'video/mp4');
  res.setHeader('Content-Disposition', `attachment; filename="${job.filename}"`);
  createReadStream(job.file).pipe(res);
});
