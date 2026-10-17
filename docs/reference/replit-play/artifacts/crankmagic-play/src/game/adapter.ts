// THE ADAPTER. The single seam between the screen and the room.
//   views in  → subscribe(listener)  (InMessage)
//   frames out → send(frame)          (OutFrame)
// MockRoomAdapter plays back sample-views.json and, in demo mode, a synthetic
// script. A real WebSocket adapter implements the same two methods.
import { DemoScript, type Emission } from './demo-script';
import { cloneView, FIXTURES } from './fixtures';
import * as syn from './synthetic';
import type { AnswerFrame, ConnectionState, InMessage, OutFrame, RoomView } from './types';

export interface RoomAdapter {
  subscribe(fn: (m: InMessage) => void): () => void;
  send(frame: OutFrame): void;
}

export type ScenarioId =
  | 'demo' | 'big-board' | 'two-seat' | 'three-seat' | 'deep-stack' | 'damage' | 'amount' | 'ack' | 'index' | 'constrained' | 'spectator';

export interface FrameLogEntry {
  at: number;
  dir: 'out' | 'in';
  summary: string;
  body: unknown;
}

function uuid(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });
}
export const newActionId = uuid;

/** The sample's history arrives oldest-first; the anchor says newest-first. Normalize. */
export function normalizeHistory(v: RoomView): RoomView {
  const h = v.history;
  if (h.length > 1 && h[0].turn < h[h.length - 1].turn) v.history = [...h].reverse();
  return v;
}

export class MockRoomAdapter implements RoomAdapter {
  private listeners = new Set<(m: InMessage) => void>();
  private statusListeners = new Set<(s: ConnectionState) => void>();
  private timers: number[] = [];
  private current: RoomView;
  private mode: 'playback' | 'demo' | 'static' = 'demo';
  private fixtureIndex = 7;
  private demo: DemoScript | null = null;
  private connected = true;
  private queued: InMessage[] = [];
  /** Bumps when the prototype swaps source (fixture/scenario); lets the screen accept a lower revision. */
  epoch = 0;
  log: FrameLogEntry[] = [];
  logListeners = new Set<() => void>();

  constructor() {
    this.demo = new DemoScript();
    this.current = this.demo.start();
  }

  get latest(): RoomView {
    return this.current;
  }
  get source(): string {
    return this.mode === 'playback' ? `Playback · recorded view ${this.fixtureIndex + 1} of ${FIXTURES.length}` : this.mode === 'demo' ? 'Demo script' : 'Synthetic scenario';
  }

  subscribe(fn: (m: InMessage) => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }
  onStatus(fn: (s: ConnectionState) => void): () => void {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  }

  private record(dir: 'in' | 'out', summary: string, body: unknown) {
    this.log = [{ at: Date.now(), dir, summary, body }, ...this.log].slice(0, 200);
    this.logListeners.forEach((l) => l());
  }

  private emit(m: InMessage) {
    if (m.type === 'view') {
      normalizeHistory(m.view);
      this.current = m.view;
    }
    if (m.type === 'refused') normalizeHistory(m.view);
    if (!this.connected) {
      this.queued.push(m);
      return;
    }
    this.record('in', m.type === 'view' ? `view rev ${m.view.revision}` : m.type, m.type === 'view' ? { revision: m.view.revision, decision: m.view.decision?.title ?? null } : m);
    this.listeners.forEach((l) => l(m));
  }

  private schedule(list: Emission[]) {
    let t = 0;
    for (const e of list) {
      t += e.delay;
      if (t === 0) this.emit({ type: 'view', view: e.view });
      else this.timers.push(window.setTimeout(() => this.emit({ type: 'view', view: e.view }), t));
    }
  }

  private clearTimers() {
    this.timers.forEach((t) => clearTimeout(t));
    this.timers = [];
  }

  // ---------------- frames out ----------------
  send(frame: OutFrame): void {
    this.record('out', frame.type === 'act' ? `act ${frame.choiceId}` : frame.type, frame);
    if (frame.type === 'view') {
      this.emit({ type: 'view', view: this.current });
      return;
    }
    if (frame.type === 'prefer') {
      const v = structuredClone(this.current);
      v.stepByStep = frame.stepByStep;
      v.revision += 1;
      if (this.demo && this.mode === 'demo') this.demo.v.stepByStep = frame.stepByStep;
      this.emit({ type: 'receipt', accepted: true, actionId: 'prefer' });
      this.emit({ type: 'view', view: v });
      return;
    }
    this.answer(frame);
  }

  private refuse(f: AnswerFrame, status: 400 | 409 | 422 | 500, error: string) {
    this.emit({ type: 'refused', actionId: f.actionId, status, error, view: this.current });
  }

  private answer(f: AnswerFrame) {
    const v = this.current;
    const d = v.decision;
    if (v.status === 'finished') return this.refuse(f, 409, 'The game is over. Nothing more can be chosen.');
    if (!d || d.id !== f.choiceId) return this.refuse(f, 409, 'It is not your decision right now. Wait for the table to come back to you.');
    if (f.revision !== v.revision) return this.refuse(f, 409, 'The board changed. Review the refreshed choice and try again.');
    const idx = f.indices ?? [];
    const n = d.options.length;
    if (idx.some((i) => i < 0 || i >= n || !Number.isInteger(i))) return this.refuse(f, 400, 'That answer named an option that does not exist.');
    switch (d.mode) {
      case 'one': case 'boolean': case 'index':
        if (idx.length !== 1) return this.refuse(f, 400, 'Choose exactly one option.');
        break;
      case 'many': {
        if (idx.length < d.min || idx.length > d.max) return this.refuse(f, 422, `Choose ${d.min === d.max ? d.min : `between ${d.min} and ${d.max}`} option${d.max === 1 ? '' : 's'}; you chose ${idx.length}.`);
        if (d.exclusiveBy) {
          const seen = new Map<unknown, string>();
          for (const i of idx) {
            const o = d.options[i];
            const key = o[d.exclusiveBy];
            if (key != null && seen.has(key)) return this.refuse(f, 422, `${o.label.split(' → ')[0]} can be chosen only once. Pick one of its options.`);
            seen.set(key, o.label);
          }
        }
        break;
      }
      case 'order':
        if (idx.length !== n || new Set(idx).size !== n) return this.refuse(f, 400, 'Put every option in order, each once.');
        break;
      case 'damage': case 'amount': {
        const a = f.amounts ?? [];
        if (a.length !== n) return this.refuse(f, 400, 'Give every option a number.');
        const sum = a.reduce((x, y) => x + y, 0);
        if (d.total != null && sum !== d.total) return this.refuse(f, 422, `Assign exactly ${d.total}; you assigned ${sum}.`);
        if (d.minEach != null && a.some((x) => x < d.minEach!)) return this.refuse(f, 422, `Each option needs at least ${d.minEach}.`);
        if (d.mode === 'damage') {
          const blockers = d.options.map((o, i) => ({ o, i })).filter((x) => x.o.lethal != null);
          const def = d.options.findIndex((o) => o.defender);
          if (def >= 0 && a[def] > 0 && blockers.some((b) => a[b.i] < (b.o.lethal as number))) return this.refuse(f, 422, 'Assign lethal damage to each blocker before any tramples over to the player.');
        }
        break;
      }
      case 'ack':
        break;
    }
    this.emit({ type: 'receipt', accepted: true, actionId: f.actionId });
    if (this.mode === 'demo' && this.demo) {
      this.schedule(this.demo.answer(f));
    } else if (this.mode === 'playback') {
      const next = Math.min(FIXTURES.length - 1, this.fixtureIndex + 1);
      this.fixtureIndex = next;
      this.schedule([{ delay: 420, view: cloneView(FIXTURES[next]) }]);
    } else {
      // static synthetic: acknowledge, clear the decision so the answer is felt.
      const nv = structuredClone(v);
      nv.revision += 1;
      nv.decision = null;
      nv.waitingOn = 's1';
      nv.continuing = true;
      nv.history = [{ turn: nv.state.turn, text: `Answer accepted (synthetic: ${d.title})` }, ...nv.history];
      this.schedule([{ delay: 200, view: nv }]);
    }
  }

  // ---------------- prototype controls (not part of the real adapter) ----------------
  loadFixture(i: number) {
    this.clearTimers();
    this.mode = 'playback';
    this.epoch++;
    this.fixtureIndex = i;
    this.emit({ type: 'view', view: cloneView(FIXTURES[i]) });
  }
  loadScenario(id: ScenarioId) {
    this.clearTimers();
    this.epoch++;
    if (id === 'demo') {
      this.mode = 'demo';
      this.demo = new DemoScript();
      this.emit({ type: 'view', view: this.demo.start() });
      return;
    }
    this.mode = 'static';
    const map: Record<Exclude<ScenarioId, 'demo'>, () => RoomView> = {
      'big-board': syn.bigBoard, 'two-seat': syn.twoSeat, 'three-seat': syn.threeSeat, 'deep-stack': syn.deepStack, damage: syn.damageMode,
      amount: syn.amountMode, ack: syn.ackMode, index: syn.indexMode, constrained: syn.constrainedMany,
      spectator: () => syn.spectatorProjection(cloneView(FIXTURES[35])),
    };
    this.emit({ type: 'view', view: map[id]() });
  }
  /** Start the recorded game from its first view (lobby launch). */
  startRecorded() {
    this.loadFixture(0);
  }
  tableAction(kind: 'concede' | 'end-for-everyone') {
    this.clearTimers();
    this.record('out', `POST /table/${kind}`, { kind });
    const v = kind === 'concede' ? syn.conceded(this.current) : syn.endedForEveryone(this.current, 's0');
    this.emit({ type: 'view', view: v });
  }
  simulateStale() {
    const d = this.current.decision;
    if (!d) return;
    this.send({ type: 'act', actionId: uuid(), revision: this.current.revision - 3, kind: 'answer', choiceId: d.id, indices: d.mode === 'ack' ? [] : [0] });
  }
  simulateEngineFailure() {
    this.emit({ type: 'refused', actionId: uuid(), status: 500, error: 'The engine failed on that action; nothing changed. Try it again.', view: this.current });
  }
  simulateAway(seatId: string, minutes = 5) {
    this.emit({ type: 'away', seatId, until: Date.now() + minutes * 60_000 });
  }
  clearAway(seatId: string) {
    this.emit({ type: 'away', seatId, until: null });
  }
  /** Drops the "socket", backs off 1 s → 2 s → 4 s, then reconnects and asks for a view. */
  simulateDisconnect(attempts = 3) {
    this.connected = false;
    this.statusListeners.forEach((l) => l('reconnecting'));
    let delay = 1000;
    let total = 0;
    for (let i = 0; i < attempts; i++) {
      total += delay;
      delay = Math.min(10_000, delay * 2);
    }
    window.setTimeout(() => {
      this.connected = true;
      this.statusListeners.forEach((l) => l('connected'));
      this.queued = [];
      this.send({ type: 'view' });
    }, total);
  }
}

let singleton: MockRoomAdapter | null = null;
export function getAdapter(): MockRoomAdapter {
  if (!singleton) singleton = new MockRoomAdapter();
  return singleton;
}
