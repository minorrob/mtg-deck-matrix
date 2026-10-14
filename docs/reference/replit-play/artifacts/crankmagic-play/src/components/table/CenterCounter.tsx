// The center counter: four life totals around a wand. The wand opens Vitals.
import { useState } from 'react';
import { displayName, seatColor } from '@/game/derive';
import { useGame } from '@/state/game';
import { WandMark } from '@/components/brand/Logo';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';

export function CenterCounter() {
  const { view } = useGame();
  const [open, setOpen] = useState(false);
  const ps = view.state.players;
  return (
    <>
      <div className="flex min-h-9 items-center justify-center gap-4 overflow-x-auto px-3 text-xs" aria-label="Life totals">
        {ps.map((p) => (
          <div key={p.playerId} className="flex shrink-0 items-center gap-1.5" title={`${displayName(view, p.playerId)}: ${p.health.life}`}>
            <span className="h-1.5 w-1.5 rounded-full" style={{ background: seatColor(p.playerId) }} />
            <span className="text-muted-foreground">{displayName(view, p.playerId)}</span>
            <span className="font-mono font-semibold tabular-nums">{p.health.life}</span>
          </div>
        ))}
        <button onClick={() => setOpen(true)} className="flex shrink-0 items-center gap-1.5 rounded-full px-2 py-1 text-primary hover:bg-secondary" aria-label="Open vitals" data-testid="button-vitals">
          <WandMark size={16} /> Vitals
        </button>
      </div>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle className="font-display">Vitals</DialogTitle>
            <DialogDescription>Life, poison, and commander damage, read from the view. Totals change only through the game.</DialogDescription>
          </DialogHeader>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-muted-foreground">
                  <th className="py-1">Seat</th><th>Life</th><th>Poison</th><th>Cmdr dmg (max)</th><th>Counters</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {ps.map((p) => (
                  <tr key={p.playerId} className="border-t border-border">
                    <td className="py-1.5"><span className="mr-2 inline-block h-2 w-2 rounded-full" style={{ background: seatColor(p.playerId) }} />{displayName(view, p.playerId)}</td>
                    <td className="font-mono">{p.health.life}</td>
                    <td className="font-mono">{p.health.poison}</td>
                    <td className="font-mono">{p.health.commanderDamageMax}{Object.keys(p.health.commanderDamage).length > 0 && <span className="ml-1 text-xs text-muted-foreground">({Object.entries(p.health.commanderDamage).map(([k, v]) => `${k.split(':').pop()} ${v}`).join(', ')})</span>}</td>
                    <td className="text-xs">{Object.entries(p.counters).map(([k, v]) => `${k} ${v}`).join(', ') || '—'}</td>
                    <td className="text-xs">{p.health.status}{p.health.lossReason ? ` · ${p.health.lossReason}` : ''}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
