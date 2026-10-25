import { useCallback, useEffect, useRef, useState } from 'react';

export function useElementWidth() {
  const observer = useRef(null);
  const [width, setWidth] = useState(0);

  const ref = useCallback((el) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el) return;
    setWidth(el.getBoundingClientRect().width);
    observer.current = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width));
    observer.current.observe(el);
  }, []);

  useEffect(() => () => observer.current?.disconnect(), []);
  return [ref, width];
}
