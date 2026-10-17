// Synthetic scenario builders. Each starts from a recorded view and reshapes it so a
// fixture the sample lacks (250 permanents, two seats, deep stack, damage/amount/ack
// modes, spectator projection, ended-for-everyone) can be rendered. All flagged __synthetic.
import { cloneView, FIXTURES } from './fixtures';
import type { CardView, RoomView } from './types';

let rev = 20000;
function tag(v: RoomView, label: string): RoomView {
  v.__synthetic = label;
  v.revision = ++rev;
  return v;
}

const NAMES = ['Goblin', 'Soldier', 'Spirit', 'Thopter', 'Saproling', 'Clue', 'Treasure', 'Zombie'];

export function bigBoard(): RoomView {
  const v = cloneView(FIXTURES[35]);
  let id = 30000;
  const per = [70, 60, 60, 60];
  v.state.players.forEach((p, i) => {
    const bf = p.zones.Battlefield;
    while (bf.cards.length < per[i]) {
      const n = NAMES[(bf.cards.length + i) % NAMES.length];
      const isArt = n === 'Clue' || n === 'Treasure';
      const c: CardView = {
        cardId: id++, name: n, faceDown: false, owner: p.playerId, controller: p.playerId, tapped: bf.cards.length % 5 === 0,
        damage: 0, counters: bf.cards.length % 7 === 0 ? { '+1/+1': (bf.cards.length % 4) + 1 } : {},
        types: isArt ? ['Artifact'] : ['Creature'], power: isArt ? null : 1, toughness: isArt ? null : 1, keywords: [], commander: false,
      };
      bf.cards.push(c);
    }
    bf.count = bf.cards.length;
  });
  return tag(v, 'Synthetic · 250 permanents (recorded rev 661 padded with token-like cards)');
}

export function twoSeat(): RoomView {
  const v = cloneView(FIXTURES[7]);
  v.seats = v.seats.filter((s) => s.seatId === 's0' || s.seatId === 's2');
  v.state.players = v.state.players.filter((p) => p.playerId === 0 || p.playerId === 2);
  return tag(v, 'Synthetic · two-seat projection of recorded rev 91');
}

export function threeSeat(): RoomView {
  const v = cloneView(FIXTURES[13]);
  v.seats = v.seats.filter((s) => s.seatId !== 's3');
  v.state.players = v.state.players.filter((p) => p.playerId !== 3);
  return tag(v, 'Synthetic · three-seat projection of recorded rev 211');
}

export function deepStack(): RoomView {
  const v = cloneView(FIXTURES[25]);
  const base = v.state.stack[0];
  const trig = Array.from({ length: 250 }, (_, i) => ({
    stackId: 5000 + i, abilityId: 1, cardId: 700, name: 'Intruder Alarm', faceDown: false, playerId: 0, kind: 'trigger', stage: 'waiting', targets: [],
  }));
  v.state.stack = [...(base ? [base] : []), ...trig];
  v.state.stackSize = v.state.stack.length;
  v.decision = {
    id: 'priority:synthetic:deep', title: 'Your priority', mode: 'one', min: 1, max: 1, kind: 'priority',
    options: [
      { index: 0, label: 'Pass priority', act: 'pass' },
      { index: 1, label: 'Resolve all Intruder Alarm triggers', act: 'resolve-all', count: 250 },
    ],
  };
  return tag(v, 'Synthetic · 251-deep stack with resolve-all');
}

export function damageMode(): RoomView {
  const v = cloneView(FIXTURES[8]);
  v.decision = {
    id: 'assign-damage:synthetic', title: 'Assign 7 damage', mode: 'damage', min: 0, max: 7, total: 7, minEach: 0,
    options: [
      { index: 0, label: 'Walking Bulwark', cardId: 493, lethal: 3 },
      { index: 1, label: 'Bofur, Reliable Guardian', cardId: 481, lethal: 2 },
      { index: 2, label: 'AI 2 (trample)', defender: true, defenderId: 2 },
    ],
  };
  return tag(v, 'Synthetic · damage mode (shape from anchor, sample has none)');
}

export function amountMode(): RoomView {
  const v = cloneView(FIXTURES[13]);
  const mine = v.state.players[0].zones.Battlefield.cards.filter((c) => c.types.includes('Creature') || c.types.includes('Artifact')).slice(0, 4);
  v.decision = {
    id: 'amount:synthetic', title: 'Distribute four +1/+1 counters', mode: 'amount', min: 0, max: 4, total: 4, minEach: 0, divide: true,
    options: mine.map((c, index) => ({ index, label: c.name ?? 'Permanent', cardId: c.cardId })),
  };
  return tag(v, 'Synthetic · amount mode');
}

export function ackMode(): RoomView {
  const v = cloneView(FIXTURES[22]);
  v.decision = { id: 'ack:synthetic', title: 'AI 3 revealed Sol Ring from the top of their library', mode: 'ack', min: 0, max: 0, options: [] };
  return tag(v, 'Synthetic · ack mode');
}

export function indexMode(): RoomView {
  const v = cloneView(FIXTURES[22]);
  v.decision = {
    id: 'index:synthetic', title: 'Choose a color', mode: 'index', min: 1, max: 1,
    options: ['White', 'Blue', 'Black', 'Red', 'Green'].map((label, index) => ({ index, label })),
  };
  return tag(v, 'Synthetic · index mode');
}

export function constrainedMany(): RoomView {
  const v = cloneView(FIXTURES[32]);
  if (v.decision) {
    v.decision.capped = { by: 'cardId', most: 1, why: 'Each permanent can pay only once.' };
    v.decision.budget = 2;
  }
  return tag(v, 'Synthetic · many with capped/budget constraint fields');
}

export function endedForEveryone(from: RoomView, by: string): RoomView {
  const v = structuredClone(from);
  v.status = 'finished';
  v.state.gameOver = true;
  v.decision = null;
  v.waitingOn = null;
  v.result = { winner: null, reason: 'a person ended it for everyone', endedBy: by };
  v.history = [{ turn: v.state.turn, text: 'Rob ended the game for everyone · the record is kept', mark: 'end' }, ...v.history];
  return tag(v, v.__synthetic ?? 'Synthetic · table action (end for everyone)');
}

export function conceded(from: RoomView): RoomView {
  const v = structuredClone(from);
  const me = v.state.players.find((p) => p.playerId === v.seat);
  if (me) {
    me.health.status = 'lost';
    me.health.lossReason = 'conceded';
  }
  v.status = 'finished';
  v.state.gameOver = true;
  v.decision = null;
  v.waitingOn = null;
  v.result = { winner: null, reason: 'every person had left the game, so it ended there', endedBy: null };
  v.history = [{ turn: v.state.turn, text: 'Rob conceded', mark: 'end' }, ...v.history];
  return tag(v, v.__synthetic ?? 'Synthetic · table action (concede)');
}

/** Spectator projection: no hands, no pile contents — counts only. Never acts. */
export function spectatorProjection(from: RoomView): RoomView {
  const v = structuredClone(from);
  v.__spectator = true;
  v.seatId = 'spectator';
  v.seat = -1;
  v.decision = null;
  v.yourTurn = undefined;
  for (const p of v.state.players) {
    for (const z of ['Hand', 'Library', 'Graveyard', 'Exile'] as const) {
      const zone = p.zones[z];
      zone.hiddenCount = zone.count;
      zone.cards = [];
    }
    for (const c of p.zones.Battlefield.cards) if (c.faceDown) c.faceDownName = null;
  }
  v.history = v.history.map((h) => ({ ...h }));
  return tag(v, 'Spectator projection (synthetic: counts only)');
}
