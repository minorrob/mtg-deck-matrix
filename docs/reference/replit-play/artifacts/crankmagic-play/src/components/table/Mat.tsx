// A seat's full board: artwork mat, permanents in reading order (creatures first),
// lands piled by basic name, card-shaped piles on the right.
import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Heart, Skull } from 'lucide-react';
import { displayName, landPiles, optionsByCard, seatColor, splitBattlefield } from '@/game/derive';
import type { CardView, PlayerView } from '@/game/types';
import { matById } from '@/lib/art';
import { anchorRef } from '@/lib/flights';
import { useElementSize } from '@/hooks/use-element-size';
import { useGame } from '@/state/game';
import { usePrefs } from '@/state/prefs';
import { useDraft } from '@/state/draft';
import { CardFace } from '@/components/cards/CardFace';
import { PileColumn } from './Piles';
import { cn } from '@/lib/utils';

export function useCardActivate() {
  const { view, choose, setZoomId } = useGame();
  const draft = useDraft();
  const byCard = useMemo(() => optionsByCard(view.decision), [view.decision]);
  return {
    byCard,
    activate: (c: CardView) => {
      const opts = byCard.get(c.cardId);
      const d = view.decision;
      if (!opts || !d) return undefined;
      if (d.mode === 'one' || d.mode === 'boolean' || d.mode === 'index') {
        if (opts.length === 1) return () => choose(opts[0]);
        return () => setZoomId(c.cardId);
      }
      if (d.mode === 'many') return () => draft.toggleCard(c.cardId);
      return () => setZoomId(c.cardId);
    },
  };
}

function MatBackdrop({ seat }: { seat: number }) {
  const { prefs } = usePrefs();
  const mat = matById(prefs.mats[String(seat)]);
  return (
    <div className="mat-surface absolute inset-0 overflow-hidden" aria-hidden style={mat.css ? { background: mat.css } : undefined}>
      {mat.src && <img src={mat.src} alt="" className="mat-art" />}
    </div>
  );
}

export function Mat({ p, compact, bare }: { p: PlayerView; compact?: boolean; bare?: boolean }) {
  const { view, lit } = useGame();
  const { prefs } = usePrefs();
  const draft = useDraft();
  const { byCard, activate } = useCardActivate();
  const [ref, size] = useElementSize<HTMLElement>();
  const w = compact ? Math.round(prefs.cardSize * 0.8) : prefs.cardSize;
  const h = w * 1.4;
  const { lands, nonlands } = splitBattlefield(p.zones.Battlefield.cards);
  const piles = landPiles(lands);
  const hasOpts = byCard.size > 0;
  const rows = Math.max(1, Math.floor((size.height - h - 24) / (h + 10)));
  const cols = Math.max(1, Math.ceil(nonlands.length / rows));
  const isTurn = view.state.turnPlayerId === p.playerId;
  const out = p.health.status !== 'active';
  const attacking = new Set((view.state.combat?.attacks ?? []).map((a) => a.attacker));
  const blocking = new Set((view.state.combat?.attacks ?? []).flatMap((a) => a.blockers));

  const renderCard = (c: CardView) => {
    const act = activate(c);
    return (
      <motion.div key={c.cardId} layout="position" transition={{ duration: 0.2 }} className="relative">
        <CardFace
          card={c}
          width={w}
          onActivate={act}
          bright={hasOpts && !!act}
          dim={hasOpts && !act && view.decision?.mode !== 'one'}
          lit={lit.has(c.cardId) || attacking.has(c.cardId) || blocking.has(c.cardId)}
          selected={draft.isCardSelected(c.cardId)}
          nameplate={prefs.nameplates}
          onZoom={() => draft.zoom(c.cardId)}
        />
        {attacking.has(c.cardId) && <span className="absolute -top-2 left-1 rounded bg-[hsl(var(--destructive))] px-1 text-[10px] font-semibold text-white">ATK</span>}
        {blocking.has(c.cardId) && <span className="absolute -top-2 left-1 rounded bg-primary px-1 text-[10px] font-semibold text-white">BLK</span>}
      </motion.div>
    );
  };

  return (
    <section
      ref={(el) => {
        ref(el);
        anchorRef(`seat:${p.playerId}`)(el);
      }}
      data-zone={`bf-${p.playerId}`}
      aria-label={`${displayName(view, p.playerId)}'s board`}
      className={cn('relative h-full w-full overflow-hidden rounded-2xl', isTurn && 'priority-ring', out && 'grayscale-[0.7]')}
      style={{ ['--seat' as string]: seatColor(p.playerId) }}
    >
      {!bare && <MatBackdrop seat={p.playerId} />}
      <div className="relative flex h-full gap-4 overflow-auto p-3 scroll-thin">
        <div className="flex min-w-0 flex-1 flex-col gap-2" style={{ minHeight: h * 2 + 76 }}>
          <div className="flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full" style={{ background: seatColor(p.playerId) }} />
            <span className="font-display text-[15px] font-semibold">{displayName(view, p.playerId)}</span>
            <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--card)/0.85)] px-2 py-0.5 font-mono text-sm tabular" aria-label={`life ${p.health.life}`}>
              <Heart className="h-3.5 w-3.5 text-[hsl(var(--seat-1))]" aria-hidden /> {p.health.life}
            </span>
            {p.health.poison > 0 && <span className="rounded-full bg-[hsl(var(--card)/0.85)] px-2 py-0.5 text-xs">poison {p.health.poison}</span>}
            {out && (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive px-2 py-0.5 text-xs text-white">
                <Skull className="h-3 w-3" /> {p.health.lossReason ?? 'out'}
              </span>
            )}
            {/* Flight anchor only: hands are never drawn on a board. Counts live in the side pane. */}
            {p.playerId !== view.seat && <span className="pointer-events-none ml-auto h-0 w-0" aria-hidden ref={anchorRef(`${p.playerId}:Hand`)} />}
          </div>
          <div className="min-h-0 flex-1 overflow-auto scroll-thin" style={{ minHeight: h + 16 }}>
            {nonlands.length === 0 ? (
              <div className="grid h-full place-items-center text-sm text-[hsl(var(--ink)/0.45)]">No permanents yet</div>
            ) : (
              <div className="grid gap-2.5 pt-3" style={{ gridTemplateColumns: `repeat(${cols}, ${w}px)` }}>
                {nonlands.map(renderCard)}
              </div>
            )}
          </div>
          <div className="flex shrink-0 items-end gap-3 overflow-x-auto overflow-y-visible px-1 pb-1 pt-3 scroll-thin" style={{ minHeight: h + 16 }} aria-label="Lands">
            {piles.map((pile) => (
              <div key={pile[0].cardId} className="relative shrink-0" style={{ width: w, height: h + (pile.length - 1) * 6 }}>
                {pile.map((c, i) => (
                  <div key={c.cardId} className="absolute left-0" style={{ top: i * 6, zIndex: i }}>
                    {renderCard(c)}
                  </div>
                ))}
                {pile.length > 1 && <span className="absolute -right-1 -top-1 z-20 rounded-full bg-[hsl(var(--ink))] px-1.5 font-mono text-[10px] text-white">×{pile.length}</span>}
              </div>
            ))}
            {lands.length === 0 && <span className="text-xs text-[hsl(var(--ink)/0.45)]">No lands</span>}
          </div>
        </div>
        {!compact && (
          <div className="shrink-0 self-start pt-8">
            <PileColumn p={p} width={Math.round(w * 0.78)} spectator={view.__spectator} />
          </div>
        )}
      </div>
    </section>
  );
}
