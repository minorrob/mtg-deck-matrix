// Counters drawn as small die faces (d6 pips up to six, a numbered chip beyond).
const PIPS: Record<number, [number, number][]> = {
  1: [[1, 1]],
  2: [[0, 0], [2, 2]],
  3: [[0, 0], [1, 1], [2, 2]],
  4: [[0, 0], [2, 0], [0, 2], [2, 2]],
  5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]],
  6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]],
};

function tone(kind: string): string {
  if (kind === '+1/+1') return 'hsl(var(--lichen))';
  if (kind === 'loyalty') return 'hsl(var(--brass))';
  if (kind.startsWith('-')) return 'hsl(var(--destructive))';
  return 'hsl(var(--primary))';
}

export function Die({ n, kind, size }: { n: number; kind: string; size: number }) {
  const c = tone(kind);
  if (n > 6 || n < 1) {
    return (
      <span className="grid place-items-center rounded-[4px] font-mono font-bold text-white shadow" style={{ minWidth: size, height: size, background: c, fontSize: Math.max(10, size * 0.55), padding: '0 3px' }} title={`${kind} ×${n}`}>
        {n}
      </span>
    );
  }
  const pip = size / 5.2;
  return (
    <span className="relative inline-block rounded-[4px] bg-white shadow" style={{ width: size, height: size, border: `1.5px solid ${c}` }} title={`${kind} ×${n}`}>
      {PIPS[n].map(([x, y], i) => (
        <span key={i} className="absolute rounded-full" style={{ width: pip, height: pip, background: c, left: size * (0.18 + x * 0.29) - pip / 2 + 1, top: size * (0.18 + y * 0.29) - pip / 2 + 1 }} />
      ))}
    </span>
  );
}

export function CounterDice({ counters, size }: { counters: Record<string, number>; size: number }) {
  const d = Math.max(12, size * 0.2);
  return (
    <div className="absolute bottom-[3%] left-[4%] flex flex-col gap-0.5">
      {Object.entries(counters).map(([k, n]) => (
        <span key={k} className="flex items-center gap-0.5" aria-label={`${n} ${k} counters`}>
          <Die n={n} kind={k} size={d} />
          {size > 64 && !['+1/+1', 'loyalty'].includes(k) && <span className="rounded bg-[hsl(var(--card)/0.9)] px-1 text-[10px]">{k}</span>}
        </span>
      ))}
    </div>
  );
}
