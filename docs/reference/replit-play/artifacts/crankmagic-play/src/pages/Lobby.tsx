// Lobby: four quadrants laid out like the table (2·3 over 4·1, you bottom right).
// No Launch button: when every seat is ready a 10-second countdown runs; the host can cancel.
import { useEffect, useState } from 'react';
import { Link, useLocation } from 'wouter';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, Crown, Dices, Pencil, UserPlus, X, Check } from 'lucide-react';
import { AppNav } from '@/components/brand/AppNav';
import { ChatPanel } from '@/components/panes/ChatTab';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { MANA_COLORS, seatColor } from '@/game/derive';
import { getAdapter } from '@/game/adapter';
import { DECKS } from '@/data/home';
import { MATS } from '@/lib/art';
import { usePrefs } from '@/state/prefs';
import { cn } from '@/lib/utils';

type Kind = 'you' | 'human' | 'ai' | 'open';
interface Seat { kind: Kind; name: string; deck: string; colors: string[]; mat: string; ready: boolean; level?: string }

const INIT: Seat[] = [
  { kind: 'you', name: 'Rob', deck: DECKS[0], colors: ['U', 'W'], mat: 'highland', ready: true },
  { kind: 'human', name: 'Friend', deck: DECKS[2], colors: ['R', 'W'], mat: 'felt', ready: true },
  { kind: 'ai', name: 'AI 2', deck: DECKS[1], colors: ['W', 'U', 'B', 'G'], mat: 'cloud', ready: true, level: 'Steady' },
  { kind: 'open', name: 'Open seat', deck: DECKS[3], colors: [], mat: 'felt', ready: false },
];

function ColorFan({ colors, onToggle, editable }: { colors: string[]; onToggle?: (c: string) => void; editable: boolean }) {
  const all = ['W', 'U', 'B', 'R', 'G'];
  return (
    <div className="relative h-10 w-[150px]" aria-label="Deck colors">
      {all.map((c, i) => {
        const on = colors.includes(c);
        return (
          <motion.button key={c} disabled={!editable} onClick={() => onToggle?.(c)} aria-pressed={on} aria-label={MANA_COLORS[c].label}
            animate={{ rotate: (i - 2) * 9, y: on ? -6 : 0, opacity: on ? 1 : 0.35 }} style={{ left: i * 24, background: `hsl(${MANA_COLORS[c].hsl})` }}
            className="absolute top-1 h-9 w-7 origin-bottom rounded-md border-2 border-card text-[10px] font-bold text-white shadow-sm disabled:cursor-default">{c}</motion.button>
        );
      })}
    </div>
  );
}

export default function Lobby() {
  const [, nav] = useLocation();
  const { prefs, set, reduced } = usePrefs();
  const [seats, setSeats] = useState<Seat[]>(INIT);
  const [rules, setRules] = useState({ bracket: 3, life: 40, pace: 'normal', coach: true, spectators: true });
  const [editRules, setEditRules] = useState(false);
  const [count, setCount] = useState<number | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [die, setDie] = useState(14);
  const allReady = seats.every((s) => s.kind !== 'open' && s.ready);

  useEffect(() => {
    if (allReady && !cancelled && count == null) setCount(10);
    if (!allReady && count != null) setCount(null);
  }, [allReady, cancelled, count]);
  useEffect(() => {
    if (count == null) return;
    if (count <= 0) {
      set({ mats: { ...prefs.mats, '0': seats[0].mat, '1': seats[1].mat, '2': seats[2].mat, '3': seats[3].mat } });
      getAdapter().loadScenario('demo');
      nav('/game');
      return;
    }
    const t = window.setTimeout(() => setCount((c) => (c == null ? c : c - 1)), 1000);
    return () => clearTimeout(t);
  }, [count]); // eslint-disable-line react-hooks/exhaustive-deps

  const upd = (i: number, p: Partial<Seat>) => setSeats((s) => s.map((x, j) => (j === i ? { ...x, ...p } : x)));
  const order = [1, 2, 3, 0]; // 2·3 / 4·1, you bottom right

  return (
    <div className="min-h-[100dvh] bg-background">
      <AppNav />
      <main className="mx-auto grid max-w-[1400px] gap-5 px-5 py-6 lg:grid-cols-[1fr_340px]">
        <div>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <div>
              <p className="zone-label">New table</p>
              <h1 className="font-display text-3xl font-semibold">Rob's table</h1>
            </div>
            <div className="ml-auto flex items-center gap-2 rounded-full border bg-card px-3 py-1.5 text-sm">
              Bracket {rules.bracket} · {rules.life} life · {rules.pace} pace{rules.coach ? ' · coach on' : ''}
              <button onClick={() => setEditRules(true)} className="ml-1 inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-xs" data-testid="button-edit-rules"><Pencil className="h-3 w-3" />Edit</button>
            </div>
          </div>

          <div className="relative grid grid-cols-1 gap-3 sm:grid-cols-2">
            {order.map((i) => {
              const s = seats[i];
              const mine = s.kind === 'you';
              return (
                <motion.section key={i} layout className={cn('relative overflow-hidden rounded-2xl border bg-card p-4', mine && 'ring-2 ring-primary/40')} style={{ borderTop: `4px solid ${seatColor(i)}` }} data-testid={`lobby-seat-${i}`}>
                  <div className="absolute inset-0 opacity-25" aria-hidden>{MATS.find((m) => m.id === s.mat)?.src && <img src={MATS.find((m) => m.id === s.mat)!.src} alt="" className="h-full w-full object-cover" />}</div>
                  <div className="relative">
                    <div className="flex items-center gap-2">
                      <span className="grid h-6 w-6 place-items-center rounded-full text-xs font-bold text-white" style={{ background: seatColor(i) }}>{i + 1}</span>
                      <span className="font-display text-lg font-semibold">{mine ? 'You' : s.name}</span>
                      {i === 0 && <span className="inline-flex items-center gap-1 rounded-full bg-[hsl(var(--brass)/0.2)] px-2 text-[11px]"><Crown className="h-3 w-3" />host · starts</span>}
                      {s.kind === 'ai' && <span className="rounded bg-secondary px-1.5 text-[10px] uppercase">AI · {s.level}</span>}
                      <span className={cn('ml-auto text-xs', s.ready ? 'text-primary' : 'text-muted-foreground')}>{s.kind === 'open' ? 'waiting' : s.ready ? 'ready' : 'not ready'}</span>
                    </div>
                    {s.kind === 'open' ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        <button onClick={() => upd(i, { kind: 'human', name: 'Nina', ready: false, colors: ['B', 'G'] })} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm hover:bg-secondary" data-testid="button-invite"><UserPlus className="h-4 w-4" />Invite Nina</button>
                        {['Gentle', 'Steady', 'Sharp'].map((lv) => (
                          <button key={lv} onClick={() => upd(i, { kind: 'ai', name: 'AI 3', level: lv, ready: true, colors: ['W', 'R'] })} className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm hover:bg-secondary" data-testid={`button-ai-${lv.toLowerCase()}`}><Bot className="h-4 w-4" />AI · {lv}</button>
                        ))}
                      </div>
                    ) : (
                      <div className="mt-3 space-y-3">
                        <ColorFan colors={s.colors} editable={mine} onToggle={(c) => upd(i, { colors: s.colors.includes(c) ? s.colors.filter((x) => x !== c) : [...s.colors, c] })} />
                        <div className="grid grid-cols-2 gap-2">
                          <Select value={s.deck} onValueChange={(v) => upd(i, { deck: v })} disabled={!mine && s.kind !== 'ai'}>
                            <SelectTrigger className="h-8 text-xs" aria-label="Deck"><SelectValue /></SelectTrigger>
                            <SelectContent>{DECKS.map((d) => <SelectItem key={d} value={d}>{d}</SelectItem>)}</SelectContent>
                          </Select>
                          <Select value={s.mat} onValueChange={(v) => upd(i, { mat: v })} disabled={!mine}>
                            <SelectTrigger className="h-8 text-xs" aria-label="Mat"><SelectValue /></SelectTrigger>
                            <SelectContent>{MATS.map((m) => <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>)}</SelectContent>
                          </Select>
                        </div>
                        <div className="flex gap-2">
                          {mine && <button onClick={() => { upd(i, { ready: !s.ready }); setCancelled(false); }} className={cn('rounded-full px-3 py-1 text-xs font-semibold', s.ready ? 'bg-primary text-primary-foreground' : 'border')}>{s.ready ? <><Check className="mr-1 inline h-3 w-3" />Ready</> : 'Mark ready'}</button>}
                          {s.kind === 'human' && !s.ready && <button onClick={() => upd(i, { ready: true })} className="rounded-full border px-3 py-1 text-xs">Simulate ready</button>}
                          {!mine && <button onClick={() => upd(i, { kind: 'open', name: 'Open seat', ready: false, colors: [] })} className="ml-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs text-muted-foreground hover:bg-secondary"><X className="h-3 w-3" />Free seat</button>}
                        </div>
                      </div>
                    )}
                  </div>
                </motion.section>
              );
            })}
            <button onClick={() => setDie(1 + Math.floor(Math.random() * 20))} className="absolute left-1/2 top-1/2 z-10 hidden h-14 w-14 -translate-x-1/2 -translate-y-1/2 place-items-center rounded-2xl border bg-card font-mono text-lg font-bold shadow-md sm:grid" title="Decorative. The host seat starts." aria-label={`Decorative die showing ${die}. The host seat starts.`}>
              <Dices className="absolute -right-2 -top-2 h-5 w-5 rounded-full bg-card p-0.5 text-[hsl(var(--brass))]" />{die}
            </button>
          </div>

          <AnimatePresence>
            {count != null ? (
              <motion.div key="cd" initial={reduced ? false : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="mt-5 flex items-center gap-4 rounded-2xl border bg-primary p-4 text-primary-foreground" role="timer" aria-live="polite" data-testid="lobby-countdown">
                <span className="font-callout text-5xl tabular">{count}</span>
                <div className="flex-1 text-sm">Everyone is ready. The table opens on its own; you go first.</div>
                <button onClick={() => { setCount(null); setCancelled(true); }} className="rounded-full bg-card px-4 py-2 text-sm font-semibold text-foreground" data-testid="button-cancel-countdown">Cancel</button>
              </motion.div>
            ) : (
              <motion.div key="wait" initial={false} animate={{ opacity: 1 }} className="mt-5 flex items-center gap-3 rounded-2xl border border-dashed p-4 text-sm text-muted-foreground">
                {allReady ? <>Countdown cancelled. <button onClick={() => setCancelled(false)} className="font-semibold text-primary underline" data-testid="button-restart-countdown">Start it again</button></> : 'The table opens 10 seconds after every seat is ready. Fill the open seat with a friend or an AI.'}
                <Link href="/" className="ml-auto text-xs underline">Leave lobby</Link>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
        <aside className="rounded-2xl border bg-card p-4 lg:h-[calc(100dvh-110px)]"><h2 className="mb-2 font-display text-lg font-semibold">Table chat</h2><div className="h-[calc(100%-36px)]"><ChatPanel /></div></aside>
      </main>

      <Dialog open={editRules} onOpenChange={setEditRules}>
        <DialogContent>
          <DialogHeader><DialogTitle className="font-display">Host rules</DialogTitle><DialogDescription>Only the host edits these. Changing them clears everyone's ready.</DialogDescription></DialogHeader>
          <div className="space-y-3 text-sm">
            <label className="flex items-center justify-between">Bracket<Select value={String(rules.bracket)} onValueChange={(v) => setRules({ ...rules, bracket: Number(v) })}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger><SelectContent>{[1, 2, 3, 4, 5].map((b) => <SelectItem key={b} value={String(b)}>{b}</SelectItem>)}</SelectContent></Select></label>
            <label className="flex items-center justify-between">Starting life<Select value={String(rules.life)} onValueChange={(v) => setRules({ ...rules, life: Number(v) })}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger><SelectContent>{[20, 30, 40].map((b) => <SelectItem key={b} value={String(b)}>{b}</SelectItem>)}</SelectContent></Select></label>
            <label className="flex items-center justify-between">Pace<Select value={rules.pace} onValueChange={(v) => setRules({ ...rules, pace: v })}><SelectTrigger className="w-28"><SelectValue /></SelectTrigger><SelectContent>{['relaxed', 'normal', 'quick'].map((b) => <SelectItem key={b} value={b}>{b}</SelectItem>)}</SelectContent></Select></label>
            <label className="flex items-center justify-between">Coach allowed<Switch checked={rules.coach} onCheckedChange={(b) => setRules({ ...rules, coach: b })} /></label>
            <label className="flex items-center justify-between">Spectators allowed<Switch checked={rules.spectators} onCheckedChange={(b) => setRules({ ...rules, spectators: b })} /></label>
          </div>
          <DialogFooter><button onClick={() => { setEditRules(false); setSeats((s) => s.map((x) => (x.kind === 'human' ? { ...x, ready: false } : x))); }} className="rounded-full bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Save rules</button></DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
