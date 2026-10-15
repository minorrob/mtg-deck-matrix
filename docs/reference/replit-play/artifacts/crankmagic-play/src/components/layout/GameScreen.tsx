// The table. Four layouts share one LayoutGroup, so seat boards walk between
// slots (shared-layout FLIP, ~360 ms) instead of cutting.
import { useEffect, useRef, useState, type ReactNode } from "react";
import { LayoutGroup, MotionConfig, motion } from 'framer-motion';
import { Link } from 'wouter';
import { RotateCw, WifiOff, Eye, Box, Square } from 'lucide-react';
import { player, relativeSeats } from '@/game/derive';
import { useGame } from '@/state/game';
import { usePrefs, DEFAULT_SIZES, type LayoutMode } from '@/state/prefs';
import { useChat } from '@/state/chat';
import { setSound } from '@/lib/sound';
import { Strip, type StripDoor } from '@/components/table/Strip';
import { Mat } from '@/components/table/Mat';
import { Chair } from '@/components/table/Chair';
import { HandTray } from '@/components/table/HandTray';
import { Table3D } from '@/components/table/Table3D';
import { CenterCounter } from '@/components/table/CenterCounter';
import { StackPanel } from '@/components/table/StackPanel';
import { DecisionDock } from '@/components/table/DecisionDock';
import { FlightLayer } from '@/components/table/FlightLayer';
import { CalloutLayer } from '@/components/table/CalloutLayer';
import { RightPane } from '@/components/panes/RightPane';
import { CoachDrawer } from '@/components/dialogs/CoachDrawer';
import { ScenarioPicker } from '@/components/dialogs/ScenarioPicker';
import { KeyboardHelp } from '@/components/dialogs/KeyboardHelp';
import { ConfirmTable } from '@/components/dialogs/ConfirmTable';
import { GameOver } from '@/components/dialogs/GameOver';
import { CardZoom } from '@/components/dialogs/CardZoom';
import { HoverPreview } from '@/components/dialogs/HoverPreview';
import { SettingsPlay } from '@/components/dialogs/SettingsPlay';
import { Logo } from '@/components/brand/Logo';
import { Divider } from './Divider';
import { cn } from '@/lib/utils';

function usePhoneLandscape() {
  const q = '(max-height: 520px) and (orientation: landscape)';
  const [m, setM] = useState(() => window.matchMedia(q).matches);
  useEffect(() => {
    const mq = window.matchMedia(q);
    const on = () => setM(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return m;
}

function SeatSlot({ id, children, className }: { id: number; children: ReactNode; className?: string }) {
  return <motion.div layoutId={`seat-${id}`} className={cn('relative min-h-0 min-w-0', className)}>{children}</motion.div>;
}

export function GameScreen() {
  const g = useGame();
  const { view, focusSeat, setFocusSeat, connection, status, pass } = g;
  const { prefs, set, setPanes, setSizes, reduced } = usePrefs();
  const chat = useChat();
  const phone = usePhoneLandscape();
  const boardRef = useRef<HTMLDivElement>(null);
  const [door, setDoor] = useState<StripDoor | null>(null);
  const [confirm, setConfirm] = useState<'concede' | 'end' | null>(null);
  const [emote, setEmote] = useState<{ seat: number; text: string; key: number } | null>(null);

  useEffect(() => setSound(prefs.sfx, prefs.mute), [prefs.sfx, prefs.mute]);
  useEffect(() => {
    if (!chat.lastEmote) return;
    setEmote({ seat: chat.lastEmote.seat, text: chat.lastEmote.emote, key: chat.lastEmote.key });
    const t = window.setTimeout(() => setEmote(null), 1800);
    return () => clearTimeout(t);
  }, [chat.lastEmote]);

  const ids = view.state.players.map((p) => p.playerId);
  const focus = ids.includes(focusSeat) ? focusSeat : ids[0];
  const focused = player(view, focus)!;
  const others = relativeSeats(view, Math.max(0, view.seat)).filter((i) => i !== focus);

  const onDoor = (d: StripDoor) => {
    if (d === 'concede' || d === 'end') setConfirm(d);
    else setDoor(d);
  };

  // keyboard: N, Space, H, 1–4, C, L, ?, Esc
  const keyRef = useRef<(e: KeyboardEvent) => void>(() => {});
  keyRef.current = (e: KeyboardEvent) => {
    const t = e.target as HTMLElement;
    if (t.closest('input, textarea, [contenteditable=true], [role=dialog], [role=menu], [role=slider]')) return;
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key;
    if (k === 'n' || k === 'N' || (k === ' ' && !t.closest('button'))) { e.preventDefault(); pass(); }
    else if (k === 'h' || k === 'H') { setPanes({ hand: !prefs.panes.hand }); }
    else if (k === 'c' || k === 'C') { setDoor('coach'); }
    else if (k === 'l' || k === 'L') { const o: LayoutMode[] = ['focus', 'table']; set({ layout: o[(o.indexOf(prefs.layout) + 1) % 2] }); }
    else if (k === '?') setDoor('keys');
    else if (k === 'Escape') setFocusSeat(Math.max(0, view.seat));
    else if (/^[1-4]$/.test(k)) { const n = Number(k) - 1; if (ids.includes(n)) setFocusSeat(n); }
  };
  useEffect(() => {
    const h = (e: KeyboardEvent) => keyRef.current(e);
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, []);

  const layout = phone ? 'focus' : prefs.layout;
  const [isFull, setIsFull] = useState(() => !!document.fullscreenElement);
  useEffect(() => {
    const on = () => setIsFull(!!document.fullscreenElement);
    document.addEventListener('fullscreenchange', on);
    return () => document.removeEventListener('fullscreenchange', on);
  }, []);
  const is3d = prefs.table3d && !phone;
  // Board navigation stays available even in fullscreen or Minimal panels.
  // In 3D, other seats sit on the shared surface and are selectable there.
  const showChairs = layout === 'focus' && !is3d;
  const previousFocus = useRef(focus);
  const direction = useRef(1);
  if (previousFocus.current !== focus) {
    direction.current = focus > previousFocus.current ? 1 : -1;
    previousFocus.current = focus;
  }
  const showPane = !phone && prefs.panes.pane;
  const showHand = prefs.panes.hand && !view.__spectator ? true : !!view.__spectator;
  const quad = (() => {
    const r = relativeSeats(view, Math.max(0, view.seat));
    return [r[1], r[2], r[3], r[0]].filter((x) => x != null);
  })();

  return (
    <MotionConfig transition={{ duration: reduced ? 0 : 0.36, ease: [0.25, 0.8, 0.25, 1] }} reducedMotion={reduced ? 'always' : 'never'}>
      <div className="game-root felt relative flex h-[100dvh] flex-col overflow-hidden" data-layout={layout} data-table3d={is3d ? 'on' : 'off'}>
        <div className="sr-only" aria-live="polite" role="status">{status}</div>
        {connection === 'reconnecting' && (
          <div className="relative z-40 flex h-7 items-center justify-center gap-2 overflow-hidden bg-[hsl(var(--brass))] text-xs font-medium text-white" role="alert" data-testid="bar-reconnecting">
            <span className="reconnect-runner absolute inset-y-0 left-0 w-1/3 bg-white/20" aria-hidden />
            <WifiOff className="h-3.5 w-3.5" /> Reconnecting. The board is unchanged; your next answer waits for the room.
          </div>
        )}
        <div className="flex items-center">
          <Link href="/" className="flex h-12 shrink-0 items-center border-b border-r border-border/70 bg-background/90 px-3" aria-label="Back to Play" data-testid="link-back-play"><Logo compact /></Link>
          <div className="min-w-0 flex-1"><Strip onDoor={onDoor} /></div>
        </div>
        {view.__synthetic && (
          <div className="pointer-events-none absolute left-3 top-[52px] z-30 rounded-full bg-[hsl(var(--ink)/0.75)] px-2.5 py-0.5 text-[10px] font-medium uppercase tracking-wider text-white" data-testid="badge-synthetic">
            {view.__spectator && <Eye className="mr-1 inline h-3 w-3" />}{view.__synthetic}
          </div>
        )}

        <LayoutGroup>
          <div className="flex min-h-0 flex-1">
            <div className="flex min-w-0 flex-1 flex-col">
              {showChairs && others.length > 0 && (
                <>
                  <nav aria-label="Player boards — select a board to rotate the table" className="flex shrink-0 gap-2 overflow-x-auto px-3 pt-3" style={{ height: phone ? 100 : prefs.panes.chairs ? prefs.sizes.chairsH : 116 }}>
                    {others.map((id) => (
                      <SeatSlot key={id} id={id} className="flex flex-1">
                        <Chair p={player(view, id)!} onFocus={() => setFocusSeat(id)} />
                      </SeatSlot>
                    ))}
                  </nav>
                  {!phone && prefs.panes.chairs && <Divider axis="y" label="Chairs height" value={prefs.sizes.chairsH} min={110} max={360} onChange={(n) => setSizes({ chairsH: n })} onReset={() => setSizes({ chairsH: DEFAULT_SIZES.chairsH })} />}
                </>
              )}

              <div ref={boardRef} className="relative min-h-0 flex-1 p-3" style={{ perspective: 1400 }}>
                {is3d ? (
                  <Table3D focus={focus} onFocus={setFocusSeat} />
                ) : layout === 'focus' ? (
                  <SeatSlot id={focus} className="h-full">
                    <motion.div
                      key={focus}
                      className="h-full"
                      initial={reduced ? false : { rotateY: direction.current * 24, rotateZ: direction.current * 2, x: direction.current * 65, scale: 0.94 }}
                      animate={{ rotateY: 0, rotateZ: 0, x: 0, scale: 1 }}
                      transition={{ duration: reduced ? 0 : 0.65, ease: [0.22, 1, 0.36, 1] }}
                      style={{ transformOrigin: '50% 85%' }}
                    >
                      <Mat p={focused} />
                    </motion.div>
                  </SeatSlot>
                ) : (
                  <div className="grid h-full grid-cols-2 grid-rows-2 gap-2">
                    {quad.map((id) => (
                      <SeatSlot key={id} id={id} className={cn('h-full', id === focus && 'ring-2 ring-primary/40 rounded-2xl')}>
                        <div className="h-full" onDoubleClick={() => { setFocusSeat(id); set({ layout: 'focus' }); }}><Mat p={player(view, id)!} compact /></div>
                      </SeatSlot>
                    ))}
                  </div>
                )}
                {(isFull || is3d) && !phone && (
                  <button
                    onClick={() => set({ table3d: !prefs.table3d })}
                    aria-pressed={prefs.table3d}
                    className="absolute left-5 top-5 z-30 inline-flex items-center gap-1.5 rounded-full bg-[hsl(var(--card)/0.92)] px-3 py-1.5 text-xs font-medium shadow-md hover:bg-card"
                    data-testid="button-toggle-3d-floating"
                  >
                    {prefs.table3d ? <><Square className="h-3.5 w-3.5" aria-hidden />Back to 2D</> : <><Box className="h-3.5 w-3.5" aria-hidden />3D table</>}
                  </button>
                )}
                {!prefs.panes.stackPinned && <div className="absolute right-6 top-14 z-20"><StackPanel compact={layout !== 'focus'} /></div>}
                <div className="pointer-events-none absolute inset-x-0 bottom-3 z-30"><DecisionDock /></div>
                {emote && (
                  <motion.div key={emote.key} initial={{ opacity: 0, y: 10, scale: 0.8 }} animate={{ opacity: 1, y: 0, scale: 1 }} className="pointer-events-none absolute left-1/2 top-6 z-30 -translate-x-1/2 rounded-full bg-card px-4 py-1.5 font-callout text-xl uppercase tracking-wide shadow-lg">
                    {player(view, emote.seat)?.name ?? 'Seat'}: {emote.text}
                  </motion.div>
                )}
              </div>

              {prefs.panes.counter && (
                <div className="shrink-0 border-t border-border/60 bg-background/80">
                  <CenterCounter />
                </div>
              )}
              {showHand && (
                <>
                  {!phone && <Divider axis="y" label="Hand height" invert value={prefs.sizes.handH} min={96} max={340} onChange={(n) => setSizes({ handH: n })} onReset={() => setSizes({ handH: DEFAULT_SIZES.handH })} />}
                  <div className="shrink-0 border-t border-border/60 bg-background/70" style={{ height: phone ? 120 : prefs.sizes.handH }}>
                    <HandTray fan={phone} height={phone ? 120 : prefs.sizes.handH} />
                  </div>
                </>
              )}
            </div>

            {showPane && (
              <>
                <Divider axis="x" label="Pane width" invert value={prefs.sizes.paneW} min={260} max={560} onChange={(n) => setSizes({ paneW: n })} onReset={() => setSizes({ paneW: DEFAULT_SIZES.paneW })} />
                <div className="shrink-0 border-l border-border/60" style={{ width: prefs.sizes.paneW }}><RightPane /></div>
              </>
            )}
          </div>
        </LayoutGroup>

        <div className="rotate-hint fixed inset-0 z-[90] flex-col items-center justify-center gap-3 bg-background p-8 text-center">
          <RotateCw className="h-10 w-10 text-primary" />
          <p className="font-display text-xl">Turn your phone sideways</p>
          <p className="text-sm text-muted-foreground">The table needs landscape. Your seat is held.</p>
        </div>

        <FlightLayer view={view} disabled={reduced} />
        <CalloutLayer boundsRef={boardRef} />
        <HoverPreview />
        <CardZoom />
        <GameOver />
        <CoachDrawer open={door === 'coach'} onOpenChange={(b) => setDoor(b ? 'coach' : null)} />
        <ScenarioPicker open={door === 'scenarios'} onOpenChange={(b) => setDoor(b ? 'scenarios' : null)} />
        <KeyboardHelp open={door === 'keys'} onOpenChange={(b) => setDoor(b ? 'keys' : null)} />
        <SettingsPlay open={door === 'settings'} onOpenChange={(b) => setDoor(b ? 'settings' : null)} />
        <ConfirmTable kind={confirm} onClose={() => setConfirm(null)} />
      </div>
    </MotionConfig>
  );
}
