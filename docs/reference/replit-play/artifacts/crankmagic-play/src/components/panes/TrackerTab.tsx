import { displayName, seatColor } from '@/game/derive';
import { useGame } from '@/state/game';

export function TrackerTab() {
  const { view } = useGame();
  return (
    <div className="space-y-2">
      {view.state.players.map((p) => (
        <div key={p.playerId} className="rounded-xl border p-2.5 text-sm" style={{ borderLeft: `4px solid ${seatColor(p.playerId)}` }}>
          <div className="flex items-center"><span className="font-semibold">{displayName(view, p.playerId)}</span><span className="ml-auto font-mono text-lg">{p.health.life}</span></div>
          <div className="mt-1 grid grid-cols-4 gap-1 text-center text-[11px] text-muted-foreground">
            {(['Hand', 'Library', 'Graveyard', 'Exile'] as const).map((z) => <div key={z}><div className="font-mono text-sm text-foreground">{p.zones[z].count}</div>{z}</div>)}
          </div>
          <div className="mt-1 text-[11px] text-muted-foreground">poison {p.health.poison} · cmdr dmg max {p.health.commanderDamageMax} · {p.health.status}</div>
        </div>
      ))}
    </div>
  );
}
