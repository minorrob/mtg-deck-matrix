// Pure read-only helpers over a view. Nothing here decides legality:
// everything actionable comes from view.decision.options.
import type { CardView, Decision, DecisionOption, Phase, PlayerView, RoomView, ZoneName } from './types';

export const PHASES: Phase[] = [
  'UNTAP', 'UPKEEP', 'DRAW', 'MAIN1', 'COMBAT_BEGIN', 'COMBAT_DECLARE_ATTACKERS', 'COMBAT_DECLARE_BLOCKERS',
  'COMBAT_FIRST_STRIKE_DAMAGE', 'COMBAT_DAMAGE', 'COMBAT_END', 'MAIN2', 'END_OF_TURN', 'CLEANUP',
];

const PHASE_LABELS: Record<Phase, string> = {
  UNTAP: 'Untap', UPKEEP: 'Upkeep', DRAW: 'Draw', MAIN1: 'Main 1', COMBAT_BEGIN: 'Beginning of combat',
  COMBAT_DECLARE_ATTACKERS: 'Declare attackers', COMBAT_DECLARE_BLOCKERS: 'Declare blockers',
  COMBAT_FIRST_STRIKE_DAMAGE: 'First-strike damage', COMBAT_DAMAGE: 'Combat damage', COMBAT_END: 'End of combat',
  MAIN2: 'Main 2', END_OF_TURN: 'End step', CLEANUP: 'Cleanup',
};
export function phaseLabel(p: Phase | null | undefined): string {
  return p ? PHASE_LABELS[p] ?? p : 'Opening hand';
}

/** The 7-step ribbon from the brief: groups of the 13 steps. */
export const RIBBON: { key: string; label: string; phases: Phase[] }[] = [
  { key: 'begin', label: 'Beginning', phases: ['UNTAP', 'UPKEEP', 'DRAW'] },
  { key: 'main1', label: 'Main 1', phases: ['MAIN1'] },
  { key: 'combat', label: 'Combat', phases: ['COMBAT_BEGIN', 'COMBAT_DECLARE_ATTACKERS'] },
  { key: 'blocks', label: 'Blocks', phases: ['COMBAT_DECLARE_BLOCKERS'] },
  { key: 'damage', label: 'Damage', phases: ['COMBAT_FIRST_STRIKE_DAMAGE', 'COMBAT_DAMAGE', 'COMBAT_END'] },
  { key: 'main2', label: 'Main 2', phases: ['MAIN2'] },
  { key: 'end', label: 'End', phases: ['END_OF_TURN', 'CLEANUP'] },
];

export const SEAT_COLOR_VARS = ['--seat-0', '--seat-1', '--seat-2', '--seat-3'];
export function seatColor(i: number, alpha = 1): string {
  return `hsl(var(${SEAT_COLOR_VARS[((i % 4) + 4) % 4]}) / ${alpha})`;
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

export function player(view: RoomView, id: number | null | undefined): PlayerView | undefined {
  if (id == null) return undefined;
  return view.state.players.find((p) => p.playerId === id);
}

export function seatIndexOf(seatId: string | null | undefined): number | null {
  if (!seatId) return null;
  const n = Number(seatId.replace('s', ''));
  return Number.isFinite(n) ? n : null;
}

export function displayName(view: RoomView, id: number | null | undefined): string {
  if (id == null) return '—';
  if (id === view.seat) return 'You';
  return player(view, id)?.name ?? `Seat ${id + 1}`;
}

/** The name a seat may see. Face-down cards never leak a name. */
export function visibleName(c: Pick<CardView, 'name' | 'faceDown' | 'faceDownName'>): string | null {
  if (c.faceDown) return c.faceDownName ?? null;
  return c.name;
}
export function a11yCardName(c: Pick<CardView, 'name' | 'faceDown' | 'faceDownName'>): string {
  const n = visibleName(c);
  if (c.faceDown) return n ? `${n} (face down)` : 'Face-down card';
  return n ?? 'Hidden card';
}

export function turnLabel(view: RoomView): string {
  const s = view.state;
  if (!s.turn) return 'Opening hand';
  const who = s.turnPlayerId === view.seat ? 'You' : displayName(view, s.turnPlayerId);
  const yours = s.turnPlayerId === view.seat && view.yourTurn ? ` (your ${ordinal(view.yourTurn)})` : '';
  return `Turn ${s.turn} · ${who}${yours}`;
}

export function isPriority(d: Decision | null | undefined): boolean {
  return !!d && (d.kind === 'priority' || d.title === 'Your priority');
}

export function passOption(d: Decision | null | undefined): DecisionOption | undefined {
  if (!isPriority(d)) return undefined;
  return d!.options.find((o) => o.act === 'pass');
}

export interface OneButtonState {
  label: string;
  hint: string;
  option?: DecisionOption;
  kind: 'pass' | 'next' | 'resolve' | 'end' | 'answer' | 'waiting' | 'over' | 'spectate';
}

export function oneButton(view: RoomView): OneButtonState {
  const s = view.state;
  if (view.__spectator) return { label: 'Watching', hint: 'Spectators never act', kind: 'spectate' };
  if (view.status === 'finished' || s.gameOver) return { label: 'Game over', hint: 'See the scorecard', kind: 'over' };
  const d = view.decision;
  if (!d) {
    const who = view.waitingOn ? displayName(view, seatIndexOf(view.waitingOn)) : 'the table';
    return { label: `Waiting on ${who}`, hint: view.continuing ? 'AI seats are playing' : 'Not your decision', kind: 'waiting' };
  }
  if (!isPriority(d)) return { label: 'Answer above', hint: d.title, kind: 'answer' };
  const p = passOption(d);
  if (!p) return { label: 'Choose an option', hint: d.title, kind: 'answer' };
  if (p.endsTurn) return { label: 'End Turn', hint: 'Passing now ends your turn', option: p, kind: 'end' };
  if (s.stack.length > 0) {
    const top = s.stack[s.stack.length - 1];
    const name = top.faceDown ? 'face-down spell' : top.name ?? 'top of stack';
    return { label: `Resolve ${name}`, hint: 'Passing lets the top of the stack resolve', option: p, kind: 'resolve' };
  }
  if (s.turnPlayerId === view.seat) return { label: s.phase === 'UPKEEP' || s.phase === 'UNTAP' ? 'Draw' : 'Next Step', hint: `Leave ${phaseLabel(s.phase)}`, option: p, kind: 'next' };
  return { label: 'Pass', hint: `${displayName(view, s.turnPlayerId)}'s turn`, option: p, kind: 'pass' };
}

/** Map cardId → where it lives, for flights and lookups. */
export function locationMap(view: RoomView): Map<number, { owner: number; zone: ZoneName; card: CardView }> {
  const m = new Map<number, { owner: number; zone: ZoneName; card: CardView }>();
  for (const p of view.state.players) {
    for (const z of Object.keys(p.zones) as ZoneName[]) {
      for (const c of p.zones[z].cards) m.set(c.cardId, { owner: p.playerId, zone: z, card: c });
    }
  }
  return m;
}

export function findCard(view: RoomView, cardId: number | undefined | null): CardView | undefined {
  if (cardId == null) return undefined;
  return locationMap(view).get(cardId)?.card;
}

/** Options grouped by cardId — "castable now" comes only from here. */
export function optionsByCard(d: Decision | null | undefined): Map<number, DecisionOption[]> {
  const m = new Map<number, DecisionOption[]>();
  if (!d) return m;
  for (const o of d.options) {
    if (o.cardId == null) continue;
    const arr = m.get(o.cardId) ?? [];
    arr.push(o);
    m.set(o.cardId, arr);
  }
  return m;
}

export const TYPE_ORDER = ['Land', 'Creature', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Planeswalker'];
export function primaryType(c: CardView): string {
  for (const t of ['Creature', 'Planeswalker', 'Land', 'Instant', 'Sorcery', 'Artifact', 'Enchantment', 'Battle']) {
    if (c.types.includes(t)) return t;
  }
  return c.types[0] ?? 'Other';
}

const BASICS = ['Plains', 'Island', 'Swamp', 'Mountain', 'Forest', 'Wastes'];
export function isBasic(name: string | null): boolean {
  return !!name && BASICS.includes(name);
}
export function basicOrder(name: string | null): number {
  const i = BASICS.indexOf(name ?? '');
  return i === -1 ? 99 : i;
}

/** Battlefield split: creatures first, then the rest; lands separate. */
export function splitBattlefield(cards: CardView[]) {
  const lands: CardView[] = [];
  const creatures: CardView[] = [];
  const others: CardView[] = [];
  for (const c of cards) {
    if (c.types.includes('Land') && !c.types.includes('Creature')) lands.push(c);
    else if (c.types.includes('Creature')) creatures.push(c);
    else others.push(c);
  }
  return { lands, nonlands: [...creatures, ...others] };
}

/** Lands: basics pile by name (WUBRG first); nonbasics stand alone. */
export function landPiles(lands: CardView[]): CardView[][] {
  const piles = new Map<string, CardView[]>();
  const loose: CardView[][] = [];
  for (const l of lands) {
    if (isBasic(l.name)) {
      const k = `${l.name}:${l.tapped ? 't' : 'u'}`;
      const arr = piles.get(k) ?? [];
      arr.push(l);
      piles.set(k, arr);
    } else loose.push([l]);
  }
  const basics = [...piles.values()].sort((a, b) => basicOrder(a[0].name) - basicOrder(b[0].name) || Number(a[0].tapped) - Number(b[0].tapped));
  return [...basics, ...loose];
}

export const MANA_COLORS: Record<string, { label: string; hsl: string }> = {
  W: { label: 'White', hsl: '48 60% 86%' },
  U: { label: 'Blue', hsl: '205 70% 52%' },
  B: { label: 'Black', hsl: '260 10% 26%' },
  R: { label: 'Red', hsl: '6 72% 52%' },
  G: { label: 'Green', hsl: '135 45% 38%' },
  C: { label: 'Colorless', hsl: '30 6% 62%' },
};

export function relativeSeats(view: RoomView, focus: number): number[] {
  const ids = view.state.players.map((p) => p.playerId);
  const i = Math.max(0, ids.indexOf(focus));
  return [...ids.slice(i), ...ids.slice(0, i)];
}

export function fmtTime(ms: number): string {
  return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}
export function fmtDate(ms: number): string {
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}
