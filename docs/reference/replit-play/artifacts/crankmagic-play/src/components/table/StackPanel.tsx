// The stack, top first. Resolve-all appears only when the decision offers it.
// A rules-helper chip explains what passing does right now.
import { Layers, Lightbulb } from 'lucide-react';
import { displayName, seatColor } from '@/game/derive';
import { anchorRef } from '@/lib/flights';
import { artFor } from '@/lib/art';
import { useGame } from '@/state/game';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

export function StackPanel({ compact }: { compact?: boolean }) {
  const { view, choose } = useGame();
  const stack = [...view.state.stack].reverse();
  const resolveAll = view.decision?.options.find((o) => o.act === 'resolve-all');
  if (stack.length === 0) return <div ref={anchorRef('stack')} className="h-0 w-0" aria-hidden />;
  const shown = stack.slice(0, compact ? 4 : 8);
  return (
    <section ref={anchorRef('stack')} aria-label={`Stack, ${stack.length} items`} className="readout w-[260px] rounded-xl p-2.5 shadow-lg" data-testid="stack-panel">
      <div className="mb-1.5 flex items-center gap-2">
        <Layers className="h-4 w-4" aria-hidden />
        <span className="zone-label !text-inherit">Stack · {stack.length}</span>
        <Popover>
          <PopoverTrigger className="ml-auto inline-flex items-center gap-1 rounded-full bg-white/15 px-2 py-0.5 text-[11px]" data-testid="chip-rules-helper">
            <Lightbulb className="h-3 w-3" /> What now?
          </PopoverTrigger>
          <PopoverContent className="w-72 text-sm">
            The top item resolves first, once every player passes in a row. Passing now lets <b>{stack[0].faceDown ? 'the face-down spell' : stack[0].name}</b> resolve. To answer it, choose a spell or ability instead.
          </PopoverContent>
        </Popover>
      </div>
      <ol className="space-y-1">
        {shown.map((s, i) => (
          <li key={s.stackId} className="flex items-center gap-2 rounded-lg bg-white/10 px-1.5 py-1 text-[12px]" style={{ opacity: i === 0 ? 1 : 0.85 }}>
            <span className="h-6 w-[17px] shrink-0 overflow-hidden rounded-[2px]" style={{ boxShadow: `0 0 0 1.5px ${seatColor(s.playerId)}` }}>
              {s.faceDown || !s.name ? <span className="card-back block h-full w-full" /> : <img src={artFor(s.name).src} alt="" className="h-full w-full object-cover" />}
            </span>
            <span className="min-w-0 flex-1 truncate">{s.faceDown ? 'Face-down spell' : s.name}</span>
            <span className="text-[10px] opacity-75">{s.kind} · {displayName(view, s.playerId)}</span>
          </li>
        ))}
      </ol>
      {stack.length > shown.length && <div className="mt-1 text-[11px] opacity-75">+{stack.length - shown.length} more below</div>}
      {resolveAll && (
        <button onClick={() => choose(resolveAll)} className="mt-2 w-full rounded-lg bg-[hsl(var(--lichen))] px-2 py-1.5 text-[12px] font-semibold text-[hsl(var(--ink))]" data-testid="button-resolve-all">
          {resolveAll.label}{resolveAll.count ? ` (${resolveAll.count})` : ''}
        </button>
      )}
    </section>
  );
}
