// The strip: the one button (with any refusal right under it), and the few doors
// off it. Every game action is a decision option — nothing here invents one.
import { ChevronDown, FastForward, GraduationCap, History, LayoutGrid, PanelRight, Wrench, Flag, Power, Footprints, Hand, Bug, WifiOff, Clock, AlertTriangle, Settings, Box } from 'lucide-react';
import { motion } from 'framer-motion';
import { isPriority, oneButton, phaseLabel, RIBBON, turnLabel } from '@/game/derive';
import { useGame } from '@/state/game';
import { usePrefs, type LayoutMode } from '@/state/prefs';
import { useChat, EMOTES } from '@/state/chat';
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuSub, DropdownMenuSubTrigger, DropdownMenuSubContent,
} from '@/components/ui/dropdown-menu';
import { Slider } from '@/components/ui/slider';
import { cn } from '@/lib/utils';

export type StripDoor = 'coach' | 'scenarios' | 'concede' | 'end' | 'settings' | 'keys';

function Door({ icon: Icon, label, onClick, active, testId }: { icon: typeof History; label: string; onClick?: () => void; active?: boolean; testId: string }) {
  return (
    <button onClick={onClick} className={cn('inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground', active && 'bg-secondary text-foreground')} data-testid={testId}>
      <Icon className="h-4 w-4" aria-hidden /> <span className="hidden lg:inline">{label}</span>
    </button>
  );
}

export function Strip({ onDoor }: { onDoor: (d: StripDoor) => void }) {
  const g = useGame();
  const { view, refusal, pending, skipping, setSkipping, choose, adapter } = g;
  const { prefs, set, setPanes, applyPreset } = usePrefs();
  const chat = useChat();
  const ob = oneButton(view);
  const d = view.decision;
  const others = isPriority(d) ? d!.options.filter((o) => o.act !== 'pass' && o.act !== 'play-land') : [];
  const phaseIdx = RIBBON.findIndex((r) => view.state.phase && r.phases.includes(view.state.phase));
  const canSkip = isPriority(d) && view.state.turnPlayerId === view.seat;

  const cycleLayout = () => {
    const order: LayoutMode[] = ['focus', 'table'];
    set({ layout: order[(order.indexOf(prefs.layout) + 1) % order.length] });
  };

  return (
    <div className="relative z-20 flex h-12 shrink-0 items-center gap-2 whitespace-nowrap border-b border-border/70 bg-background/90 px-3 backdrop-blur" role="toolbar" aria-label="Game strip">
      <div className="hidden min-w-0 flex-col leading-tight md:flex">
        <span className="truncate font-display text-[14px] font-semibold">{turnLabel(view)}</span>
        <span className="text-[11px] text-muted-foreground">{phaseLabel(view.state.phase)}</span>
      </div>
      <ol className="ml-2 hidden items-center gap-0.5 min-[1600px]:flex" aria-label="Turn steps">
        {RIBBON.map((r, i) => (
          <li key={r.key} className={cn('rounded-full px-2 py-0.5 text-[11px]', i === phaseIdx ? 'bg-primary text-primary-foreground' : i < phaseIdx ? 'text-foreground/60' : 'text-muted-foreground/60')}>{r.label}</li>
        ))}
      </ol>

      <div className="relative mx-auto flex flex-col items-center">
        <motion.button
          whileTap={{ scale: 0.97 }}
          onClick={() => ob.option && choose(ob.option)}
          disabled={!ob.option || pending}
          className={cn('relative h-9 min-w-[180px] rounded-full px-5 text-sm font-semibold shadow-sm transition-colors', ob.option ? 'priority-pulse bg-primary text-primary-foreground hover:brightness-110' : 'bg-secondary text-muted-foreground', ob.kind === 'end' && 'bg-[hsl(var(--brass))]')}
          title={`${ob.hint} (N or Space)`}
          data-testid="button-one"
        >
          {pending ? 'Sending…' : ob.label}
        </motion.button>
        {refusal && (
          <div role="alert" className="absolute top-[42px] z-30 w-max max-w-[420px] rounded-lg border border-destructive/40 bg-card px-3 py-1.5 text-xs text-destructive shadow-lg" data-testid="text-refusal">
            <AlertTriangle className="mr-1 inline h-3.5 w-3.5" />{refusal.error} <span className="text-muted-foreground">({refusal.status})</span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-0.5">
        <Door icon={FastForward} label={skipping ? 'Stop skipping' : 'Skip to end'} onClick={() => canSkip && setSkipping(!skipping)} active={skipping} testId="button-skip" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button disabled={others.length === 0} className="inline-flex h-9 items-center gap-1 rounded-full px-3 text-sm text-muted-foreground hover:bg-secondary disabled:opacity-40" data-testid="button-you-can-also">
              <Hand className="h-4 w-4" /><span className="hidden lg:inline">You can also</span><span className="font-mono text-[11px]">{others.length}</span><ChevronDown className="h-3 w-3" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="max-h-[60vh] w-72 overflow-auto">
            {others.map((o) => (
              <DropdownMenuItem key={o.index} onSelect={() => choose(o)} className="gap-2">
                <span className="font-mono text-[10px] text-muted-foreground">#{o.index}</span>
                <span className="flex-1">{o.label} {o.detail && <span className="text-muted-foreground">{o.detail}</span>}</span>
                {o.lean && <span className="text-[10px] text-[hsl(var(--brass))]">{o.lean}</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
        <Door icon={History} label="History" onClick={() => { setPanes({ pane: true }); set({ paneTab: 'history' }); }} testId="button-history" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground hover:bg-secondary" data-testid="button-tools"><Wrench className="h-4 w-4" /><span className="hidden lg:inline">Tools</span></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuCheckboxItem checked={prefs.stepByStep} onCheckedChange={(b) => g.setStepByStep(!!b)}><Footprints className="mr-2 h-4 w-4" />Step by step</DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={prefs.holdPriority} onCheckedChange={(b) => set({ holdPriority: !!b })}>Hold priority after casting</DropdownMenuCheckboxItem>
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Emote</DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {EMOTES.map((e) => <DropdownMenuItem key={e} onSelect={() => chat.send(e, { emote: e })}>{e}</DropdownMenuItem>)}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
            <DropdownMenuSeparator />
            <DropdownMenuLabel className="text-xs text-muted-foreground">Prototype</DropdownMenuLabel>
            <DropdownMenuItem onSelect={() => onDoor('scenarios')} data-testid="menu-scenarios"><Bug className="mr-2 h-4 w-4" />Scenarios &amp; callouts</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => adapter.simulateDisconnect()}><WifiOff className="mr-2 h-4 w-4" />Simulate disconnect</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => adapter.simulateAway('s1', 4)}><Clock className="mr-2 h-4 w-4" />Friend steps away</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => adapter.simulateStale()}>Send a stale answer (409)</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => adapter.simulateEngineFailure()}>Engine failure (500)</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onDoor('keys')}>Keyboard shortcuts</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onDoor('settings')}><Settings className="mr-2 h-4 w-4" />Settings › Play</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => onDoor('concede')} className="text-destructive" data-testid="menu-concede"><Flag className="mr-2 h-4 w-4" />Concede</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => onDoor('end')} className="text-destructive" data-testid="menu-end"><Power className="mr-2 h-4 w-4" />End for everyone</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-sm text-muted-foreground hover:bg-secondary" data-testid="button-layout" onDoubleClick={cycleLayout}><LayoutGrid className="h-4 w-4" /><span className="hidden lg:inline">Layout</span></button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-72 p-2">
            <DropdownMenuLabel>Layout <span className="text-xs font-normal text-muted-foreground">(L cycles)</span></DropdownMenuLabel>
            <div className="grid grid-cols-2 gap-1 pb-2">
              {(['focus', 'table'] as LayoutMode[]).map((l) => (
                <button key={l} onClick={() => set({ layout: l })} className={cn('rounded-md border px-2 py-1 text-xs capitalize', prefs.layout === l ? 'border-primary bg-accent/60' : 'border-border')} data-testid={`layout-${l}`}>{l}</button>
              ))}
            </div>
            <DropdownMenuItem onSelect={async () => {
              try {
                if (document.fullscreenElement) await document.exitFullscreen();
                else await document.documentElement.requestFullscreen();
              } catch {
                window.alert('Fullscreen is unavailable in this embedded preview. Open the preview in a new tab for fullscreen. The 3D table works here without it.');
              }
            }} data-testid="menu-fullscreen">Full screen / Exit full screen</DropdownMenuItem>
            <DropdownMenuCheckboxItem checked={prefs.table3d} onCheckedChange={(b) => set({ table3d: !!b })} data-testid="menu-table-3d"><Box className="mr-2 h-4 w-4" />3D table (one shared surface)</DropdownMenuCheckboxItem>
            <DropdownMenuLabel>Panel presets</DropdownMenuLabel>
            <p className="px-2 pb-2 text-xs text-muted-foreground">Show fewer or more panels without changing the board layout.</p>
            <div className="grid grid-cols-3 gap-1 pb-2">
              {(['open', 'standard', 'full'] as const).map((p) => (
                <button key={p} onClick={() => applyPreset(p)} className={cn('rounded-md border px-2 py-1 text-xs capitalize', prefs.preset === p ? 'border-primary bg-accent/60' : 'border-border')} data-testid={`preset-${p}`}>{p === 'full' ? 'All panels' : p === 'open' ? 'Minimal' : 'Standard'}</button>
              ))}
            </div>
            <div className="space-y-3 px-1 py-1 text-xs">
              <label className="block">Card size · {prefs.cardSize}px<Slider className="mt-1.5" min={44} max={130} step={2} value={[prefs.cardSize]} onValueChange={([v]) => set({ cardSize: v })} aria-label="Card size" /></label>
              <label className="block">Hand size · {prefs.handScale.toFixed(1)}×<Slider className="mt-1.5" min={1} max={3} step={0.1} value={[prefs.handScale]} onValueChange={([v]) => set({ handScale: v })} aria-label="Hand size" /></label>
            </div>
            <DropdownMenuSeparator />
            <DropdownMenuCheckboxItem checked={prefs.panes.chairs} onCheckedChange={(b) => setPanes({ chairs: !!b })}>Expanded board previews</DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={prefs.panes.hand} onCheckedChange={(b) => setPanes({ hand: !!b })}>Hand tray</DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={prefs.panes.counter} onCheckedChange={(b) => setPanes({ counter: !!b })}>Life totals bar</DropdownMenuCheckboxItem>
            <DropdownMenuCheckboxItem checked={prefs.panes.callouts} onCheckedChange={(b) => setPanes({ callouts: !!b })}>Callouts</DropdownMenuCheckboxItem>
            <DropdownMenuItem onSelect={() => set({ savedLayout: { layout: prefs.layout, panes: prefs.panes, sizes: prefs.sizes, paneTab: prefs.paneTab } })}>Save this layout</DropdownMenuItem>
            <DropdownMenuItem disabled={!prefs.savedLayout} onSelect={() => prefs.savedLayout && set({ ...prefs.savedLayout, preset: 'custom' })}>Restore saved layout</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <Door icon={Box} label={prefs.table3d ? '2D' : '3D'} onClick={() => set({ table3d: !prefs.table3d })} active={prefs.table3d} testId="button-table-3d" />
        <Door icon={PanelRight} label="Panel" onClick={() => setPanes({ pane: !prefs.panes.pane })} active={prefs.panes.pane} testId="button-panel" />
        <Door icon={GraduationCap} label="Coach" onClick={() => onDoor('coach')} testId="button-coach" />
      </div>
    </div>
  );
}
