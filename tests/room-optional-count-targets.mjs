/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* AN "UP TO ONE" / "ANY NUMBER" TARGET QUESTION IS ANSWERED THROUGH THE ROOM (ROB-204, Luke's playtest of 2026-10-28; BUG-01).
 *
 * The server half of the Confirm lock. The browser half is tests/board-optional-count-targets.mjs: the board sent nothing,
 * so the issue's "request sent and the prompt returns unchanged" branch is the one this suite shuts: a person's answer to a
 * counted target (game/engine/script/bind.mjs `countedChoice`, mode "many", min 0) is taken by the room whether it names one
 * target, several, or none, and the game plays on to the next question.
 *
 *   Up to one    "exile up to one target creature you control, then return it": one chosen is taken; none is taken.
 *   Any number   Brago's wording, "any number of target ... you control": one, all of them, and none are each taken.
 *   Limits       more than the question's most is refused in the rules' words, and the same question is still Rob's.
 *   Played on    after each answer the stack resolves and Rob has priority again; nothing waits on the answer.
 */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {memoryStorage} from "../game/engine/storage.mjs";
import {startRoom, RoomError, basicCards, leastAnswer} from "../game/room/room.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

const blinker = (name, text, count) => ({types: ["Creature"], subtypes: ["Rogue"], power: 1, toughness: 1, manaCost: "{0}", colors: [],
  abilities: [{id: "a1", kind: "triggered", text, trigger: {on: "GameEventCardChangeZone", to: "Battlefield", who: "self"},
    effects: [{effect: "moveZone", targets: {target: 0}, to: "exile", andReturn: "now"}],
    targets: [{what: "permanent", types: ["Creature"], controller: "you", count}]}]});
const DEFS = {
  "Zero Elf": {types: ["Creature"], subtypes: ["Elf"], power: 1, toughness: 1, manaCost: "{0}", colors: ["G"]},
  "Up To One Blinker": blinker("Up To One Blinker", "When this creature enters, exile up to one target creature you control, then return it to the battlefield under its owner's control.", {min: 0, max: 1}),
  "Any Number Blinker": blinker("Any Number Blinker", "When this creature enters, exile any number of target creatures you control, then return those cards to the battlefield under their owner's control.", {min: 0}),
};
const cards = (name) => DEFS[name] ?? basicCards(name);
const request = (view, indices) => ({actionId: randomUUID(), revision: view.revision, kind: "answer", choiceId: view.decision.id, indices});
const isCounted = (d) => d && /^choose-targets:/.test(d.id);

/* Rob casts Zero Elves until three are out, then the blinker, and passes through anything else; stops at the counted target. */
async function toCountedTarget(blinkerName, seed) {
  const rob = {seatId: "rob", name: "Rob", pilot: "human", commander: [], cards: [...Array(30).fill("Zero Elf"), ...Array(30).fill(blinkerName)]};
  const house = {seatId: "ai", name: "House", pilot: "house", commander: [], cards: Array(60).fill("Forest")};
  const room = await startRoom({storage: memoryStorage(), matchId: `optional-${seed.replaceAll(" ", "-")}`, cards, pod: {seats: [rob, house]}, seed});
  for (let i = 0; i < 600 && room.waitingOn === "rob"; i += 1) {
    const view = room.view("rob");
    if (isCounted(view.decision)) return {room, view};
    const d = view.decision;
    const elves = view.state.players[view.seat].zones.Battlefield.cards.filter((c) => c.name === "Zero Elf").length;
    let pick;
    if (d.kind === "priority") {
      const want = elves >= 3 ? blinkerName : "Zero Elf";
      pick = (d.options.find((o) => o.label === want) ?? d.options.find((o) => o.label === "Pass priority")).index;
      await room.act("rob", request(view, [pick]));
    } else await room.act("rob", request(view, leastAnswer(d).indices));
  }
  throw new Error(`${blinkerName} never asked Rob for its targets`);
}
const refusedWith = async (promise, re, message) => {
  let caught = null;
  try {await promise;} catch (error) {caught = error;}
  ok(caught instanceof RoomError && [409, 422].includes(caught.status) && re.test(caught.message), `${message} (${caught ? `${caught.status}: ${caught.message}` : "it was taken"})`);
};
const playsOn = (room, message) => {
  const view = room.view("rob");
  ok(room.waitingOn === "rob" && !isCounted(view.decision), `${message}: the question is gone and the game plays on (${view.decision?.id})`);
};

/* ---- up to one ---- */
for (const [label, pick] of [["one chosen", (d) => [d.options[0].index]], ["none chosen", () => []]]) {
  const {room, view} = await toCountedTarget("Up To One Blinker", `one-${label}`);
  eq([view.decision.mode, view.decision.min, view.decision.max], ["many", 0, 1], `up to one: asked as a pick of 0 to 1 (${label})`);
  const answered = await room.act("rob", request(view, pick(view.decision)));
  eq(answered.receipt.accepted, true, `up to one, ${label}: the room takes the answer`);
  playsOn(room, `up to one, ${label}`);
}

/* ---- any number (Brago's wording) ---- */
for (const [label, pick] of [["one chosen", (d) => [d.options[0].index]], ["all chosen", (d) => d.options.map((o) => o.index)], ["none chosen", () => []]]) {
  const {room, view} = await toCountedTarget("Any Number Blinker", `any-${label}`);
  eq([view.decision.mode, view.decision.min], ["many", 0], `any number: asked as a pick with no minimum (${label})`);
  ok(view.decision.max >= 3, `any number: it can take every creature of Rob's (${view.decision.max})`);
  const answered = await room.act("rob", request(view, pick(view.decision)));
  eq(answered.receipt.accepted, true, `any number, ${label}: the room takes the answer`);
  playsOn(room, `any number, ${label}`);
}

/* ---- the limits hold ---- */
{
  const {room, view} = await toCountedTarget("Up To One Blinker", "limit");
  const two = view.decision.options.slice(0, 2).map((o) => o.index);
  await refusedWith(room.act("rob", request(view, two)), /\S/, "up to one: two chosen is refused, by the room");
  eq([room.waitingOn, room.view("rob").decision.id], ["rob", view.decision.id], "and it is still Rob's question, unchanged");
  const answered = await room.act("rob", request(room.view("rob"), []));
  eq(answered.receipt.accepted, true, "and then none, sent after the refusal, is taken");
}

console.log(`room-optional-count-targets: ${checks} checks passed -- an "up to one" and an "any number" target question are answered through the room with one, several or none chosen, and the game plays on.`);
