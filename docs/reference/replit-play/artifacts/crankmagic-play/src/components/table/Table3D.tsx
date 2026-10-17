// Optional 3D table. One continuous surface: the focused seat's mat is the felt,
// its board sits nearest you, and every other seat's public cards rest on the same
// surface at the far edge and sides (no separate mats). Choosing a seat swings the
// table round to it; the others reshuffle to their new chairs.
import { useEffect, useRef } from 'react';
import { motion, useAnimationControls } from 'framer-motion';
import { Heart, Skull } from 'lucide-react';
import { displayName, landPiles, relativeSeats, seatColor, splitBattlefield } from '@/game/derive';
import type { CardView, PlayerView } from '@/game/types';
import { matById } from '@/lib/art';
import { anchorRef } from '@/lib/flights';
import { useGame } from '@/state/game';
import { usePrefs } from '@/state/prefs';
import { useDraft } from '@/state/draft';
import { CardFace } from '@/components/cards/CardFace';
import { Mat, useCardActivate } from './Mat';
import { cn } from '@/lib/utils';

type Side = 'top' | 'left' | 'right';

function OpponentPatch({ p, side, onFocus }: { p: PlayerView; side: Side; onFocus: () => void }) {
  const { view, lit } = useGame();
  const { prefs } = usePrefs();
  const draft = useDraft();
  const { byCard, activate } = useCardActivate();
  const { lands, nonlands } = splitBattlefield(p.zones.Battlefield.cards);
  const piles = landPiles(lands);
  const w = Math.max(40, Math.round(prefs.cardSize * (side === 'top' ? 0.72 : 0.62)));
  const isTurn = view.state.turnPlayerId === p.playerId;
  const out = p.health.status !== 'active';
  const name = displayName(view, p.playerId);
  const card = (c: CardView) => {
    const act = activate(c);
    return (
      <motion.div key={c.cardId} layout="position" className="relative shrink-0">
        <CardFace card={c} width={w} onActivate={act} bright={byCard.size > 0 && !!act} lit={lit.has(c.cardId)} selected={draft.isCardSelected(c.cardId)} nameplate={false} onZoom={() => draft.zoom(c.cardId)} />
      </motion.div>
    );
  };
  return (
    <motion.section
      layoutId={`t3d-seat-${p.playerId}`}
      ref={anchorRef(`seat:${p.playerId}`)}
      data-zone={`bf-${p.playerId}`}
      aria-label={`${name}'s public cards`}
      className={cn('t3d-patch relative flex h-full min-h-0 min-w-0 flex-col gap-1.5 rounded-2xl p-2', isTurn && 'priority-ring', out && 'grayscale-[0.7]')}
      style={{ ['--seat' as string]: seatColor(p.playerId) }}
      data-testid={`t3d-seat-${p.playerId}`}
    >
      <button onClick={onFocus} className="t3d-chip inline-flex items-center gap-2 self-start rounded-full px-2.5 py-1 text-left" aria-label={`Rotate the table to ${name}'s board. Life ${p.health.life}.`} data-testid={`button-t3d-focus-${p.playerId}`}>
        <span className="grid h-5 w-5 place-items-center rounded-full text-[10px] font-bold text-white" style={{ background: seatColor(p.playerId) }}>{p.playerId + 1}</span>
        <span className="font-display text-sm font-semibold">{name}</span>
        <span className="inline-flex items-center gap-1 font-mono text-sm tabular"><Heart className="h-3 w-3 text-[hsl(var(--seat-1))]" aria-hidden />{p.health.life}</span>
        {out && <Skull className="h-3.5 w-3.5 text-destructive" aria-label="out" />}
        <span className="pointer-events-none h-0 w-0" aria-hidden ref={anchorRef(`${p.playerId}:Hand`)} />
      </button>
      <div className={cn('flex min-h-0 flex-1 flex-wrap content-start gap-1.5 overflow-hidden pt-1', side === 'top' && 'justify-center')}>
        {nonlands.map(card)}
        {nonlands.length === 0 && <span className="text-xs text-[hsl(var(--ink)/0.5)]">No permanents</span>}
      </div>
      <div className={cn('flex shrink-0 flex-wrap items-end gap-2 pt-2', side === 'top' && 'justify-center')} aria-label={`${name}'s lands`}>
        {piles.map((pile) => (
          <div key={pile[0].cardId} className="relative shrink-0" style={{ width: w, height: w * 1.4 + (pile.length - 1) * 5 }}>
            {pile.map((c, i) => <div key={c.cardId} className="absolute left-0" style={{ top: i * 5, zIndex: i }}>{card(c)}</div>)}
            {pile.length > 1 && <span className="absolute -right-1 -top-1 z-20 rounded-full bg-[hsl(var(--ink))] px-1.5 font-mono text-[10px] text-white">×{pile.length}</span>}
          </div>
        ))}
      </div>
      <span className="sr-only" ref={anchorRef(`${p.playerId}:Library`)} />
      <span className="sr-only" ref={anchorRef(`${p.playerId}:Graveyard`)} />
    </motion.section>
  );
}

export function Table3D({ focus, onFocus }: { focus: number; onFocus: (id: number) => void }) {
  const { view } = useGame();
  const { prefs, reduced } = usePrefs();
  const controls = useAnimationControls();
  const prev = useRef(focus);
  const ring = relativeSeats(view, focus);
  const others = ring.slice(1);
  const slots: Partial<Record<Side, number>> =
    others.length === 1 ? { top: others[0] } : others.length === 2 ? { left: others[0], right: others[1] } : { left: others[0], top: others[1], right: others[2] };
  const mat = matById(prefs.mats[String(focus)]);
  const focused = view.state.players.find((p) => p.playerId === focus)!;

  useEffect(() => {
    if (prev.current === focus) return;
    const ids = view.state.players.map((p) => p.playerId);
    const steps = (ids.indexOf(focus) - ids.indexOf(prev.current) + ids.length) % ids.length;
    const dir = steps <= ids.length / 2 ? 1 : -1;
    prev.current = focus;
    if (reduced) return;
    controls.set({ rotateZ: dir * 28, scale: 0.92, opacity: 0.75 });
    void controls.start({ rotateZ: 0, scale: 1, opacity: 1, transition: { duration: 0.75, ease: [0.22, 1, 0.36, 1] } });
  }, [focus, reduced, controls, view.state.players]);

  const patch = (side: Side) => {
    const id = slots[side];
    if (id == null) return null;
    return <OpponentPatch key={id} p={view.state.players.find((p) => p.playerId === id)!} side={side} onFocus={() => onFocus(id)} />;
  };

  return (
    <div className="t3d-stage absolute inset-0 overflow-hidden" data-testid="table-3d">
      <div className="t3d-sky absolute inset-x-0 top-0 h-[40%]" aria-hidden />
      <div className="absolute inset-0" style={{ perspective: 900, perspectiveOrigin: '50% 26%' }}>
        <motion.div animate={controls} className="pointer-events-none absolute inset-x-[-9%] bottom-0 top-[-12%]" style={{ transformOrigin: '50% 100%', transformStyle: 'preserve-3d' }}>
          <div className="t3d-plane pointer-events-auto absolute inset-0 overflow-hidden rounded-t-[48px]" style={{ transform: 'rotateX(46deg)', transformOrigin: '50% 100%' }}>
            <div className="mat-surface absolute inset-0" aria-hidden style={mat.css ? { background: mat.css } : undefined}>
              {mat.src && <img src={mat.src} alt="" className="mat-art" />}
            </div>
            <div className="relative grid h-full gap-3 px-[10%] pb-4 pt-6" style={{ gridTemplateRows: slots.top != null ? '30% 1fr' : '0 1fr', gridTemplateColumns: '24% 1fr 24%' }}>
              <div className="col-span-3 col-start-1 row-start-1 mx-auto h-full w-[62%] min-h-0">{patch('top')}</div>
              <div className="row-start-2 min-h-0">{patch('left')}</div>
              <motion.div layoutId={`t3d-seat-${focus}`} key={focus} className="row-start-2 min-h-0">
                <Mat p={focused} bare />
              </motion.div>
              <div className="row-start-2 min-h-0">{patch('right')}</div>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}
