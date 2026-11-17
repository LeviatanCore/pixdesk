const TOKEN_KEY = 'leviatan_access_token';

export const AUTH_BASE =
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_LEVIATAN_AUTH_URL) ||
  'http://127.0.0.1:8790';

export function getToken() {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function setToken(token) {
  if (!token) {
    clearToken();
    return;
  }
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export function callbackRedirectUri() {
  return `${window.location.origin}/auth/callback`;
}

export function googleLoginUrl(app = 'pixdesk') {
  const url = new URL(`${AUTH_BASE}/auth/google`);
  url.searchParams.set('app', app);
  url.searchParams.set('redirect_uri', callbackRedirectUri());
  return url.toString();
}

export function devLoginUrl(app = 'pixdesk') {
  const url = new URL(`${AUTH_BASE}/auth/dev-login`);
  url.searchParams.set('app', app);
  url.searchParams.set('redirect_uri', callbackRedirectUri());
  return url.toString();
}

export async function fetchAuthConfig() {
  try {
    const res = await fetch(`${AUTH_BASE}/api/config`);
    if (!res.ok) return { google: false, devLogin: false };
    return await res.json();
  } catch {
    return { google: false, devLogin: false, offline: true };
  }
}

export async function fetchSession() {
  const token = getToken();
  if (!token) return null;
  const res = await fetch(`${AUTH_BASE}/api/me`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (res.status === 401) {
    clearToken();
    return null;
  }
  if (!res.ok) throw new Error('Could not load account');
  return res.json();
}

export function parseCallbackHash(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  const params = new URLSearchParams(raw);
  return {
    token: params.get('token'),
    app: params.get('app'),
    provider: params.get('provider'),
  };
}
