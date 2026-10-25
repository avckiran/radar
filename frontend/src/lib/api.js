export const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:3001' : '');

export class ApiError extends Error {
  constructor(message, { status = 0, network = false } = {}) {
    super(message);
    this.status = status;
    this.network = network;
  }
}

async function request(path, { method = 'GET', body, signal } = {}) {
  if (!API_URL) throw new ApiError('Couldn’t reach the server.', { network: true });
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, {
      method,
      signal,
      headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
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
    throw new ApiError(json?.error || 'Something went wrong on our side. Your items are safe.', { status: res.status });
  }
  return json;
}

export const apiGet = (path, options) => request(path, options);
export const apiPost = (path, body = {}, options) => request(path, { ...options, method: 'POST', body });
export const apiPatch = (path, body = {}, options) => request(path, { ...options, method: 'PATCH', body });
export const apiDelete = (path, options) => request(path, { ...options, method: 'DELETE' });
