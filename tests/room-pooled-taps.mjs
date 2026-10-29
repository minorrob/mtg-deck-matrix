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
import {startRoom, openRoom, basicCards} from "../game/room/room.mjs";
import {replayMatch} from "../game/room/replay.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {awaitingChoice} from "../game/engine/rules/turn.mjs";

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

{
  const storage = memoryStorage(), matchId = "physical-sources";
  const room = await startRoom({storage, matchId, cards, pod: pod({pooledTaps: true, sourceChoices: true}), seed: SEED});
  const readyThree = v => v.seatId === "rob" && priority(v) && v.state.turnPlayerId === v.seat && v.state.phase === "MAIN1"
    && !v.decision.options.some(o => o.act === "play-land") && forests(v).filter(c => !c.tapped).length === 3;
  const before = await until(room, readyThree), ids = forests(before).map(c => c.cardId);
  await act(room, before, bears(before)[0].index);
  const asked = ask(room);
  eq([asked.decision.mode, asked.decision.min, asked.decision.max, asked.decision.options.map(o => o.cardId)], ["many", 2, 2, ids], "a current room asks every actual source identity before paying");
  eq([forests(asked).some(c => c.tapped), stack(asked).length], [false, 0], "the saved identity proposal has made no tap or cast");
  const reopened = await openRoom({storage, matchId, cards});
  eq(ask(reopened).decision.options.map(o => o.cardId), ids, "room reload preserves all exact identity options");
  await act(reopened, ask(reopened), [1, 2]);
  const after = ask(reopened);
  eq([forests(after).filter(c => c.tapped).map(c => c.cardId), stack(after).length], [ids.slice(1), 1], "the room activates only the two identities chosen after reload");
  eq((await createMatchStore(storage, matchId).loadMatch()).pod.sourceChoices, true, "the current saved pod retains its physical-source contract");
  const proof = await replayMatch({storage, matchId, cards});
  ok(proof.same, `current exact identity answers replay to the same game (${proof.tape} tape entries)`);
}

{
  const index = loadCardIndex(), name = "Sephara, Sky's Blade", storage = memoryStorage(), matchId = "pilot-disjoint-cost";
  const cardFor = card => card === name ? index.definition(card) : /^Bird /.test(card) ? {types: ["Creature"], colors: ["W"], manaCost: "{0}", power: 0, toughness: 1, keywords: ["Flying", "Haste"],
    abilities: [{id: "m", kind: "mana", tapSelf: true, produces: {W: 1}}]} : /^Drake /.test(card) ? {types: ["Creature"], colors: ["W"], manaCost: "{0}", power: 2, toughness: 2, keywords: ["Flying"]}
    : card === "General" ? {types: ["Creature"], supertypes: ["Legendary"], manaCost: "{20}", power: 1, toughness: 1} : basicCards(card);
  const answers = [];
  const pilot = ({seat, cards}) => {
    const own = housePilot({seat, cards});
    return {...own, choose(view, actions) {
      const board = view.players[seat].zones.Battlefield.cards;
      if (seat === 0 && !board.some(c => c.name === name)) {
        const birds = board.filter(c => /^Bird /.test(c.name)).length, drakes = board.filter(c => /^Drake /.test(c.name)).length;
        const next = actions.find(a => a.kind === "cast" && ((birds < 2 && /^Bird /.test(a.label)) || (drakes < 4 && /^Drake /.test(a.label))));
        if (next) return next;
        if (birds === 2 && drakes === 4) {const cast = actions.find(a => a.kind === "cast" && a.label === name && a.alternative !== undefined); if (cast) return cast;}
        return actions.find(a => a.kind === "pass");
      }
      return own.choose(view, actions);
    }, answer(view, choice) {
      const answer = own.answer(view, choice);
      if (seat === 0 && choice.cost === "tap" && choice.title.startsWith(name)) answers.push({choice: structuredClone(choice), answer: structuredClone(answer)});
      return answer;
    }};
  };
  const pod = {sourceChoices: true, pooledTaps: true, passEmpty: true, seats: [
    {seatId: "rob", name: "Rob", pilot: "house", level: "easy", commander: [name], cards: Array.from({length: 99}, (_, i) => `${i % 2 ? "Bird" : "Drake"} ${i}`)},
    {seatId: "maya", name: "Maya", pilot: "house", level: "easy", commander: ["General"], cards: Array(99).fill("Wastes")}
  ]};
  let room = await startRoom({storage, matchId, cards: cardFor, pod, seed: "pilot-disjoint-cost-1", pilot, slice: 1});
  const store = createMatchStore(storage, matchId);
  let checkpoint;
  for (let i = 0; i < 1200; i++) {
    checkpoint = await store.latestCheckpoint();
    if (checkpoint.state.awaiting?.kind === "choose-cost" && checkpoint.state.awaiting.action?.label === name) break;
    assert.ok(room.continuing, "the real room continues toward the actual cost question");
    await room.resume();
  }
  eq([checkpoint.state.awaiting?.kind, checkpoint.state.priorityPlayer, answers.length], ["choose-cost", null, 0], "the real room saves the unpaid proposal before its house pilot answers");
  const question = JSON.parse(JSON.stringify(awaitingChoice(checkpoint.state))), sources = question.fundingWitness.sources.map(s => s.cardId);
  eq([question.options.length, question.min, question.max, sources.length], [6, 4, 4, 1], "the saved public facts retain every human cost option and one real funding witness");
  eq(checkpoint.state.zones.battlefield.some(id => checkpoint.state.objects[id].tapped), false, "no mana or nonmana cost tap is committed before reload");
  room = await openRoom({storage, matchId, cards: cardFor, pilot, slice: 1});
  await room.resume();
  const paid = (await store.latestCheckpoint()).state, answer = answers[0];
  eq(answers.length, 1, "the actual house-pilot answer is taken once after room reload");
  const costs = answer.answer.indices.map(i => answer.choice.options[i].cardId);
  eq([costs.length, costs.some(id => sources.includes(id))], [4, false], "the actual room pilot preserves its visible funding source while selecting the other tap cost");
  eq(paid.zones.battlefield.filter(id => paid.objects[id].tapped).sort((a,b) => a-b), [...costs, ...sources].sort((a,b) => a-b), "Pay commits exactly the pilot's four cost IDs and one distinct mana ID");
  eq([paid.awaiting, paid.priorityPlayer, paid.passes, paid.players[0].manaPool.W, paid.stack.at(-1)?.name], [null, 0, 0, 0, name], "the real paid cast retains its actor's priority and exact empty pool");
  eq([room.refusals.since, room.refusals.total], [0, 0], "the real pilot payment has zero refusals from the match start");
  for (let i = 0; i < 1200 && room.continuing; i++) await room.resume();
  eq([room.status, room.refusals.total], ["finished", 0], "the real easy-house game finishes with no rejected answer or fallback");
  const ended = (await store.latestCheckpoint()).state;
  eq([ended.players[0].lost, ended.players[1].lost], [false, true], "the actual paid flying board reaches a winner");
  const proof = await replayMatch({storage, matchId, cards: cardFor, pilot});
  ok(proof.same, `actual pilot Pay/reload and complete room game replay with the same state/journal (${proof.tape} tape entries)`);
}
console.log(`room-pooled-taps: ${checks} checks passed — a new match tops floating mana up from its caster's untapped sources; a match launched before offers what it offered; the saved match keeps which, and replays the same.`);
