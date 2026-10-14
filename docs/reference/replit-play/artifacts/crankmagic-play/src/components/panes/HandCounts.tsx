// Hand counts by player. The only place other players' hands exist in the UI:
// a number, never a container or card backs.
import { displayName, seatColor } from '@/game/derive';
import { useGame } from '@/state/game';
import { cn } from '@/lib/utils';

export function HandCounts() {
  const { view } = useGame();
  return (
    <section aria-labelledby="hand-counts-title" className="border-b border-border px-3 py-2" data-testid="section-hand-counts">
      <h2 id="hand-counts-title" className="zone-label mb-1.5">Cards in hand</h2>
      <ul className="grid grid-cols-2 gap-x-3 gap-y-1">
        {view.state.players.map((p) => {
          const me = p.playerId === view.seat;
          const n = p.zones.Hand.count;
          return (
            <li key={p.playerId} className={cn('flex items-center gap-1.5 text-xs', p.health.status !== 'active' && 'opacity-50')} aria-label={`${displayName(view, p.playerId)}: ${n} card${n === 1 ? '' : 's'} in hand`} data-testid={`text-hand-count-${p.playerId}`}>
              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: seatColor(p.playerId) }} aria-hidden />
              <span className="min-w-0 flex-1 truncate">{me ? 'You' : displayName(view, p.playerId)}</span>
              <span className="font-mono tabular text-foreground">{n}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
