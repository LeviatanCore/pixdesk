const STORAGE_KEY = 'pixdesk:image-history';
const MAX_ITEMS = 24;

/** @typedef {{ id: string, dataUrl: string, kind: string, label: string, createdAt: number }} HistoryItem */

/** @type {HistoryItem[]} */
let items = [];
const listeners = new Set();

function notify() {
  for (const fn of listeners) fn(items);
}

function loadFromSession() {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      items = parsed.filter(
        (item) => item && typeof item.dataUrl === 'string' && item.dataUrl.startsWith('data:')
      );
    }
  } catch {
    items = [];
  }
}

function persist() {
  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    return;
  } catch {
    // QuotaExceeded — drop oldest until it fits, keep newest in memory always
  }

  let working = [...items];
  while (working.length > 1) {
    working = working.slice(0, -1);
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(working));
      items = working;
      return;
    } catch {
      // keep trimming
    }
  }

  try {
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(working));
    items = working;
  } catch {
    // memory-only for this session
  }
}

loadFromSession();

export function subscribeHistory(listener) {
  listeners.add(listener);
  listener(items);
  return () => listeners.delete(listener);
}

export function listHistory() {
  return items;
}

export function getHistoryItem(id) {
  return items.find((item) => item.id === id) || null;
}

/**
 * @param {{ dataUrl: string, kind?: string, label?: string }} input
 * @returns {HistoryItem}
 */
export function addHistoryItem({ dataUrl, kind = 'image', label = 'Image' }) {
  if (!dataUrl || typeof dataUrl !== 'string') {
    throw new Error('Missing image data');
  }

  const item = {
    id: crypto.randomUUID(),
    dataUrl,
    kind,
    label,
    createdAt: Date.now(),
  };

  items = [item, ...items.filter((existing) => existing.dataUrl !== dataUrl)].slice(0, MAX_ITEMS);
  persist();
  notify();
  return item;
}

export function removeHistoryItem(id) {
  items = items.filter((item) => item.id !== id);
  persist();
  notify();
}

export function clearHistory() {
  items = [];
  try {
    sessionStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  notify();
}

export function blobUrlToDataUrl(blobUrl) {
  return fetch(blobUrl)
    .then((res) => res.blob())
    .then(
      (blob) =>
        new Promise((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result);
          reader.onerror = reject;
          reader.readAsDataURL(blob);
        })
    );
}

export function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
