// The right pane: six tabs, each with a ⋯ menu and Hide.
import { MoreHorizontal, X } from 'lucide-react';
import { usePrefs, type PaneTab } from '@/state/prefs';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuCheckboxItem } from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { ResourcesTab } from './ResourcesTab';
import { PanelTab } from './PanelTab';
import { HistoryTab } from './HistoryTab';
import { TrackerTab } from './TrackerTab';
import { CombatTab } from './CombatTab';
import { ChatTab } from './ChatTab';
import { HandCounts } from './HandCounts';

const TABS: { id: PaneTab; label: string }[] = [
  { id: 'resources', label: 'Turn Resources' },
  { id: 'panel', label: 'Panel' },
  { id: 'history', label: 'History' },
  { id: 'tracker', label: 'Tracker' },
  { id: 'combat', label: 'Combat' },
  { id: 'chat', label: 'Chat' },
];

export function RightPane() {
  const { prefs, set, setPanes } = usePrefs();
  const tab = prefs.paneTab;
  return (
    <aside className="flex h-full min-w-0 flex-col bg-card/80" aria-label="Side pane">
      <HandCounts />
      <div className="flex items-center gap-0.5 border-b border-border px-1.5 pt-1.5" role="tablist">
        <div className="flex min-w-0 flex-1 gap-0.5 overflow-x-auto scroll-thin">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => set({ paneTab: t.id })}
              className={cn('shrink-0 rounded-t-lg px-2.5 py-1.5 text-[12px]', tab === t.id ? 'bg-background font-semibold text-foreground' : 'text-muted-foreground hover:text-foreground')} data-testid={`tab-${t.id}`}>
              {t.label}
            </button>
          ))}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger className="rounded p-1 hover:bg-secondary" aria-label="Pane options"><MoreHorizontal className="h-4 w-4" /></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {tab === 'resources' && (
              <>
                <DropdownMenuCheckboxItem checked={prefs.resourcesGroup === 'type'} onCheckedChange={() => set({ resourcesGroup: 'type' })}>Group by type</DropdownMenuCheckboxItem>
                <DropdownMenuCheckboxItem checked={prefs.resourcesGroup === 'land'} onCheckedChange={() => set({ resourcesGroup: 'land' })}>Lands first</DropdownMenuCheckboxItem>
              </>
            )}
            {tab === 'history' && <DropdownMenuCheckboxItem checked={prefs.panes.historyBand} onCheckedChange={(b) => setPanes({ historyBand: !!b })}>Show quiet steps</DropdownMenuCheckboxItem>}
            {tab === 'panel' && <DropdownMenuCheckboxItem checked={prefs.panes.odds} onCheckedChange={(b) => setPanes({ odds: !!b })}>Show draw odds</DropdownMenuCheckboxItem>}
            {tab === 'combat' && <DropdownMenuCheckboxItem checked={prefs.panes.stackPinned} onCheckedChange={(b) => setPanes({ stackPinned: !!b })}>Pin stack here</DropdownMenuCheckboxItem>}
            <DropdownMenuItem onSelect={() => setPanes({ pane: false })}>Hide pane</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <button onClick={() => setPanes({ pane: false })} className="rounded p-1 hover:bg-secondary" aria-label="Hide pane" data-testid="button-hide-pane"><X className="h-4 w-4" /></button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto scroll-thin p-3" role="tabpanel">
        {tab === 'resources' && <ResourcesTab />}
        {tab === 'panel' && <PanelTab />}
        {tab === 'history' && <HistoryTab />}
        {tab === 'tracker' && <TrackerTab />}
        {tab === 'combat' && <CombatTab />}
        {tab === 'chat' && <ChatTab />}
      </div>
    </aside>
  );
}
