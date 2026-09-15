const TOKEN_KEY = 'oyo10x.token';

// When the frontend and backend are the same origin (single-server deploy, or
// local dev via the Vite proxy), this stays empty and requests go to relative
// paths. When they are split across two hosts (e.g. Vercel + Render), set
// VITE_API_URL at build time to the backend's full origin, no trailing slash.
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '');

/** Turn a server-relative path (e.g. an uploaded photo) into an absolute one. */
export const assetUrl = (path) => (!path ? path : API_BASE + path);

export const getToken = () => localStorage.getItem(TOKEN_KEY);
export const setToken = (t) => localStorage.setItem(TOKEN_KEY, t);
export const clearToken = () => localStorage.removeItem(TOKEN_KEY);

async function request(path, options = {}) {
  const headers = { ...(options.headers || {}) };
  const token = getToken();
  if (token) headers.Authorization = 'Bearer ' + token;

  const isForm = options.body instanceof FormData;
  if (!isForm && options.body !== undefined) headers['Content-Type'] = 'application/json';

  const res = await fetch(API_BASE + '/api' + path, {
    ...options,
    headers,
    body: isForm ? options.body
        : options.body !== undefined ? JSON.stringify(options.body) : undefined,
  });

  if (res.status === 401 && getToken()) {
    clearToken();
    if (!location.pathname.startsWith('/login')) location.href = '/login';
    throw new Error('Your session has expired. Please sign in again.');
  }

  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

  if (!res.ok) {
    const err = new Error(data.error || 'Request failed (' + res.status + ')');
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  get: (p) => request(p),
  post: (p, body) => request(p, { method: 'POST', body }),
  patch: (p, body) => request(p, { method: 'PATCH', body }),
  delete: (p) => request(p, { method: 'DELETE' }),
  form: (p, formData) => request(p, { method: 'POST', body: formData }),
};

export async function publicRequest(path, options = {}) {
  const res = await fetch(API_BASE + path, {
    ...options,
    headers: { 'Content-Type': 'application/json', ...(options.headers || {}) },
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) { const err = new Error(data.error || 'Request failed'); err.data = data; err.status = res.status; throw err; }
  return data;
}

async function triggerCsvDownload(res, filename) {
  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.error || 'Export failed');
  }
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** Trigger a CSV download through the authenticated GET endpoint. */
export async function downloadCsv(path, filename) {
  const res = await fetch(API_BASE + '/api' + path, {
    headers: { Authorization: 'Bearer ' + getToken() },
  });
  await triggerCsvDownload(res, filename);
}

/** Trigger a CSV download through an authenticated POST (for exports that also change data). */
export async function downloadCsvPost(path, body, filename) {
  const res = await fetch(API_BASE + '/api' + path, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + getToken(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {}),
  });
  await triggerCsvDownload(res, filename);
}

export const naira = (n) =>
  '₦' + Number(n || 0).toLocaleString('en-NG', { maximumFractionDigits: 0 });

export const num = (n) => Number(n || 0).toLocaleString('en-NG');

export const pct = (a, b) => (b ? Math.round((a / b) * 100) : 0);

export function timeAgo(iso) {
  if (!iso) return '--';
  const secs = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (secs < 60) return 'just now';
  if (secs < 3600) return Math.floor(secs / 60) + 'm ago';
  if (secs < 86400) return Math.floor(secs / 3600) + 'h ago';
  if (secs < 2592000) return Math.floor(secs / 86400) + 'd ago';
  return new Date(iso).toLocaleDateString('en-NG', { day: 'numeric', month: 'short' });
}

export const LEVEL_LABEL = {
  mobiliser: 'Mobiliser',
  participant: 'Participant',
};

export const ROLE_LABEL = {
  superadmin: 'Super Administrator',
  admin: 'Administrator',
  candidate: 'Candidate',
  mobiliser: 'Mobiliser',
  participant: 'Participant',
};
