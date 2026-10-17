import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { getAdapter, newActionId, type MockRoomAdapter } from '@/game/adapter';
import { detectCallouts, type Callout } from '@/game/callouts';
import { isPriority, passOption } from '@/game/derive';
import type { ConnectionState, DecisionOption, InMessage, RoomView } from '@/game/types';
import { play } from '@/lib/sound';
import { usePrefs } from './prefs';

export interface Refusal {
  status: number;
  error: string;
  at: number;
}

interface GameCtx {
  adapter: MockRoomAdapter;
  view: RoomView;
  prev: RoomView | null;
  refusal: Refusal | null;
  pending: boolean;
  connection: ConnectionState;
  away: Record<string, number>;
  callouts: Callout[];
  pushCallout: (c: Callout) => void;
  dismissCallout: (id: string) => void;
  focusSeat: number;
  setFocusSeat: (n: number) => void;
  picked: number | null;
  setPicked: (n: number | null) => void;
  lit: Set<number>;
  lightCards: (ids: number[], ms?: number) => void;
  zoomId: number | null;
  setZoomId: (n: number | null) => void;
  choose: (o: DecisionOption) => void;
  submit: (payload: { indices?: number[]; amounts?: number[] }) => void;
  pass: () => void;
  skipping: boolean;
  setSkipping: (b: boolean) => void;
  setStepByStep: (b: boolean) => void;
  status: string;
}

const Ctx = createContext<GameCtx | null>(null);

export function GameProvider({ children }: { children: ReactNode }) {
  const adapter = getAdapter();
  const { prefs, set } = usePrefs();
  const [view, setView] = useState<RoomView>(() => adapter.latest);
  const [prev, setPrev] = useState<RoomView | null>(null);
  const [refusal, setRefusal] = useState<Refusal | null>(null);
  const [pending, setPending] = useState(false);
  const [connection, setConnection] = useState<ConnectionState>('connected');
  const [away, setAway] = useState<Record<string, number>>({});
  const [callouts, setCallouts] = useState<Callout[]>([]);
  const [focusSeat, setFocusSeat] = useState<number>(Math.max(0, adapter.latest.seat));
  const [picked, setPicked] = useState<number | null>(null);
  const [lit, setLit] = useState<Set<number>>(new Set());
  const [zoomId, setZoomId] = useState<number | null>(null);
  const [skipping, setSkipping] = useState(false);
  const viewRef = useRef(view);
  viewRef.current = view;
  const overlayRef = useRef(prefs.overlay);
  overlayRef.current = prefs.panes.callouts ? prefs.overlay : 0;
  const epochRef = useRef(adapter.epoch);

  const pushCallout = useCallback((c: Callout) => {
    if (overlayRef.current <= 0) return;
    setCallouts((list) => [...list, c]);
    if (c.tone === 'harm' && c.kind === 'incoming') play('sword');
    else if (c.tone === 'answer') play('shield');
    else if (c.kind === 'life-gain') play('life');
    else if (c.kind === 'your-turn') play('turn');
    else if (c.kind === 'game-over') play('end');
  }, []);
  const dismissCallout = useCallback((id: string) => setCallouts((l) => l.filter((c) => c.id !== id)), []);

  useEffect(() => {
    const off = adapter.subscribe((m: InMessage) => {
      if (m.type === 'view') {
        const cur = viewRef.current;
        const reset = adapter.epoch !== epochRef.current;
        if (!reset && m.view.matchId === cur.matchId && m.view.revision < cur.revision) return; // stale view ignored
        epochRef.current = adapter.epoch;
        const p = reset ? null : cur;
        setPrev(p);
        setView(m.view);
        viewRef.current = m.view;
        setPending(false);
        if (reset) {
          setFocusSeat(Math.max(0, m.view.seat));
          setRefusal(null);
          setSkipping(false);
          setCallouts([]);
        }
        for (const c of detectCallouts(p, m.view)) pushCallout(c);
        if (p) {
          const hp = p.state.players.find((x) => x.playerId === p.seat)?.zones.Hand.count ?? 0;
          const hn = m.view.state.players.find((x) => x.playerId === m.view.seat)?.zones.Hand.count ?? 0;
          if (hn > hp) play('draw');
        }
      } else if (m.type === 'refused') {
        setRefusal({ status: m.status, error: m.error, at: Date.now() });
        setPending(false);
        setSkipping(false);
        if (m.of === 'prefer') set({ stepByStep: !!viewRef.current.stepByStep });
      } else if (m.type === 'receipt') {
        setRefusal(null);
      } else if (m.type === 'away') {
        setAway((a) => {
          const n = { ...a };
          if (m.until == null) delete n[m.seatId];
          else n[m.seatId] = m.until;
          return n;
        });
      }
    });
    const offS = adapter.onStatus(setConnection);
    return () => {
      off();
      offS();
    };
  }, [adapter, pushCallout, set]);

  const submit = useCallback(
    (payload: { indices?: number[]; amounts?: number[] }) => {
      const v = viewRef.current;
      const d = v.decision;
      if (!d) return;
      if (pendingRef.current) return;
      const selected = d.options.find((o) => o.index === payload.indices?.[0]);
      const me = v.state.players.find((p) => p.playerId === v.seat);
      if (prefsLand.current && selected?.act === 'pass' && v.state.phase === 'MAIN2' && v.state.stack.length === 0 && me?.landsPlayed === 0 && me.zones.Hand.cards.some((c) => c.types.includes('Land'))) {
        setSkipping(false);
        if (!window.confirm('You have not played a land this turn. Continue to the end step? Choose Cancel to stay and play a land from your hand.')) return;
      }
      pendingRef.current = true;
      setPending(true);
      adapter.send({
        type: 'act', actionId: newActionId(), revision: v.revision, kind: 'answer', choiceId: d.id,
        ...(payload.amounts ? { amounts: payload.amounts } : { indices: payload.indices ?? [] }),
        ...(isPriority(d) && prefsHold.current ? { hold: true } : {}),
      });
    },
    [adapter],
  );
  const prefsHold = useRef(prefs.holdPriority);
  prefsHold.current = prefs.holdPriority;
  const prefsLand = useRef(prefs.remindLand);
  prefsLand.current = prefs.remindLand;
  const pendingRef = useRef(pending);
  pendingRef.current = pending;

  const choose = useCallback((o: DecisionOption) => submit({ indices: [o.index] }), [submit]);
  const pass = useCallback(() => {
    const p = passOption(viewRef.current.decision);
    if (p) choose(p);
  }, [choose]);

  // Skip to end: a convenience the player turned on. Stops on stack, any question, end step.
  useEffect(() => {
    if (!skipping) return;
    const v = view;
    const d = v.decision;
    if (v.state.turnPlayerId !== v.seat) {
      setSkipping(false);
      return;
    }
    if (!d) return;
    const p = passOption(d);
    if (!isPriority(d) || !p || p.endsTurn || v.state.stack.length > 0 || v.state.phase === 'UPKEEP' || v.state.phase === 'UNTAP') {
      setSkipping(false);
      return;
    }
    const t = window.setTimeout(() => choose(p), 260);
    return () => clearTimeout(t);
  }, [skipping, view, choose]);

  const setStepByStep = useCallback(
    (b: boolean) => {
      set({ stepByStep: b });
      adapter.send({ type: 'prefer', stepByStep: b });
    },
    [adapter, set],
  );

  const lightCards = useCallback((ids: number[], ms = 2600) => {
    setLit(new Set(ids));
    window.setTimeout(() => setLit(new Set()), ms);
  }, []);

  const status = useMemo(() => {
    if (connection === 'reconnecting') return 'Reconnecting. The board is unchanged.';
    if (view.status === 'finished') return `Game over. ${view.result?.reason ?? ''}`;
    if (refusal) return `Refused: ${refusal.error}`;
    if (view.decision) return `Your decision: ${view.decision.title}`;
    return view.waitingOn ? `Waiting on seat ${Number(view.waitingOn.replace('s', '')) + 1}` : 'Waiting';
  }, [connection, view, refusal]);

  const value: GameCtx = {
    adapter, view, prev, refusal, pending, connection, away, callouts, pushCallout, dismissCallout, focusSeat, setFocusSeat,
    picked, setPicked, lit, lightCards, zoomId, setZoomId, choose, submit, pass, skipping, setSkipping, setStepByStep, status,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useGame(): GameCtx {
  const c = useContext(Ctx);
  if (!c) throw new Error('useGame outside GameProvider');
  return c;
}
