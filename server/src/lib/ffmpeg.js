/* ============================================================
   ffmpeg.js — every shell-out to ffmpeg/ffprobe.

   Three jobs:
     probe()          read duration / size / whether audio exists
     extractAudio()   video -> small mono mp3 the STT API will accept
     splitAudio()     long audio -> chunks under the API size limit
     burnCaptions()   video + .ass subtitles -> final MP4, with progress
   ============================================================ */

import { spawn } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs/promises';
import { config } from '../config.js';

/* Run a binary and collect stderr. onStderr sees output as it streams,
   which is how render progress is tracked. */
function run(bin, args, { onStderr, label } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true });
    let stdout = '';
    let stderr = '';

    child.stdout.on('data', d => { stdout += d.toString(); });
    child.stderr.on('data', d => {
      const text = d.toString();
      stderr += text;
      /* ffmpeg is chatty; keep only the tail so a long render cannot
         grow this buffer without bound. */
      if (stderr.length > 20000) stderr = stderr.slice(-8000);
      if (onStderr) onStderr(text);
    });

    child.on('error', err => {
      reject(new Error(
        err.code === 'ENOENT'
          ? `${bin} not found. Install FFmpeg and put it on PATH, or set FFMPEG_PATH.`
          : `${label || bin} failed to start: ${err.message}`
      ));
    });
    child.on('close', code => {
      if (code === 0) return resolve({ stdout, stderr });
      reject(new Error(`${label || bin} exited ${code}: ${stderr.trim().split('\n').slice(-4).join(' ')}`));
    });
  });
}

export async function probe(file) {
  const { stdout } = await run(config.ffmpeg.probeBin, [
    '-v', 'error',
    '-show_entries', 'format=duration,size',
    '-show_entries', 'stream=codec_type,codec_name,width,height',
    '-of', 'json', file
  ], { label: 'ffprobe' });

  const info = JSON.parse(stdout || '{}');
  const streams = info.streams || [];
  const video = streams.find(s => s.codec_type === 'video');
  return {
    duration: Number(info.format?.duration) || 0,
    size: Number(info.format?.size) || 0,
    hasAudio: streams.some(s => s.codec_type === 'audio'),
    width: video?.width || 0,
    height: video?.height || 0
  };
}

/* Mono 16 kHz mp3 at 48 kbps ≈ 0.36 MB per minute — an hour still fits
   inside the API's 25MB limit, and Whisper wants 16 kHz anyway. */
export async function extractAudio(videoPath, outDir, id) {
  const out = path.join(outDir, id + '.mp3');
  await run(config.ffmpeg.bin, [
    '-y', '-i', videoPath,
    '-vn', '-ac', '1', '-ar', '16000', '-b:a', '48k',
    out
  ], { label: 'audio extraction' });
  const { size } = await fs.stat(out);
  return { path: out, size };
}

/* Split into fixed-length pieces. Each piece keeps the offset it started
   at so word timestamps can be shifted back onto the real timeline. */
export async function splitAudio(audioPath, outDir, id, chunkSeconds) {
  const pattern = path.join(outDir, `${id}-chunk-%03d.mp3`);
  await run(config.ffmpeg.bin, [
    '-y', '-i', audioPath,
    '-f', 'segment', '-segment_time', String(chunkSeconds),
    '-c', 'copy', pattern
  ], { label: 'audio split' });

  const files = (await fs.readdir(outDir))
    .filter(f => f.startsWith(`${id}-chunk-`))
    .sort();
  return files.map((f, i) => ({
    path: path.join(outDir, f),
    offset: i * chunkSeconds
  }));
}

/* Burn an .ass subtitle file into the video.
   onProgress(0..100) is driven by ffmpeg's own time= output. */
export async function burnCaptions({ videoPath, assPath, outPath, duration, onProgress }) {
  /* ffmpeg parses the filter string, so Windows backslashes and the colon
     in "C:" have to be escaped or the filter is read as more arguments. */
  const escaped = assPath
    .replace(/\\/g, '/')
    .replace(/:/g, '\\:')
    .replace(/'/g, "\\'");

  let lastPct = 0;
  await run(config.ffmpeg.bin, [
    '-y', '-i', videoPath,
    '-vf', `subtitles='${escaped}'`,
    '-c:v', 'libx264', '-preset', config.ffmpeg.preset, '-crf', String(config.ffmpeg.crf),
    '-pix_fmt', 'yuv420p',
    '-c:a', 'aac', '-b:a', '160k',
    '-movflags', '+faststart',
    outPath
  ], {
    label: 'caption burn-in',
    onStderr: text => {
      if (!onProgress || !duration) return;
      /* e.g. "time=00:00:12.34" */
      const m = /time=(\d+):(\d+):(\d+\.?\d*)/.exec(text);
      if (!m) return;
      const secs = Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]);
      const pct = Math.max(0, Math.min(99, Math.round((secs / duration) * 100)));
      if (pct > lastPct) { lastPct = pct; onProgress(pct); }
    }
  });

  return outPath;
}

/* Used by the health check so the UI can say FFmpeg is missing. */
export async function ffmpegVersion() {
  try {
    const { stdout, stderr } = await run(config.ffmpeg.bin, ['-version'], { label: 'ffmpeg' });
    const line = (stdout || stderr).split('\n')[0] || '';
    return line.trim();
  } catch (e) {
    return null;
  }
}
