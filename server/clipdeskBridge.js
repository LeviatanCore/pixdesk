import { Readable } from 'node:stream';

const VIDEO_EXT = new Set(['.mp4', '.webm', '.mkv', '.mov', '.m4v']);

export function clipdeskBaseUrl() {
  return (process.env.CLIPDESK_URL || 'http://127.0.0.1:8765').replace(/\/$/, '');
}

function isVideoName(name) {
  const lower = String(name || '').toLowerCase();
  const dot = lower.lastIndexOf('.');
  return dot >= 0 && VIDEO_EXT.has(lower.slice(dot));
}

async function clipdeskFetch(path, search = {}) {
  const url = new URL(path, `${clipdeskBaseUrl()}/`);
  for (const [key, value] of Object.entries(search)) {
    if (value != null && value !== '') url.searchParams.set(key, String(value));
  }
  const response = await fetch(url, { signal: AbortSignal.timeout(30_000) });
  return { url, response };
}

export async function clipdeskStatus() {
  try {
    const { response } = await clipdeskFetch('/api/meta');
    if (!response.ok) {
      return { available: false, reason: `Clipdesk responded ${response.status}` };
    }
    const meta = await response.json();
    return {
      available: true,
      url: clipdeskBaseUrl(),
      output_dir: meta.output_dir,
      output_hint: meta.output_hint,
    };
  } catch (err) {
    return {
      available: false,
      url: clipdeskBaseUrl(),
      reason: err.cause?.code === 'ECONNREFUSED'
        ? 'Clipdesk is not running (start it on :8765)'
        : err.message || 'Clipdesk unreachable',
    };
  }
}

export async function listClipdeskVideos(output = '') {
  const { response } = await clipdeskFetch('/api/files', { output });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    const error = new Error(body.error || `Clipdesk files failed (${response.status})`);
    error.status = response.status;
    throw error;
  }
  const data = await response.json();
  const files = (data.files || []).filter((file) => isVideoName(file.name));
  return {
    output_dir: data.output_dir,
    output_hint: data.output_hint,
    files,
  };
}

export async function streamClipdeskFile(name, output = '') {
  const safe = String(name || '').trim();
  if (!safe || safe.includes('..') || safe.includes('/') || safe.includes('\\')) {
    const error = new Error('Invalid file name');
    error.status = 400;
    throw error;
  }
  const { response } = await clipdeskFetch(`/files/${encodeURIComponent(safe)}`, { output });
  if (!response.ok) {
    const error = new Error(response.status === 404 ? 'File not found in Clipdesk' : 'Clipdesk file failed');
    error.status = response.status;
    throw error;
  }
  const contentType = response.headers.get('content-type') || 'application/octet-stream';
  const body = response.body ? Readable.fromWeb(response.body) : Readable.from([]);
  return { contentType, body, filename: safe };
}
