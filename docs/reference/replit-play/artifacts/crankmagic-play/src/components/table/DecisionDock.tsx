// One generic dock for every decision mode. It only ever sends indices/amounts
// drawn from decision.options; the room validates.
import { motion } from 'framer-motion';
import { ArrowDown, ArrowUp, Check, Minus, Plus } from 'lucide-react';
import { findCard, isPriority } from '@/game/derive';
import type { Decision } from '@/game/types';
import { useGame } from '@/state/game';
import { useDraft } from '@/state/draft';
import { usePrefs } from '@/state/prefs';
import { CardFace } from '@/components/cards/CardFace';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

function Idx({ n }: { n: number }) {
  return <span className="font-mono text-[10px] text-muted-foreground">#{n}</span>;
}

function header(d: Decision): string {
  switch (d.mode) {
    case 'many': return d.min === d.max ? `Choose ${d.min}` : `Choose ${d.min} to ${d.max}`;
    case 'order': return 'Put these in order, first at the top';
    case 'damage': case 'amount': return `Assign ${d.total ?? d.max}${d.minEach ? `, at least ${d.minEach} each` : ''}`;
    case 'ack': return 'Acknowledge to continue';
    default: return 'Choose one';
  }
}

export function DecisionDock() {
  const { view, choose, submit, pending } = useGame();
  const { reduced } = usePrefs();
  const draft = useDraft();
  const d = view.decision;
  if (!d || isPriority(d) || view.__spectator) return null;

  const sum = draft.amounts.reduce((a, b) => a + b, 0);
  const total = d.total ?? d.max;
  const remaining = total - sum;
  const manyOk = draft.selected.length >= d.min && draft.selected.length <= d.max;

  return (
    <motion.section
      key={d.id}
      initial={reduced ? false : { y: 24, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.22 }}
      className="pointer-events-auto mx-auto w-[min(720px,96%)] rounded-2xl border border-border bg-card/95 p-3 shadow-xl backdrop-blur"
      aria-label={`Decision: ${d.title}`}
      data-testid="decision-dock"
    >
      <div className="mb-2 flex flex-wrap items-baseline gap-2">
        <h2 className="font-display text-[17px] font-semibold leading-tight">{d.title}</h2>
        <span className="text-xs text-muted-foreground">{header(d)} · {d.mode}</span>
        {d.capped && <span className="text-xs text-[hsl(var(--brass))]">{d.capped.why}</span>}
        {d.requires?.map((r, i) => <span key={i} className="text-xs text-[hsl(var(--brass))]">{r.why}</span>)}
        {d.cost && <span className="text-xs">cost {d.cost}</span>}
      </div>

      {(d.mode === 'one' || d.mode === 'boolean' || d.mode === 'index') && (
        <div className="flex max-h-[28vh] flex-wrap gap-2 overflow-auto">
          {d.options.map((o) => (
            <Button key={o.index} variant={o.hostile ? 'destructive' : 'outline'} disabled={pending} onClick={() => choose(o)} className="h-auto gap-2 py-1.5" data-testid={`option-${o.index}`}>
              <Idx n={o.index} /> {o.label} {o.detail && <span className="text-muted-foreground">{o.detail}</span>}
            </Button>
          ))}
        </div>
      )}

      {d.mode === 'many' && (
        <div className="flex max-h-[30vh] flex-wrap gap-2 overflow-auto">
          {d.options.map((o) => {
            const on = draft.selected.includes(o.index);
            const c = findCard(view, o.cardId);
            return (
              <button key={o.index} onClick={() => draft.toggle(o.index)} aria-pressed={on} data-testid={`option-${o.index}`}
                className={cn('flex items-center gap-2 rounded-lg border px-2 py-1 text-left text-sm transition-colors', on ? 'border-primary bg-accent/60' : 'border-border hover:bg-secondary')}>
                {c && <CardFace card={c} width={30} track={false} hoverable nameplate={false} showTapped={false} />}
                <span className={cn('grid h-4 w-4 place-items-center rounded border', on ? 'border-primary bg-primary text-white' : 'border-border')}>{on && <Check className="h-3 w-3" />}</span>
                <Idx n={o.index} /> {o.label}
              </button>
            );
          })}
        </div>
      )}

      {d.mode === 'order' && (
        <ol className="max-h-[30vh] space-y-1 overflow-auto">
          {draft.selected.map((idx, pos) => (
            <li key={idx} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1 text-sm">
              <span className="w-5 font-mono text-xs">{pos + 1}</span>
              <Idx n={idx} /> <span className="flex-1">{d.options[idx].label}</span>
              <button aria-label="Move up" disabled={pos === 0} onClick={() => { const s = [...draft.selected]; [s[pos - 1], s[pos]] = [s[pos], s[pos - 1]]; draft.setSelected(s); }} className="rounded p-1 hover:bg-secondary disabled:opacity-30"><ArrowUp className="h-3.5 w-3.5" /></button>
              <button aria-label="Move down" disabled={pos === draft.selected.length - 1} onClick={() => { const s = [...draft.selected]; [s[pos + 1], s[pos]] = [s[pos], s[pos + 1]]; draft.setSelected(s); }} className="rounded p-1 hover:bg-secondary disabled:opacity-30"><ArrowDown className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ol>
      )}

      {(d.mode === 'damage' || d.mode === 'amount') && (
        <div className="space-y-1">
          {d.options.map((o, i) => (
            <div key={o.index} className="flex items-center gap-2 rounded-lg border border-border px-2 py-1 text-sm" data-testid={`amount-row-${o.index}`}>
              <Idx n={o.index} /> <span className="flex-1">{o.label}{o.lethal != null && <span className="ml-2 text-xs text-muted-foreground">lethal {o.lethal}</span>}</span>
              <button aria-label={`Less to ${o.label}`} onClick={() => draft.setAmount(i, (draft.amounts[i] ?? 0) - 1)} className="rounded-full border p-1 hover:bg-secondary"><Minus className="h-3 w-3" /></button>
              <span className="w-6 text-center font-mono tabular">{draft.amounts[i] ?? 0}</span>
              <button aria-label={`More to ${o.label}`} disabled={remaining <= 0} onClick={() => draft.setAmount(i, (draft.amounts[i] ?? 0) + 1)} className="rounded-full border p-1 hover:bg-secondary disabled:opacity-30"><Plus className="h-3 w-3" /></button>
            </div>
          ))}
          <div className={cn('text-right text-xs', remaining === 0 ? 'text-primary' : 'text-muted-foreground')}>{remaining} left of {total}</div>
        </div>
      )}

      <div className="mt-2 flex items-center justify-end gap-2">
        {d.mode === 'many' && <span className="mr-auto text-xs text-muted-foreground">{draft.selected.length} chosen · click cards on the board too</span>}
        {(d.mode === 'many' || d.mode === 'damage' || d.mode === 'amount') && <Button variant="ghost" size="sm" onClick={draft.reset}>Clear</Button>}
        {d.mode === 'many' && <Button size="sm" disabled={pending || !manyOk} onClick={() => submit({ indices: draft.selected })} data-testid="button-submit-decision">Confirm{draft.selected.length === 0 ? ' none' : ''}</Button>}
        {d.mode === 'order' && <Button size="sm" disabled={pending} onClick={() => submit({ indices: draft.selected })} data-testid="button-submit-decision">Confirm order</Button>}
        {(d.mode === 'damage' || d.mode === 'amount') && <Button size="sm" disabled={pending} onClick={() => submit({ amounts: draft.amounts })} data-testid="button-submit-decision">Assign</Button>}
        {d.mode === 'ack' && <Button size="sm" disabled={pending} onClick={() => submit({ indices: [] })} data-testid="button-submit-decision">OK</Button>}
      </div>
    </motion.section>
  );
}
