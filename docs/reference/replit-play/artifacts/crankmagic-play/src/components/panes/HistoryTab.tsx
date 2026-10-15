import { useGame } from '@/state/game';
import { usePrefs } from '@/state/prefs';
import { cn } from '@/lib/utils';

export function HistoryTab() {
  const { view } = useGame();
  const { prefs } = usePrefs();
  const lines = view.history.filter((h) => prefs.panes.historyBand || h.mark !== 'quiet');
  if (lines.length === 0) return <p className="text-sm text-muted-foreground">Nothing has happened yet.</p>;
  return (
    <ol className="space-y-0.5 text-[13px]" aria-label="History, newest first">
      {lines.map((h, i) => (
        <li key={i} className={cn(h.mark === 'turn' ? 'mt-3 font-display font-semibold text-foreground first:mt-0' : h.mark === 'quiet' ? 'text-xs italic text-muted-foreground' : h.mark === 'end' ? 'font-semibold text-destructive' : 'text-foreground/85')}>
          {h.text}
        </li>
      ))}
    </ol>
  );
}
