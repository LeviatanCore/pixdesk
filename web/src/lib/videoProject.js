export const ASPECTS = {
  '16:9': { label: '16:9 Landscape', width: 1920, height: 1080, className: 'aspect-video' },
  '9:16': { label: '9:16 Shorts', width: 1080, height: 1920, className: 'aspect-[9/16]' },
};

export const EXPORT_QUALITIES = [
  {
    id: 'high',
    label: 'High',
    hint: '1080p · best quality',
    sizes: { '16:9': '1920×1080', '9:16': '1080×1920' },
  },
  {
    id: 'medium',
    label: 'Medium',
    hint: '720p · balanced',
    sizes: { '16:9': '1280×720', '9:16': '720×1280' },
  },
  {
    id: 'low',
    label: 'Low',
    hint: '480p · faster / smaller',
    sizes: { '16:9': '854×480', '9:16': '480×854' },
  },
];

export function uid(prefix = 'id') {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`;
}

export function formatTime(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  const m = Math.floor(s / 60);
  const rem = s - m * 60;
  return `${m}:${rem.toFixed(1).padStart(4, '0')}`;
}

export function pageDuration(page) {
  const start = Math.max(0, Number(page.trimIn) || 0);
  const end = Math.min(Number(page.duration) || start, Number(page.trimOut) || start);
  return Math.max(0.1, end - start);
}

export function totalDuration(pages) {
  return pages.reduce((sum, page) => sum + pageDuration(page), 0);
}

export function pageAtTime(pages, time) {
  let cursor = 0;
  for (let i = 0; i < pages.length; i += 1) {
    const dur = pageDuration(pages[i]);
    if (time < cursor + dur) {
      return { index: i, page: pages[i], localTime: time - cursor, start: cursor, duration: dur };
    }
    cursor += dur;
  }
  if (!pages.length) return null;
  const last = pages.length - 1;
  const dur = pageDuration(pages[last]);
  return { index: last, page: pages[last], localTime: dur, start: cursor - dur, duration: dur };
}

export function readMediaDuration(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const isAudio = file.type.startsWith('audio/');
    const el = document.createElement(isAudio ? 'audio' : 'video');
    el.preload = 'metadata';
    el.onloadedmetadata = () => {
      const duration = Number(el.duration) || 0;
      URL.revokeObjectURL(url);
      if (!duration || !Number.isFinite(duration)) reject(new Error('Could not read duration'));
      else resolve(duration);
    };
    el.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Could not load media'));
    };
    el.src = url;
  });
}

export async function makePageFromFile(file) {
  const duration = await readMediaDuration(file);
  const url = URL.createObjectURL(file);
  return {
    id: uid('page'),
    name: file.name,
    file,
    url,
    duration,
    trimIn: 0,
    trimOut: duration,
    volume: 1,
  };
}

export async function makeMusicFromFile(file) {
  const duration = await readMediaDuration(file);
  const url = URL.createObjectURL(file);
  return {
    id: uid('music'),
    name: file.name,
    file,
    url,
    duration,
    trimIn: 0,
    trimOut: duration,
    /** Where the music clip starts on the project timeline (seconds). */
    offset: 0,
    /** Overall music gain (multiplies the envelope). */
    volume: 0.35,
    /**
     * Envelope shape along the clip (t = 0…clipDuration).
     * Defaults to 1 so Base volume alone sets the level; drag points to automate.
     */
    volumeKeyframes: defaultVolumeKeyframes(duration, 1),
  };
}

export function musicClipDuration(music) {
  if (!music) return 0;
  const start = Math.max(0, Number(music.trimIn) || 0);
  const end = Math.min(Number(music.duration) || start, Number(music.trimOut) || start);
  return Math.max(0.1, end - start);
}

export function defaultVolumeKeyframes(clipDuration, volume = 0.35) {
  const dur = Math.max(0.1, Number(clipDuration) || 0.1);
  const v = clampVolume(volume);
  return [
    { id: uid('vk'), t: 0, volume: v },
    { id: uid('vk'), t: dur, volume: v },
  ];
}

export function clampVolume(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 1;
  return Math.min(2, Math.max(0, n));
}

export function normalizeVolumeKeyframes(keyframes, clipDuration, fallbackVolume = 0.35) {
  const dur = Math.max(0.1, Number(clipDuration) || 0.1);
  let points = Array.isArray(keyframes) ? keyframes.map((k) => ({ ...k })) : [];
  points = points
    .map((k) => ({
      id: k.id || uid('vk'),
      t: Math.min(dur, Math.max(0, Number(k.t) || 0)),
      volume: clampVolume(k.volume),
    }))
    .sort((a, b) => a.t - b.t);

  if (!points.length) return defaultVolumeKeyframes(dur, fallbackVolume);
  if (points[0].t > 0.001) points.unshift({ id: uid('vk'), t: 0, volume: points[0].volume });
  const last = points[points.length - 1];
  if (last.t < dur - 0.001) points.push({ id: uid('vk'), t: dur, volume: last.volume });
  // Deduplicate same-time points (keep last)
  const byT = new Map();
  for (const p of points) byT.set(Number(p.t.toFixed(3)), p);
  return [...byT.values()].sort((a, b) => a.t - b.t);
}

/**
 * Envelope value at local clip time (0…clipDuration), before base gain.
 * IMPORTANT: clipDuration must be the real music clip length — not localTime.
 */
export function volumeAtLocalTime(keyframes, localTime, clipDuration, fallbackEnvelope = 1) {
  const dur = Math.max(0.1, Number(clipDuration) || 0.1);
  const points = normalizeVolumeKeyframes(keyframes, dur, fallbackEnvelope);
  const t = Math.min(dur, Math.max(0, Number(localTime) || 0));
  if (t <= points[0].t) return points[0].volume;
  const last = points[points.length - 1];
  if (t >= last.t) return last.volume;
  for (let i = 0; i < points.length - 1; i += 1) {
    const a = points[i];
    const b = points[i + 1];
    if (t >= a.t && t <= b.t) {
      const span = Math.max(0.0001, b.t - a.t);
      const u = (t - a.t) / span;
      return a.volume + (b.volume - a.volume) * u;
    }
  }
  return fallbackEnvelope;
}

/** Final music level = base volume × envelope. */
export function musicGainAt(music, localTime) {
  if (!music) return 0;
  const clipDur = musicClipDuration(music);
  const env = volumeAtLocalTime(music.volumeKeyframes, localTime, clipDur, 1);
  return clampVolume(clampVolume(music.volume ?? 1) * env);
}

/** Build ffmpeg volume expression (time t starts at 0 after atrim). */
export function ffmpegVolumeExpression(keyframes, clipDuration, fallbackVolume = 0.35) {
  const points = normalizeVolumeKeyframes(keyframes, clipDuration, fallbackVolume);
  if (points.length === 1) return String(points[0].volume);
  // Nest from the end: if(lt(t,t1), lerp0, if(lt(t,t2), lerp1, …))
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
