import type { ReactNode } from 'react';
import { Link } from 'wouter';
import { Menu as MenuIcon } from 'lucide-react';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger, DropdownMenuCheckboxItem,
} from '@/components/ui/dropdown-menu';
import { useToast } from '@/hooks/use-toast';
import { usePrefs, type ThemeId } from '@/state/prefs';
import { cn } from '@/lib/utils';
import { Logo } from './Logo';

export const APP = 'https://staging.crankmagic.com/';
export const NAV = [
  { label: 'Decks', href: `${APP}#decks` },
  { label: 'Library', href: `${APP}#cards` },
  { label: 'Explore', href: `${APP}#discover` },
];

export const THEMES: { id: ThemeId; name: string; swatch: [string, string, string] }[] = [
  { id: 'moss', name: 'Moss & Iron', swatch: ['hsl(96 22% 95%)', 'hsl(158 42% 28%)', 'hsl(72 70% 46%)'] },
  { id: 'brass', name: 'Brass & Slate', swatch: ['hsl(36 30% 94%)', 'hsl(212 24% 30%)', 'hsl(38 70% 42%)'] },
  { id: 'felt', name: 'Felt & Cream', swatch: ['hsl(44 46% 95%)', 'hsl(152 48% 24%)', 'hsl(32 64% 44%)'] },
  { id: 'steel', name: 'Steel & Cobalt', swatch: ['hsl(214 26% 95%)', 'hsl(222 62% 40%)', 'hsl(196 80% 44%)'] },
];

export function AppMenu({ onSettings, trigger }: { onSettings?: () => void; trigger?: ReactNode }) {
  const { prefs, set } = usePrefs();
  const { toast } = useToast();
  const stub = (what: string) => toast({ title: what, description: 'Lives in the main CrankMagic app; not part of the Play prototype.' });
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        {trigger ?? (
          <button className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-card px-3 text-sm font-medium hover:bg-secondary" data-testid="button-app-menu">
            <MenuIcon className="h-4 w-4" /> Menu
          </button>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-display">Rob's menu</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => (onSettings ? onSettings() : stub('Settings'))} data-testid="menu-settings">Settings</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => stub('Save a backup file')}>Save a backup file</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => stub('Restore from a backup file')}>Restore from a backup file</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => stub('Reset All')}>Reset All</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onSelect={() => stub('Help & glossary')}>Help &amp; glossary</DropdownMenuItem>
        <DropdownMenuCheckboxItem checked={prefs.termHover} onCheckedChange={(b) => set({ termHover: !!b })}>Term definitions on hover</DropdownMenuCheckboxItem>
        <DropdownMenuItem onSelect={() => stub('Take a Tour')}>Take a Tour</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => stub('Send Feedback')}>Send Feedback</DropdownMenuItem>
        <DropdownMenuItem onSelect={() => stub('Show a QR code')}>Show a QR code</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Theme</DropdownMenuLabel>
        <div className="grid grid-cols-2 gap-1 px-1 pb-1">
          {THEMES.map((t) => (
            <button
              key={t.id}
              onClick={() => set({ theme: t.id })}
              data-testid={`button-theme-${t.id}`}
              className={cn('flex items-center gap-2 rounded-md border px-2 py-1.5 text-left text-xs', prefs.theme === t.id ? 'border-primary bg-accent/50' : 'border-transparent hover:bg-secondary')}
            >
              <span className="flex">
                {t.swatch.map((c, i) => (
                  <span key={i} className="-ml-1 h-3.5 w-3.5 rounded-full border border-white first:ml-0" style={{ background: c }} />
                ))}
              </span>
              {t.name}
            </button>
          ))}
        </div>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AppNav({ onSettings }: { onSettings?: () => void }) {
  return (
    <header className="sticky top-0 z-30 border-b border-border/70 bg-background/85 backdrop-blur">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-6 px-5">
        <a href={`${APP}#welcome`} aria-label="CrankMagic home" data-testid="link-home">
          <Logo />
        </a>
        <nav className="hidden items-center gap-1 sm:flex" aria-label="CrankMagic">
          {NAV.map((n) => (
            <a key={n.label} href={n.href} className="rounded-full px-3 py-1.5 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground" data-testid={`link-nav-${n.label.toLowerCase()}`}>
              {n.label}
            </a>
          ))}
          <Link href="/" className="rounded-full bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground" data-testid="link-nav-play" aria-current="page">
            Play
          </Link>
        </nav>
        <div className="ml-auto">
          <AppMenu onSettings={onSettings} />
        </div>
      </div>
    </header>
  );
}
