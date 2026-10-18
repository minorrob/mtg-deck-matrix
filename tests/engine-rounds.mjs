/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE ROUND AND THE TURN WITHIN IT (Linear ROB-76; rules/turn.mjs, nextRound; projection.mjs).
 *
 * The table labelled the turn by dividing the game's turn count by the seats it began with, which is wrong after an
 * extra turn or once a player has left. The engine now keeps the round, counted from its turns as they are taken:
 *   1. Two, three and four seats, and a starting player other than seat 0: a round is every player's turn once, from the
 *      starting player's; `turnInRound` counts the turns in it from 1.
 *   2. An extra turn (CR 500.7) is in the round of the turn it follows and begins none -- the starting player's own, and
 *      one given to the starting player after the last seat's turn, too.
 *   3. A player who leaves the game (CR 800.4) takes their turns out of the round: another player, the starting player
 *      (the next one still in the game begins the rounds), and a player who leaves during their own turn.
 *   4. The view: `round`, `turnInRound`, `turnId` and `extraTurn`, the same to every seat; the turn's event says its round,
 *      and so does the table's `turn` event (events.v1).
 *   5. A game saved and resumed goes on with the same labels; one saved before rounds were kept has none (null), and is
 *      not given one partway; a game not begun has no turn id.
 *   6. At the room: each view's labels, and a replay of the tape gives the same ones.
 *
 * A turn skipped by an effect (CR 500.11) would be one never taken, and so never counted; no card the engine knows skips a
 * turn yet, so there is nothing of it to play here.
 */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {addTurn} from "../game/engine/script/effects/turns.mjs";
import {beginGame, advance, awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {tableEvent} from "../game/room/events.mjs";
import {memoryStorage, createMatchStore} from "../game/engine/storage.mjs";
import {startRoom, basicCards} from "../game/room/room.mjs";
import {replayTape} from "../game/room/replay.mjs";

let checks = 0;
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const ok = (c, m) => {assert.ok(c, m); checks += 1;};

const NAMES = ["Rob", "Maya", "Trey", "Sam"];
/* A table to play turns on: twenty cards in each library, so nobody draws from an empty one. */
const stocked = (seats) => {
  const s = createState({matchId: "rounds", seed: "rounds", players: NAMES.slice(0, seats).map((name) => ({name}))});
  for (let seat = 0; seat < seats; seat += 1)
    for (let n = 0; n < 20; n += 1) addObject(s, {card: "Wastes", types: ["Land"], owner: seat, controller: seat}, "library", seat);
  return s;
};
/* The rules loop with nobody doing anything: pass, advance, no attackers, no blockers. */
const pilotless = (s, rng) => {
  if (s.awaiting) { const choice = awaitingChoice(s); resolveAwaiting(s, choice.min ? choice.options.slice(0, choice.min).map((o) => o.index) : [], null, rng); return; }
  if (s.priorityPlayer === null) { advance(s); return; }
  if (passPriority(s, null, rng).outcome === "step-ends") advance(s);
};
/* Each turn as the view labels it: [turn, whose, round, turnInRound, extra]. The first, as the game begins. */
const label = (s) => {const v = projectFor(s, 0); return [v.turn, NAMES[v.turnPlayerId], v.round, v.turnInRound, v.extraTurn];};
const turns = (s, n, rng = createRng("rounds"), log = []) => {
  for (let guard = 0; guard < 20000 && log.length < n; guard += 1) {
    const before = s.turn;
    pilotless(s, rng);
    if (s.turn !== before) log.push(label(s));
  }
  assert.equal(log.length, n, `${n} turns were played`);
  return log;
};
const begun = (seats, first = 0) => {const s = stocked(seats); beginGame(s, first); return s;};

/* ---- 1. A round is every player's turn once, from the starting player's ---- */
{
  const s = begun(2);
  eq(label(s), [1, "Rob", 1, 1, false], "1. the game begins in round 1, its first turn");
  eq(turns(s, 5), [[2, "Maya", 1, 2, false], [3, "Rob", 2, 1, false], [4, "Maya", 2, 2, false], [5, "Rob", 3, 1, false], [6, "Maya", 3, 2, false]],
    "two seats: each round is Rob's turn and Maya's");
}
{
  const s = begun(4);
  eq(turns(s, 8).map((t) => t.slice(1, 4)), [["Maya", 1, 2], ["Trey", 1, 3], ["Sam", 1, 4], ["Rob", 2, 1], ["Maya", 2, 2], ["Trey", 2, 3], ["Sam", 2, 4], ["Rob", 3, 1]],
    "four seats: four turns a round, and a new one at Rob's");
}
{
  const s = begun(3, 2);
  eq(label(s), [1, "Trey", 1, 1, false], "a starting player other than seat 0: Trey begins round 1");
  eq(turns(s, 4).map((t) => t.slice(1, 4)), [["Rob", 1, 2], ["Maya", 1, 3], ["Trey", 2, 1], ["Rob", 2, 2]],
    "and round 2 begins at Trey's turn again, not at seat 0's");
}

/* ---- 2. An extra turn is in the round of the turn it follows ---- */
{
  const s = begun(4);
  addTurn(s, {who: [1]}, {controller: 0});
  eq(turns(s, 5), [[2, "Maya", 1, 2, true], [3, "Maya", 1, 3, false], [4, "Trey", 1, 4, false], [5, "Sam", 1, 5, false], [6, "Rob", 2, 1, false]],
    "2. Maya's extra turn after Rob's is round 1's second turn, her own its third, and round 2 begins at Rob's: five turns in round 1");
}
{
  const s = begun(3);
  addTurn(s, {who: "you"}, {controller: 0});
  eq(turns(s, 3), [[2, "Rob", 1, 2, true], [3, "Maya", 1, 3, false], [4, "Trey", 1, 4, false]], "the starting player's own extra turn begins no round");
  eq(turns(s, 1), [[5, "Rob", 2, 1, false]], "his next turn in the order does");
}
{
  const s = begun(3);
  turns(s, 2);
  addTurn(s, {who: [0]}, {controller: 2});
  eq(turns(s, 2), [[4, "Rob", 1, 4, true], [5, "Rob", 2, 1, false]],
    "one given to the starting player on the last seat's turn is still round 1's; his turn after it begins round 2");
}
{
  const s = begun(3);
  addTurn(s, {who: [2]}, {controller: 0});
  addTurn(s, {who: [1]}, {controller: 0});
  eq(turns(s, 4).map((t) => t.slice(1)), [["Maya", 1, 2, true], ["Trey", 1, 3, true], ["Maya", 1, 4, false], ["Trey", 1, 5, false]],
    "two extra turns in a row, the most recently made first (CR 500.7), both in round 1");
}

/* ---- 3. A player who leaves the game takes their turns out of the round ---- */
{
  const s = begun(4);
  s.players[2].lost = true;
  eq(turns(s, 4).map((t) => t.slice(1, 4)), [["Maya", 1, 2], ["Sam", 1, 3], ["Rob", 2, 1], ["Maya", 2, 2]], "3. Trey gone: three turns a round");
}
{
  const s = begun(4);
  turns(s, 1);
  s.players[0].lost = true;
  eq(turns(s, 4).map((t) => t.slice(1, 4)), [["Trey", 1, 3], ["Sam", 1, 4], ["Maya", 2, 1], ["Trey", 2, 2]],
    "the starting player gone during Maya's turn: round 2 begins at Maya's, the first after his seat still in the game");
}
{
  const s = begun(4);
  turns(s, 1);
  s.players[1].lost = true;
  eq(turns(s, 3).map((t) => t.slice(1, 4)), [["Trey", 1, 3], ["Sam", 1, 4], ["Rob", 2, 1]], "Maya gone during her own turn: it goes on to Trey's, round 1's third");
}
{
  const s = begun(3);
  turns(s, 3);
  eq(label(s).slice(1, 4), ["Rob", 2, 1], "round 2 has begun at Rob's turn");
  s.players[0].lost = true;
  eq(turns(s, 3).map((t) => t.slice(1, 4)), [["Maya", 2, 2], ["Trey", 2, 3], ["Maya", 3, 1]],
    "and Rob gone during it: Maya's and Trey's turns finish round 2, and round 3 begins at Maya's");
}
{
  const s = begun(4);
  addTurn(s, {who: [2]}, {controller: 0});
  s.players[2].lost = true;
  eq(turns(s, 3).map((t) => t.slice(1)), [["Maya", 1, 2, false], ["Sam", 1, 3, false], ["Rob", 2, 1, false]],
    "an extra turn of a player who has left is not taken (CR 800.4a), so not counted");
}

/* ---- 4. The view and the events ---- */
{
  const s = begun(3);
  addTurn(s, {who: [1]}, {controller: 0});
  turns(s, 1);
  const views = [0, 1, 2, null].map((seat) => projectFor(s, seat));
  eq(views.map((v) => [v.round, v.turnInRound, v.turnId, v.extraTurn, v.turnPlayerId]), Array(4).fill([1, 2, "turn:2", true, 1]),
    "4. round, turnInRound, turnId and extraTurn are public: every seat and a spectator see the same");
  /* A turn begins as `advance` arrives at its untap step, and the first as the game begins. */
  const start = stocked(2), rng = createRng("rounds");
  const events = beginGame(start, 0);
  for (let i = 0; i < 4000 && start.turn < 3; i += 1) {
    if (start.awaiting) pilotless(start, rng);
    else if (start.priorityPlayer === null) events.push(...advance(start));
    else if (passPriority(start, null, rng).outcome === "step-ends") events.push(...advance(start));
  }
  const begins = events.filter((e) => e.kind === "GameEventTurnPhase" && e.data.fields.phase === "UNTAP");
  eq(begins.map((e) => [e.data.turn, e.data.fields.round, e.data.fields.turnInRound]), [[1, 1, 1], [2, 1, 2], [3, 2, 1]], "each turn's beginning says its round");
  eq(begins.map((e, i) => {const t = tableEvent(e, `event:${i}`); return [t.kind, t.player, t.round, t.turnInRound];}), [["turn", 0, 1, 1], ["turn", 1, 1, 2], ["turn", 0, 2, 1]],
    "and so does the table's turn event (events.v1)");
}

/* ---- 5. Saved and resumed; saved before rounds were kept; not begun ---- */
{
  const s = begun(3);
  addTurn(s, {who: [2]}, {controller: 0});
  turns(s, 1);
  const saved = JSON.parse(JSON.stringify(s));
  eq(turns(saved, 5, createRng("again")), turns(s, 5, createRng("again")), "5. a game saved during an extra turn resumes with the same labels");
}
{
  const s = begun(3);
  turns(s, 2);
  delete s.round;
  delete s.turnInRound;
  eq(label(s), [3, "Trey", null, null, false], "a game saved before rounds were kept has none in its view");
  eq(turns(s, 2), [[4, "Rob", null, null, false], [5, "Maya", null, null, false]], "and is not given one partway, which would be a guess");
  eq([Object.hasOwn(s, "round"), Object.hasOwn(s, "turnInRound")], [false, false], "nor does its state gain one");
  ok(projectFor(s, 0).turnId === "turn:5", "its turn id is still the turn's");
}
{
  const s = stocked(2);
  const v = projectFor(s, 0);
  eq([v.turn, v.turnId, v.round, v.turnInRound], [0, null, null, null], "a game not begun has no turn, round or turn id");
}

/* ---- 6. At the room, and replayed ---- */
{
  const deck = () => ({commander: ["General"], cards: Array.from({length: 99}, () => "Forest")});
  const cards = (name) => (name === "General" ? {types: ["Creature"], power: 9, toughness: 9, manaCost: "{9}", colors: []} : basicCards(name));
  const pod = {seats: [{seatId: "rob", name: "Rob", pilot: "human", ...deck()}, {seatId: "maya", name: "Maya", pilot: "human", ...deck()}, {seatId: "trey", name: "Trey", pilot: "human", ...deck()}],
    passEmpty: true, endWhenNoPerson: true};
  const storage = memoryStorage();
  const room = await startRoom({storage, matchId: "rounds", cards, pod, seed: "rounds-1"});
  const seen = new Map();
  const hear = () => {
    const vs = ["rob", "maya", "trey"].map((id) => room.view(id).state);
    assert.ok(vs.every((v) => v.round === vs[0].round && v.turnInRound === vs[0].turnInRound), "every seat sees the same round");
    seen.set(vs[0].turn, [vs[0].turnPlayerId, vs[0].round, vs[0].turnInRound]);
  };
  hear();
  for (let i = 0; i < 2000 && room.view("rob").state.turn < 7; i += 1) {
    const waiting = room.waitingOn;
    if (!waiting) break;
    const v = room.view(waiting), d = v.decision;
    const pass = d.options.find((o) => o.act === "pass" || o.act === "play-land") || d.options[0];
    const indices = d.mode === "many" ? d.options.slice(0, d.min).map((o) => o.index) : [pass.index];
    await room.act(waiting, {actionId: randomUUID(), revision: v.revision, kind: "answer", choiceId: d.id, indices});
    hear();
  }
  const labels = [...seen.entries()].filter(([turn]) => turn > 0 && turn <= 7).sort((a, b) => a[0] - b[0]);
  const first = labels[0][1][0];
  eq(labels.map(([turn, [, round, inRound]]) => [turn, round, inRound]), [[1, 1, 1], [2, 1, 2], [3, 1, 3], [4, 2, 1], [5, 2, 2], [6, 2, 3], [7, 3, 1]],
    `6. at the room, three people: three turns a round, from the first player's (seat ${first})`);
  const meta = await createMatchStore(storage, "rounds").loadMatch();
  const replayed = await replayTape({matchId: "rounds", pod: meta.pod, seed: meta.seed, tape: await createMatchStore(storage, "rounds").readTape(), cards});
  const at = (r) => {const v = r.view("rob").state; return [v.turn, v.turnPlayerId, v.round, v.turnInRound, v.turnId, v.extraTurn];};
  eq(at(replayed), at(room), "replayed, the room ends on the same turn with the same labels");
}

console.log(`engine-rounds: ${checks} checks passed — the round and the turn within it, from the turns as taken: an extra turn in the round it follows, a player who leaves taking their turns out of it, the same to every seat, and the same replayed.`);
