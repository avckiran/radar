export const API_URL = import.meta.env.VITE_API_URL ?? (import.meta.env.DEV ? 'http://localhost:3001' : '');

export class ApiError extends Error {
  constructor(message, { status = 0, network = false } = {}) {
    super(message);
    this.status = status;
    this.network = network;
  }
}

export async function apiGet(path, { signal } = {}) {
  if (!API_URL) throw new ApiError('Couldn’t reach the server.', { network: true });
  let res;
  try {
    res = await fetch(`${API_URL}${path}`, { signal });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError('Couldn’t reach the server.', { network: true });
  }
  let body = null;
  try {
    body = await res.json();
  } catch {

  }
  if (!res.ok) {
    throw new ApiError(body?.error || 'Something went wrong on our side. Your items are safe.', { status: res.status });
  }
  return body;
}
