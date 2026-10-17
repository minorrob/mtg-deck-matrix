import { useCallback, useEffect, useRef, useState } from 'react';

export function useElementSize<T extends HTMLElement>(): [(el: T | null) => void, { width: number; height: number }] {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const [el, setEl] = useState<T | null>(null);
  const ro = useRef<ResizeObserver | null>(null);
  const ref = useCallback((node: T | null) => setEl(node), []);
  useEffect(() => {
    if (!el) return;
    ro.current = new ResizeObserver(([e]) => setSize({ width: e.contentRect.width, height: e.contentRect.height }));
    ro.current.observe(el);
    return () => ro.current?.disconnect();
  }, [el]);
  return [ref, size];
}
