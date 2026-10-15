// A chair: a miniature of that seat's board. Click (or press its number) to walk
// the camera there — the mats swap places via shared layout, never a cut.
import { motion } from 'framer-motion';
import { Clock, Heart, WifiOff } from 'lucide-react';
import { displayName, seatColor, splitBattlefield } from '@/game/derive';
import type { PlayerView } from '@/game/types';
import { anchorRef } from '@/lib/flights';
import { matById, artFor } from '@/lib/art';
import { useGame } from '@/state/game';
import { usePrefs } from '@/state/prefs';
import { cn } from '@/lib/utils';

export function Chair({ p, onFocus, pill }: { p: PlayerView; onFocus: () => void; pill?: boolean }) {
  const { view, away } = useGame();
  const { prefs } = usePrefs();
  const seatId = `s${p.playerId}`;
  const isTurn = view.state.turnPlayerId === p.playerId;
  const waiting = view.waitingOn === seatId;
  const awayUntil = away[seatId];
  const out = p.health.status !== 'active';
  const pilot = view.seats.find((s) => s.seatId === seatId)?.pilot;
  const mat = matById(prefs.mats[String(p.playerId)]);
  const { lands, nonlands } = splitBattlefield(p.zones.Battlefield.cards);

  if (pill) {
    return (
      <button onClick={onFocus} className={cn('flex items-center gap-2 rounded-full border bg-card px-3 py-1 text-xs shadow-sm', isTurn && 'border-primary')} data-testid={`chair-pill-${p.playerId}`}>
        <span className="h-2 w-2 rounded-full" style={{ background: seatColor(p.playerId) }} />
        {displayName(view, p.playerId)}
        <span className="font-mono">{p.health.life}</span>
      </button>
    );
  }

  return (
    <motion.button
      layout
      onClick={onFocus}
      ref={anchorRef(`seat:${p.playerId}`)}
      className={cn('group relative flex h-full min-w-[220px] flex-1 flex-col overflow-hidden rounded-xl border bg-card text-left shadow-sm transition-shadow hover:shadow-md', isTurn ? 'border-[color:var(--seat)] priority-ring' : 'border-border', out && 'opacity-60 grayscale')}
      style={{ ['--seat' as string]: seatColor(p.playerId) }}
      aria-label={`${displayName(view, p.playerId)}: life ${p.health.life}. Press ${p.playerId + 1} to look at this board.`}
      data-testid={`chair-${p.playerId}`}
    >
      <div className="absolute inset-0 opacity-50" aria-hidden style={mat.css ? { background: mat.css } : undefined}>
        {mat.src && <img src={mat.src} alt="" className="h-full w-full object-cover" />}
      </div>
      <div className="relative flex items-center gap-2 bg-[hsl(var(--card)/0.88)] px-2.5 py-1.5">
        <span className="grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: seatColor(p.playerId) }}>{p.playerId + 1}</span>
        <span className="truncate font-display text-sm font-semibold">{displayName(view, p.playerId)}</span>
        {pilot && pilot !== 'human' && <span className="rounded bg-secondary px-1 text-[10px] uppercase tracking-wide text-muted-foreground">AI</span>}
        <span className="ml-auto inline-flex items-center gap-1 font-mono text-sm tabular"><Heart className="h-3 w-3 text-[hsl(var(--seat-1))]" aria-hidden />{p.health.life}</span>
      </div>
      <div className="relative flex min-h-0 flex-1 flex-wrap content-start gap-1 overflow-hidden p-2">
        {nonlands.slice(0, 24).map((c) => (
          <div key={c.cardId} data-card-id={c.cardId} className={cn('aspect-[5/7] w-[22px] overflow-hidden rounded-[3px] shadow-sm ring-1 ring-black/10 transition-transform', c.tapped && 'rotate-90')} title={c.faceDown ? 'Face down' : c.name ?? ''}>
            {c.faceDown ? <div className="card-back h-full w-full" /> : <img src={artFor(c.name ?? '').src} alt="" className="h-full w-full object-cover" />}
          </div>
        ))}
        {nonlands.length > 24 && <span className="self-center text-[10px] text-muted-foreground">+{nonlands.length - 24}</span>}
      </div>
      <div className="relative flex items-center gap-2 bg-[hsl(var(--card)/0.88)] px-2.5 py-1 text-[11px] text-muted-foreground">
        <span>lands {lands.length}</span>
        <span ref={anchorRef(`${p.playerId}:Hand`)} className="h-0 w-0" aria-hidden />
        <span ref={anchorRef(`${p.playerId}:Library`)}>lib {p.zones.Library.count}</span>
        <span ref={anchorRef(`${p.playerId}:Graveyard`)}>gy {p.zones.Graveyard.count}</span>
        {waiting && !isTurn && <span className="ml-auto text-primary">thinking</span>}
        {awayUntil && (
          <span className="ml-auto inline-flex items-center gap-1 text-[hsl(var(--brass))]"><Clock className="h-3 w-3" />away {Math.max(0, Math.ceil((awayUntil - Date.now()) / 60000))}m</span>
        )}
        {view.departures[seatId] != null && <WifiOff className="ml-auto h-3 w-3" aria-label="left the game" />}
      </div>
    </motion.button>
  );
}
