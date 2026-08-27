/* ============================================================
   jobs.js — in-memory render jobs.

   Rendering outlives a single request, so the client starts a job and
   then polls it. Deliberately not a database: a render is worthless
   once the process restarts anyway, since its files live on disk.
   Swap this for Redis the day you run more than one instance.
   ============================================================ */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { config, dirs } from '../config.js';

const jobs = new Map();

export function createJob(meta = {}) {
  const id = randomUUID();
  jobs.set(id, {
    id,
    status: 'queued',        // queued | working | done | error
    progress: 0,
    step: 'Queued',
    error: null,
    file: null,
    createdAt: Date.now(),
    ...meta
  });
  return jobs.get(id);
}

export function getJob(id) {
  return jobs.get(id) || null;
}

export function updateJob(id, patch) {
  const job = jobs.get(id);
  if (!job) return null;
  Object.assign(job, patch);
  return job;
}

/* What the client is allowed to see. */
export function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    progress: job.progress,
    step: job.step,
    error: job.error,
    downloadUrl: job.status === 'done' ? `/api/render/${job.id}/file` : null,
    filename: job.filename || null,
    durationMinutes: job.durationMinutes || null
  };
}

/* Finished renders are large. Drop them, and their files, on a timer. */
/* Anything left in the work directories past the retention window, whoever
   put it there. The job-map sweep below only knows about jobs this process
   started, so a restart used to strand every file belonging to the jobs it
   forgot — which is exactly how uploads from weeks earlier were still on
   disk. The privacy policy promises clips are deleted; that promise has to
   survive a redeploy, so this walks the directories themselves. */
async function sweepDisk(cutoff) {
  let removed = 0;
  for (const dir of Object.values(dirs)) {
    let names;
    try { names = await fs.readdir(dir); } catch (e) { continue; }
    for (const name of names) {
      const full = path.join(dir, name);
      try {
        const st = await fs.stat(full);
        if (!st.isFile() || st.mtimeMs > cutoff) continue;
        await fs.unlink(full);
        removed++;
      } catch (e) { /* vanished under us, or busy — next pass gets it */ }
    }
  }
  if (removed) console.log(`[cleanup] removed ${removed} expired file(s)`);
  return removed;
}

export function startCleanup() {
  const ms = Math.max(1, config.retentionMinutes) * 60 * 1000;
  const run = async () => {
    const cutoff = Date.now() - ms;
    for (const [id, job] of jobs) {
      if (job.createdAt > cutoff) continue;
      for (const f of [job.file, job.videoPath, job.assPath].filter(Boolean)) {
        await fs.unlink(f).catch(() => {});
      }
      jobs.delete(id);
    }
    await sweepDisk(cutoff);
  };
  /* Once at boot, so a restart clears whatever the previous process left
     behind instead of waiting out the first interval. */
  run().catch(err => console.warn('[cleanup]', err.message));
  const timer = setInterval(() => run().catch(err => console.warn('[cleanup]', err.message)), 5 * 60 * 1000);
  timer.unref?.();
  return timer;
}
