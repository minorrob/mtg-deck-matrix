import { displayName, findCard } from '@/game/derive';
import { useGame } from '@/state/game';
import { usePrefs } from '@/state/prefs';
import { StackPanel } from '@/components/table/StackPanel';

export function CombatTab() {
  const { view } = useGame();
  const { prefs } = usePrefs();
  const c = view.state.combat;
  return (
    <div className="space-y-3 text-sm">
      {!c ? <p className="text-muted-foreground">No combat right now.</p> : (
        <>
          <p className="text-xs text-muted-foreground">{displayName(view, c.attackingPlayerId)} is attacking.</p>
          <ul className="space-y-1.5">
            {c.attacks.map((a) => {
              const at = findCard(view, a.attacker);
              return (
                <li key={a.attacker} className="rounded-lg border p-2">
                  <div className="font-medium">{at?.name ?? 'Attacker'} <span className="font-mono text-xs">{at?.power}/{at?.toughness}</span></div>
                  <div className="text-xs text-muted-foreground">→ {a.planeswalker ? findCard(view, a.planeswalker)?.name ?? 'planeswalker' : displayName(view, a.defender)} · {a.blocked ? `blocked by ${a.blockers.map((b) => findCard(view, b)?.name ?? 'blocker').join(', ')}` : 'unblocked'}</div>
                </li>
              );
            })}
          </ul>
        </>
      )}
      {prefs.panes.stackPinned && <StackPanel />}
    </div>
  );
}
