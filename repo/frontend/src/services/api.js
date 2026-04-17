const BASE = '/api/v1';

function authHeaders() {
  const t = localStorage.getItem('token');
  return t ? { Authorization: `Bearer ${t}` } : {};
}

export async function api(path, { method = 'GET', body, headers = {}, formData } = {}) {
  const opts = {
    method,
    headers: {
      ...(formData ? {} : { 'Content-Type': 'application/json' }),
      ...authHeaders(),
      ...headers,
    },
    body: formData ? formData : (body ? JSON.stringify(body) : undefined),
  };
  const res = await fetch(BASE + path, opts);
  let json = null;
  try { json = await res.json(); } catch {}
  if (!res.ok) {
    const err = new Error((json && json.error && json.error.message) || `HTTP ${res.status}`);
    err.status = res.status;
    err.code = json && json.error && json.error.code;
    err.details = json && json.error && json.error.details;
    throw err;
  }
  return json && json.data;
}

export function idempotent(key, path, opts) {
  return api(path, { ...opts, headers: { ...(opts && opts.headers || {}), 'Idempotency-Key': key } });
}
