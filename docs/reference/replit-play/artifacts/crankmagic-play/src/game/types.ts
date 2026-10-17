// CrankRoomView@1 — the shapes the screen reads. Mirrors gameplay-anchor.md.
// Open sets (counters, option extras) stay open on purpose.

export type ZoneName = 'Library' | 'Hand' | 'Battlefield' | 'Graveyard' | 'Exile' | 'Command';
export const ZONES: ZoneName[] = ['Library', 'Hand', 'Battlefield', 'Graveyard', 'Exile', 'Command'];

export type Phase =
  | 'UNTAP'
  | 'UPKEEP'
  | 'DRAW'
  | 'MAIN1'
  | 'COMBAT_BEGIN'
  | 'COMBAT_DECLARE_ATTACKERS'
  | 'COMBAT_DECLARE_BLOCKERS'
  | 'COMBAT_FIRST_STRIKE_DAMAGE'
  | 'COMBAT_DAMAGE'
  | 'COMBAT_END'
  | 'MAIN2'
  | 'END_OF_TURN'
  | 'CLEANUP';

export interface CardView {
  cardId: number;
  name: string | null;
  faceDown: boolean;
  faceDownName?: string | null;
  owner: number;
  controller: number;
  tapped: boolean;
  damage: number;
  counters: Record<string, number>;
  types: string[];
  power: number | null;
  toughness: number | null;
  keywords: string[];
  commander: boolean;
  commanderKey?: string;
  level?: number;
  monstrous?: boolean;
  prepared?: boolean;
}

export interface Zone {
  count: number;
  hiddenCount: number;
  cards: CardView[];
}

export interface Health {
  life: number;
  poison: number;
  status: string;
  lossReason: string | null;
  commanderDamageMax: number;
  commanderDamage: Record<string, number>;
}

export interface PlayerView {
  playerId: number;
  name: string;
  life: number;
  health: Health;
  counters: Record<string, number>;
  mana: { color: string; amount: number }[];
  landsPlayed: number;
  zones: Record<ZoneName, Zone>;
}

export interface StackEntry {
  stackId: number;
  abilityId?: number | null;
  cardId: number | null;
  name: string | null;
  faceDown: boolean;
  playerId: number;
  kind: 'spell' | 'ability' | 'trigger' | string;
  stage: 'waiting' | 'targeting' | 'resolving' | string;
  targets: { kind: string; id: number }[];
}

export interface CombatAttack {
  attacker: number;
  defender: number;
  planeswalker?: number;
  blocked: boolean;
  blockers: number[];
}

export interface CombatView {
  attackingPlayerId: number;
  defenders: number[];
  attacks: CombatAttack[];
}

export interface GameState {
  schema?: string;
  viewerSeatId?: number;
  turn: number;
  turnPlayerId: number | null;
  priorityPlayerId: number | null;
  phase: Phase | null;
  players: PlayerView[];
  combat: CombatView | null;
  stack: StackEntry[];
  stackSize: number;
  gameOver: boolean;
}

export type DecisionMode = 'one' | 'boolean' | 'index' | 'many' | 'order' | 'damage' | 'amount' | 'ack';

export interface DecisionOption {
  index: number;
  label: string;
  cardId?: number;
  act?: string;
  detail?: string;
  defenderId?: number;
  endsTurn?: boolean;
  targets?: unknown;
  hostile?: boolean;
  key?: string;
  lean?: string;
  count?: number;
  lethal?: number;
  defender?: boolean;
  [extra: string]: unknown;
}

export interface Decision {
  id: string;
  title: string;
  mode: DecisionMode;
  min: number;
  max: number;
  kind?: string;
  cost?: string;
  options: DecisionOption[];
  exclusiveBy?: string;
  requires?: { by: string; values: unknown[]; least: number; why: string }[];
  capped?: { by: string; most: number; why: string };
  budget?: number;
  total?: number;
  minEach?: number;
  divide?: boolean;
  overrideOrder?: boolean;
}

export interface SeatInfo {
  seatId: string;
  name: string;
  pilot: 'human' | 'house' | 'claude' | string;
  level?: string;
}

export interface HistoryLine {
  turn: number;
  text: string;
  mark?: 'turn' | 'quiet' | 'end';
}

export interface GameResult {
  winner: number | string | null;
  reason: string;
  endedBy: string | null;
}

export interface RoomView {
  schema: string;
  protocol: number;
  matchId: string;
  seatId: string;
  seat: number;
  revision: number;
  status: string;
  result: GameResult | null;
  departures: Record<string, unknown>;
  seats: SeatInfo[];
  waitingOn: string | null;
  decision: Decision | null;
  state: GameState;
  history: HistoryLine[];
  continuing?: boolean;
  stepByStep?: boolean;
  yourTurn?: number;
  /** Prototype-only: set on frames produced by the demo script, never by the real room. */
  __synthetic?: string;
  /** Prototype-only: spectator projection (counts only). */
  __spectator?: boolean;
}

// ----- frames out -----
export interface AnswerFrame {
  type: 'act';
  actionId: string;
  revision: number;
  kind: 'answer';
  choiceId: string;
  indices?: number[];
  amounts?: number[];
  hold?: boolean;
}
export type OutFrame = { type: 'view' } | AnswerFrame | { type: 'prefer'; stepByStep: boolean };

// ----- messages in -----
export type InMessage =
  | { type: 'view'; view: RoomView }
  | { type: 'receipt'; accepted: boolean; actionId: string }
  | { type: 'refused'; actionId: string; status: 400 | 409 | 422 | 500; error: string; view: RoomView; of?: 'prefer' }
  | { type: 'away'; seatId: string; until: number | null };

export type ConnectionState = 'connected' | 'reconnecting';
