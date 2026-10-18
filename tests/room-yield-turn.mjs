/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE STACK PASSED FOR A PERSON WITH NO RESPONSE, AND YIELD TURN (Linear ROB-13, the Oct 16 handoff; game/room/room.mjs,
 * `passStack` and `yieldTurn`). Both are kept with the match, so a game launched before them is asked as it was.
 *
 *   1. passStack: Maya casts a Bear. Rob, with nothing he could cast in response, is not asked over it; without the key
 *      he is, as before; with an instant he could pay, he is. Maya casting holding priority is asked over her own Bear.
 *   2. Yield turn: Rob, asked in Maya's turn, yields it. No priority of his is asked for the rest of that turn, whatever he
 *      holds; Declare blockers still is, and the yield holds on after his answer. His own turn asks him as before, and so
 *      does Maya's next. Only his own view says so.
 *   3. Stop yielding: asked again, in the same turn.
 *   4. Refused: in his own turn, by an AI seat, and in a game launched before Yield turn.
 *   5. It ends with the turn: an extra turn of Maya's is a new one, and he is asked in it.
 *   6. And when the turn's player leaves the game: asked for what is left of it.
 *   7. Reopened from storage, the yield is still on; replayed, a game with yields on its tape is the same game.
 */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {memoryStorage, createMatchStore} from "../game/engine/storage.mjs";
import {startRoom, openRoom, basicCards} from "../game/room/room.mjs";
import {replayMatch} from "../game/room/replay.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

const BEAR = {types: ["Creature"], power: 2, toughness: 2, manaCost: "{1}{G}", colors: ["G"]};
const SALVE = {types: ["Instant"], manaCost: "{G}", colors: ["G"], spell: {id: "s", text: "You gain 1 life.", targets: [], effects: [{effect: "gainLife", amount: 1}]}};
const TIMEWALK = {types: ["Sorcery"], manaCost: "{G}", colors: ["G"], spell: {id: "s", text: "Take an extra turn after this one.", targets: [], effects: [{effect: "addTurn"}]}};
const GENERAL = {types: ["Creature"], power: 9, toughness: 9, manaCost: "{7}{G}{G}", colors: ["G"]};
const cards = (name) => (/^Bear /.test(name) ? BEAR : /^Salve /.test(name) ? SALVE : /^Timewalk /.test(name) ? TIMEWALK : name.startsWith("General") ? GENERAL : basicCards(name));
/* A deck of Forests and `kinds` in turn: ["Bear"], ["Bear", "Salve"], ["Timewalk"]. */
const deck = (seat, kinds) => ({commander: [`General ${seat}`], cards: Array.from({length: 99}, (_, i) => (i % 2 ? "Forest" : `${kinds[(i / 2) % kinds.length]} ${seat}-${i}`))});
const person = (seatId, name, seat, kinds) => ({seatId, name, pilot: "human", ...deck(seat, kinds)});
/* The pod as the table launches it, and the two keys (`more`). */
const TABLE = {passEmpty: true, endWhenNoPerson: true, resolveAll: true, passAfterCast: true, endAsks: true, untapMana: true, pooledTaps: true};
const pod = (seats, more = {}) => ({seats, ...TABLE, ...more});
const BOTH = {passStack: true, yieldTurn: true};
const SEED = "yield-seed-1";

const ask = (room) => (room.waitingOn ? room.view(room.waitingOn) : null);
const isPriority = (v) => v?.decision?.kind === "priority";
const mine = (v, zone) => v.state.players[v.seat].zones[zone].cards;
const untappedForests = (v) => mine(v, "Battlefield").filter((c) => c.name === "Forest" && !c.tapped).length;
const herTurn = (v, seatOf) => v.state.turnPlayerId === seatOf;
const act = (room, v, indices, more = {}) => room.act(v.seatId, {actionId: randomUUID(), revision: v.revision, kind: "answer", choiceId: v.decision.id, indices: [indices].flat(), ...more});
const option = (v, test) => v.decision.options.find(test);
/* How each person plays when nothing else is asked of them: keep, play a land, cast a Bear (or a Timewalk) in their own
   main phase while a Forest would be left untapped, attack with everything if `attacks`, never block, and otherwise pass.
   A Salve is never cast: it is only what makes its holder someone with a response. */
function answer(v, attacks) {
  const d = v.decision;
  if (d.kind === "priority") {
    const land = option(v, (o) => o.act === "play-land");
    if (land) return land.index;
    const own = v.state.turnPlayerId === v.seat && /^MAIN/.test(v.state.phase) && !v.state.stack.length;
    const spell = own && untappedForests(v) >= 3 && option(v, (o) => o.act === "cast" && /^(Bear|Timewalk) /.test(o.label));
    if (spell) return spell.index;
    return option(v, (o) => o.act === "pass").index;
  }
  if (d.id.startsWith("declare-attackers") && attacks.includes(v.seatId)) {
    const seen = new Set();
    return d.options.filter((o) => !seen.has(o.cardId) && seen.add(o.cardId)).map((o) => o.index);
  }
  return d.mode === "many" ? d.options.slice(0, d.min).map((o) => o.index) : 0;
}
/* Play on as `answer` does until `stop` says this is the decision (or the game waits on nobody); `seen` hears every one. */
async function until(room, stop, {attacks = ["maya"], seen = () => {}} = {}) {
  for (let n = 0; n < 20000; n += 1) {
    const v = ask(room);
    if (!v || stop(v)) return v;
    seen(v);
    await act(room, v, answer(v, attacks));
  }
  throw new Error("the game did not reach the decision");
}

/* ---- 1. passStack ---- */
/* Maya's own main phase, the stack empty, a Bear she would cast. */
const herCast = (v) => v.seatId === "maya" && isPriority(v) && herTurn(v, v.seat) && v.state.phase === "MAIN1" && !v.state.stack.length
  && !option(v, (o) => o.act === "play-land") && untappedForests(v) >= 3 && option(v, (o) => o.act === "cast" && /^Bear /.test(o.label));
/* Reopened from storage before the cast, as a Durable Object evicted and woken is: the key comes back with the room. */
async function castOver(kinds, more, hold = false) {
  const store = memoryStorage(), matchId = `stack-${kinds.join("")}-${Object.keys(more).join("")}-${hold}`;
  const first = await startRoom({storage: store, matchId, cards, pod: pod([person("rob", "Rob", 0, kinds), person("maya", "Maya", 1, ["Bear"])], more), seed: SEED});
  ok(await until(first, herCast), "Maya's main phase, a Bear to cast");
  const room = await openRoom({storage: store, matchId, cards}), v = ask(room);
  await act(room, v, option(v, (o) => o.act === "cast" && /^Bear /.test(o.label)).index, hold ? {hold: true} : {});
  return ask(room);
}
{
  const next = await castOver(["Bear"], BOTH);
  eq([next.seatId, next.state.stack.length], ["maya", 0], "1. with the key: Rob, with nothing he could cast, is not asked over Maya's Bear -- it resolved, and Maya is asked next");
  const before = await castOver(["Bear"], {});
  eq([before.seatId, before.state.stack.map((e) => e.name.replace(/ .*/, ""))], ["rob", ["Bear"]], "without it (a match launched before): Rob is asked over the Bear, as he was");
  const salve = await castOver(["Bear", "Salve"], BOTH);
  ok(salve.seatId === "rob" && salve.state.stack.length === 1 && mine(salve, "Hand").some((c) => /^Salve /.test(c.name)) && untappedForests(salve) > 0,
    `with a Salve in hand and a Forest to pay for it, Rob is asked over the Bear (${salve.seatId}, ${salve.state.stack.length} on the stack)`);
  const held = await castOver(["Bear"], BOTH, true);
  eq([held.seatId, held.state.stack.length], ["maya", 1], "Maya casting it holding priority is asked over her own Bear (CR 117.3c)");
}

/* ---- 2. Yield turn ---- */
/* Rob asked for priority in Maya's turn, a Bear of hers that may attack and one of his that may block. */
const bears = (v, seat) => v.state.players[seat].zones.Battlefield.cards.filter((c) => /^Bear /.test(c.name));
const yieldPoint = (v) => v.seatId === "rob" && isPriority(v) && herTurn(v, 1 - v.seat) && v.state.phase === "UPKEEP"
  && bears(v, 1 - v.seat).length > 0 && bears(v, v.seat).some((c) => !c.tapped);
const yieldPod = () => pod([person("rob", "Rob", 0, ["Bear", "Salve"]), person("maya", "Maya", 1, ["Bear"])], BOTH);
const storage = memoryStorage();
let room = await startRoom({storage, matchId: "yield", cards, pod: yieldPod(), seed: SEED});
eq([room.view("rob").state.turn, room.view("rob").mayYield], [0, undefined], "before the game begins (the opening hands): no turn to yield");
let v = await until(room, yieldPoint);
ok(v, "Rob is asked in Maya's upkeep, with a Salve and a Forest, her Bear able to attack and his able to block");
const yielded = v.state.turn;
eq([v.mayYield, v.yielding], [true, undefined], "his view: he may yield her turn");
eq([room.view("maya").mayYield, room.view("maya").yielding], [undefined, undefined], "hers says nothing of his");
await room.yieldTurn("rob", {on: true});
v = ask(room);
ok(!(v.seatId === "rob" && isPriority(v)), "2. yielded as he was asked: that priority is passed for him, at once");
eq(room.view("rob").yielding, true, "and his view says he is yielding");
eq(room.view("maya").yielding, undefined, "Maya's does not");
/* The rest of her turn: what Rob is asked, and that the yield holds after it. */
const asked = [];
v = await until(room, (x) => x.state.turn !== yielded, {seen: (x) => { if (x.seatId === "rob") asked.push([x.decision.kind ?? x.decision.id.replace(/:.*/, ""), room.view("rob").yielding === true]); }});
ok(asked.length > 0 && asked.every(([kind]) => kind !== "priority"), `no priority of Rob's asked for the rest of her turn (${asked.map(([k]) => k).join(", ")})`);
ok(asked.some(([kind]) => kind === "declare-blockers"), "Declare blockers is still asked of him: a decision the rules ask is his to make");
ok(asked.every(([, on]) => on), "and he is still yielding when he answers it");
eq([v.state.turnPlayerId, v.state.turn], [0, yielded + 1], "her turn over, his begins");
eq([room.view("rob").yielding, room.view("rob").mayYield], [undefined, undefined], "the yield is gone with her turn, and his own turn has none to start");
await assert.rejects(room.yieldTurn("rob", {on: true}), (e) => e.status === 409 && /your own turn/.test(e.message), "4. yielding his own turn: refused");
checks += 1;
v = await until(room, (x) => x.seatId === "rob" && isPriority(x) && herTurn(x, 1 - x.seat));
eq(v.state.turn, yielded + 2, "and in Maya's next turn he is asked again: a yield never carries");
eq(room.view("rob").mayYield, true, "he may yield this one too");

/* ---- 7. Reopened, and replayed ---- */
await room.yieldTurn("rob", {on: true});
const reopened = await openRoom({storage, matchId: "yield", cards});
eq(reopened.view("rob").yielding, true, "7. reopened from storage, the yield is still on");
await until(reopened, (x) => x.state.turn !== yielded + 2);
const proof = await replayMatch({storage, matchId: "yield", cards});
ok(proof.same, `replayed: the game with two yields on its tape is the same game (${proof.tape} tape entries)`);
const tape = await createMatchStore(storage, "yield").readTape();
eq(tape.filter((e) => e.kind === "yield").map((e) => [e.seat, e.on]), [["rob", true], ["rob", true]], "the tape holds each yield, as given");
eq((await createMatchStore(storage, "yield").loadMatch()).pod.yieldTurn, true, "the saved match keeps the key");

/* ---- 3. Stop yielding ---- */
{
  const r = await startRoom({storage: memoryStorage(), matchId: "yield-stop", cards, pod: yieldPod(), seed: SEED});
  const at = await until(r, yieldPoint);
  await r.yieldTurn("rob", {on: true});
  await r.yieldTurn("rob", {on: false});
  eq([r.view("rob").yielding, r.view("rob").mayYield], [undefined, true], "3. Stop yielding: acknowledged in his view, and he may yield again");
  const again = await until(r, (x) => (x.seatId === "rob" && isPriority(x)) || x.state.turn !== at.state.turn);
  eq([again.seatId, again.state.turn, isPriority(again)], ["rob", at.state.turn, true], "and he is asked for priority again in the same turn");
  await r.end("maya");
  eq([r.status, r.view("rob").mayYield], ["finished", undefined], "the game ended for everyone (by Maya, in her turn), there is nothing to yield");
}

/* ---- 4. Refused ---- */
{
  const r = await startRoom({storage: memoryStorage(), matchId: "yield-before", cards, pod: pod([person("rob", "Rob", 0, ["Bear", "Salve"]), person("maya", "Maya", 1, ["Bear"])]), seed: SEED});
  await until(r, (x) => x.seatId === "rob" && isPriority(x) && herTurn(x, 1 - x.seat));
  await assert.rejects(r.yieldTurn("rob", {on: true}), (e) => e.status === 409 && /started before Yield turn/.test(e.message), "a game launched before Yield turn: refused, and asked as it was");
  checks += 1;
  eq(r.view("rob").mayYield, undefined, "and its view offers none");
  const house = await startRoom({storage: memoryStorage(), matchId: "yield-house", cards, seed: SEED,
    pod: pod([person("rob", "Rob", 0, ["Bear"]), {seatId: "ai", name: "House", pilot: "house", ...deck(1, ["Bear"])}], BOTH)});
  await assert.rejects(house.yieldTurn("ai", {on: true}), (e) => e.status === 409 && /AI seat/.test(e.message), "an AI seat does not yield");
  checks += 1;
  await until(house, (x) => x.seatId === "rob" && isPriority(x) && x.state.turnPlayerId === 0);
  eq(house.view("ai").mayYield, undefined, "and its view never offers one, in Rob's turn as in its own");
}

/* ---- 5. An extra turn is a new one ---- */
{
  const r = await startRoom({storage: memoryStorage(), matchId: "yield-extra", cards, seed: SEED,
    pod: pod([person("rob", "Rob", 0, ["Bear", "Salve"]), person("maya", "Maya", 1, ["Timewalk"])], BOTH)});
  /* Rob asked in Maya's turn with a Timewalk in her hand and Forests enough to cast it. */
  const at = await until(r, (x) => x.seatId === "rob" && isPriority(x) && herTurn(x, 1 - x.seat) && x.state.phase === "UPKEEP"
    && x.state.players[1 - x.seat].zones.Battlefield.cards.filter((c) => c.name === "Forest").length >= 3);
  ok(at, "Rob asked in Maya's upkeep, her Forests out");
  await r.yieldTurn("rob", {on: true});
  const robs = [];
  const next = await until(r, (x) => x.state.turn !== at.state.turn, {seen: (x) => { if (x.seatId === "rob" && isPriority(x)) robs.push(x.state.turn); }});
  eq(robs, [], "no priority of his asked in the turn he yielded");
  eq(next.state.turnPlayerId, 1, `and Maya's Timewalk gave her an extra turn (${next.state.turn})`);
  const inExtra = await until(r, (x) => (x.seatId === "rob" && isPriority(x)) || x.state.turn !== next.state.turn);
  eq([inExtra.seatId, inExtra.state.turn, isPriority(inExtra)], ["rob", next.state.turn, true], "5. in her extra turn he is asked again: a new turn, and the yield ended with the last");
}

/* ---- 6. When the turn's player leaves ---- */
{
  const leftStorage = memoryStorage();
  const r = await startRoom({storage: leftStorage, matchId: "yield-leave", cards, seed: SEED,
    pod: pod([person("rob", "Rob", 0, ["Bear", "Salve"]), person("maya", "Maya", 1, ["Bear"]), person("ann", "Ann", 2, ["Bear"])], BOTH)});
  const at = await until(r, (x) => x.seatId === "rob" && isPriority(x) && x.state.turnPlayerId === 1 && x.state.phase === "UPKEEP");
  ok(at, "Rob asked in Maya's upkeep, three at the table");
  await r.yieldTurn("rob", {on: true});
  await r.leave("maya");
  const after = await until(r, (x) => (x.seatId === "rob" && isPriority(x)) || x.state.turn !== at.state.turn);
  eq([after.seatId, after.state.turn, isPriority(after)], ["rob", at.state.turn, true], "6. Maya conceded in her own turn: what is left of it asks Rob again");
  eq([r.view("rob").yielding, r.view("rob").mayYield], [undefined, undefined], "and nothing to yield in a turn whose player has gone");
  const annTurn = await until(r, (x) => x.state.turnPlayerId === 2);
  eq([annTurn.state.turn, r.view("rob").mayYield, r.view("maya").mayYield], [at.state.turn + 1, true, undefined], "in Ann's turn Rob may yield again; Maya, out of the game, may not");
  ok((await replayMatch({storage: leftStorage, matchId: "yield-leave", cards})).same, "and the game, a yield and a concession on its tape, replays the same");
}

console.log(`room-yield-turn: ${checks} checks passed — a person with no response to what is on the stack is passed for, and one who yields an opponent's turn is passed for in it, still asked what the rules ask; it ends with that turn or its player, never carries, and replays the same.`);
