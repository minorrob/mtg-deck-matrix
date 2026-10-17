import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FIXTURE_META } from '@/game/fixtures';
import { CALLOUT_SAMPLES, type CalloutKind } from '@/game/callouts';
import type { ScenarioId } from '@/game/adapter';
import { useGame } from '@/state/game';

const SCEN: [ScenarioId, string][] = [
  ['demo', 'Demo script (default)'], ['big-board', '250 permanents'], ['two-seat', 'Two seats'], ['three-seat', 'Three seats'], ['deep-stack', 'Deep stack + resolve all'],
  ['damage', 'Damage mode'], ['amount', 'Amount mode'], ['ack', 'Ack mode'], ['index', 'Index mode'], ['constrained', 'Many with caps'], ['spectator', 'Spectator projection'],
];

export function ScenarioPicker({ open, onOpenChange }: { open: boolean; onOpenChange: (b: boolean) => void }) {
  const { adapter, pushCallout } = useGame();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="font-display">Scenarios &amp; callouts</DialogTitle>
          <DialogDescription>Prototype only. Source now: {adapter.source}.</DialogDescription>
        </DialogHeader>
        <div className="grid max-h-[65vh] gap-5 overflow-auto md:grid-cols-[1fr_1.4fr]">
          <div className="space-y-4">
            <section>
              <h3 className="zone-label mb-2">Synthetic scenarios</h3>
              <div className="flex flex-wrap gap-1.5">
                {SCEN.map(([id, label]) => <button key={id} onClick={() => { adapter.loadScenario(id); onOpenChange(false); }} className="rounded-full border px-2.5 py-1 text-xs hover:bg-secondary" data-testid={`scenario-${id}`}>{label}</button>)}
              </div>
            </section>
            <section>
              <h3 className="zone-label mb-2">Fire a callout</h3>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(CALLOUT_SAMPLES) as CalloutKind[]).map((k) => <button key={k} onClick={() => pushCallout(CALLOUT_SAMPLES[k]())} className="rounded-full border px-2.5 py-1 text-xs hover:bg-secondary" data-testid={`fire-${k}`}>{k}</button>)}
              </div>
            </section>
          </div>
          <section>
            <h3 className="zone-label mb-2">Recorded views ({FIXTURE_META.length}) · playback advances to the next on answer</h3>
            <ol className="space-y-1 text-xs">
              {FIXTURE_META.map((m) => (
                <li key={m.index}>
                  <button onClick={() => { adapter.loadFixture(m.index); onOpenChange(false); }} className="flex w-full gap-2 rounded-lg border px-2 py-1 text-left hover:bg-secondary">
                    <span className="w-6 font-mono text-muted-foreground">{m.index + 1}</span>
                    <span className="w-14 text-muted-foreground">rev {m.revision}</span>
                    <span className="flex-1 truncate">T{m.turn} · {m.phase} · {m.title}</span>
                    <span className="text-muted-foreground">{m.mode}</span>
                    {m.tags.map((t) => <span key={t} className="rounded bg-accent px-1">{t}</span>)}
                  </button>
                </li>
              ))}
            </ol>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
