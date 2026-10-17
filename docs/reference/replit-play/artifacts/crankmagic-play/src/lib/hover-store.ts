// Hover lives outside React context so a hovered card never re-renders the board.
import { useSyncExternalStore } from 'react';

let hovered: number | null = null;
const subs = new Set<() => void>();
let timer: number | undefined;

export function setHover(id: number | null, delay = 380) {
  window.clearTimeout(timer);
  if (id == null) {
    hovered = null;
    subs.forEach((s) => s());
    return;
  }
  timer = window.setTimeout(() => {
    hovered = id;
    subs.forEach((s) => s());
  }, delay);
}

export function useHovered(): number | null {
  return useSyncExternalStore(
    (cb) => {
      subs.add(cb);
      return () => subs.delete(cb);
    },
    () => hovered,
  );
}
