import { clearSession, readSession } from './session.js';

export const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:3001' : '');

export class ApiError extends Error {
  constructor(message, { status = 0, network = false } = {}) {
    super(message);
    this.status = status;
    this.network = network;
  }
}

export const SIGNED_OUT_EVENT = 'radar:signed-out';

function headers(body, auth = true) {
  const out = {};
  if (body !== undefined) out['Content-Type'] = 'application/json';
  const token = auth ? readSession()?.token : null;
  if (token) out.Authorization = `Bearer ${token}`;
  return out;
}

// A 401 on anything but the sign-in call itself means the session ended: drop it and let the app show sign-in
function sessionEnded() {
  clearSession();
  window.dispatchEvent(new Event(SIGNED_OUT_EVENT));
}

async function request(path, { method = 'GET', body, signal, auth = true } = {}) {
  if (!API_URL) throw new ApiError('Couldn’t reach the server.', { network: true });
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      signal,
      headers: headers(body, auth),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Couldn’t reach the server.', { network: true });
  }
  let json = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok) {
    if (res.status === 401 && auth) sessionEnded();
    throw new ApiError(json?.error || 'Something went wrong on our side. Your items are safe.', { status: res.status });
  }
  return json;
}

export const apiGet = (path, options) => request(path, options);
export const apiPost = (path, body = {}, options) => request(path, { ...options, method: 'POST', body });
export const apiPatch = (path, body = {}, options) => request(path, { ...options, method: 'PATCH', body });
export const apiDelete = (path, body, options) => request(path, { ...options, method: 'DELETE', body });

// Fetches a file (the export) so it can be saved from the page
export async function apiFile(path) {
  if (!API_URL) throw new ApiError('Couldn’t reach the server.', { network: true });
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, { headers: headers(undefined) });
  } catch {
    throw new ApiError('Couldn’t reach the server.', { network: true });
  }
  if (!res.ok) {
    if (res.status === 401) sessionEnded();
    let message = 'Something went wrong on our side. Your items are safe.';
    try {
      message = (await res.json()).error || message;
    } catch {
      /* keep the default */
    }
    throw new ApiError(message, { status: res.status });
  }
  const named = /filename="?([^";]+)"?/i.exec(res.headers.get('Content-Disposition') || '');
  return { blob: await res.blob(), filename: named ? named[1] : 'radar-export' };
}
