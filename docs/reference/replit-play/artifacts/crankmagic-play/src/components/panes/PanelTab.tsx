import { findCard, optionsByCard, visibleName } from '@/game/derive';
import { useGame } from '@/state/game';
import { usePrefs } from '@/state/prefs';
import { useHovered } from '@/lib/hover-store';
import { artMatches } from '@/lib/art';
import { CardFace } from '@/components/cards/CardFace';

export function PanelTab() {
  const { view, zoomId, choose } = useGame();
  const { prefs } = usePrefs();
  const hovered = useHovered();
  const card = findCard(view, hovered ?? zoomId);
  if (!card) return <div className="grid h-40 place-items-center rounded-xl border border-dashed text-center text-sm text-muted-foreground">Hover or right-click a card<br />to read it here.</div>;
  const opts = optionsByCard(view.decision).get(card.cardId) ?? [];
  const w = Math.round(prefs.sizes.panelCardH / 1.4);
  const name = visibleName(card);
  return (
    <div className="space-y-3 text-sm">
      <div className="mx-auto" style={{ width: w }}><CardFace card={card} width={w} track={false} showTapped={false} hoverable={false} /></div>
      <div>
        <div className="font-display text-base font-semibold">{name ?? 'Face-down card'}</div>
        <div className="text-xs text-muted-foreground">{card.types.join(' ')}{card.power != null && ` · ${card.power}/${card.toughness}`}{card.keywords.length > 0 && ` · ${card.keywords.join(', ')}`}</div>
        {name && !artMatches(name) && <div className="mt-1 text-[11px] text-muted-foreground">Image is a placeholder; the real card loads from Scryfall in production.</div>}
      </div>
      {opts.length > 0 && (
        <div className="space-y-1">
          <div className="zone-label">What it can do</div>
          {opts.map((o) => <button key={o.index} onClick={() => choose(o)} className="block w-full rounded-lg border px-2 py-1 text-left text-xs hover:bg-secondary">#{o.index} {o.label} {o.detail}</button>)}
        </div>
      )}
      {prefs.panes.odds && <p className="text-xs text-muted-foreground">Draw odds: stub. Needs a library composition field the view does not send.</p>}
    </div>
  );
}
