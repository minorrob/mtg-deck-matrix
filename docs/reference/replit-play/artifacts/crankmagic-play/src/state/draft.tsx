// Decision draft: the in-progress answer for many/order/damage/amount modes,
// shared by the dock and by clicking cards on the mats.
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useGame } from './game';

interface Ctx {
  selected: number[];
  amounts: number[];
  toggle: (index: number) => void;
  toggleCard: (cardId: number) => void;
  setSelected: (s: number[]) => void;
  setAmount: (i: number, n: number) => void;
  isCardSelected: (cardId: number) => boolean;
  zoom: (cardId: number) => void;
  reset: () => void;
}
const DraftCtx = createContext<Ctx | null>(null);

export function DraftProvider({ children }: { children: ReactNode }) {
  const { view, setZoomId } = useGame();
  const d = view.decision;
  const [selected, setSelected] = useState<number[]>([]);
  const [amounts, setAmounts] = useState<number[]>([]);

  useEffect(() => {
    setSelected(d?.mode === 'order' ? d.options.map((o) => o.index) : []);
    setAmounts(d ? d.options.map(() => 0) : []);
  }, [d?.id, view.revision]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = useCallback(
    (index: number) => {
      if (!d) return;
      setSelected((s) => {
        if (s.includes(index)) return s.filter((x) => x !== index);
        let next = [...s, index];
        if (d.exclusiveBy) {
          const key = d.options[index][d.exclusiveBy];
          next = next.filter((i) => i === index || d.options[i][d.exclusiveBy!] !== key);
        }
        if (d.max === 1) next = [index];
        return next;
      });
    },
    [d],
  );

  const toggleCard = useCallback(
    (cardId: number) => {
      if (!d) return;
      const mine = d.options.filter((o) => o.cardId === cardId).map((o) => o.index);
      if (!mine.length) return;
      setSelected((s) => {
        const cur = mine.findIndex((i) => s.includes(i));
        const without = s.filter((i) => !mine.includes(i));
        if (cur === -1) return d.max === 1 ? [mine[0]] : [...without, mine[0]];
        if (cur + 1 < mine.length) return [...without, mine[cur + 1]]; // cycle through this card's options
        return without;
      });
    },
    [d],
  );

  const isCardSelected = useCallback((cardId: number) => !!d && selected.some((i) => d.options[i]?.cardId === cardId), [d, selected]);
  const setAmount = useCallback((i: number, n: number) => setAmounts((a) => a.map((x, j) => (j === i ? Math.max(0, n) : x))), []);
  const reset = useCallback(() => {
    setSelected([]);
    setAmounts((a) => a.map(() => 0));
  }, []);

  const value = useMemo(
    () => ({ selected, amounts, toggle, toggleCard, setSelected, setAmount, isCardSelected, zoom: setZoomId, reset }),
    [selected, amounts, toggle, toggleCard, setAmount, isCardSelected, setZoomId, reset],
  );
  return <DraftCtx.Provider value={value}>{children}</DraftCtx.Provider>;
}

export function useDraft(): Ctx {
  const c = useContext(DraftCtx);
  if (!c) throw new Error('useDraft outside DraftProvider');
  return c;
}
