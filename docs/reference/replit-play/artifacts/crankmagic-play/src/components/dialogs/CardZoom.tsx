import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { findCard, optionsByCard, visibleName } from '@/game/derive';
import { useGame } from '@/state/game';
import { CardFace } from '@/components/cards/CardFace';

export function CardZoom() {
  const { view, zoomId, setZoomId, choose } = useGame();
  const card = findCard(view, zoomId);
  const opts = optionsByCard(view.decision).get(zoomId ?? -1) ?? [];
  return (
    <Dialog open={!!card} onOpenChange={(b) => !b && setZoomId(null)}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle className="font-display">{card ? visibleName(card) ?? 'Face-down card' : ''}</DialogTitle>
          <DialogDescription>{card?.types.join(' ')}</DialogDescription>
        </DialogHeader>
        {card && (
          <div className="flex flex-col gap-4 sm:flex-row">
            <CardFace card={card} width={240} track={false} showTapped={false} hoverable={false} />
            <div className="flex-1 space-y-1.5">
              <div className="zone-label">What it can do now</div>
              {opts.length === 0 && <p className="text-sm text-muted-foreground">Nothing offered for this card right now.</p>}
              {opts.map((o) => (
                <button key={o.index} onClick={() => { choose(o); setZoomId(null); }} className="block w-full rounded-lg border px-3 py-2 text-left text-sm hover:bg-secondary" data-testid={`zoom-option-${o.index}`}>
                  <span className="font-mono text-xs text-muted-foreground">#{o.index}</span> {o.label} {o.detail && <span className="text-muted-foreground">{o.detail}</span>}
                  {o.lean && <span className="ml-2 text-xs text-[hsl(var(--brass))]">{o.lean}</span>}
                </button>
              ))}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
