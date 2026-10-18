/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* DRAW CARD, ACKNOWLEDGED ONCE (Linear ROB-73, the Oct 15 playtest's P05; game/room/room.mjs and rules/turn.mjs, `drawBeat`).
 * room-beats proves the beat itself: the draw held for the active person's Draw a card, the two-player first draw skipped,
 * an AI seat drawing for itself, a game without it drawing at once, and replay. These are the rest of ROB-73's list:
 *
 *   1. The decision: `draw:<turn>`, kind "draw", one option; the hand unchanged until it is answered, one card after.
 *      The other seat sees the count grow and never the card.
 *   2. A double submission: the same answer sent again is its receipt, and draws nothing more; another answer to the
 *      question already answered is refused as stale.
 *   3. Reopened while the draw is pending (a Durable Object evicted and woken, a reconnect): the same question, and one draw.
 *   4. The first player's first turn: no draw in a two-player game, unless the host turns the rule off; and in a game of
 *      three, a draw (CR 103.8a is a two-player rule).
 *   5. An empty library: Draw a card is still asked (a turn-based action, CR 504.1), and drawing from it loses the game
 *      (CR 704.5b).
 * A replaced draw (dredge, CR 702.52a) asks its own question in place of the beat's (engine-wave4c-k2). No card the engine
 * plays skips a draw step yet, so a skipped one has nothing to show.
 */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {memoryStorage} from "../game/engine/storage.mjs";
import {startRoom, openRoom, basicCards} from "../game/room/room.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

const BEAR = {types: ["Creature"], power: 2, toughness: 2, manaCost: "{1}{G}", colors: ["G"]};
const GENERAL = {types: ["Creature"], power: 9, toughness: 9, manaCost: "{7}{G}{G}", colors: ["G"]};
const cards = (name) => (/^Bear /.test(name) ? BEAR : name.startsWith("General") ? GENERAL : basicCards(name));
const deck = (seat, n = 99) => ({commander: [`General ${seat}`], cards: Array.from({length: n}, (_, i) => (i % 2 ? "Forest" : `Bear ${seat}-${i}`))});
const person = (seatId, name, seat, n) => ({seatId, name, pilot: "human", ...deck(seat, n)});
const TABLE = {passEmpty: true, endWhenNoPerson: true, resolveAll: true, passAfterCast: true, endAsks: true, untapMana: true, pooledTaps: true, yieldTurn: true, drawBeat: true};
const pod = (seats, more = {}) => ({seats, ...TABLE, ...more});
const SEED = "draw-card-1";

const ask = (room) => (room.waitingOn ? room.view(room.waitingOn) : null);
const isDraw = (v) => v?.decision?.kind === "draw";
const hand = (v, seat = v.seat) => v.state.players[seat].zones.Hand;
const library = (v, seat = v.seat) => v.state.players[seat].zones.Library.count;
const envelope = (v, indices) => ({actionId: randomUUID(), revision: v.revision, kind: "answer", choiceId: v.decision.id, indices: [indices].flat()});
const act = (room, v, indices) => room.act(v.seatId, envelope(v, indices));
/* Keep, play a land, otherwise pass -- and Draw a card when asked -- until `stop` says this is the decision. */
async function until(room, stop) {
  for (let n = 0; n < 5000; n += 1) {
    const v = ask(room);
    if (!v || stop(v)) return v;
    const d = v.decision;
    const pick = d.kind === "priority" ? (d.options.find((o) => o.act === "play-land") ?? d.options.find((o) => o.act === "pass")) : null;
    await act(room, v, pick ? pick.index : d.mode === "many" ? d.options.slice(0, d.min).map((o) => o.index) : 0);
  }
  throw new Error("the game did not reach the decision");
}
const two = () => [person("rob", "Rob", 0), person("maya", "Maya", 1)];

/* ---- 1, 2, 3: a two-player game, the second player's first draw ---- */
const storage = memoryStorage();
let room = await startRoom({storage, matchId: "draw", cards, pod: pod(two()), seed: SEED});
let v = await until(room, isDraw);
const drawer = v.seatId, other = drawer === "rob" ? "maya" : "rob", turn = v.state.turn;
eq([v.decision.id, v.decision.kind, v.decision.options.map((o) => o.label), v.state.phase], [`draw:${turn}`, "draw", ["Draw a card"], "DRAW"],
  "1. the draw step's draw is a decision of its own: draw:<turn>, kind draw, its one option Draw a card");
ok(turn === 2, `and it is the second player's, on turn 2: the first player's first draw is skipped (turn ${turn})`);
const before = {hand: hand(v).count, library: library(v), theirs: hand(room.view(other), v.seat).count};
/* ---- 3: reopened while the draw waits ---- */
room = await openRoom({storage, matchId: "draw", cards});
v = ask(room);
eq([v.seatId, v.decision.id, hand(v).count], [drawer, `draw:${turn}`, before.hand], "3. reopened while it waits: the same question, the hand unchanged");
const answer = envelope(v, 0);
const first = await room.act(drawer, answer);
const after = room.view(drawer);
eq([first.changed, hand(after).count, library(after)], [true, before.hand + 1, before.library - 1], "answered: one card drawn, from the library to the hand");
const seen = room.view(other);
eq(hand(seen, after.seat).count, before.theirs + 1, "the other seat sees the hand count grow by one");
eq([hand(seen, after.seat).cards.length, hand(seen, after.seat).hiddenCount], [0, before.theirs + 1], "and never the card: another's hand is a count, every card of it hidden");
/* ---- 2: sent again ---- */
const again = await room.act(drawer, answer);
eq([again.changed, again.receipt, hand(room.view(drawer)).count], [false, first.receipt, before.hand + 1], "2. the same answer sent again is its receipt: nothing more is drawn");
await assert.rejects(room.act(drawer, {...answer, actionId: randomUUID()}), (e) => e.status === 409, "another answer to the question already answered is refused as stale");
checks += 1;
eq(hand(room.view(drawer)).count, before.hand + 1, "and still one card");
/* And once the table waits on someone else -- a client retrying late, after a dropped connection -- the room answers from
   the receipt it kept, rather than refusing a decision no longer theirs. */
await until(room, (x) => x.seatId === other);
const held = hand(room.view(drawer)).count, late = await room.act(drawer, answer);
eq([late.changed, late.receipt, hand(room.view(drawer)).count], [false, first.receipt, held], "sent again later, with the table waiting on the other seat: the same receipt, and nothing drawn");

/* ---- 4: the first player's first turn ---- */
{
  const off = await startRoom({storage: memoryStorage(), matchId: "draw-off", cards, pod: pod(two(), {skipFirstDraw: false}), seed: SEED});
  const d = await until(off, isDraw);
  eq([d.state.turn, d.state.turnPlayerId === d.seat], [1, true], "4. with the host's skip-the-first-draw rule off, the first player is asked Draw a card on turn 1");
  const three = await startRoom({storage: memoryStorage(), matchId: "draw-three", cards, pod: pod([...two(), person("ann", "Ann", 2)]), seed: SEED});
  const t = await until(three, isDraw);
  eq([t.state.turn, t.state.turnPlayerId === t.seat], [1, true], "in a game of three the first player draws on turn 1 (CR 103.8a is a two-player rule)");
}

/* ---- 5: an empty library ---- */
{
  const empty = await startRoom({storage: memoryStorage(), matchId: "draw-empty", cards, seed: SEED,
    pod: pod([person("rob", "Rob", 0, 7), person("maya", "Maya", 1, 7)])});
  const d = await until(empty, isDraw);
  eq([library(d), d.decision.kind], [0, "draw"], "5. an empty library: Draw a card is still asked, a turn-based action (CR 504.1)");
  await act(empty, d, 0);
  const end = empty.view(d.seatId);
  eq([end.status, end.result?.winner === d.seatId], ["finished", false], `and drawing from it loses the game (CR 704.5b): ${end.result?.reason}`);
}

console.log(`room-draw-card: ${checks} checks passed — the draw step's draw asked once as Draw a card, its card the drawer's alone; sent twice it draws once, reopened it waits, the first player's first draw as the rules and the host say, and an empty library drawn from loses.`);
