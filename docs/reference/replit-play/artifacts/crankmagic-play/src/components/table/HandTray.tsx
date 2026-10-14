// Your hand. Castable-now comes only from decision options: those cards lift and
// brighten; the rest stay quiet. Phone: a fan.
import { useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowDownAZ, Layers, ListOrdered } from 'lucide-react';
import { primaryType, TYPE_ORDER, player } from '@/game/derive';
import { anchorRef } from '@/lib/flights';
import { useGame } from '@/state/game';
import { usePrefs } from '@/state/prefs';
import { useDraft } from '@/state/draft';
import { CardFace } from '@/components/cards/CardFace';
import { CardBack } from '@/components/cards/CardBack';
import { useCardActivate } from './Mat';
import { cn } from '@/lib/utils';

export function HandTray({ fan, height }: { fan?: boolean; height: number }) {
  const { view, lit } = useGame();
  const { prefs, set, reduced } = usePrefs();
  const draft = useDraft();
  const { byCard, activate } = useCardActivate();
  const me = player(view, view.seat);
  const cards = useMemo(() => {
    const list = [...(me?.zones.Hand.cards ?? [])];
    if (prefs.handSort === 'name') list.sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));
    if (prefs.handSort === 'type') list.sort((a, b) => TYPE_ORDER.indexOf(primaryType(a)) - TYPE_ORDER.indexOf(primaryType(b)));
    return list;
  }, [me, prefs.handSort]);
  const w = Math.round(Math.min((height - 34) / 1.4, 56 * prefs.handScale));
  const n = cards.length;

  if (view.__spectator) {
    return (
      <div className="flex h-full items-center gap-3 px-4 text-sm text-muted-foreground">
        <CardBack width={34} /> Spectating · hands are hidden. Counts only.
      </div>
    );
  }

  return (
    <div className="relative flex h-full flex-col" ref={anchorRef(`${view.seat}:Hand`)} data-zone="hand" aria-label={`Your hand, ${n} cards`}>
      <div className="flex items-center gap-2 px-3 pt-1.5 text-[11px] text-muted-foreground">
        <span className="zone-label">Your hand · {n}</span>
        {byCard.size > 0 && <span className="text-primary">bright cards can be played now</span>}
        <div className="ml-auto flex gap-0.5" role="group" aria-label="Sort hand">
          {([['drawn', ListOrdered, 'Order drawn'], ['type', Layers, 'By type'], ['name', ArrowDownAZ, 'By name']] as const).map(([k, Icon, label]) => (
            <button key={k} aria-label={label} title={label} onClick={() => set({ handSort: k })} className={cn('rounded p-1 hover:bg-secondary', prefs.handSort === k && 'bg-secondary text-foreground')}>
              <Icon className="h-3.5 w-3.5" />
            </button>
          ))}
        </div>
      </div>
      <div className={cn('flex min-h-0 flex-1 items-end px-4 pb-2', fan ? 'justify-center' : 'gap-2 overflow-x-auto scroll-thin')}>
        {n === 0 && <span className="m-auto text-sm text-muted-foreground">Your hand is empty</span>}
        <AnimatePresence initial={false}>
          {cards.map((c, i) => {
            const act = activate(c);
            const mid = (n - 1) / 2;
            const rot = fan ? (i - mid) * 5 : 0;
            return (
              <motion.div
                key={c.cardId}
                layout={!reduced}
                initial={reduced ? false : { opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: act && !fan ? -8 : Math.abs(i - mid) * (fan ? 4 : 0), rotate: rot }}
                exit={{ opacity: 0, transition: { duration: 0.01 } }}
                transition={{ duration: 0.2 }}
                style={fan ? { marginLeft: i === 0 ? 0 : -w * 0.45, zIndex: i } : undefined}
              >
                <CardFace
                  card={c}
                  width={w}
                  onActivate={act}
                  bright={byCard.size > 0 && !!act}
                  dim={byCard.size > 0 && !act}
                  lit={lit.has(c.cardId)}
                  selected={draft.isCardSelected(c.cardId)}
                  onZoom={() => draft.zoom(c.cardId)}
                  nameplate={prefs.nameplates}
                />
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </div>
  );
}
