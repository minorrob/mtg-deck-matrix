/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* NO CREATURE THAT COULD BLOCK, NO QUESTION (Rob's one-person, three-AI table, Oct 21; game/room/room.mjs, `blocksNone`).
 *
 * The solo-vs-AI run: Declare blockers asked of the person with "No legal blockers." on it, and a No blocks to press -- for
 * most of the AI seats' attacks. The declaration is empty (CR 509.1a), so it is no choice; the room makes it, saying why.
 * Kept with the match, so a game launched before it is asked as it was.
 *
 *   1. With the key: Rob, with no creature, is never asked to declare blockers while Maya's Bears attack him; the history
 *      says he had none that could block, and the damage is dealt.
 *   2. Without it (a match launched before): he is asked, with nothing on offer, as before.
 *   3. With the key and a Bear of his own that could block: he is asked, as ever.
 *   4. Reopened from storage, the key is still on; replayed, the game is the same game.
 */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {memoryStorage} from "../game/engine/storage.mjs";
import {startRoom, openRoom, basicCards} from "../game/room/room.mjs";
import {replayMatch} from "../game/room/replay.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

const BEAR = {types: ["Creature"], power: 2, toughness: 2, manaCost: "{1}{G}", colors: ["G"]};
const SALVE = {types: ["Instant"], manaCost: "{G}", colors: ["G"], spell: {id: "s", text: "You gain 1 life.", targets: [], effects: [{effect: "gainLife", amount: 1}]}};
const GENERAL = {types: ["Creature"], power: 9, toughness: 9, manaCost: "{7}{G}{G}", colors: ["G"]};
const cards = (name) => (/^Bear /.test(name) ? BEAR : /^Salve /.test(name) ? SALVE : name.startsWith("General") ? GENERAL : basicCards(name));
/* A deck of Forests and `kinds` in turn: ["Bear"], or ["Salve"] for one with no creature but its general. */
const deck = (seat, kinds) => ({commander: [`General ${seat}`], cards: Array.from({length: 99}, (_, i) => (i % 2 ? "Forest" : `${kinds[(i / 2) % kinds.length]} ${seat}-${i}`))});
const person = (seatId, name, seat, kinds) => ({seatId, name, pilot: "human", ...deck(seat, kinds)});
/* The pod as the table launches it, with or without the key. */
const TABLE = {passEmpty: true, endWhenNoPerson: true, resolveAll: true, passAfterCast: true, endAsks: true, untapMana: true, pooledTaps: true, passStack: true, yieldTurn: true};
const pod = (robKinds, more = {}) => ({seats: [person("rob", "Rob", 0, robKinds), person("maya", "Maya", 1, ["Bear"])], ...TABLE, ...more});
const SEED = "blocks-none-1";

const ask = (room) => (room.waitingOn ? room.view(room.waitingOn) : null);
const act = (room, v, indices) => room.act(v.seatId, {actionId: randomUUID(), revision: v.revision, kind: "answer", choiceId: v.decision.id, indices: [indices].flat()});
const option = (v, test) => v.decision.options.find(test);
const untappedForests = (v) => v.state.players[v.seat].zones.Battlefield.cards.filter((c) => c.name === "Forest" && !c.tapped).length;
const blocking = (v) => v.decision.id.startsWith("declare-blockers:");
/* Each person keeps, plays a land, casts a Bear in their own main phase, and passes; Maya attacks with every Bear, Rob
   never does, and a blocker declares none. */
function answer(v) {
  const d = v.decision;
  if (d.kind === "priority") {
    const land = option(v, (o) => o.act === "play-land");
    if (land) return land.index;
    const own = v.state.turnPlayerId === v.seat && /^MAIN/.test(v.state.phase) && !v.state.stack.length;
    const bear = own && untappedForests(v) >= 2 && option(v, (o) => o.act === "cast" && /^Bear /.test(o.label));
    if (bear) return bear.index;
    return option(v, (o) => o.act === "pass").index;
  }
  if (d.id.startsWith("declare-attackers") && v.seatId === "maya") {
    const seen = new Set();
    return d.options.filter((o) => !seen.has(o.cardId) && seen.add(o.cardId)).map((o) => o.index);
  }
  return d.mode === "many" ? d.options.slice(0, d.min).map((o) => o.index) : 0;
}
/* Play on until turn `to`; what Rob is asked to block, and with how many blocks on offer. */
async function playTo(room, to, asked = []) {
  for (let n = 0; n < 20000; n += 1) {
    const v = ask(room);
    if (!v || v.state.turn >= to) return {v, asked};
    if (v.seatId === "rob" && blocking(v)) asked.push(v.decision.options.length);
    await act(room, v, answer(v));
  }
  throw new Error("the game did not reach the turn");
}
const said = (room) => room.view("rob").history.filter((l) => /has no creature that can block/.test(l.text)).map((l) => l.text);
const attacked = (room) => room.view("rob").history.filter((l) => /attack/i.test(l.text)).length;
const life = (room) => room.view("rob").state.players[0].health.life;

/* ---- 1. with the key, and 4. reopened and replayed ---- */
{
  const storage = memoryStorage();
  const first = await startRoom({storage, matchId: "none-on", cards, pod: pod(["Salve"], {blocksNone: true}), seed: SEED});
  const half = await playTo(first, 8);
  const room = await openRoom({storage, matchId: "none-on", cards});
  const {asked} = await playTo(room, 16, half.asked);
  ok(attacked(room) > 0 && life(room) < 40, `Maya's Bears attacked Rob, and he took the damage (${life(room)} life)`);
  eq(asked, [], "1. with the key, Rob, with no creature that could block, is never asked to declare blockers");
  ok(said(room).length > 0 && said(room).every((t) => t === "Rob has no creature that can block: no blockers"), `and the history says why (${said(room)[0]})`);
  ok(said(first).length > 0, "4. before the room was reopened from storage as after: the key came back with it");
  const replay = await replayMatch({storage, matchId: "none-on", cards});
  ok(replay.same, "and replayed from its seed and tape, it is the same game");
}
/* ---- 2. without it ---- */
{
  const room = await startRoom({storage: memoryStorage(), matchId: "none-off", cards, pod: pod(["Salve"]), seed: SEED});
  const {asked} = await playTo(room, 16);
  ok(asked.length > 0 && asked.every((n) => n === 0), `2. without it (a match launched before), he is asked, nothing on offer, as before (${asked.length} times)`);
  eq(said(room), [], "and the history says nothing of it");
}
/* ---- 3. with a block he could make ---- */
{
  const room = await startRoom({storage: memoryStorage(), matchId: "none-bear", cards, pod: pod(["Bear"], {blocksNone: true}), seed: SEED});
  const {asked} = await playTo(room, 16);
  ok(asked.some((n) => n > 0), `3. with a Bear of his that could block, he is asked, as ever (${asked.join(", ")} blocks on offer)`);
}
console.log(`room-blocks-none: ${checks} checks passed -- Declare blockers made for a person with no creature that could block, the history saying why; asked as before in a match launched before, and of one with a block to make; kept on reopening, the same game replayed.`);
