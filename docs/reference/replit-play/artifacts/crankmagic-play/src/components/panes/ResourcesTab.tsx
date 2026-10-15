import { MANA_COLORS, player, primaryType, findCard } from '@/game/derive';
import { useGame } from '@/state/game';
import { usePrefs } from '@/state/prefs';

export function ResourcesTab() {
  const { view, choose } = useGame();
  const { prefs } = usePrefs();
  const me = player(view, view.seat);
  if (!me) return <p className="text-sm text-muted-foreground">Spectators have no resources.</p>;
  const lands = me.zones.Battlefield.cards.filter((c) => c.types.includes('Land'));
  const untapped = lands.filter((c) => !c.tapped).length;
  const opts = view.decision?.options ?? [];
  const sources = opts.filter((o) => o.act === 'activate-mana' || o.act === 'undo-mana');
  const plays = opts.filter((o) => o.act === 'cast' || o.act === 'activate');
  const grouped = new Map<string, typeof plays>();
  for (const o of plays) {
    const c = findCard(view, o.cardId);
    const k = prefs.resourcesGroup === 'land' ? (o.act === 'play-land' ? 'Lands' : 'Spells') : c ? primaryType(c) : 'Other';
    grouped.set(k, [...(grouped.get(k) ?? []), o]);
  }
  return (
    <div className="space-y-4 text-sm">
      <section>
        <h3 className="zone-label mb-1.5">Mana pool</h3>
        <div className="flex flex-wrap gap-1.5">
          {me.mana.length === 0 && <span className="text-muted-foreground">Empty</span>}
          {me.mana.map((m) => (
            <span key={m.color} className="inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono">
              <span className="h-3 w-3 rounded-full" style={{ background: `hsl(${MANA_COLORS[m.color]?.hsl ?? '0 0% 60%'})` }} />{m.amount}
            </span>
          ))}
        </div>
        <p className="mt-1.5 text-xs text-muted-foreground">Lands {untapped} untapped of {lands.length} · land drops used {me.landsPlayed}</p>
      </section>
      <section>
        <h3 className="zone-label mb-1.5">Mana sources</h3>
        {sources.length === 0 ? <p className="text-xs text-muted-foreground">None offered right now.</p> : (
          <div className="flex flex-wrap gap-1.5">
            {sources.map((o) => <button key={o.index} onClick={() => choose(o)} className="rounded-lg border px-2 py-1 text-xs hover:bg-secondary">{o.label} <span className="text-muted-foreground">{o.detail}</span></button>)}
          </div>
        )}
      </section>
      <section>
        <h3 className="zone-label mb-1.5">Playable now</h3>
        {plays.length === 0 && <p className="text-xs text-muted-foreground">Nothing offered. The room decides what is playable.</p>}
        {[...grouped.entries()].map(([k, list]) => (
          <div key={k} className="mb-2">
            <div className="mb-1 text-xs font-medium">{k}</div>
            <ul className="space-y-1">
              {list.map((o) => (
                <li key={o.index}><button onClick={() => choose(o)} className="w-full rounded-lg border px-2 py-1 text-left text-xs hover:bg-secondary"><span className="font-mono text-muted-foreground">#{o.index}</span> {o.label} <span className="text-muted-foreground">{o.detail}</span></button></li>
              ))}
            </ul>
          </div>
        ))}
      </section>
    </div>
  );
}
