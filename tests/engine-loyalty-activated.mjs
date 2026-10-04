/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "WHENEVER YOU ACTIVATE A LOYALTY ABILITY", AND "IF YOU'VE ACTIVATED A LOYALTY ABILITY THIS TURN" (Ajani Unrelenting,
 * Kiora of Salt and Sand; the live-game plan of 2026-10-04, its piece P4).
 *
 * The trigger (`loyalty activated`, cards/index.mjs; rules/trigger.mjs) is an ability, not a spell, with a loyalty cost
 * (CR 606.4), put on the stack by its `activator` -- any permanent's, its own source included; `removedAtLeast` is "if you
 * removed two or more loyalty counters to activate it" (Way of the Mind Sculptor), read from that cost. The activation
 * event says its loyalty cost (rules/actions.mjs). The condition (`loyaltyThisTurn`, script/condition.mjs) reads a record
 * kept by the player, not the permanent, so it holds after the permanent has left (CR 400.7), and it is counted afresh
 * each turn (rules/turn.mjs). And "discard your hand" (`discard`, `all`): every card, nobody asked.
 *
 * The card scenarios play the cards. This suite holds the edges.
 */
import assert from "node:assert/strict";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {conditionHolds} from "../game/engine/script/condition.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const AJANI = "Ajani Unrelenting", KB = "Kiora, Behemoth Beckoner";
const at = (seat, zone, ...cards) => ({seat, zone, cards});
/* A test-only card: "whenever you activate a loyalty ability, if you removed two or more loyalty counters to activate it,
   draw a card" -- Way of the Mind Sculptor's second line, alone. */
const SCULPTOR = compileScript({schema: "CrankCardScript@1", identity: {name: "Sculptor Fixture", oracleId: "x", types: ["Enchantment"], subtypes: [], manaCost: "{U}", colors: ["U"], colorIdentity: ["U"]},
  oracleText: "x", source: "hand", abilities: [{kind: "triggered", text: "x", trigger: {on: "loyalty activated", removedAtLeast: 2}, effects: [{effect: "draw", count: 1}]}]});
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  "Sculptor Fixture": SCULPTOR.definition,
};
const play = (setup, steps = [], extra = {}) => runScenario({name: "loyalty activated", setup, steps, ...extra}, index.definition, FIX).state;
const on = (s, card, seat = 0) => s.zones.battlefield.filter((id) => s.objects[id].card === card && s.objects[id].controller === seat).length;
/* On the stack, and waiting to go on it (two at once wait for their order, CR 603.3b). */
const pending = (s) => s.stack.length + (s.pendingTriggers?.length ?? 0);

eq(SCULPTOR.problems, [], "the trigger compiles with removedAtLeast");
ok(compileScript({schema: "CrankCardScript@1", identity: {name: "Odd", oracleId: "x", types: ["Enchantment"], subtypes: [], manaCost: "{U}", colors: ["U"], colorIdentity: ["U"]},
  oracleText: "x", source: "hand", abilities: [{kind: "triggered", text: "x", trigger: {on: "loyalty activated"}, condition: {loyaltyThisTurn: "yes"}, effects: [{effect: "draw", count: 1}]}]})
  .problems.some((p) => p.includes("loyaltyThisTurn is true")), "the condition is true, nothing else");

/* ---- whose, and what ---- */
{
  const s = play([at(0, "battlefield", AJANI, KB, "Forest")], [{tap: "Forest"}, {activate: KB, targets: [{card: "Forest"}]}]);
  eq(pending(s), 2, "Rob's other planeswalker's -1: Ajani's trigger above it");
  const t = play([at(0, "battlefield", AJANI), at(1, "battlefield", KB, "Island")], [{pass: 1}, {to: {turn: 2, phase: "MAIN1"}}, {tap: "Island", seat: 1}, {activate: KB, seat: 1, targets: [{card: "Island"}]}]);
  eq(pending(t), 1, "Maya's planeswalker's -1: no Cadet for Rob");
  const u = play([at(0, "battlefield", AJANI, "Mind Stone", "Wastes")], [{tap: "Wastes"}, {activate: "Mind Stone", ability: "a1"}]);
  eq([pending(u), on(u, "Cadet")], [1, 0], "a loyalty ability only: Mind Stone's draw, alone on the stack, makes no Cadet");
}
/* ---- removed two or more ---- */
{
  const s = play([at(0, "battlefield", AJANI, "Sculptor Fixture")], [{activate: AJANI, ability: "a2"}]);
  eq(pending(s), 3, "Ajani's -2: two counters removed, both triggers");
  const t = play([at(0, "battlefield", AJANI, "Sculptor Fixture")], [{activate: AJANI, ability: "a1"}]);
  eq(pending(t), 2, "Ajani's +1: none removed, the Sculptor's draw does not trigger");
  const u = play([at(0, "battlefield", KB, "Sculptor Fixture", "Forest")], [{tap: "Forest"}, {activate: KB, targets: [{card: "Forest"}]}]);
  eq(pending(u), 1, "a -1: one removed, not two");
}
/* ---- if you've activated one this turn: by the player, for the turn ---- */
{
  const ask = (s) => conditionHolds(s, {loyaltyThisTurn: true}, {controller: 0});
  const s = play([at(0, "battlefield", AJANI, "Bear")]);
  ok(!ask(s), "nothing activated yet: no");
  const t = play([at(0, "battlefield", AJANI, "Bear")], [{activate: AJANI, ability: "a1"}, {resolve: true}, {resolve: true}]);
  ok(ask(t) && !conditionHolds(t, {loyaltyThisTurn: true}, {controller: 1}), "Ajani's +1: yes for Rob, not for Maya");
  const ajani = t.zones.battlefield.find((id) => t.objects[id].card === AJANI);
  runEffect(t, {effect: "moveZone", targets: [ajani], to: "graveyard"}, {controller: 1, source: null});
  ok(ask(t), "Ajani gone: still yes, the record is Rob's");
  const u = play([at(0, "battlefield", AJANI, "Bear")], [{activate: AJANI, ability: "a1"}, {resolve: true}, {resolve: true}, {to: {turn: 2, phase: "UPKEEP"}}]);
  ok(!ask(u), "the next turn: no again");
}
/* ---- discard your hand ---- */
{
  const t = play([at(0, "battlefield", AJANI), at(0, "hand", "Swamp", "Mountain", "Plains")], [{activate: AJANI, ability: "a2"}, {resolve: true}, {resolve: true}]);
  eq([t.zones.graveyard[0].length, t.zones.hand[0].length, t.awaiting], [3, 1, null], "three cards discarded, nobody asked; a card for the Cadet");
  const u = play([at(0, "battlefield", AJANI)], [{activate: AJANI, ability: "a2"}, {resolve: true}, {resolve: true}]);
  eq([u.zones.hand[0].length, u.awaiting], [1, null], "an empty hand: nothing to discard, still a card for the Cadet");
}
for (const name of [AJANI, "Kiora of Salt and Sand"]) ok(index.resolve(name)?.playable === true, `${name} is defined and playable`);

console.log(`engine-loyalty-activated: ${checks} checks passed -- whenever you activate a loyalty ability, any permanent's, yours only, two or more removed; if you've activated one this turn, by the player, for the turn; discard your hand.`);
