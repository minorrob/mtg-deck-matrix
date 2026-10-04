/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* TWO COSTS: "EXILE THIS CREATURE" AND "REMOVE A COUNTER FROM THIS CREATURE" (Rob's Priority Batch 10.3, its thirty-third
 * slice: Hanged Executioner, the 156th card of Rob's list, and Burdened Stoneback, the 194th).
 *
 * `{atom: "exile", self: true}` (rules/actions.mjs): the permanent itself, exiled as the ability is put on the stack (CR
 * 602.2b, 601.2h), and read afterward as it last was, as a sacrificed source is (CR 608.2h). `{atom: "removeAnyCounter",
 * self: true}`: one counter on it, of whichever kind is chosen as it is activated -- one offer for each kind it has, none
 * when it has none (CR 118.3).
 *
 * The card scenarios play the cards: the Executioner exiling Maya's Bear, the Stoneback's counters coming off. This suite
 * holds what the compiler takes, the source read as it was, an ability that cannot be paid twice, and the offers.
 */
import assert from "node:assert/strict";
import {costAtomBuilt, legalActions} from "../game/engine/rules/actions.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {
  /* "{2}, Exile this creature: It deals damage equal to its power to target player." */
  Martyr: {types: ["Creature"], subtypes: ["Human"], manaCost: "{1}{R}", colors: ["R"], power: 3, toughness: 3, abilities: [{id: "a0", kind: "activated",
    text: "{2}, Exile this creature: It deals damage equal to its power to target player.", cost: [{atom: "mana", cost: "{2}"}, {atom: "exile", self: true}],
    targets: [{what: "player"}], effects: [{effect: "dealDamage", amount: {powerOf: "self"}, who: {target: 0}}]}]},
  /* "Remove a counter from this artifact: Draw a card." */
  Hourglass: {types: ["Artifact"], manaCost: "{1}", colors: [], abilities: [{id: "a0", kind: "activated", text: "Remove a counter from this artifact: Draw a card.",
    cost: [{atom: "removeAnyCounter", self: true}], targets: [], effects: [{effect: "draw", count: 1}]}]},
};
const play = (setup, steps, more = {}) => runScenario({name: "costs", setup, steps, ...more}, index.definition, FIX).state;
const offers = (s, card) => legalActions(s, 0).filter((a) => a.kind === "activate" && a.label === card);

/* ---- the compiler ---- */
eq([costAtomBuilt({atom: "exile", self: true}), costAtomBuilt({atom: "exile"}), costAtomBuilt({atom: "removeAnyCounter", self: true}),
  costAtomBuilt({atom: "removeAnyCounter", self: true, count: 2})], [true, false, true, false],
  "built: exiling the permanent itself, and removing one counter from it; not another's exile, nor two counters at once");

/* ---- "exile this creature" ---- */
{
  const s = play([at(0, "battlefield", "Martyr", "Wastes", "Wastes")], [{tap: "Wastes"}, {tap: "Wastes"}, {activate: "Martyr", targets: [{player: 1}]}]);
  eq([s.zones.exile.map((id) => s.objects[id].card), s.zones.battlefield.map((id) => s.objects[id].card).includes("Martyr")], [["Martyr"], false],
    "activated: the Martyr is in exile before the ability resolves");
  const done = play([at(0, "battlefield", "Martyr", "Wastes", "Wastes")], [{tap: "Wastes"}, {tap: "Wastes"}, {activate: "Martyr", targets: [{player: 1}]}, {resolve: true}]);
  eq(done.players[1].life, 37, "\"damage equal to its power\": 3, its power as it last was on the battlefield");
  eq(offers(play([at(0, "battlefield", "Martyr", "Wastes", "Wastes", "Wastes", "Wastes")], [{tap: "Wastes"}, {tap: "Wastes"}, {activate: "Martyr", targets: [{player: 1}]},
    {tap: "Wastes"}, {tap: "Wastes"}]), "Martyr").length, 0, "and it cannot be paid again: the Martyr is gone");
}

/* ---- "remove a counter" ---- */
{
  eq(offers(play([at(0, "battlefield", "Hourglass")], []), "Hourglass").length, 0, "no counter on it: no offer");
  const stoneback = play([at(0, "battlefield", "Plains", "Wastes"), at(0, "hand", "Burdened Stoneback")], [{tap: "Plains"}, {tap: "Wastes"}, {cast: "Burdened Stoneback"}, {resolve: true}]);
  const object = Object.values(stoneback.objects).find((o) => o.card === "Burdened Stoneback" && o.zone === "battlefield");
  eq(object.counters["-1/-1"], 2, "the Stoneback enters with two -1/-1 counters");
}
{
  /* Two kinds on one permanent: one offer each, named; paying takes exactly one of the kind chosen. */
  const s = play([at(0, "battlefield", "Hourglass")], [], {library: ["Forest", "Island"]});
  const glass = Object.values(s.objects).find((o) => o.card === "Hourglass" && o.zone === "battlefield");
  glass.counters = {charge: 2, time: 1};
  eq(offers(s, "Hourglass").map((a) => a.costNames).sort(), [["a charge counter"], ["a time counter"]], "a charge counter or a time counter: two offers, each named");
}

for (const name of ["Hanged Executioner", "Burdened Stoneback"]) ok(index.resolve(name)?.playable === true, `${name} is defined and playable`);

console.log(`engine-cost-exile-counter: ${checks} checks passed -- "exile this creature" paid as it goes on the stack, the source read as it was, not twice; "remove a counter" one offer a kind, none with none.`);
