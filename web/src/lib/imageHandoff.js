const KEY = 'pixdesk:handoff-image';

export function setHandoffImage(dataUrl) {
  sessionStorage.setItem(KEY, dataUrl);
}

export function getHandoffImage() {
  return sessionStorage.getItem(KEY);
}

export function clearHandoffImage() {
  sessionStorage.removeItem(KEY);
}

export function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

export async function dataUrlToBlob(dataUrl) {
  const res = await fetch(dataUrl);
  return res.blob();
}

export async function exportToServer(dataUrl, { filename, format = 'png', width, height } = {}) {
  const blob = await dataUrlToBlob(dataUrl);
  const form = new FormData();
  form.append('file', blob, filename || `pixdesk.${format === 'jpg' ? 'jpg' : 'png'}`);
  form.append('format', format);
  if (filename) form.append('filename', filename);
  if (width) form.append('width', String(width));
  if (height) form.append('height', String(height));

  const res = await fetch('/api/export', { method: 'POST', body: form });
  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || 'Export failed');
  }
  return res.json();
}
