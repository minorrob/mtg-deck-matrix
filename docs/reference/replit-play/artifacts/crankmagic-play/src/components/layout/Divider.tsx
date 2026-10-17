// Pane divider: drag, double-click to reset, arrow keys (Shift = bigger steps).
import { useRef } from 'react';
import { cn } from '@/lib/utils';

export function Divider({ axis, value, min, max, onChange, onReset, invert, label }: {
  axis: 'x' | 'y'; value: number; min: number; max: number; onChange: (n: number) => void; onReset: () => void; invert?: boolean; label: string;
}) {
  const start = useRef<{ p: number; v: number } | null>(null);
  const clamp = (n: number) => Math.min(max, Math.max(min, Math.round(n)));
  return (
    <div
      role="separator"
      aria-orientation={axis === 'x' ? 'vertical' : 'horizontal'}
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onDoubleClick={onReset}
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
        start.current = { p: axis === 'x' ? e.clientX : e.clientY, v: value };
      }}
      onPointerMove={(e) => {
        if (!start.current) return;
        const d = (axis === 'x' ? e.clientX : e.clientY) - start.current.p;
        onChange(clamp(start.current.v + (invert ? -d : d)));
      }}
      onPointerUp={() => (start.current = null)}
      onKeyDown={(e) => {
        const step = e.shiftKey ? 48 : 16;
        const dec = axis === 'x' ? 'ArrowLeft' : 'ArrowUp';
        const inc = axis === 'x' ? 'ArrowRight' : 'ArrowDown';
        if (e.key === dec) onChange(clamp(value + (invert ? step : -step)));
        else if (e.key === inc) onChange(clamp(value + (invert ? -step : step)));
        else if (e.key === 'Enter') onReset();
        else return;
        e.preventDefault();
      }}
      className={cn(axis === 'x' ? 'divider-v' : 'divider-h', 'shrink-0 touch-none outline-none focus-visible:bg-primary/40')}
      data-testid={`divider-${label.toLowerCase().replace(/\s+/g, '-')}`}
    />
  );
}
