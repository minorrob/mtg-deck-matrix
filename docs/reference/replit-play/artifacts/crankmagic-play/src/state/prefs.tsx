import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type ThemeId = 'moss' | 'brass' | 'felt' | 'steel';
export type LayoutMode = 'focus' | 'table';
export type Preset = 'open' | 'standard' | 'full' | 'custom';
export type PaneTab = 'resources' | 'panel' | 'history' | 'tracker' | 'combat' | 'chat';

export interface Prefs {
  theme: ThemeId;
  reduceMotion: boolean;
  overlay: number;
  sfx: number;
  music: number;
  mute: boolean;
  cardSize: number;
  handScale: number;
  stepByStep: boolean;
  holdPriority: boolean;
  remindLand: boolean;
  layout: LayoutMode;
  table3d: boolean;
  preset: Preset;
  panes: { chairs: boolean; pane: boolean; hand: boolean; counter: boolean; historyBand: boolean; stackPinned: boolean; odds: boolean; callouts: boolean };
  sizes: { chairsH: number; paneW: number; handH: number; panelCardH: number };
  paneTab: PaneTab;
  coach: { suggestUnowned: boolean; preferOwned: boolean; stayInBracket: boolean; length: 'short' | 'detailed'; sees: 'board-hand' | 'board' };
  mats: Record<string, string>;
  nameplates: boolean;
  termHover: boolean;
  handSort: 'drawn' | 'type' | 'name';
  resourcesGroup: 'type' | 'land';
  savedLayout: null | Pick<Prefs, 'layout' | 'panes' | 'sizes' | 'paneTab'>;
}

export const DEFAULT_SIZES = { chairsH: 190, paneW: 340, handH: 168, panelCardH: 300 };

export const DEFAULT_PREFS: Prefs = {
  theme: 'moss',
  reduceMotion: false,
  overlay: 70,
  sfx: 60,
  music: 0,
  mute: false,
  cardSize: 74,
  handScale: 2,
  stepByStep: false,
  holdPriority: false,
  remindLand: true,
  layout: 'focus',
  table3d: false,
  preset: 'standard',
  panes: { chairs: true, pane: true, hand: true, counter: true, historyBand: true, stackPinned: false, odds: false, callouts: true },
  sizes: DEFAULT_SIZES,
  paneTab: 'resources',
  coach: { suggestUnowned: false, preferOwned: true, stayInBracket: true, length: 'short', sees: 'board-hand' },
  mats: { '0': 'highland', '1': 'felt', '2': 'cloud', '3': 'felt' },
  nameplates: true,
  termHover: true,
  handSort: 'drawn',
  resourcesGroup: 'type',
  savedLayout: null,
};

export const PRESETS: Record<Exclude<Preset, 'custom'>, Partial<Prefs>> = {
  open: { layout: 'focus', panes: { chairs: false, pane: false, hand: true, counter: true, historyBand: false, stackPinned: false, odds: false, callouts: true } },
  standard: { layout: 'focus', paneTab: 'resources', panes: { chairs: true, pane: true, hand: true, counter: true, historyBand: true, stackPinned: false, odds: false, callouts: true } },
  full: { layout: 'focus', paneTab: 'chat', panes: { chairs: true, pane: true, hand: true, counter: true, historyBand: true, stackPinned: true, odds: true, callouts: true } },
};

const KEY = 'crankmagic-play:prefs:v1';

interface Ctx {
  prefs: Prefs;
  set: (patch: Partial<Prefs>) => void;
  setPanes: (patch: Partial<Prefs['panes']>) => void;
  setSizes: (patch: Partial<Prefs['sizes']>) => void;
  applyPreset: (p: Exclude<Preset, 'custom'>) => void;
  reduced: boolean;
}

const PrefsContext = createContext<Ctx | null>(null);

export function PrefsProvider({ children }: { children: ReactNode }) {
  const [prefs, setPrefs] = useState<Prefs>(() => {
    try {
      const raw = localStorage.getItem(KEY);
      if (raw) {
        const p = JSON.parse(raw);
        if (p.layout === 'grid') p.layout = 'table';
        if (p.layout === 'full') p.layout = 'focus';
        if (p.savedLayout?.layout === 'grid') p.savedLayout.layout = 'table';
        if (p.savedLayout?.layout === 'full') p.savedLayout.layout = 'focus';
        return { ...DEFAULT_PREFS, ...p, panes: { ...DEFAULT_PREFS.panes, ...p.panes }, sizes: { ...DEFAULT_SIZES, ...p.sizes }, coach: { ...DEFAULT_PREFS.coach, ...p.coach } };
      }
    } catch {
      /* ignore */
    }
    return DEFAULT_PREFS;
  });
  const [osReduced, setOsReduced] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    setOsReduced(mq.matches);
    const on = () => setOsReduced(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(prefs));
    document.documentElement.dataset.theme = prefs.theme;
  }, [prefs]);

  const reduced = prefs.reduceMotion || osReduced;
  useEffect(() => {
    document.documentElement.classList.toggle('reduce-motion', reduced);
  }, [reduced]);

  const set = useCallback((patch: Partial<Prefs>) => setPrefs((p) => ({ ...p, ...patch })), []);
  const setPanes = useCallback((patch: Partial<Prefs['panes']>) => setPrefs((p) => ({ ...p, preset: 'custom', panes: { ...p.panes, ...patch } })), []);
  const setSizes = useCallback((patch: Partial<Prefs['sizes']>) => setPrefs((p) => ({ ...p, sizes: { ...p.sizes, ...patch } })), []);
  const applyPreset = useCallback(
    (preset: Exclude<Preset, 'custom'>) => setPrefs((p) => ({ ...p, ...PRESETS[preset], layout: p.layout, preset, panes: { ...p.panes, ...(PRESETS[preset].panes ?? {}) } })),
    [],
  );

  const value = useMemo(() => ({ prefs, set, setPanes, setSizes, applyPreset, reduced }), [prefs, set, setPanes, setSizes, applyPreset, reduced]);
  return <PrefsContext.Provider value={value}>{children}</PrefsContext.Provider>;
}

export function usePrefs(): Ctx {
  const c = useContext(PrefsContext);
  if (!c) throw new Error('usePrefs outside PrefsProvider');
  return c;
}
