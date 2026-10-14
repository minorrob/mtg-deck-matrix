import { memo, type CSSProperties, type MouseEvent, type KeyboardEvent } from 'react';
import { Crown } from 'lucide-react';
import { a11yCardName, visibleName } from '@/game/derive';
import type { CardView } from '@/game/types';
import { artFor } from '@/lib/art';
import { cardRef } from '@/lib/flights';
import { setHover } from '@/lib/hover-store';
import { cn } from '@/lib/utils';
import { CardBack } from './CardBack';
import { CounterDice } from './CounterDice';

export interface CardFaceProps {
  card: CardView;
  width: number;
  track?: boolean;
  bright?: boolean;
  dim?: boolean;
  lit?: boolean;
  selected?: boolean;
  showTapped?: boolean;
  nameplate?: boolean;
  onActivate?: () => void;
  onZoom?: () => void;
  className?: string;
  style?: CSSProperties;
  testId?: string;
  hoverable?: boolean;
}

/** A card on the table: the full uncropped 5:7 image, never altered. */
export const CardFace = memo(function CardFace({
  card, width, track = true, bright, dim, lit, selected, showTapped = true, nameplate = true, onActivate, onZoom, className, style, testId, hoverable = true,
}: CardFaceProps) {
  const name = visibleName(card);
  const label = `${a11yCardName(card)}${card.types.length ? ', ' + card.types.join(' ') : ''}${card.power != null ? `, ${card.power}/${card.toughness}` : ''}${card.tapped ? ', tapped' : ''}`;
  const interactive = !!onActivate;

  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onActivate?.();
    }
    if (e.key === 'z' || e.key === 'Z') onZoom?.();
  };
  const onCtx = (e: MouseEvent) => {
    if (!onZoom) return;
    e.preventDefault();
    onZoom();
  };

  if (card.faceDown && !name) {
    return (
      <div ref={track ? cardRef(card.cardId) : undefined} data-card-id={card.cardId} style={{ width, ...style }} className={cn('relative', className)} role="img" aria-label="Face-down card">
        <CardBack width={width} tapped={showTapped && card.tapped} label="Face down" />
      </div>
    );
  }

  const art = artFor(name ?? 'Unknown');
  const lethalDmg = card.damage > 0 && card.toughness != null;

  return (
    <div
      ref={track ? cardRef(card.cardId) : undefined}
      data-card-id={card.cardId}
      data-testid={testId ?? `card-${card.cardId}`}
      role={interactive ? 'button' : 'img'}
      tabIndex={interactive || onZoom ? 0 : -1}
      aria-label={label}
      title={nameplate ? `${label} · Prototype placeholder artwork` : label}
      onClick={onActivate}
      onKeyDown={onKey}
      onContextMenu={onCtx}
      onPointerEnter={hoverable ? () => setHover(card.cardId) : undefined}
      onPointerLeave={hoverable ? () => setHover(null) : undefined}
      className={cn('relative shrink-0 select-none', interactive && 'cursor-pointer', className)}
      style={{ width, ...style }}
    >
      <div
        className={cn(
          'mtg-card',
          showTapped && card.tapped && 'is-tapped',
          dim && 'is-dim',
          bright && 'is-bright',
          lit && 'is-lit',
          selected && 'is-selected',
          interactive && 'hover:-translate-y-1',
        )}
      >
        <img className="card-img" src={art.src} alt="" draggable={false} loading="lazy" decoding="async" />
        {card.faceDown && name && (
          <div className="absolute inset-x-0 bottom-[18%] mx-[8%] rounded bg-[hsl(var(--ink)/0.8)] px-1 text-center text-[10px] text-white">Face down · only you see</div>
        )}
        {Object.keys(card.counters).length > 0 && <CounterDice counters={card.counters} size={width} />}
        {card.power != null && (
          <div
            className={cn('absolute bottom-[3%] right-[4%] rounded-sm px-1 font-mono font-semibold tabular', lethalDmg ? 'bg-destructive text-destructive-foreground' : 'bg-[hsl(var(--ink)/0.85)] text-white')}
            style={{ fontSize: Math.max(10, width * 0.11) }}
          >
            {card.power}/{lethalDmg ? (card.toughness ?? 0) - card.damage : card.toughness}
          </div>
        )}
        {card.commander && (
          <div className="absolute right-[3%] top-[3%] grid place-items-center rounded-sm bg-[hsl(var(--ink)/0.8)] p-0.5 text-white" title="Commander">
            <Crown style={{ width: Math.max(10, width * 0.12), height: Math.max(10, width * 0.12) }} aria-hidden />
          </div>
        )}
      </div>
    </div>
  );
});
