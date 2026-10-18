/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* A DRAFT OF BLOCKS, CHECKED BEFORE CONFIRM (Linear ROB-75; rules/combat.mjs `blockers.check`, controller.mjs `check`,
 * room.mjs `check`).
 *
 * The board drafts a defending seat's blocks a creature at a time and confirms them once. It must never decide what is
 * legal itself, so the engine says:
 *   1. Which attackers each creature may block (`legalBlocks` on the declare-blockers decision): the decision's own pairs,
 *      by blocker -- none for a tapped creature, none against a flyer without reach, none against an attack on another
 *      player.
 *   2. Everything wrong with a draft, at once (`blockers.check`): a creature blocking twice, an attacker with menace
 *      blocked by one, an option that is not there; "no blocks" always legal. Each reason says what to do instead. It
 *      changes nothing: the state's hash is the same after.
 *   3. The answer is refused for the first of the same reasons, so a draft the check passed is never refused, and one it
 *      failed never taken.
 *   4. Any other choice of options is checked as its answer would be, for its first reason (controller.mjs `check`); a
 *      choice of a number or of damage is not a draft to check.
 *   5. At the room: `room.check(seat, {choiceId, indices})` -- `{ok, open, reasons}` -- for the seat asked, about the
 *      question open now; another seat, a question gone, or an answer already given is `open: false`. Nothing is taped,
 *      journalled or shown to another seat; the revision does not move; the answer after it is taken as before.
 */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {awaitingChoice, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {blockers} from "../game/engine/rules/combat.mjs";
import {hashState} from "../game/engine/journal.mjs";
import {createController} from "../game/engine/controller.mjs";
import {memoryStorage} from "../game/engine/storage.mjs";
import {startRoom, basicCards} from "../game/room/room.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};

/* ---- 1-3. The engine: Rob attacks Maya with a Brute (menace), a Bear and a Drake (flying), and Trey with a Hound ---- */
const s = createState({matchId: "blocks", seed: "blocks", players: [{name: "Rob"}, {name: "Maya"}, {name: "Trey"}]});
const on = (seat, card, more = {}) => addObject(s, {card, types: ["Creature"], power: 2, toughness: 2, manaCost: "{2}", owner: seat, controller: seat, ...more}, "battlefield");
const brute = on(0, "Brute", {keywords: ["Menace"]}), bear = on(0, "Bear"), drake = on(0, "Drake", {keywords: ["Flying"]}), hound = on(0, "Hound");
const wall = on(1, "Wall", {power: 0, toughness: 4}), elf = on(1, "Elf", {power: 1, toughness: 1}), archer = on(1, "Archer", {keywords: ["Reach"]});
const tired = on(1, "Tired Ox");
s.objects[tired].tapped = true;
s.combat = {attackingPlayerId: 0, defenders: [1, 2], firstStrike: false,
  attacks: [brute, bear, drake].map((attacker) => ({attacker, defender: 1, blocked: false, blockers: []})).concat([{attacker: hound, defender: 2, blocked: false, blockers: []}])};
s.awaiting = {kind: "declare-blockers", player: 1};
const choice = awaitingChoice(s);
const pick = (...pairs) => pairs.map(([b, a]) => choice.options.findIndex((o) => o.cardId === b && o.attackerId === a));

eq(choice.legalBlocks, [{blocker: wall, attackers: [brute, bear]}, {blocker: elf, attackers: [brute, bear]}, {blocker: archer, attackers: [brute, bear, drake]}],
  "1. legalBlocks: the Wall and the Elf may block the Brute or the Bear, the Archer (reach) the Drake too; the tapped Ox nothing; nobody the Hound, attacking Trey");
eq(choice.legalBlocks.flatMap((b) => b.attackers.map((a) => [b.blocker, a])), choice.options.map((o) => [o.cardId, o.attackerId]),
  "and they are exactly the decision's options, by blocker, in the same order");

const before = hashState(s);
const check = (indices) => blockers.check(s, s.awaiting, indices).reasons;
eq(check([]), [], "2. no blocks: always legal");
eq(check(pick([wall, brute], [elf, brute], [archer, drake])), [], "the Wall and the Elf on the Brute, the Archer on the Drake: legal");
eq(check(pick([wall, brute])), ["Brute has menace and can't be blocked except by two or more creatures"], "the Brute blocked by the Wall alone: menace");
eq(check(pick([wall, brute], [wall, bear])), ["Wall can block only one attacker. Choose one attacker for it to block.", "Brute has menace and can't be blocked except by two or more creatures"],
  "the Wall on two attackers, and so on the Brute alone: both reasons, at once, each saying what is wrong");
eq(check([choice.options.length]), ["Invalid selection"], "an option that is not there");
eq(check([0, 0]), ["Invalid selection"], "one option twice");
eq(check("nonsense"), ["Invalid selection"], "not a list at all");
eq(hashState(s), before, "and checking changed nothing: the state's hash is the same");

{
  /* 3. The answer: refused for the same first reason, and the one the check passed taken. */
  const copy = structuredClone(s), indices = pick([wall, brute], [wall, bear]);
  assert.throws(() => resolveAwaiting(copy, indices), (e) => e.message === check(indices)[0]);
  checks += 1;
  const fine = structuredClone(s);
  resolveAwaiting(fine, pick([wall, brute], [elf, brute], [archer, drake]));
  eq(fine.combat.attacks.map((a) => [a.blocked, a.blockers]), [[true, [wall, elf]], [false, []], [true, [archer]], [false, []]],
    "3. an answer the check refuses is refused for its first reason; one it passes is taken: the Brute blocked by two, the Drake by the Archer");
}

/* ---- 4. Any other choice, at the controller ---- */
{
  const c = createController();
  eq(c.check({choiceId: "x", indices: []}), "This choice has expired", "4. nothing asked: nothing to check");
  c.offer({id: "x", title: "Pick", mode: "many", min: 1, max: 2, options: [{index: 0, label: "a"}, {index: 1, label: "b"}]});
  const revision = c.revision;
  eq([c.check({choiceId: "x", indices: [0, 1]}), c.check({choiceId: "x", indices: []}), c.check({choiceId: "x", indices: [0, 0]}), c.check({choiceId: "y", indices: [0]})],
    [null, "Select the required number of options", "Invalid selection", "This choice has expired"],
    "a choice of options: legal, too few, one twice, another question -- each as its answer would be refused");
  eq(c.revision, revision, "and checking moved nothing");
  const n = createController();
  n.offer({id: "n", title: "How many", mode: "integer", min: 0, max: 3});
  eq(n.check({choiceId: "n", indices: [0]}), "Only a choice of options can be checked", "a choice of a number is not a draft to check");
}

/* ---- 5. At the room: Rob's Brutes at Maya, a person with Bears ---- */
const BEAR = {types: ["Creature"], power: 2, toughness: 2, manaCost: "{1}{G}", colors: ["G"]};
const BRUTE = {...BEAR, keywords: ["Menace"]};
const GENERAL = {types: ["Creature"], power: 9, toughness: 9, manaCost: "{7}{G}{G}", colors: ["G"]};
const cards = (name) => (/^Brute /.test(name) ? BRUTE : /^Bear /.test(name) ? BEAR : name.startsWith("General") ? GENERAL : basicCards(name));
const deck = (seat, kind) => ({commander: [`General ${seat}`], cards: Array.from({length: 99}, (_, i) => (i % 2 ? "Forest" : `${kind} ${seat}-${i}`))});
const pod = {seats: [{seatId: "rob", name: "Rob", pilot: "human", ...deck(0, "Brute")}, {seatId: "maya", name: "Maya", pilot: "human", ...deck(1, "Bear")}],
  passEmpty: true, endWhenNoPerson: true, passAfterCast: true, pooledTaps: true};
const room = await startRoom({storage: memoryStorage(), matchId: "block-check", cards, pod, seed: "block-check-3"});
const untapped = (v) => v.state.players[v.seat].zones.Battlefield.cards.filter((c) => c.name === "Forest" && !c.tapped).length;
let asked = null;
for (let i = 0; i < 3000 && !asked; i += 1) {
  const seatId = room.waitingOn;
  if (!seatId) break;
  const v = room.view(seatId), d = v.decision;
  /* Maya holds her creatures back until Rob has two Brutes to attack with, then is asked to block them. */
  if (d.id.startsWith("declare-blockers") && seatId === "maya" && new Set(d.options.map((o) => o.cardId)).size >= 2 && new Set(d.options.map((o) => o.attackerId)).size >= 2) {asked = v; break;}
  let indices;
  if (d.kind === "priority") {
    const own = v.state.turnPlayerId === v.seat && /^MAIN/.test(v.state.phase) && !v.state.stack.length;
    const cast = own && untapped(v) >= 2 && d.options.find((o) => o.act === "cast" && /^(Brute|Bear) /.test(o.label));
    indices = [(d.options.find((o) => o.act === "play-land") || cast || d.options.find((o) => o.act === "pass")).index];
  } else if (d.id.startsWith("declare-attackers")) {
    const brutes = room.view("rob").state.players[0].zones.Battlefield.cards.filter((c) => /^Brute /.test(c.name) && !c.tapped).length;
    const ids = new Set();
    indices = seatId === "rob" && brutes >= 2 ? d.options.filter((o) => !ids.has(o.cardId) && ids.add(o.cardId)).map((o) => o.index) : [];
  } else if (d.id.startsWith("declare-blockers")) indices = [];
  else indices = d.mode === "many" ? d.options.slice(0, d.min).map((o) => o.index) : [0];
  await room.act(seatId, {actionId: randomUUID(), revision: v.revision, kind: "answer", choiceId: d.id, indices});
}
ok(asked, "5. the room reaches Maya's question: which of her two Bears or more block Rob's two attacking Brutes or more");
const d = asked.decision;
const grouped = [];
for (const o of d.options) {const g = grouped.find((x) => x.blocker === o.cardId); if (g) g.attackers.push(o.attackerId); else grouped.push({blocker: o.cardId, attackers: [o.attackerId]});}
eq(d.legalBlocks, grouped, "her view's decision carries legalBlocks: its own pairs, by blocker");
eq(room.view("rob").decision, null, "Rob's view has no decision of hers, and so no legalBlocks");

const [b1, b2] = d.legalBlocks.map((b) => b.blocker), [a1, a2] = d.legalBlocks[0].attackers;
const at = (b, a) => d.options.find((o) => o.cardId === b && o.attackerId === a).index;
const quiet = () => ({fingerprint: JSON.stringify(room.fingerprint()), revision: room.view("maya").revision, rob: room.view("rob").events.length, history: room.view("rob").history.length});
const still = quiet();
eq(room.check("maya", {choiceId: d.id, indices: []}), {ok: true, open: true, reasons: []}, "no blocks: legal");
const alone = room.check("maya", {choiceId: d.id, indices: [at(b1, a1)]});
eq([alone.ok, alone.open, alone.reasons.length, /has menace and can't be blocked except by two or more creatures/.test(alone.reasons[0])], [false, true, 1, true],
  "one Bear on a Brute: refused, for menace");
eq(room.check("maya", {choiceId: d.id, indices: [at(b1, a1), at(b2, a1)]}), {ok: true, open: true, reasons: []}, "two Bears on one Brute: legal");
const twice = room.check("maya", {choiceId: d.id, indices: [at(b1, a1), at(b1, a2), at(b2, a1)]});
eq([twice.ok, twice.reasons.length, /can block only one attacker\. Choose one attacker for it to block\./.test(twice.reasons[0]), /has menace/.test(twice.reasons[1])], [false, 2, true, true],
  `one Bear on both Brutes, and so the second Brute blocked by one: both reasons at once (${twice.reasons.join(" | ")})`);
eq(room.check("rob", {choiceId: d.id, indices: []}).open, false, "Rob asks about Maya's question: not his, not open to him");
eq(room.check("maya", {choiceId: "declare-blockers:0:1", indices: []}).open, false, "a question gone: not open");
{
  /* Rob's question in his next main phase, a choice of one: checked as its answer would be. */
  const robTurn = await startRoom({storage: memoryStorage(), matchId: "block-check-priority", cards, pod, seed: "block-check-3"});
  const first = robTurn.view(robTurn.waitingOn);
  eq([robTurn.check(first.seatId, {choiceId: first.decision.id, indices: [0]}), robTurn.check(first.seatId, {choiceId: first.decision.id, indices: [999]})],
    [{ok: true, open: true, reasons: []}, {ok: false, open: true, reasons: ["Invalid selection"]}], "any other question: checked as its answer would be, for its first reason");
}
assert.throws(() => room.check("sam", {choiceId: d.id, indices: []}), /not at this table/);
checks += 1;
eq(quiet(), still, "and nothing changed: the room's fingerprint (state, journal, tape), the revision, and no event or history line in Rob's view");

await room.act("maya", {actionId: randomUUID(), revision: asked.revision, kind: "answer", choiceId: d.id, indices: [at(b1, a1), at(b2, a1)]});
const blocked = room.view("rob").events.filter((e) => e.kind === "block").flatMap((e) => e.blocks);
eq(blocked.map((b) => [b.card.cardId, b.blocking.cardId]), [[b1, a1], [b2, a1]], "the answer the check passed is taken as before: one Brute blocked by the two Bears, public now");
eq(room.check("maya", {choiceId: d.id, indices: []}).open, false, "and once answered, the question is no longer open to check");

console.log(`room-block-check: ${checks} checks passed — a draft of blocks checked whole before Confirm, every reason at once and nothing changed: legalBlocks the decision's own pairs by blocker, menace and one blocker twice refused saying what to do, the answer refused for the same first reason, and at the room only the seat asked, about the question open now.`);
