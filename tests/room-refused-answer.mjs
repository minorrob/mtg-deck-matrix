/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* AN ANSWER THE RULES REFUSE IS REFUSED, WITH NOTHING CHANGED (AGENTS.md, "Behavior that would break a game is refused, with
 * instructions"; game/room/room.mjs `act`, `restore`; cloud/game-room.mjs).
 *
 * The live fuzz (tools/fuzz-live.mjs, D3 to D6 with a person in the first seat) found it: a person's answer was written to
 * the tape and its receipt kept before the engine applied it, and when the engine refused it, the refusal escaped the room
 * with the game half-changed in memory -- the question taken, the board part-moved -- and the tape holding an answer no
 * replay could apply again. Now the rules' refusal is the person's, in the rules' words, and the room is put back as it
 * was saved before the answer arrived. The person here is Rob, with a deck of {0} Elves and a {3} sorcery with convoke;
 * his convoke picks that cannot pay (CR 702.51a: each creature tapped pays {1}) are the refused answer.
 *
 *   Refused    a 422 RoomError in the rules' own words: what is wrong, and what to do instead;
 *   Unchanged  storage, byte for byte (the state, the journal, the tape, the receipts), the fingerprint, the view and the
 *              history; a retry of the same action is refused again, since no receipt was kept;
 *   Pending    the same question, at the same revision, still Rob's;
 *   Taken      a valid answer then is accepted and played, and the tape holds it alone;
 *   Reopened   the room woken from its storage plays on, and the saved tape replays to the same game;
 *   Priority   a priority action the engine refuses (a pass that resolves a spell it cannot) is refused the same way;
 *   After      an engine failure in the AI seats' play after an answer, or after a seat leaves, undoes it too: a 500 that
 *              says so, nothing changed, no departure recorded;
 *   Carried    over the Durable Object: a refused frame (status 422, the rules' words) and the sender's view, still asking
 *              the same question; no one else is sent anything; the valid answer after it is taken;
 *   Harness    tools/fuzz-live.mjs's random person, refused, answers again, and the game finishes clean, its tape holding
 *              only the answers taken; a person refused PERSON_TRIES times running is given up on, and an engine failure
 *              after an answer (a 500) is never answered again.
 */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {memoryStorage, createMatchStore} from "../game/engine/storage.mjs";
import {startRoom, openRoom, RoomError, basicCards, leastAnswer} from "../game/room/room.mjs";
import {replayMatch} from "../game/room/replay.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {GameRoom} from "../cloud/game-room.mjs";
import {playGame, verdict, describe, person, PERSON_TRIES} from "../tools/fuzz-live.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

const DEFS = {
  "Zero Elf": {types: ["Creature"], subtypes: ["Elf"], power: 1, toughness: 1, manaCost: "{0}", colors: ["G"]},
  "Convoke Spell": {types: ["Sorcery"], manaCost: "{3}", colors: [], keywords: ["Convoke"], spell: {id: "s", text: "Draw a card.", targets: [], effects: [{effect: "draw", count: 1}]}},
  /* A spell the engine cannot resolve: its effect is no primitive (game/engine/vocabulary.mjs), for the priority path. */
  "Broken Spell": {types: ["Sorcery"], manaCost: "{0}", colors: [], spell: {id: "s", text: "Nothing.", targets: [], effects: [{effect: "noSuchEffect"}]}},
};
const cards = (name) => DEFS[name] ?? basicCards(name);
const ROB = {seatId: "rob", name: "Rob", pilot: "human", commander: [], cards: [...Array(40).fill("Zero Elf"), ...Array(20).fill("Convoke Spell")]};
const HOUSE = {seatId: "ai", name: "House", pilot: "house", commander: [], cards: Array(60).fill("Forest")};
const POD = {seats: [ROB, HOUSE]};

/* Everything the room has stored, key by key. */
const dump = async (storage) => Object.fromEntries(await Promise.all((await storage.list("")).map(async (k) => [k, await storage.get(k)])));
const request = (view, indices) => ({actionId: randomUUID(), revision: view.revision, kind: "answer", choiceId: view.decision.id, indices});
const isConvokeQuestion = (d) => d && /tap creatures to convoke it/.test(d.title);
/* Rob at the table: casts his Elves, then a Convoke Spell convoked once three creatures could pay it, and otherwise
   passes; any other question gets its least answer (room.mjs). Stops at the convoke question for the suite to answer. */
function robsAnswer(view) {
  const d = view.decision;
  if (d.kind !== "priority") return leastAnswer(d).indices;
  const elf = d.options.find((o) => o.label === "Zero Elf");
  const convoke = d.options.find((o) => o.label === "Convoke Spell" && /convoking/.test(o.detail || ""));
  return [(elf ?? convoke ?? d.options.find((o) => o.label === "Pass priority")).index];
}
async function toConvoke(room) {
  for (let i = 0; i < 400 && room.waitingOn === "rob"; i += 1) {
    const view = room.view("rob");
    if (isConvokeQuestion(view.decision)) return view;
    await room.act("rob", request(view, robsAnswer(view)));
  }
  throw new Error("Rob was never asked which creatures convoke the spell");
}
const refused = async (promise, status, re, message) => {
  let caught = null;
  try {await promise;} catch (error) {caught = error;}
  ok(caught instanceof RoomError && caught.status === status && re.test(caught.message), `${message} (${caught ? `${caught.status}: ${caught.message}` : "it was taken"})`);
  return caught;
};

/* 1. THE REFUSED ANSWER, AND WHAT IT LEFT. */
const storage = memoryStorage();
let room = await startRoom({storage, matchId: "refused", cards, pod: POD, seed: "seed-1"});
const asked = await toConvoke(room);
eq([asked.decision.min, asked.decision.max, asked.decision.options.every((o) => /^Zero Elf/.test(o.label))], [1, 3, true], "Rob is asked which of his Elves convoke the {3} sorcery: one to three of them");
const before = {storage: await dump(storage), fingerprint: room.fingerprint(), view: room.view("rob"), history: room.history, refusals: room.refusals, tape: (await createMatchStore(storage, "refused").readTape()).length};
const one = request(asked, [asked.decision.options[0].index]);
const error = await refused(room.act("rob", one), 422, /^Those creatures and the mana in your pool cannot pay for Convoke Spell: each creature pays \{1\} or one mana of its color\. Pick other creatures, or add mana first$/,
  "one Elf for {3} is refused, 422, in the rules' words: what is wrong, then what to do instead");
eq(error.refused, true, "and marked as the rules' refusal of the answer");
eq(await dump(storage), before.storage, "storage is as it was, key for key: the state, the journal, the tape and the receipts");
eq(room.fingerprint(), before.fingerprint, "the game in memory is as it was: the same state, journal and tape");
eq([room.view("rob"), room.history, room.refusals], [before.view, before.history, before.refusals], "Rob's view, the table's history and the refusal tally are as they were");
eq([room.waitingOn, room.revision, room.view("rob").decision], ["rob", asked.revision, asked.decision], "the same question is still Rob's, at the revision he answered");
await refused(room.act("rob", one), 422, /cannot pay for Convoke Spell/, "the same action sent again is refused again: no receipt was kept for it");
eq(room.fingerprint(), before.fingerprint, "and changes nothing either");

/* 2. A VALID ANSWER THEN IS TAKEN, AND THE TAPE HOLDS IT ALONE. */
const all = request(asked, asked.decision.options.slice(0, 3).map((o) => o.index));
const taken = await room.act("rob", all);
eq([taken.changed, taken.receipt.accepted], [true, true], "three Elves are accepted, with a receipt, at the same revision");
ok(room.history.some((h) => h.text === "Rob cast Convoke Spell"), "and the spell is cast");
const tape = await createMatchStore(storage, "refused").readTape();
eq([tape.length, tape.at(-1).answer.indices], [before.tape + 1, all.indices], "the tape gained the one answer taken, and never the refused one");
const retried = await room.act("rob", all);
eq([retried.changed, retried.receipt], [false, taken.receipt], "the taken answer, sent again, is answered from its receipt");

/* 3. REOPENED FROM STORAGE, IT PLAYS ON; THE SAVED TAPE REPLAYS TO THE SAME GAME. */
room = await openRoom({storage, matchId: "refused", cards});
eq(room.fingerprint(), (await openRoom({storage, matchId: "refused", cards})).fingerprint(), "woken from its storage, the room is the game it saved");
const turn = room.view("rob").state.turn;
let more = 0;
for (; more < 60 && room.waitingOn === "rob" && room.status === "playing"; more += 1) {
  const view = room.view("rob");
  await room.act("rob", request(view, isConvokeQuestion(view.decision) ? view.decision.options.slice(0, 3).map((o) => o.index) : robsAnswer(view)));
}
ok(more === 60 && room.view("rob").state.turn > turn, `and plays on: ${more} more of Rob's answers, from turn ${turn} to turn ${room.view("rob").state.turn}`);
const proof = await replayMatch({storage, matchId: "refused", cards});
ok(proof.same && proof.tape === tape.length + more, `its tape of ${proof.tape} answers replays to the same game, journal and all`);

/* 4. A PRIORITY ACTION THE ENGINE REFUSES: Rob's pass would resolve the House's Broken Spell, which the engine cannot. */
{
  const s = memoryStorage();
  const r = await startRoom({storage: s, matchId: "priority", cards, pod: {seats: [ROB, {...HOUSE, cards: [...Array(50).fill("Forest"), ...Array(10).fill("Broken Spell")]}]}, seed: "seed-1"});
  let view = null;
  for (let i = 0; i < 400 && r.waitingOn === "rob"; i += 1) {
    view = r.view("rob");
    if (view.decision.kind === "priority" && (view.state.stack ?? []).some((e) => e.name === "Broken Spell")) break;
    await r.act("rob", request(view, isConvokeQuestion(view.decision) ? view.decision.options.slice(0, 3).map((o) => o.index) : robsAnswer(view)));
  }
  ok(view && r.history.some((h) => h.text === "House cast Broken Spell") && view.decision.kind === "priority", "the House casts its Broken Spell, and Rob has priority with it on the stack");
  const was = {storage: await dump(s), fingerprint: r.fingerprint(), view: r.view("rob")};
  const pass = view.decision.options.find((o) => o.label === "Pass priority").index;
  await refused(r.act("rob", request(view, [pass])), 422, /noSuchEffect/, "Rob's pass, which would resolve it, is refused with the engine's words");
  eq([await dump(s), r.fingerprint(), r.view("rob")], [was.storage, was.fingerprint, was.view], "and nothing changed: storage, the game, Rob's view and question");
  await r.end("rob");
  eq(r.status, "finished", "Rob can still end the game for everyone");
}

/* 5. AN ENGINE FAILURE AFTER AN ANSWER, OR AFTER A SEAT LEAVES: undone, and a 500 that says so. */
{
  let crash = false;
  const breaking = ({seat, cards: facts}) => {
    const real = housePilot({seat, cards: facts});
    return {...real,
      choose(view, actions) {if (crash) throw new Error("the house pilot broke"); return real.choose(view, actions);},
      answer(view, choice) {if (crash) throw new Error("the house pilot broke"); return real.answer(view, choice);}};
  };
  const pod = {seats: [ROB, HOUSE, {...ROB, seatId: "maya", name: "Maya"}]};
  const s = memoryStorage();
  const r = await startRoom({storage: s, matchId: "after", cards, pod, seed: "seed-2", pilot: breaking});
  for (let i = 0; i < 400 && r.waitingOn !== "rob"; i += 1) {const v = r.view(r.waitingOn); await r.act(r.waitingOn, request(v, leastAnswer(v.decision).indices));}
  for (let i = 0; i < 400 && !(r.waitingOn === "rob" && r.view("rob").decision.kind === "priority"); i += 1) {const v = r.view(r.waitingOn); await r.act(r.waitingOn, request(v, leastAnswer(v.decision).indices));}
  const view = r.view("rob"), was = {storage: await dump(s), fingerprint: r.fingerprint(), view};
  crash = true;
  const pass = view.decision.options.find((o) => o.label === "Pass priority").index;
  await refused(r.act("rob", request(view, [pass])), 500, /^The rules engine failed after that \(the house pilot broke\), so it was not taken: nothing changed, and the game is where it was\. Try another choice, or end the game\.$/,
    "Rob's pass is followed by the House's failing play: a 500 that says what happened and what Rob can still do");
  eq([await dump(s), r.fingerprint(), r.view("rob")], [was.storage, was.fingerprint, was.view], "and nothing changed");
  await refused(r.leave("rob"), 500, /The rules engine failed after that \(the house pilot broke\)/, "Rob leaving, the House playing on fails the same way");
  eq([await dump(s), r.fingerprint(), r.view("rob").departures, r.view("rob").decision], [was.storage, was.fingerprint, {}, view.decision], "and Rob has not left: nothing recorded, the same question his");
  crash = false;
  const went = await r.act("rob", request(view, [pass]));
  ok(went.changed && r.fingerprint().tape === was.fingerprint.tape + 1, "with the House mended, the same pass is taken, and taped once");
}

/* 6. CARRIED OVER THE DURABLE OBJECT: the refused frame, its status and words, and the same question. */
{
  const map = new Map();
  const doStorage = {get: async (k) => map.get(k), put: async (k, v) => {map.set(k, v);}, delete: async (k) => map.delete(k), list: async ({prefix}) => new Map([...map].filter(([k]) => k.startsWith(prefix)).sort())};
  const sockets = [];
  const ctx = {storage: doStorage, acceptWebSocket: (s, tags) => {s.tags = tags; sockets.push(s);}, getWebSockets: () => sockets, getTags: (s) => s.tags, setAlarm: async () => {}};
  const socket = () => ({frames: [], send(f) {this.frames.push(JSON.parse(f));}, close() {}});
  let object = new GameRoom(ctx, {}, {cards});
  const started = await object.fetch(new Request("https://room.internal/start", {method: "POST", headers: {"content-type": "application/json"}, body: JSON.stringify({matchId: "do", seed: "seed-1", pod: POD})}));
  eq(started.status, 201, "the table starts over the object");
  const rob = socket(), ai = socket();
  object.accept(rob, "rob"); object.accept(ai, "ai");
  const latest = () => rob.frames.filter((f) => f.type === "view" || f.type === "refused").at(-1).view;
  for (let i = 0; i < 400 && !isConvokeQuestion(latest().decision); i += 1) {
    const v = latest();
    await object.webSocketMessage(rob, JSON.stringify({type: "act", ...request(v, robsAnswer(v))}));
  }
  const v = latest();
  ok(isConvokeQuestion(v.decision), "over the socket, Rob is asked which Elves convoke the spell");
  const stored = new Map(map), counts = [rob.frames.length, ai.frames.length];
  const one = request(v, [v.decision.options[0].index]);
  await object.webSocketMessage(rob, JSON.stringify({type: "act", ...one}));
  const frames = rob.frames.slice(counts[0]);
  eq(frames.map((f) => f.type), ["refused"], "Rob's socket is sent one frame: refused");
  eq([frames[0].status, frames[0].actionId, frames[0].error], [422, one.actionId, "Those creatures and the mana in your pool cannot pay for Convoke Spell: each creature pays {1} or one mana of its color. Pick other creatures, or add mana first"],
    "with its status, the action it refuses and the rules' words, which the board shows as they are (crankmagic-board.js, receive)");
  eq([frames[0].view.decision, frames[0].view.revision], [v.decision, v.revision], "and Rob's view, asking him the same question at the same revision");
  eq([ai.frames.length, [...map]], [counts[1], [...stored]], "no one else is sent anything, and the object's storage is as it was");
  object = new GameRoom(ctx, {}, {cards});  /* evicted and woken */
  await object.webSocketMessage(rob, JSON.stringify({type: "act", ...request(v, v.decision.options.slice(0, 3).map((o) => o.index))}));
  const after = rob.frames.slice(counts[0] + 1);
  ok(after.some((f) => f.type === "receipt" && f.receipt.accepted) && after.some((f) => f.type === "view") && ai.frames.length > counts[1],
    "woken, the object takes the valid answer: Rob's receipt, and a view for each seat");
}

/* 7. THE HARNESS: a random person, refused, answers again, and the game is clean. */
{
  const decks = [{name: "Elves", commander: [], cards: ROB.cards}, {name: "Forests", commander: [], cards: HOUSE.cards}];
  const s = memoryStorage();
  const game = await playGame({decks, seed: 3, cards, humans: [0], matchId: "harness", storage: s});
  ok(game.personRefused.length > 0 && game.personRefused.every((r) => r.seatId === "s0" && /tap creatures to convoke it/.test(r.question) && /cannot pay for Convoke Spell/.test(r.reason)),
    `the random person's convoke picks were refused ${game.personRefused.length} times, each kept with its question and the rules' words, and each answered again`);
  ok(game.status === "finished" && verdict(game).clean, `and the game finished clean (${game.turns} turns, ${game.decisions} decisions)`);
  ok(describe(game).includes(`${game.personRefused.length} of the people's answers refused by the rules and given again`), "the harness's line for the game says how many");
  const proof = await replayMatch({storage: s, matchId: "harness", cards});
  ok(proof.same && proof.tape === game.decisions, `its tape holds the ${game.decisions} answers taken, none refused, and replays to the same game`);
  /* A person who never reads the refusal -- one Elf for the {3}, every time -- is given up on after PERSON_TRIES refusals
     running, with the room's refusal, rather than asked forever. */
  let tried = 0;
  const oneElf = (seed) => {
    const random = person(seed);
    return (decision) => {
      if (!isConvokeQuestion(decision)) return random(decision);
      tried += 1;
      return {kind: "answer", choiceId: decision.id, indices: [decision.options[0].index]};
    };
  };
  const thrown = await playGame({decks, seed: 3, cards, humans: [0], matchId: "stuck", people: oneElf}).then(() => null, (e) => e);
  ok(thrown instanceof RoomError && thrown.status === 422 && /cannot pay for Convoke Spell/.test(thrown.message) && tried === PERSON_TRIES,
    `a person refused ${PERSON_TRIES} times running is given up on, with the room's refusal (${tried} tries: ${thrown?.message})`);
  /* Only the rules' refusal of an answer is answered again. The engine failing in the play after it (the House's Broken
     Spell resolving once the person passes) is thrown at once: it is no answer of theirs to give again. */
  const asks = new Map();
  const counting = (seed) => {
    const random = person(seed);
    return (decision) => {asks.set(decision.id, (asks.get(decision.id) ?? 0) + 1); return random(decision);};
  };
  const broken = [{name: "Forests", commander: [], cards: HOUSE.cards}, {name: "Broken", commander: [], cards: [...Array(50).fill("Forest"), ...Array(10).fill("Broken Spell")]}];
  const failed = await playGame({decks: broken, seed: 1, cards, humans: [0], matchId: "broken", people: counting}).then(() => null, (e) => e);
  ok(failed instanceof RoomError && failed.status === 500 && /noSuchEffect/.test(failed.message) && Math.max(...asks.values()) === 1,
    `an engine failure after a person's answer stops the harness at once, each question asked once (${failed?.status}: ${failed?.message})`);
}

console.log(`room-refused-answer: ${checks} checks passed -- an answer the rules refuse is refused (422, in their words) with nothing changed and the question still pending, a valid one then taken, the room reopened plays on and its tape replays; a priority action likewise; a failure after an answer or a leave undone (500); carried over the Durable Object; the fuzz harness answers again.`);
