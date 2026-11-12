import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import ffmpegPath from 'ffmpeg-static';

const ASPECTS = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
};

/** Export quality presets: resolution + encode speed/size. */
const QUALITIES = {
  high: {
    id: 'high',
    crf: 18,
    preset: 'fast',
    audioBitrate: '192k',
    sizes: { '16:9': [1920, 1080], '9:16': [1080, 1920] },
  },
  medium: {
    id: 'medium',
    crf: 23,
    preset: 'veryfast',
    audioBitrate: '160k',
    sizes: { '16:9': [1280, 720], '9:16': [720, 1280] },
  },
  low: {
    id: 'low',
    crf: 28,
    preset: 'veryfast',
    audioBitrate: '128k',
    sizes: { '16:9': [854, 480], '9:16': [480, 854] },
  },
};

function resolveQuality(quality, aspect) {
  const q = QUALITIES[quality] || QUALITIES.high;
  const aspectKey = ASPECTS[aspect] ? aspect : '16:9';
  const [width, height] = q.sizes[aspectKey] || q.sizes['16:9'];
  return { ...q, width, height };
}

function run(cmd, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('error', reject);
    child.on('close', (code) => {
      if (code === 0) resolve(stderr);
      else reject(new Error(stderr.slice(-2000) || `ffmpeg exited ${code}`));
    });
  });
}

function clampVolume(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(2, Math.max(0, n));
}

function normalizeKeyframes(keyframes, clipDuration, fallbackVolume = 0.35) {
  const dur = Math.max(0.1, Number(clipDuration) || 0.1);
  let points = Array.isArray(keyframes) ? keyframes.map((k) => ({ ...k })) : [];
  points = points
    .map((k) => ({
      t: Math.min(dur, Math.max(0, Number(k.t) || 0)),
      volume: clampVolume(k.volume),
    }))
    .sort((a, b) => a.t - b.t);
  if (!points.length) {
    return [
      { t: 0, volume: clampVolume(fallbackVolume) },
      { t: dur, volume: clampVolume(fallbackVolume) },
    ];
  }
  if (points[0].t > 0.001) points.unshift({ t: 0, volume: points[0].volume });
  const last = points[points.length - 1];
  if (last.t < dur - 0.001) points.push({ t: dur, volume: last.volume });
  const byT = new Map();
  for (const p of points) byT.set(Number(p.t.toFixed(3)), p);
  return [...byT.values()].sort((a, b) => a.t - b.t);
}

/** ffmpeg volume expr; commas escaped for filtergraph. */
function volumeExpression(keyframes, clipDuration, fallbackVolume = 0.35) {
  const points = normalizeKeyframes(keyframes, clipDuration, fallbackVolume);
  if (points.length === 1) return String(Number(points[0].volume.toFixed(4)));
  let expr = String(Number(points[points.length - 1].volume.toFixed(4)));
  for (let i = points.length - 2; i >= 0; i -= 1) {
    const a = points[i];
    const b = points[i + 1];
    const span = Math.max(0.0001, b.t - a.t);
    const av = Number(a.volume.toFixed(4));
    const bv = Number(b.volume.toFixed(4));
    const at = Number(a.t.toFixed(4));
    const bt = Number(b.t.toFixed(4));
    const lerp = `${av}+(${bv}-${av})*(t-${at})/${span}`;
    expr = `if(lt(t\\,${bt})\\,${lerp}\\,${expr})`;
  }
  return expr;
}

function ensureAspect(aspect) {
  return ASPECTS[aspect] ? aspect : '16:9';
}

/**
 * Build an MP4 from ordered page clips + optional background music.
 * pages: [{ path, trimIn, trimOut, volume }]
 * music: { path, volume, trimIn } | null
 */
export async function exportVideoProject({ workDir, aspect, pages, music, quality = 'high' }) {
  if (!ffmpegPath) throw new Error('ffmpeg binary missing');
  if (!pages?.length) throw new Error('Add at least one video page');

  const aspectKey = ensureAspect(aspect);
  const q = resolveQuality(quality, aspectKey);
  const { width, height, crf, preset, audioBitrate } = q;
  fs.mkdirSync(workDir, { recursive: true });

  const clipPaths = [];
  for (let i = 0; i < pages.length; i += 1) {
    const page = pages[i];
    const trimIn = Math.max(0, Number(page.trimIn) || 0);
    const trimOut = Math.max(trimIn + 0.1, Number(page.trimOut) || trimIn + 0.1);
    const duration = trimOut - trimIn;
    const volume = clampVolume(page.volume);
    const out = path.join(workDir, `clip-${String(i).padStart(3, '0')}.mp4`);

    // Scale + pad to canvas; generate silent audio if the source has none.
    const filter = [
      `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,`,
      `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v]`,
      `;[0:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=${volume}[a]`,
    ].join('');

    try {
      await run(
        ffmpegPath,
        [
          '-y',
          '-ss', String(trimIn),
          '-t', String(duration),
          '-i', page.path,
          '-filter_complex', filter,
          '-map', '[v]',
          '-map', '[a]',
          '-c:v', 'libx264',
          '-preset', preset,
          '-crf', String(crf),
          '-c:a', 'aac',
          '-b:a', audioBitrate,
          '-movflags', '+faststart',
          out,
        ],
        workDir,
      );
    } catch (err) {
      // Retry without relying on source audio (images / muted clips).
      const silentFilter = [
        `[0:v]scale=${width}:${height}:force_original_aspect_ratio=decrease,`,
        `pad=${width}:${height}:(ow-iw)/2:(oh-ih)/2,setsar=1,fps=30,format=yuv420p[v]`,
        `;[1:a]aformat=sample_rates=44100:channel_layouts=stereo,volume=${volume}[a]`,
      ].join('');
      await run(
        ffmpegPath,
        [
          '-y',
          '-ss', String(trimIn),
          '-t', String(duration),
          '-i', page.path,
          '-f', 'lavfi',
          '-i', 'anullsrc=channel_layout=stereo:sample_rate=44100',
          '-filter_complex', silentFilter,
          '-map', '[v]',
          '-map', '[a]',
          '-c:v', 'libx264',
          '-preset', preset,
          '-crf', String(crf),
          '-c:a', 'aac',
          '-b:a', audioBitrate,
          '-shortest',
          '-movflags', '+faststart',
          out,
        ],
        workDir,
      );
    }
    clipPaths.push(out);
  }

  const listFile = path.join(workDir, 'concat.txt');
  fs.writeFileSync(
    listFile,
    clipPaths.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'),
  );

  const concatOut = path.join(workDir, 'concat.mp4');
  await run(
    ffmpegPath,
    ['-y', '-f', 'concat', '-safe', '0', '-i', listFile, '-c', 'copy', concatOut],
    workDir,
  );

  const finalName = `pixdesk-video-${randomUUID().slice(0, 8)}.mp4`;
  const finalPath = path.join(workDir, finalName);

  if (!music?.path) {
    fs.copyFileSync(concatOut, finalPath);
    return { name: finalName, path: finalPath };
  }

  const musicTrimIn = Math.max(0, Number(music.trimIn) || 0);
  const musicTrimOut = Math.max(musicTrimIn + 0.1, Number(music.trimOut) || musicTrimIn + 0.1);
  const musicOffset = Math.max(0, Number(music.offset) || 0);
  const clipDur = musicTrimOut - musicTrimIn;
  const delayMs = Math.round(musicOffset * 1000);
  // Envelope is relative (default 1); base volume multiplies it.
  const baseGain = clampVolume(music.volume ?? 1);
  const envExpr = volumeExpression(music.volumeKeyframes, clipDur, 1);
  const volExpr = `(${envExpr})*${baseGain}`;
  const mixFilter = [
    '[0:a]aformat=sample_rates=44100:channel_layouts=stereo[va]',
    `;[1:a]atrim=start=${musicTrimIn}:end=${musicTrimOut},asetpts=PTS-STARTPTS,`,
    `aformat=sample_rates=44100:channel_layouts=stereo,`,
    `volume='${volExpr}':eval=frame,`,
    `adelay=${delayMs}|${delayMs},apad[ma]`,
    ';[va][ma]amix=inputs=2:duration=first:dropout_transition=0[a]',
  ].join('');

  await run(
    ffmpegPath,
    [
      '-y',
      '-i', concatOut,
      '-i', music.path,
      '-filter_complex', mixFilter,
      '-map', '0:v',
      '-map', '[a]',
      '-c:v', 'copy',
      '-c:a', 'aac',
      '-b:a', '192k',
      '-shortest',
      '-movflags', '+faststart',
      finalPath,
    ],
    workDir,
  );

  return { name: finalName, path: finalPath };
}

export { ASPECTS, QUALITIES, ensureAspect, resolveQuality };
