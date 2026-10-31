const KEY = 'radar.search.recent';
const MAX = 6;

export function readRecent() {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((q) => typeof q === 'string').slice(0, MAX) : [];
  } catch {
    return [];
  }
}

export function addRecent(list, query) {
  const q = String(query ?? '').trim();
  if (q.length < 2) return list;
  return [q, ...list.filter((x) => x.toLowerCase() !== q.toLowerCase())].slice(0, MAX);
}

export function saveRecent(list) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list));
  } catch {
    /* blocked storage: recent searches just aren't kept */
  }
}
