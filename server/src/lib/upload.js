/* ============================================================
   upload.js — shared multipart handling.
   Clips go straight to disk; they are far too big to buffer.
   ============================================================ */

import multer from 'multer';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { config, dirs } from '../config.js';

const MEDIA = /\.(mp4|m4v|mov|webm|mkv|avi|mpg|mpeg|3gp|m4a|mp3|wav|aac|ogg|oga|opus|flac)$/i;

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, dirs.uploads),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname || '').toLowerCase() || '.mp4';
    cb(null, randomUUID() + ext);
  }
});

export const upload = multer({
  storage,
  limits: { fileSize: config.maxUploadMb * 1024 * 1024, files: 1 },
  fileFilter: (req, file, cb) => {
    /* Windows hands over some clips with an empty MIME type, so the
       extension is the fallback — same rule as the browser side. */
    const ok = /^(video|audio)\//i.test(file.mimetype || '') || MEDIA.test(file.originalname || '');
    cb(ok ? null : new Error('Only video or audio clips are accepted.'), ok);
  }
});
