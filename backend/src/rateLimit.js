// A small in-memory limiter: at most `max` failures per key in `windowMs`. Fine for one API server.
export function createLimiter({ max, windowMs, now = () => Date.now() }) {
  const hits = new Map();

  function live(key) {
    const t = now();
    const list = (hits.get(key) ?? []).filter((at) => t - at < windowMs);
    if (list.length) hits.set(key, list);
    else hits.delete(key);
    return list;
  }

  return {
    // Seconds until another try is allowed, or 0
    retryAfter(key) {
      const list = live(key);
      if (list.length < max) return 0;
      return Math.max(1, Math.ceil((list[0] + windowMs - now()) / 1000));
    },
    fail(key) {
      const list = live(key);
      list.push(now());
      hits.set(key, list);
      if (hits.size > 5000) for (const k of hits.keys()) live(k);
    },
    clear(key) {
      hits.delete(key);
    },
  };
}
