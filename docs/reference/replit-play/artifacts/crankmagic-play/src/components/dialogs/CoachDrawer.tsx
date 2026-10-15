// Coach STUB: canned advice derived from the view; "Show me" lights the cards it names.
import { GraduationCap } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Switch } from '@/components/ui/switch';
import { isPriority, player } from '@/game/derive';
import { useGame } from '@/state/game';
import { usePrefs } from '@/state/prefs';

export function CoachDrawer({ open, onOpenChange }: { open: boolean; onOpenChange: (b: boolean) => void }) {
  const { view, lightCards } = useGame();
  const { prefs, set } = usePrefs();
  const d = view.decision;
  const tips: { text: string; ids: number[] }[] = [];
  if (d && isPriority(d)) {
    const land = d.options.find((o) => o.act === 'play-land');
    if (land) tips.push({ text: `Play ${land.label} first. It costs nothing and opens more options.`, ids: [land.cardId!] });
    const casts = d.options.filter((o) => o.act === 'cast');
    if (casts.length) tips.push({ text: `You have ${casts.length} spell option${casts.length > 1 ? 's' : ''}. Hold an instant if an opponent is likely to attack.`, ids: casts.map((o) => o.cardId!).filter(Boolean) });
  } else if (d) {
    tips.push({ text: `This is a "${d.mode}" choice: ${d.title}. Pick in the dock, or click the bright cards.`, ids: d.options.map((o) => o.cardId!).filter(Boolean) });
  }
  const me = player(view, view.seat);
  if (me && me.health.life < 20) tips.push({ text: `You are at ${me.health.life}. Keep a blocker back.`, ids: [] });
  if (tips.length === 0) tips.push({ text: 'Nothing to decide right now. Watch the stack and the attacks.', ids: [] });
  const c = prefs.coach;
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-[380px] sm:max-w-[380px]">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 font-display"><GraduationCap className="h-5 w-5 text-primary" />Coach</SheetTitle>
          <SheetDescription>Advice only. The coach never acts for you. (Stub: canned from the view.)</SheetDescription>
        </SheetHeader>
        <ul className="mt-4 space-y-2">
          {tips.map((t, i) => (
            <li key={i} className="rounded-xl border bg-accent/30 p-3 text-sm">
              {t.text}
              {t.ids.length > 0 && <button onClick={() => lightCards(t.ids)} className="ml-2 text-xs font-semibold text-primary underline">Show me</button>}
            </li>
          ))}
        </ul>
        <div className="mt-6 space-y-3 text-sm">
          <h3 className="zone-label">Coach settings</h3>
          {([['suggestUnowned', 'Suggest cards I do not own'], ['preferOwned', 'Prefer cards I own'], ['stayInBracket', 'Stay in my bracket']] as const).map(([k, label]) => (
            <label key={k} className="flex items-center justify-between">{label}<Switch checked={c[k]} onCheckedChange={(b) => set({ coach: { ...c, [k]: b } })} /></label>
          ))}
          <label className="flex items-center justify-between">Detailed answers<Switch checked={c.length === 'detailed'} onCheckedChange={(b) => set({ coach: { ...c, length: b ? 'detailed' : 'short' } })} /></label>
          <label className="flex items-center justify-between">Coach sees my hand<Switch checked={c.sees === 'board-hand'} onCheckedChange={(b) => set({ coach: { ...c, sees: b ? 'board-hand' : 'board' } })} /></label>
        </div>
      </SheetContent>
    </Sheet>
  );
}
