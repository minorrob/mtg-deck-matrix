/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* CH-57: a play and its mana restored, only while the room still owns the same safe window. */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {memoryStorage} from "../game/engine/storage.mjs";
import {startRoom, openRoom, basicCards} from "../game/room/room.mjs";
import {replayMatch} from "../game/room/replay.mjs";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {beforePlay, observePlay, finishPlay, undoPlay} from "../game/engine/rules/undo-play.mjs";
let checks = 0;
const eq = (a, b, message) => {assert.deepEqual(a, b, message); checks++;};
const ok = (a, message) => {assert.ok(a, message); checks++;};
const cards = name => name === "Bear" ? {types: ["Creature"], manaCost: "{1}{R}", power: 2, toughness: 2}
  : name === "Commander" ? {types: ["Creature"], manaCost: "{9}", power: 1, toughness: 1} : basicCards(name);
const pod = (enabled = true) => ({seats: ["rob", "maya"].map(seatId => ({seatId, name: seatId, pilot: "human", commander: ["Commander"], cards: Array.from({length: 99}, (_, i) => i % 2 ? "Mountain" : "Bear")})),
  passEmpty: true, passAfterCast: true, endAsks: true, untapMana: true, houseRules: {undoLastPlay: enabled}});
const view = room => room.view(room.waitingOn);
const find = (v, act) => v.decision?.options.find(o => o.act === act);
const answer = (room, v, option) => room.act(v.seatId, {kind: "answer", actionId: randomUUID(), revision: v.revision, choiceId: v.decision.id, indices: [option.index]});
async function until(room, stop, policy = () => null) {
  for (let n = 0; n < 2000; n++) {
    const v = view(room);
    if (stop(v)) return v;
    const chosen = policy(v) ?? find(v, "pass") ?? v.decision.options[0];
    await answer(room, v, chosen);
  }
  throw new Error("the expected decision never arrived");
}
const storage = memoryStorage();
let room = await startRoom({storage, matchId: "undo-play", cards, seed: "r4-undo", pod: pod()});
let v = await until(room, v => v.seatId === "rob" && !!find(v, "play-land"));
const beforeLand = room.fingerprint().hash;
await answer(room, v, find(v, "play-land"));
v = view(room);
ok(v.canUndo && find(v, "undo-play"), "playing a land offers the server-approved undo");
ok(v.state.players[0].zones.Battlefield.cards.some(c => c.undoable), "the played land carries undoable in its owner's projection");
ok(!room.view("maya").canUndo, "an opponent never receives the owner's undo permission");
await answer(room, v, find(v, "undo-play"));
eq(room.fingerprint().hash, beforeLand, "undo restores the land to hand and its land drop, to the exact hash");
ok(room.view("maya").history.some(h => /Mountain undone/.test(h.text)), "the opponent's history says the play was undone");
v = await until(room, v => v.seatId === "rob" && v.decision.kind === "priority" && v.state.players[0].zones.Battlefield.cards.length >= 2,
  v => find(v, "play-land"));
const beforeCast = room.fingerprint().hash;
await answer(room, v, find(v, "activate-mana"));
v = view(room); await answer(room, v, find(v, "activate-mana"));
v = view(room); await answer(room, v, find(v, "cast"));
v = view(room);
eq([v.seatId, v.canUndo, v.state.stack.length], ["rob", true, 1], "automatic pass waits while a cast has an undo window");
ok(v.state.stack[0].undoable, "the spell's stack entry carries undoable");
room = await openRoom({storage, matchId: "undo-play", cards});
v = view(room);
ok(v.canUndo && find(v, "undo-play"), "the same undo survives a room reopen");
await answer(room, v, find(v, "undo-play"));
eq(room.fingerprint().hash, beforeCast, "the cast and its contiguous reversible mana taps are restored to the exact hash");
ok(view(room).state.players[0].zones.Battlefield.cards.every(c => !c.tapped), "its mana sources are upright again");
const replay = await replayMatch({storage, matchId: "undo-play", cards});
ok(replay.same, "land and cast undos replay to the same state and journal");
// Cast again, then give priority away. A stale client cannot restore the private snapshot afterward.
v = view(room); await answer(room, v, find(v, "activate-mana"));
v = view(room); await answer(room, v, find(v, "activate-mana"));
v = view(room); await answer(room, v, find(v, "cast"));
v = view(room);
const stale = {kind: "answer", actionId: randomUUID(), revision: v.revision, choiceId: v.decision.id, indices: [find(v, "undo-play").index]};
await answer(room, v, find(v, "pass"));
ok(!room.view("rob").canUndo, "passing priority closes the window");
await assert.rejects(() => room.act("rob", stale), error => [409, 422].includes(error.status)); checks++;
const old = await startRoom({storage: memoryStorage(), matchId: "old-play", cards, seed: "r4-undo", pod: pod(false)});
let oldView = await until(old, v => v.seatId === "rob" && !!find(v, "play-land"));
await answer(old, oldView, find(oldView, "play-land"));
ok(!old.view("rob").canUndo, "a match without the rule gets no new undo window");
// Direct guard checks cover information and trigger paths without depending on a particular card's script.
const s = createState({matchId: "guards", seed: "guards", players: [{name: "Rob"}, {name: "Maya"}]});
s.turn = 1; s.phase = "MAIN1"; s.priorityPlayer = 0;
const id = addObject(s, {card: "Test spell", owner: 0, controller: 0, types: ["Sorcery"]}, "hand", 0);
const action = {kind: "cast", objectId: id}, random = {seed: "guards", counter: 0};
const saved = beforePlay(s, 0, action, random);
s.stack.push({stackId: 1, objectId: id, playerId: 0, kind: "spell"});
const safe = finishPlay(s, saved, random);
ok(safe, "one spell with no new information has a safe window");
for (const kind of ["GameEventDrawn", "GameEventCardRevealed", "GameEventCardDiscarded"]) {
  const copy = structuredClone(saved); observePlay(copy, [{kind, data: {fields: {}}}]);
  eq(finishPlay(s, copy, random), null, `${kind} forbids undo`);
}
const revealedAfter = structuredClone(safe);
observePlay(revealedAfter, [{kind: "GameEventCardRevealed", data: {fields: {}}}]);
eq(finishPlay(s, revealedAfter, random), null, "even a reveal with no state mutation after casting closes the window");
eq(finishPlay(s, saved, {...random, counter: 1}), null, "a random outcome forbids undo even without a visible event");
s.stack.push({stackId: 2, playerId: 0, kind: "trigger"});
eq(finishPlay(s, saved, random), null, "even the caster's own trigger closes the window");
s.stack.pop();
s.turn++;
assert.throws(() => undoPlay(s, safe, 0, random), /can't be undone/); checks++;
s.turn--; safe.beforeHash = "corrupted";
assert.throws(() => undoPlay(s, safe, 0, random), /can't be undone/); checks++;
console.log(`room-undo-play: ${checks} checks passed`);
