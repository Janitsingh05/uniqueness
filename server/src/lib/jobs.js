/* ============================================================
   jobs.js — in-memory render jobs.

   Rendering outlives a single request, so the client starts a job and
   then polls it. Deliberately not a database: a render is worthless
   once the process restarts anyway, since its files live on disk.
   Swap this for Redis the day you run more than one instance.
   ============================================================ */

import { randomUUID } from 'node:crypto';
import fs from 'node:fs/promises';
import { config } from '../config.js';

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
export function startCleanup() {
  const ms = Math.max(1, config.retentionMinutes) * 60 * 1000;
  const timer = setInterval(async () => {
    const cutoff = Date.now() - ms;
    for (const [id, job] of jobs) {
      if (job.createdAt > cutoff) continue;
      for (const f of [job.file, job.videoPath, job.assPath].filter(Boolean)) {
        await fs.unlink(f).catch(() => {});
      }
      jobs.delete(id);
    }
  }, 5 * 60 * 1000);
  timer.unref?.();
  return timer;
}
