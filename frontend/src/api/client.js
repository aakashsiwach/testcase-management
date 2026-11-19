// Thin fetch wrapper: base URL, Bearer token, JSON, friendly errors for 401 / 429 / network.
export const API_URL = (import.meta.env.VITE_API_URL || 'http://localhost:4000').replace(/\/$/, '');

const TOKEN_KEY = 'tcm.token';
let onUnauthorized = () => {};

export const tokenStore = {
  get: () => localStorage.getItem(TOKEN_KEY),
  set: (t) => localStorage.setItem(TOKEN_KEY, t),
  clear: () => localStorage.removeItem(TOKEN_KEY),
};

export const setUnauthorizedHandler = (fn) => {
  onUnauthorized = fn;
};

export class ApiError extends Error {
  constructor(status, message, details) {
    super(message);
    this.status = status;
    this.details = details;
  }
}

const toQuery = (params) => {
  if (!params) return '';
  const sp = new URLSearchParams();
  Object.entries(params).forEach(([k, v]) => {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length)) return;
    sp.set(k, Array.isArray(v) ? v.join(',') : String(v));
  });
  const s = sp.toString();
  return s ? `?${s}` : '';
};

async function request(method, path, { body, params, raw, form } = {}) {
  const headers = {};
  const token = tokenStore.get();
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body !== undefined && !form) headers['Content-Type'] = 'application/json';

  let res;
  try {
    res = await fetch(`${API_URL}${path}${toQuery(params)}`, {
      method,
      headers,
      body: form || (body !== undefined ? JSON.stringify(body) : undefined),
    });
  } catch {
    throw new ApiError(0, 'Cannot reach the server. If it was idle it may be waking up (up to a minute) – please retry.');
  }

  if (res.status === 401 && token) onUnauthorized();
  if (raw && res.ok) return res;
  if (res.status === 204) return null;

  const isJson = (res.headers.get('content-type') || '').includes('application/json');
  const data = isJson ? await res.json() : await res.text();
  if (!res.ok) {
    if (res.status === 429) {
      const secs = data?.retryAfterSeconds || Number(res.headers.get('retry-after')) || 60;
      throw new ApiError(429, `Too many requests – please retry in ${Math.ceil(secs / 60)} min.`);
    }
    const details = Array.isArray(data?.details) ? data.details : undefined;
    const message = data?.error || `Request failed (${res.status})`;
    throw new ApiError(res.status, message, details);
  }
  if (isJson && data && typeof data === 'object' && !Array.isArray(data)) {
    Object.defineProperty(data, '__cache', { value: res.headers.get('x-cache'), enumerable: false });
  }
  return data;
}

export const api = {
  get: (path, params) => request('GET', path, { params }),
  post: (path, body, params) => request('POST', path, { body, params }),
  put: (path, body) => request('PUT', path, { body }),
  patch: (path, body) => request('PATCH', path, { body }),
  del: (path) => request('DELETE', path),
  upload: (path, form) => request('POST', path, { form }),
  // Authenticated file download (attachments, CSV export)
  async download(path, params, fallbackName) {
    const res = await request('GET', path, { params, raw: true });
    const blob = await res.blob();
    const cd = res.headers.get('content-disposition') || '';
    const name = /filename="?([^"]+)"?/.exec(cd)?.[1] || fallbackName;
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  },
};

export const errorText = (err) => {
  if (!err) return '';
  if (err.details?.length) return `${err.message}: ${err.details.map((d) => (d.path ? `${d.path} – ${d.message}` : d.message || `row ${d.row}: ${d.message}`)).join('; ')}`;
  return err.message || String(err);
};
