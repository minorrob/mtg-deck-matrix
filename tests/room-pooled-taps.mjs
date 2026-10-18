/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* FLOATING MANA AND THE SOURCES LEFT, TOGETHER, IN THE ROOM (`pooledTaps`; Rob's playtest, 2026-10-15). A table's new
 * matches top floating mana up from their caster's untapped sources (rules/actions.mjs); a match launched before offers
 * what it offered then. The room carries the key from the pod it is handed to the game and to the match it saves, so a
 * replay plays it the same way (game/room/room.mjs).
 *
 * Two people, Forests and Bears ({1}{G}). Rob's second turn, two Forests out: he taps one for {G}.
 *   1. With the key: the Bear is offered, the {G} in his pool and the other Forest tapped for the rest.
 *   2. Without it (a match launched before): the same tap, and no Bear -- the pool alone can't pay, and a cast that taps
 *      for itself starts from an empty pool, as it did.
 *   3. The saved pod says which, and nothing else changes: a pod without the key saves none.
 *   4. Replayed: a game with the key, the Bear cast on its tape, replays to the same game.
 */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {memoryStorage, createMatchStore} from "../game/engine/storage.mjs";
import {startRoom, basicCards} from "../game/room/room.mjs";
import {replayMatch} from "../game/room/replay.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

const BEAR = {types: ["Creature"], power: 2, toughness: 2, manaCost: "{1}{G}", colors: ["G"]};
const cards = (name) => (/^Bear /.test(name) ? BEAR : name.startsWith("General") ? {types: ["Creature"], power: 9, toughness: 9, manaCost: "{7}{G}{G}", colors: ["G"]} : basicCards(name));
const deck = (seat) => ({commander: [`General ${seat}`], cards: Array.from({length: 99}, (_, i) => (i % 2 ? "Forest" : `Bear ${seat}-${i}`))});
const pod = (more = {}) => ({seats: [{seatId: "rob", name: "Rob", pilot: "human", ...deck(0)}, {seatId: "maya", name: "Maya", pilot: "human", ...deck(1)}],
  passEmpty: true, endAsks: true, ...more});
const SEED = "pooled-seed-1";

const ask = (room) => (room.waitingOn ? room.view(room.waitingOn) : null);
const priority = (v) => v?.decision?.kind === "priority";
const forests = (v) => v.state.players[v.seat].zones.Battlefield.cards.filter((c) => c.name === "Forest");
const bears = (v) => v.decision.options.filter((o) => o.act === "cast" && /^Bear /.test(o.label));
const pool = (v) => Object.fromEntries((v.state.players[v.seat].mana || []).map((m) => [m.color, m.amount]));
const act = (room, v, indices) => room.act(v.seatId, {actionId: randomUUID(), revision: v.revision, kind: "answer", choiceId: v.decision.id, indices: [indices].flat()});
/* Keep, play a land when one may be played, and otherwise pass (never cast) -- until `stop` says this is the decision. */
async function until(room, stop) {
  for (let n = 0; n < 3000; n += 1) {
    const v = ask(room);
    if (!v) return null;
    if (stop(v)) return v;
    const d = v.decision;
    const pick = d.kind === "priority" ? (d.options.find((o) => o.act === "play-land") ?? d.options.find((o) => o.act === "pass")) : null;
    await act(room, v, pick ? pick.index : d.mode === "many" ? d.options.slice(0, d.min).map((o) => o.index) : 0);
  }
  throw new Error("the game did not reach the decision");
}
/* Rob's own main phase, his land played, two Forests of his untapped. */
const ready = (v) => v.seatId === "rob" && priority(v) && v.state.turnPlayerId === v.seat && v.state.phase === "MAIN1"
  && !v.decision.options.some((o) => o.act === "play-land") && forests(v).filter((c) => !c.tapped).length === 2;
/* Rob taps a Forest for {G}. */
async function tapOne(room) {
  const v = await until(room, ready);
  ok(v && bears(v).length > 0, `Rob's main phase, two Forests out and a Bear in hand: the Bear is offered (turn ${v?.state.turn})`);
  const forest = forests(v).find((c) => !c.tapped);
  await act(room, v, v.decision.options.find((o) => o.act === "activate-mana" && o.cardId === forest.cardId).index);
  return ask(room);
}

/* ---- 1. With the key ---- */
const storage = memoryStorage();
const room = await startRoom({storage, matchId: "pooled", cards, pod: pod({pooledTaps: true}), seed: SEED});
let v = await tapOne(room);
eq([v.seatId, pool(v), bears(v).length > 0], ["rob", {G: 1}, true], "with the key: the {G} floating, the Bear still offered -- the {G} and the other Forest pay it");
await act(room, v, bears(v)[0].index);
v = ask(room);
const stack = (view) => view.state.stack.map((e) => e.name);
eq([forests(v).every((c) => c.tapped), pool(v), stack(v).length], [true, {}, 1], "cast: both Forests tapped, the pool spent, the Bear on the stack");

/* ---- 2. Without it ---- */
{
  const before = await startRoom({storage: memoryStorage(), matchId: "pooled-before", cards, pod: pod(), seed: SEED});
  const there = await tapOne(before);
  eq([there?.seatId, pool(there), there ? bears(there).length : null], ["rob", {G: 1}, 0],
    "a match launched before: the same tap, and the Bear is not offered -- the {G} alone can't pay it, and a cast that taps for itself starts from an empty pool");
}

/* ---- 3. The saved pod ---- */
eq((await createMatchStore(storage, "pooled").loadMatch()).pod.pooledTaps, true, "the match the room saved keeps the key");
{
  const store = memoryStorage();
  await startRoom({storage: store, matchId: "pooled-none", cards, pod: pod(), seed: SEED});
  eq(Object.hasOwn((await createMatchStore(store, "pooled-none").loadMatch()).pod, "pooledTaps"), false, "and a pod without it saves none");
}

/* ---- 4. Replayed ---- */
const proof = await replayMatch({storage, matchId: "pooled", cards});
ok(proof.same, `the game with the key, the Bear cast from floating mana on its tape, replays to the same game (${proof.tape} tape entries)`);

console.log(`room-pooled-taps: ${checks} checks passed — a new match tops floating mana up from its caster's untapped sources; a match launched before offers what it offered; the saved match keeps which, and replays the same.`);
