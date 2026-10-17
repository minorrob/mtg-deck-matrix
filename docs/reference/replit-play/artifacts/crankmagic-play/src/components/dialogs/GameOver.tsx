import { Link } from 'wouter';
import { motion } from 'framer-motion';
import { Trophy } from 'lucide-react';
import { displayName, seatColor } from '@/game/derive';
import { useGame } from '@/state/game';
import { usePrefs } from '@/state/prefs';

export function GameOver() {
  const { view, adapter } = useGame();
  const { reduced } = usePrefs();
  if (view.status !== 'finished') return null;
  const r = view.result;
  const winner = r?.winner != null ? (typeof r.winner === 'number' ? displayName(view, r.winner) : String(r.winner)) : null;
  return (
    <div className="fixed inset-0 z-[70] grid place-items-center bg-[hsl(var(--ink)/0.35)] p-4 backdrop-blur-sm" role="dialog" aria-label="Game over">
      <motion.div initial={reduced ? false : { y: 30, opacity: 0, scale: 0.96 }} animate={{ y: 0, opacity: 1, scale: 1 }} transition={{ duration: 0.3 }} className="w-full max-w-lg rounded-3xl border bg-card p-6 shadow-2xl" data-testid="scorecard">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[hsl(var(--brass))] text-white"><Trophy className="h-6 w-6" /></span>
          <div>
            <h2 className="font-display text-2xl font-semibold">{winner ? `${winner} won` : 'Game over'}</h2>
            <p className="text-sm text-muted-foreground">{r?.reason}{r?.endedBy ? ` · ended by seat ${Number(r.endedBy.replace('s', '')) + 1}` : ''}</p>
          </div>
        </div>
        <table className="mt-5 w-full text-sm">
          <thead><tr className="text-left text-xs text-muted-foreground"><th>Seat</th><th>Life</th><th>Permanents</th><th>Result</th></tr></thead>
          <tbody>
            {view.state.players.map((p) => (
              <tr key={p.playerId} className="border-t">
                <td className="py-1.5"><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: seatColor(p.playerId) }} />{displayName(view, p.playerId)}</td>
                <td className="font-mono">{p.health.life}</td>
                <td className="font-mono">{p.zones.Battlefield.count}</td>
                <td className="text-xs">{p.health.status}{p.health.lossReason ? ` · ${p.health.lossReason}` : ''}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-xs text-muted-foreground">Turn {view.state.turn} · {view.history.length} history lines kept</p>
        <div className="mt-5 flex flex-wrap gap-2">
          <button onClick={() => adapter.loadScenario('demo')} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" data-testid="button-rematch">Rematch</button>
          <Link href="/lobby" className="rounded-full border px-4 py-2 text-sm">New table</Link>
          <Link href="/" className="rounded-full px-4 py-2 text-sm text-muted-foreground hover:bg-secondary">Back to Play</Link>
        </div>
      </motion.div>
    </div>
  );
}
