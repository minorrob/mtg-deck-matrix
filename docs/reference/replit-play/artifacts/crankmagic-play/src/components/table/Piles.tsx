import { useState } from 'react';
import { visibleName } from '@/game/derive';
import type { PlayerView, ZoneName } from '@/game/types';
import { anchorRef } from '@/lib/flights';
import { CardBack } from '@/components/cards/CardBack';
import { CardFace } from '@/components/cards/CardFace';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';

const LABEL: Record<string, string> = { Library: 'Library', Graveyard: 'Graveyard', Exile: 'Exile', Command: 'Command' };

/** A card-shaped pile: top card (when public), count badge. Click a public pile to browse it. */
export function Pile({ p, zone, width, spectator }: { p: PlayerView; zone: ZoneName; width: number; spectator?: boolean }) {
  const z = p.zones[zone];
  const [open, setOpen] = useState(false);
  const top = z.cards[z.cards.length - 1];
  const browsable = zone !== 'Library' && z.cards.length > 0;
  return (
    <>
      <button
        ref={anchorRef(`${p.playerId}:${zone}`)}
        onClick={() => browsable && setOpen(true)}
        className="group relative shrink-0 text-left disabled:cursor-default"
        style={{ width }}
        disabled={!browsable}
        aria-label={`${p.name} ${LABEL[zone]}: ${z.count} card${z.count === 1 ? '' : 's'}${spectator && zone !== 'Command' ? ' (count only)' : ''}`}
        data-testid={`pile-${p.playerId}-${zone.toLowerCase()}`}
      >
        {zone === 'Library' || (!top && z.count > 0) ? (
          <CardBack width={width} />
        ) : top ? (
          <CardFace card={top} width={width} showTapped={false} hoverable track={false} nameplate={width > 60} />
        ) : (
          <div className="grid aspect-[5/7] place-items-center rounded-[6%] border border-dashed border-[hsl(var(--ink)/0.2)] text-[10px] text-muted-foreground" style={{ width }}>
            empty
          </div>
        )}
        <span className="absolute -right-1.5 -top-1.5 min-w-5 rounded-full bg-[hsl(var(--ink))] px-1.5 text-center font-mono text-[11px] font-semibold text-white shadow">{z.count}</span>
        {width >= 44 && <span className="zone-label mt-1 block text-center">{LABEL[zone]}</span>}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="font-display">{p.name} · {LABEL[zone]}</DialogTitle>
            <DialogDescription>{z.count} cards, newest last. Public zone.</DialogDescription>
          </DialogHeader>
          <div className="flex max-h-[60vh] flex-wrap gap-3 overflow-auto p-1">
            {z.cards.map((c) => (
              <div key={c.cardId} className="w-[110px]">
                <CardFace card={c} width={110} track={false} showTapped={false} />
                <div className="mt-1 truncate text-xs">{visibleName(c) ?? 'Face down'}</div>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function PileColumn({ p, width, spectator, horizontal }: { p: PlayerView; width: number; spectator?: boolean; horizontal?: boolean }) {
  return (
    <div className={horizontal ? 'flex items-start gap-3' : 'grid grid-cols-2 gap-x-3 gap-y-2'}>
      {(['Command', 'Library', 'Graveyard', 'Exile'] as ZoneName[]).map((z) => (
        <Pile key={z} p={p} zone={z} width={width} spectator={spectator} />
      ))}
    </div>
  );
}
