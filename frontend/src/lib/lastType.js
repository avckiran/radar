const KEY = 'radar.capture.type';
const TYPES = ['action', 'note', 'link'];

export function readLastType() {
  try {
    const saved = localStorage.getItem(KEY);
    return TYPES.includes(saved) ? saved : 'action';
  } catch {
    return 'action';
  }
}

export function rememberType(type) {
  try {
    localStorage.setItem(KEY, type);
  } catch {
    /* blocked storage: the default is fine */
  }
}
