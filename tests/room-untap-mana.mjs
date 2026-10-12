/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* UNTAP, ITS MANA UNSPENT (Rob, 2026-10-11: "I clicked it to see what happens. It tapped it but I have not used it yet. ...
 * I should also be able to click the card to untap it again"). game/engine/rules/untap-mana.mjs, and the room's seventh
 * beat, `untapMana` (game/room/room.mjs).
 *
 * Two people, Llanowar Wastes ({T}: Add {C}; {T}: Add {B} or {G}, and it deals 1 damage to you) and one-mana Elves with
 * flash ({G}):
 *   1. Rob's first turn, his Wastes played and Elves in hand he could cast with its {G}. He taps it for {C} instead -- the
 *      wrong mana: now nothing he holds can be cast. He is asked again, not passed for, with Untap Llanowar Wastes beside
 *      the pass, the {C} in his pool; untapped, the {C} is gone, the Wastes upright, and he is in his main phase still.
 *      Without the beat (a game made before it), the same tap and the room passes for him, as it did.
 *   2. His second turn, two Wastes, each tapped for {C}: either may be untapped -- the first, though tapped first, then
 *      the other; the history and the journal say so; and the game is then exactly as it was before the first tap, to
 *      its hash. In Maya's turn too, with her pass before his tap: the round of passes as it was (CR 117.4).
 *   3. A tap that did more is not taken back: a Wastes for {G}, which deals him 1 damage, offers no untap, and ends the
 *      run, the {C} tapped before it with it.
 *   4. Nothing since: tapped, then passed, and no untap is offered again -- to him, or ever to Maya; a tap later that turn
 *      is a run of its own.
 *   5. Kept with the room: opened again, the untap is still offered, and taken.
 *   6. Replayed: the game with untaps on its tape replays to the same game.
 *   7. The fuzz harness's person never takes it, and picks among the rest as it did before it was offered.
 */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {memoryStorage, createMatchStore} from "../game/engine/storage.mjs";
import {startRoom, openRoom, basicCards} from "../game/room/room.mjs";
import {replayMatch} from "../game/room/replay.mjs";
import {tableCards} from "../cloud/game-room.mjs";
import {person} from "../tools/fuzz-live.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

const WASTES = "Llanowar Wastes";
const DEFS = new Map();
const cards = (name) => DEFS.get(name) ?? (name === WASTES ? tableCards(name) : basicCards(name));
function deck(seat) {
  const list = Array.from({length: 40}, () => WASTES);
  /* Flash: so Rob is asked in Maya's turn too, once she has passed to him (section 2). */
  for (let i = 0; i < 40; i += 1) {const name = `Elf ${seat}-${i}`; DEFS.set(name, {types: ["Creature"], power: 1, toughness: 1, manaCost: "{G}", keywords: ["Flash"]}); list.push(name);}
  DEFS.set(`General ${seat}`, {types: ["Creature"], power: 9, toughness: 9, manaCost: "{7}{G}{G}"});
  return {commander: [`General ${seat}`], cards: list};
}
const BEATS = {passEmpty: true, endAsks: true, untapMana: true};
const pod = (beats = BEATS) => ({seats: [{seatId: "rob", name: "Rob", pilot: "human", ...deck(0)}, {seatId: "maya", name: "Maya", pilot: "human", ...deck(1)}], ...beats});
const SEED = "untap-seed-1";

const answer = (room, who, index) => {const v = room.view(who); return room.act(who, {actionId: randomUUID(), revision: v.revision, kind: "answer", choiceId: v.decision.id, indices: [index]});};
const ask = (room) => (room.waitingOn ? room.view(room.waitingOn) : null);
const priority = (v) => v?.decision?.kind === "priority";
const untaps = (v) => (priority(v) ? v.decision.options.filter((o) => o.act === "undo-mana") : []);
const pass = (v) => v.decision.options.find((o) => o.act === "pass");
const lands = (v) => v.state.players[v.seat].zones.Battlefield.cards.filter((c) => c.name === WASTES);
const pool = (v) => Object.fromEntries((v.state.players[v.seat].mana || []).map((m) => [m.color, m.amount]));
const life = (v) => v.state.players[v.seat].health.life;
const where = (v) => `${v.state.turn}:${v.state.phase}`;
/* Keep, play a land when one may be played, and otherwise pass (never cast) -- until `stop` says this is the decision. */
async function until(room, stop) {
  for (let n = 0; n < 3000; n += 1) {
    const v = ask(room);
    if (!v) return null;
    if (stop(v)) return v;
    const d = v.decision;
    const pick = d.kind === "priority" ? (d.options.find((o) => o.act === "play-land") ?? pass(v)) : null;
    await room.act(v.seatId, {actionId: randomUUID(), revision: v.revision, kind: "answer", choiceId: d.id,
      indices: pick ? [pick.index] : d.mode === "many" ? d.options.slice(0, d.min).map((o) => o.index) : [0]});
  }
  throw new Error("the game did not reach the decision");
}
/* Rob's own main phase, his land played, and `n` Wastes of his untapped. (He is asked there: an Elf's one mana is within
   what his lands could make -- rules/actions.mjs, nothingToDo.) */
const ready = (n) => (v) => v.seatId === "rob" && priority(v) && v.state.turnPlayerId === v.seat && v.state.phase === "MAIN1"
  && !v.decision.options.some((o) => o.act === "play-land") && lands(v).filter((c) => !c.tapped).length === n;
/* A Wastes of Rob's tapped: for {C} (its first ability), or for {G} (its second, the one that deals damage). */
const tapFor = (v, color, not = []) => v.decision.options.find((o) => o.act === "activate-mana" && lands(v).some((c) => c.cardId === o.cardId && !c.tapped) && !not.includes(o.cardId)
  && (color === "C" ? !/\{[BG]\}/.test(o.detail || "") : /\{G\}/.test(o.detail || "")));

/* ---- 1. The wrong mana, taken back ---- */
const storage = memoryStorage();
let room = await startRoom({storage, matchId: "untap", cards, pod: pod(), seed: SEED});
let v = await until(room, ready(1));
ok(v && untaps(v).length === 0, `Rob's first turn, his Wastes played: nothing to untap yet (turn ${v?.state.turn})`);
const first = tapFor(v, "C");
await answer(room, "rob", first.index);
v = ask(room);
eq([v.seatId, where(v), untaps(v).map((o) => [o.label, o.cardId, o.detail]), pool(v), lands(v)[0].tapped],
  ["rob", "1:MAIN1", [[`Untap ${WASTES}`, first.cardId, "its mana unspent"]], {C: 1}, true],
  "tapped for {C}, the wrong mana for his Elves -- nothing he holds can be cast with it -- and still Rob is asked, not passed for, with Untap Llanowar Wastes beside the pass, the {C} in his pool");
{
  const before = await startRoom({storage: memoryStorage(), matchId: "untap-before", cards, pod: pod({passEmpty: true, endAsks: true}), seed: SEED});
  const there = await until(before, ready(1));
  await answer(before, "rob", tapFor(there, "C").index);
  eq([where(ask(before)), untaps(ask(before)).length], ["1:END_OF_TURN", 0], "a game made before the beat: the same tap, and the room passes for him, as it did, to his end step");
}
await answer(room, "rob", untaps(v)[0].index);
v = ask(room);
eq([v.seatId, where(v), pool(v), lands(v)[0].tapped, untaps(v).length], ["rob", "1:MAIN1", {}, false, 0], "untapped: upright, its {C} gone, and Rob asked on in his main phase");

/* ---- 2. A run of two; either untapped; the game as it was ---- */
v = await until(room, ready(2));
const was = room.fingerprint().hash;
const one = tapFor(v, "C");
await answer(room, "rob", one.index);
v = ask(room);
const two = tapFor(v, "C", [one.cardId]);
await answer(room, "rob", two.index);
v = ask(room);
eq([untaps(v).map((o) => o.cardId).sort(), pool(v)], [[one.cardId, two.cardId].sort(), {C: 2}], "his second turn, both Wastes tapped for {C}: either may be untapped");
await answer(room, "rob", untaps(v).find((o) => o.cardId === one.cardId).index);
v = ask(room);
eq([untaps(v).map((o) => o.cardId), pool(v), lands(v).find((c) => c.cardId === one.cardId).tapped], [[two.cardId], {C: 1}, false],
  "the one tapped first, first: upright, its {C} gone, the other's untap still offered");
ok(room.history.some((l) => l.text === `Rob untapped ${WASTES}, its mana unspent`), "and the history says so, for the table to see");
await answer(room, "rob", untaps(v)[0].index);
eq(room.fingerprint().hash, was, "both untapped, the game is exactly as it was before the first tap, to its hash");
const untapped = (await createMatchStore(storage, "untap").readJournal())
  .filter((e) => e.kind === "GameEventCardTapped" && e.data.fields.tapped === false && e.data.turn === v.state.turn && e.data.phase === "MAIN1").map((e) => e.data.fields.card.cardId);
eq(untapped.sort(), [one.cardId, two.cardId].sort(), "and the journal holds each untap, as the event it is: a card untapped, in his main phase");
{
  /* In Maya's turn: she has passed to him, so the round of passes stands at one; tapped and untapped, it stands there again. */
  const theirs = await until(room, (x) => x.seatId === "rob" && priority(x) && x.state.turnPlayerId !== x.seat && lands(x).some((c) => !c.tapped));
  const held = room.fingerprint().hash;
  await answer(room, "rob", tapFor(theirs, "C").index);
  await answer(room, "rob", untaps(ask(room))[0].index);
  eq([room.fingerprint().hash, where(ask(room)), ask(room).seatId], [held, where(theirs), "rob"],
    `in Maya's ${theirs.state.phase.toLowerCase()}, after her pass: tapped and untapped, the game is as it was, the round of passes with it (CR 117.4)`);
}

/* ---- 3. A tap that did more ---- */
v = ask(room);
const before3 = life(v), c3 = tapFor(v, "C");
await answer(room, "rob", c3.index);
v = ask(room);
await answer(room, "rob", tapFor(v, "G", [c3.cardId]).index);
v = ask(room);
eq([life(v), pool(v), untaps(v).length], [before3 - 1, {C: 1, G: 1}, 0], "a Wastes for {G}, which deals him 1 damage: no untap for it, and the run is over, the {C} tapped before it with it");

/* ---- 4. Nothing since ---- */
v = await until(room, ready(3));
const turn4 = v.state.turn, c4 = tapFor(v, "C");
await answer(room, "rob", c4.index);
ok(untaps(ask(room)).length === 1, "another turn, a Wastes tapped for {C}: its untap offered");
await answer(room, "rob", pass(ask(room)).index);
/* Later the same turn, his second main phase: another tap is a run of its own -- the one before the pass, its mana long
   gone from his pool, is not offered with it. */
const later = await until(room, (x) => x.seatId === "rob" && priority(x) && x.state.turn === turn4 && x.state.phase === "MAIN2");
const c4b = tapFor(later, "C", [c4.cardId]);
await answer(room, "rob", c4b.index);
eq(untaps(ask(room)).map((o) => o.cardId), [c4b.cardId], "later that turn, another tap: only it may be untapped, not the one before his pass");
await answer(room, "rob", pass(ask(room)).index);
const seen = [];
for (let n = 0; n < 60 && ask(room); n += 1) {
  const x = ask(room);
  if (x.state.turn > turn4 + 1) break;
  seen.push(...untaps(x).map((o) => `${x.seatId}:${o.label}`));
  await answer(room, x.seatId, priority(x) ? pass(x).index : 0);
}
eq(seen, [], "tapped, then passed: no untap is offered again, to him or to Maya, that turn or hers");

/* ---- 5. Kept with the room ---- */
v = await until(room, ready(4));
const c5 = tapFor(v, "C");
await answer(room, "rob", c5.index);
room = await openRoom({storage, matchId: "untap", cards});
v = ask(room);
eq(untaps(v).map((o) => o.cardId), [c5.cardId], "opened again, Rob's untap is still offered");
await answer(room, "rob", untaps(v)[0].index);
ok(lands(ask(room)).find((c) => c.cardId === c5.cardId).tapped === false, "and taken");

/* ---- 6. Replayed ---- */
const proof = await replayMatch({storage, matchId: "untap", cards});
ok(proof.same, `the game with its untaps on the tape replays to the same game (${proof.tape} tape entries)`);

/* ---- 7. The fuzz harness's person ---- */
{
  const decision = {id: "d", kind: "priority", mode: "one", min: 1, max: 1, options: [
    {index: 0, act: "pass", label: "Pass priority"}, {index: 1, act: "activate-mana", label: "Forest", cardId: 7}, {index: 2, act: "activate-mana", label: "Forest", cardId: 8},
    {index: 3, act: "undo-mana", label: "Untap Forest", cardId: 9}]};
  const without = {...decision, options: decision.options.slice(0, 3)};
  const a = person("p-1"), b = person("p-1"), picks = [];
  for (let i = 0; i < 200; i += 1) picks.push([a(decision, 1).indices[0], b(without, 1).indices[0]]);
  ok(picks.every(([x]) => x !== 3) && picks.every(([x, y]) => x === y), "the fuzz harness's person never untaps, and picks among the rest as it did before Untap was offered");
}

console.log(`room-untap-mana: ${checks} checks passed — a land tapped with its mana unspent may be untapped while nothing else happens, the person asked again rather than passed for, any of a run of them, leaving the game exactly as it was; a tap that did more is not; kept, replayed, and never taken by the fuzz harness's person.`);
