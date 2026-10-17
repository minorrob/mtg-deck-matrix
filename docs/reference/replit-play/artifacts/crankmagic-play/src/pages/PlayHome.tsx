import { useState } from 'react';
import { Link, useLocation } from 'wouter';
import { motion } from 'framer-motion';
import { ArrowRight, Eye, Lock, Plus, RotateCcw, Users, Globe, Trophy, Play as PlayIcon } from 'lucide-react';
import { AppNav } from '@/components/brand/AppNav';
import { AppFooter } from '@/components/brand/AppFooter';
import { ChatPanel } from '@/components/panes/ChatTab';
import { SettingsPlay } from '@/components/dialogs/SettingsPlay';
import { OPEN_TABLES, HISTORY, type Access, type OpenTable } from '@/data/home';
import { fmtDate } from '@/game/derive';
import { getAdapter } from '@/game/adapter';
import { usePrefs } from '@/state/prefs';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';

const BASE = import.meta.env.BASE_URL;
const ACCESS: Record<Access, { label: string; icon: typeof Globe; cls: string; cta: string }> = {
  open: { label: 'Open', icon: Globe, cls: 'bg-[hsl(var(--lichen)/0.25)] text-foreground', cta: 'Take a seat' },
  friends: { label: 'Friends', icon: Users, cls: 'bg-[hsl(var(--seat-2)/0.18)] text-foreground', cta: 'Ask to join' },
  invite: { label: 'Invite only', icon: Lock, cls: 'bg-[hsl(var(--brass)/0.2)] text-foreground', cta: 'Enter code' },
  full: { label: 'Full · watch', icon: Eye, cls: 'bg-secondary text-muted-foreground', cta: 'Watch' },
};

export default function PlayHome() {
  const [, nav] = useLocation();
  const { reduced } = usePrefs();
  const { toast } = useToast();
  const [sel, setSel] = useState<OpenTable>(OPEN_TABLES[0]);
  const [filter, setFilter] = useState<Access | 'all'>('all');
  const [settings, setSettings] = useState(false);
  const tables = OPEN_TABLES.filter((t) => filter === 'all' || t.access === filter);

  const act = (t: OpenTable) => {
    if (t.access === 'full') nav(`/spectate/${t.id}`);
    else if (t.access === 'open') nav('/lobby');
    else toast({ title: t.access === 'friends' ? `Asked ${t.host} to join` : 'Invite code', description: t.access === 'friends' ? 'You will hear back in chat (stub).' : 'Codes are a stub in this prototype.' });
  };

  return (
    <div className="min-h-[100dvh] bg-background">
      <AppNav onSettings={() => setSettings(true)} />
      <main className="mx-auto max-w-[1400px] px-5 pb-16 pt-8">
        <section className="grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <motion.div initial={reduced ? false : { opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="relative overflow-hidden rounded-3xl border bg-card shadow-sm">
            <img src={`${BASE}assets/mats/highland-mist.jpg`} alt="" className="absolute inset-0 h-full w-full object-cover opacity-70" />
            <div className="absolute inset-0 bg-gradient-to-r from-[hsl(var(--card))] via-[hsl(var(--card)/0.85)] to-transparent" />
            <div className="relative p-7 sm:p-9">
              <p className="zone-label">Your table is still warm</p>
              <h1 className="mt-2 max-w-md font-display text-4xl font-semibold leading-[1.05] tracking-tight sm:text-5xl">Turn 13. Friend is <span className="italic text-primary">thinking.</span></h1>
              <p className="mt-3 max-w-md text-sm text-muted-foreground">Rob, Friend, AI 2 and AI 3 · Faerie Flock · you are at 40. Pick up exactly where you left it, or try the demo table.</p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Link href="/game" onClick={() => getAdapter().loadScenario('demo')} className="inline-flex items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-md hover:brightness-110" data-testid="button-resume">
                  <PlayIcon className="h-4 w-4" /> Resume demo table
                </Link>
                <Link href="/lobby" className="inline-flex items-center gap-2 rounded-full border bg-card px-4 py-2.5 text-sm font-medium hover:bg-secondary" data-testid="button-new-table"><Plus className="h-4 w-4" />New table</Link>
                <Link href="/lobby?rematch=1" className="inline-flex items-center gap-2 rounded-full px-4 py-2.5 text-sm font-medium hover:bg-secondary" data-testid="button-rematch"><RotateCcw className="h-4 w-4" />Rematch last pod</Link>
              </div>
            </div>
          </motion.div>
          <div className="flex flex-col rounded-3xl border bg-card p-4 shadow-sm">
            <div className="mb-2 flex items-center"><h2 className="font-display text-lg font-semibold">Public lobby chat</h2><span className="ml-auto text-xs text-muted-foreground">Everyone looking for a game</span></div>
            <div className="min-h-0 flex-1"><ChatPanel compact channel="public" /></div>
          </div>
        </section>

        <section className="mt-10 grid gap-5 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <div className="mb-3 flex flex-wrap items-end gap-3">
              <h2 className="font-display text-2xl font-semibold">Open games</h2>
              <span className="text-sm text-muted-foreground">{OPEN_TABLES.length} tables</span>
              <div className="ml-auto flex gap-1" role="group" aria-label="Filter by access">
                {(['all', 'open', 'friends', 'invite', 'full'] as const).map((f) => (
                  <button key={f} onClick={() => setFilter(f)} className={cn('rounded-full px-3 py-1 text-xs capitalize', filter === f ? 'bg-primary text-primary-foreground' : 'hover:bg-secondary')}>{f === 'all' ? 'All' : ACCESS[f].label}</button>
                ))}
              </div>
            </div>
            <ul className="divide-y rounded-2xl border bg-card">
              {tables.map((t) => {
                const A = ACCESS[t.access];
                const free = t.seats.filter((s) => !s).length;
                return (
                  <li key={t.id}>
                    <button onClick={() => setSel(t)} className={cn('flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-secondary/60', sel.id === t.id && 'bg-accent/40')} data-testid={`row-table-${t.id}`}>
                      <div className="flex -space-x-1">{t.seats.map((s, i) => <span key={i} className={cn('grid h-7 w-7 place-items-center rounded-full border-2 border-card text-[10px] font-semibold', s ? 'text-white' : 'border-dashed bg-transparent text-muted-foreground')} style={s ? { background: `hsl(var(--seat-${i}))` } : undefined}>{s ? s.slice(0, 2) : '+'}</span>)}</div>
                      <div className="min-w-0 flex-1">
                        <div className="truncate font-medium">{t.name}</div>
                        <div className="text-xs text-muted-foreground">{t.host} · bracket {t.bracket} · {t.pace}{t.started ? ` · turn ${t.turn}` : ` · ${free} seat${free === 1 ? '' : 's'} free`}</div>
                      </div>
                      <span className={cn('inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px]', A.cls)}><A.icon className="h-3 w-3" />{A.label}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
          <aside className="space-y-5">
            <motion.div key={sel.id} initial={reduced ? false : { opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} className="rounded-2xl border bg-card p-5" data-testid="card-table-detail">
              <p className="zone-label">{ACCESS[sel.access].label}</p>
              <h3 className="mt-1 font-display text-xl font-semibold">{sel.name}</h3>
              <p className="text-sm text-muted-foreground">Hosted by {sel.host} · bracket {sel.bracket} · {sel.pace} pace</p>
              {sel.note && <p className="mt-3 rounded-lg bg-secondary/60 p-2 text-sm">{sel.note}</p>}
              <div className="mt-3 grid grid-cols-2 gap-1.5 text-sm">{sel.seats.map((s, i) => <div key={i} className="rounded-lg border px-2 py-1.5"><span className="mr-1 font-mono text-xs text-muted-foreground">{i + 1}</span>{s ?? <span className="text-muted-foreground">empty</span>}</div>)}</div>
              <p className="mt-2 text-xs text-muted-foreground">{sel.spectators} watching</p>
              <button onClick={() => act(sel)} className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-full bg-primary py-2 text-sm font-semibold text-primary-foreground" data-testid="button-table-action">{ACCESS[sel.access].cta}<ArrowRight className="h-4 w-4" /></button>
            </motion.div>
            <div className="rounded-2xl border bg-card p-5">
              <div className="flex items-center gap-2"><Trophy className="h-4 w-4 text-[hsl(var(--brass))]" /><h3 className="font-display text-lg font-semibold">Standing</h3><span className="ml-auto rounded bg-secondary px-1.5 text-[10px] uppercase">stub</span></div>
              <div className="mt-3 grid grid-cols-3 gap-2 text-center"><div><div className="font-mono text-2xl">7</div><div className="text-xs text-muted-foreground">wins</div></div><div><div className="font-mono text-2xl">12</div><div className="text-xs text-muted-foreground">games</div></div><div><div className="font-mono text-2xl">58.3%</div><div className="text-xs text-muted-foreground">rate</div></div></div>
            </div>
          </aside>
        </section>

        <section className="mt-10">
          <h2 className="mb-3 font-display text-2xl font-semibold">Game history</h2>
          <ul className="grid gap-3 md:grid-cols-2">
            {HISTORY.map((h) => (
              <li key={h.id} className="rounded-2xl border bg-card p-4">
                <div className="flex items-baseline"><span className="font-medium">{h.result}</span><span className="ml-auto text-xs text-muted-foreground">{fmtDate(h.when)}</span></div>
                <div className="mt-1 text-sm text-muted-foreground">{h.deck} · {h.turns} turns · {h.seats.join(', ')}</div>
              </li>
            ))}
          </ul>
        </section>
      </main>
      <AppFooter />
      <SettingsPlay open={settings} onOpenChange={setSettings} />
    </div>
  );
}
