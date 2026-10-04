/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "BECOMES A 2/1 BLUE AND RED ELEMENTAL CREATURE" (Rob's Priority Batch 10.3, its thirty-seventh slice: Proteus Staff,
 * the 97th card of Rob's list, and Restless Spire, the 100th).
 *
 * `animate` (script/effects/permanents.mjs) gives the colors it names (`colors`) as an effect of its own, in the layer
 * colors are changed in (CR 613.1e), for as long as the rest of the animation lasts; without `colors` the permanent keeps
 * its own, as before. Proteus Staff needed nothing new: the creature to the bottom of its owner's library, then its
 * controller reveals until a creature card (digUntil, `who` the target's controller as the resolution began).
 *
 * The card scenarios play the cards. This suite holds the colors: given, read by a selector, and gone with the turn.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {characteristicsOf} from "../game/engine/rules/layers.mjs";
import {matchesSelector} from "../game/engine/script/filter.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {
  /* "{G}: This land becomes a 2/2 Elemental creature until end of turn. It's still a land." -- no colors named. */
  Grove: {types: ["Land"], manaCost: "", colors: [], abilities: [{id: "a0", kind: "activated", text: "{G}: This land becomes a 2/2 Elemental creature until end of turn. It's still a land.",
    cost: [{atom: "mana", cost: "{G}"}], targets: [], effects: [{effect: "animate", targets: "self", power: 2, toughness: 2, subtypes: ["Elemental"], until: "end-of-turn"}]}]},
};
const play = (setup, steps) => runScenario({name: "animate", setup, steps}, index.definition, FIX).state;
const id = (s, card) => s.zones.battlefield.find((x) => s.objects[x].card === card);
const SPIRE = [{tap: "Island"}, {tap: "Mountain"}, {activate: "Restless Spire", ability: "a2"}, {resolve: true}];

{
  const s = play([at(0, "battlefield", "Restless Spire", "Island", "Mountain")], SPIRE);
  const spire = characteristicsOf(s, id(s, "Restless Spire"));
  eq([spire.colors.slice().sort(), ["Creature", "Land"].every((t) => spire.types.includes(t)), spire.power, spire.toughness], [["R", "U"], true, 2, 1],
    "Restless Spire animated: blue and red, a creature and still a land, 2/1");
  const context = {controller: 1, source: null};
  eq([matchesSelector({what: "permanent", types: ["Creature"], colors: ["U"]}, s, id(s, "Restless Spire"), context),
    matchesSelector({what: "permanent", types: ["Creature"], nonColors: ["R"]}, s, id(s, "Restless Spire"), context)], [true, false],
    "a selector reads the colors: a blue creature, and not a nonred one");
}
{
  const s = play([at(0, "battlefield", "Restless Spire", "Island", "Mountain")], [...SPIRE, {to: {turn: 2, phase: "UPKEEP"}}]);
  const spire = characteristicsOf(s, id(s, "Restless Spire"));
  eq([spire.colors, spire.types], [[], ["Land"]], "the turn over: a colorless land again, its colors gone with the rest");
}
{
  /* Without `colors`, the permanent keeps its own. */
  const s = play([at(0, "battlefield", "Grove", "Forest")], [{tap: "Forest"}, {activate: "Grove"}, {resolve: true}]);
  const grove = characteristicsOf(s, id(s, "Grove"));
  eq([grove.colors, grove.types.includes("Creature"), grove.power], [[], true, 2], "an animation that names no colors: a colorless 2/2 creature, as before");
}
for (const name of ["Proteus Staff", "Restless Spire"]) ok(index.resolve(name)?.playable === true, `${name} is defined and playable`);

console.log(`engine-animate-colors: ${checks} checks passed -- an animation's colors in their own layer, read by selectors, gone with the turn; none named, none given.`);
