/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* SAME NAME, TWO CREATURES (Linear ROB-168; game/room/room.mjs `combatWords`).
 *
 * A Krenko swarm's Declare blockers offered "Wall blocks Goblin" once per Goblin, and Declare attackers "Goblin → Maya",
 * with nothing to tell them apart. In the seat's view of its decision:
 *   1. Creatures whose names clash say their power and toughness, then what is still alike is numbered; each creature its
 *      own number in every option it is in ("blocks Goblin 1/1 #2" is the same Goblin for every blocker).
 *   2. A block on an attack at a planeswalker says so.
 *   3. The words only: every option keeps its index, cardId, attackerId and defenderId; a choice with no two alike is
 *      returned as it was, word for word.
 *   4. At the room: a person asked to block same-named attackers sees them numbered in `room.view(seat).decision`.
 */
import assert from "node:assert/strict";
import {randomUUID} from "node:crypto";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {awaitingChoice} from "../game/engine/rules/turn.mjs";
import {memoryStorage} from "../game/engine/storage.mjs";
import {startRoom, basicCards, combatWords} from "../game/room/room.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const ids = (choice) => choice.options.map(({index, cardId, attackerId, defenderId, planeswalkerId}) => ({index, cardId, attackerId, defenderId, planeswalkerId}));

/* ---- 1-3. The engine's own questions, said apart ---- */
const s = createState({matchId: "words", seed: "words", players: [{name: "Rob"}, {name: "Maya"}]});
const on = (seat, card, more = {}) => addObject(s, {card, types: ["Creature"], power: 1, toughness: 1, manaCost: "{R}", owner: seat, controller: seat, ...more}, "battlefield");
const goblins = [on(0, "Goblin"), on(0, "Goblin"), on(0, "Goblin"), on(0, "Goblin")];
s.objects[goblins[3]].counters = {"+1/+1": 2};   /* a 3/3 Goblin among 1/1s (CR 613.4c) */
const walls = [on(1, "Wall", {power: 0, toughness: 4}), on(1, "Wall", {power: 0, toughness: 4})];
const jace = addObject(s, {card: "Jace Beleren", types: ["Planeswalker"], loyalty: 3, manaCost: "{1}{U}{U}", owner: 1, controller: 1}, "battlefield");
s.objects[jace].counters = {loyalty: 3};
s.activePlayer = 0; s.turn = 3; s.phase = "COMBAT_DECLARE_ATTACKERS"; s.players[0].turnBegan = 3;   /* not summoning sick (keywords/timing.mjs) */

s.awaiting = {kind: "declare-attackers", player: 0};
const attacking = awaitingChoice(s), said = combatWords(s, attacking);
const words = (choice) => new Map(choice.options.map((o) => [o.cardId, o.label.split(" → ")[0]]));
const each = words(said);
eq([...new Set(each.values())].sort(), ["Goblin 1/1 #1", "Goblin 1/1 #2", "Goblin 1/1 #3", "Goblin 3/3"],
  "1. four Goblins: the 3/3 by its size, the three 1/1s numbered");
ok(said.options.every((o) => o.label.startsWith(`${each.get(o.cardId)} → `)), "each Goblin's words are the same in every option it is in (at Maya, at Jace)");
ok(said.options.some((o) => / → Jace Beleren \(Maya\)$/.test(o.label)), "an attack on the planeswalker keeps its words after the arrow");
eq(ids(said), ids(attacking), "3. every option keeps its index and ids");

s.combat = {attackingPlayerId: 0, defenders: [1], firstStrike: false,
  attacks: goblins.map((attacker, i) => ({attacker, defender: 1, blocked: false, blockers: [], ...(i === 0 ? {planeswalker: jace} : {})}))};
s.awaiting = {kind: "declare-blockers", player: 1};
const blocking = awaitingChoice(s), blockSaid = combatWords(s, blocking);
const parts = blockSaid.options.map((o) => ({o, m: /^(Wall 0\/4 #\d) blocks (Goblin [^(]+?)( \(attacking Jace Beleren\))?$/.exec(o.label)}));
ok(parts.every((p) => p.m), `1. every block reads "<Wall #n> blocks <Goblin ...>" (${blockSaid.options.map((o) => o.label).join(" | ")})`);
const attackerWords = new Map();
for (const {o, m} of parts) {
  const prior = attackerWords.get(o.attackerId);
  ok(prior === undefined || prior === m[2], `the attacker ${o.attackerId} reads the same for every blocker (${m[2]})`);
  attackerWords.set(o.attackerId, m[2]);
}
eq(new Set(attackerWords.values()).size, goblins.length, "every attacking Goblin is told apart from the others");
ok(parts.filter((p) => p.m[3]).every((p) => p.o.attackerId === goblins[0]) && parts.some((p) => p.m[3]), "2. only the Goblin attacking Jace says so");
eq(new Set(blockSaid.options.map((o) => o.label)).size, blockSaid.options.length, "no two block options read alike");
eq(ids(blockSaid), ids(blocking), "3. every block option keeps its index, blocker and attacker");

/* No two alike: returned as it was. */
const t = createState({matchId: "plain", seed: "plain", players: [{name: "Rob"}, {name: "Maya"}]});
addObject(t, {card: "Bear", types: ["Creature"], power: 2, toughness: 2, manaCost: "{1}{G}", owner: 0, controller: 0}, "battlefield");
addObject(t, {card: "Bird", types: ["Creature"], power: 1, toughness: 1, manaCost: "{W}", owner: 0, controller: 0}, "battlefield");
t.activePlayer = 0; t.turn = 3; t.phase = "COMBAT_DECLARE_ATTACKERS"; t.players[0].turnBegan = 3;
t.awaiting = {kind: "declare-attackers", player: 0};
const plain = awaitingChoice(t);
ok(combatWords(t, plain) === plain, "3. a choice with no two alike is the engine's own, word for word");
const priority = {id: "priority:1", options: [{index: 0, label: "Pass priority"}]};
ok(combatWords(t, priority) === priority, "any other decision is untouched");

/* ---- 4. At the room: Rob attacks with Brutes that all read "Brute"; Maya, a person, is asked to block them ---- */
const BEAR = {types: ["Creature"], power: 2, toughness: 2, manaCost: "{1}{G}", colors: ["G"]};
const GENERAL = {types: ["Creature"], power: 9, toughness: 9, manaCost: "{7}{G}{G}", colors: ["G"]};
const cards = (name) => (name === "Brute" || name === "Bear" ? BEAR : name.startsWith("General") ? GENERAL : basicCards(name));
const deck = (seat, kind) => ({commander: [`General ${seat}`], cards: Array.from({length: 99}, (_, i) => (i % 2 ? "Forest" : kind))});
const pod = {seats: [{seatId: "rob", name: "Rob", pilot: "human", ...deck(0, "Brute")}, {seatId: "maya", name: "Maya", pilot: "human", ...deck(1, "Bear")}],
  passEmpty: true, endWhenNoPerson: true, passAfterCast: true, pooledTaps: true};
const room = await startRoom({storage: memoryStorage(), matchId: "combat-words", cards, pod, seed: "combat-words-1"});
const untapped = (v) => v.state.players[v.seat].zones.Battlefield.cards.filter((c) => c.name === "Forest" && !c.tapped).length;
let asked = null;
for (let i = 0; i < 3000 && !asked; i += 1) {
  const seatId = room.waitingOn;
  if (!seatId) break;
  const v = room.view(seatId), d = v.decision;
  if (d.id.startsWith("declare-blockers") && seatId === "maya" && new Set(d.options.map((o) => o.attackerId)).size >= 2) {asked = v; break;}
  let indices;
  if (d.kind === "priority") {
    const own = v.state.turnPlayerId === v.seat && /^MAIN/.test(v.state.phase) && !v.state.stack.length;
    const cast = own && untapped(v) >= 2 && d.options.find((o) => o.act === "cast" && /^(Brute|Bear)/.test(o.label));
    indices = [(d.options.find((o) => o.act === "play-land") || cast || d.options.find((o) => o.act === "pass")).index];
  } else if (d.id.startsWith("declare-attackers")) {
    const brutes = v.state.players[v.seat].zones.Battlefield.cards.filter((c) => c.name === "Brute" && !c.tapped).length;
    const seen = new Set();
    indices = seatId === "rob" && brutes >= 2 ? d.options.filter((o) => !seen.has(o.cardId) && seen.add(o.cardId)).map((o) => o.index) : [];
  } else if (d.id.startsWith("declare-blockers")) indices = [];
  else indices = d.mode === "many" ? d.options.slice(0, d.min).map((o) => o.index) : [0];
  await room.act(seatId, {actionId: randomUUID(), revision: v.revision, kind: "answer", choiceId: d.id, indices});
}
ok(asked, "4. the room reaches Maya's question: her Bears against Rob's attacking Brutes, every one named Brute");
const brutes = new Map(asked.decision.options.map((o) => [o.attackerId, /blocks (Brute[^(]*)$/.exec(o.label)?.[1]]));
ok([...brutes.values()].every((w) => /^Brute 2\/2 #\d$/.test(w)), `in Maya's view each Brute is numbered (${[...brutes.values()].join(", ")})`);
eq(new Set(brutes.values()).size, brutes.size, "and no two attacking Brutes read alike");

console.log(`room-combat-words: ${checks} checks passed -- same-named attackers and blockers said apart by size, then numbered the same in every option; a block on an attack at a planeswalker says so; indices and ids untouched; and in a person's view at the room`);
