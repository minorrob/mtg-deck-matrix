/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* AFTERLIFE, AND "WHENEVER YOU CREATE ONE OR MORE CREATURE TOKENS" (the plan's X5, D5 Shadrix Aristocrats: two of the
 * mechanics its list missed; X5c).
 *
 * Afterlife N (CR 702.135a) is a triggered ability: "When this creature dies, create N 1/1 white and black Spirit creature
 * tokens with flying" -- compiled from the keyword (cards/index.mjs), as Prowess and Annihilator are. "Whenever you create
 * one or more creature tokens" watches a created token's arrival under its controller's control: a token is put onto the
 * battlefield only by being created, under its creator's control unless the effect says otherwise (CR 111.1, 111.2), and
 * "one or more" is once for all made at once. The card scenarios (Ministrant of Obligation, Staff of the Storyteller) play
 * the cards; this holds the edges: another player's tokens, a land that is not a token, the colors, and the catalog.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {
  "Two Soldiers": {types: ["Sorcery"], manaCost: "{W}", colors: ["W"], spell: {id: "s0", text: "Create two 1/1 white Soldier creature tokens.", targets: [],
    effects: [{effect: "createToken", count: 2, token: {name: "Soldier", types: ["Creature"], subtypes: ["Soldier"], colors: ["W"], power: 1, toughness: 1}}]}},
};
const play = (name, setup, steps) => runScenario({name, setup, steps}, index.definition, FIX).state;
const story = (s) => Object.values(s.objects).find((o) => o.card === "Staff of the Storyteller" && o.zone === "battlefield")?.counters?.story ?? 0;

{
  const s = play("Maya's tokens", [at(0, "battlefield", "Staff of the Storyteller"), at(1, "battlefield", "Plains"), at(1, "hand", "Two Soldiers")],
    [{to: {turn: 2, phase: "MAIN1"}}, {tap: "Plains", seat: 1}, {cast: "Two Soldiers", seat: 1}, {resolve: true}]);
  eq([story(s), s.stack.length], [0, 0], "Maya creates two Soldiers: they are hers, not Rob's -- his Staff does not trigger (\"whenever YOU create\")");
}
{
  const s = play("a land", [at(0, "battlefield", "Staff of the Storyteller"), at(0, "hand", "Plains")], [{play: "Plains"}]);
  eq([story(s), s.stack.length], [0, 0], "a land played is not a token created");
}
{
  const s = play("afterlife", [at(0, "battlefield", "Ministrant of Obligation", "Mountain"), at(0, "hand", "Lightning Bolt")],
    [{tap: "Mountain"}, {cast: "Lightning Bolt", targets: [{card: "Ministrant of Obligation"}]}, {resolve: true}, {resolve: true}]);
  const spirits = Object.values(s.objects).filter((o) => o.card === "Spirit" && o.zone === "battlefield");
  eq(spirits.map((o) => [o.colors, o.token, o.controller]), [[["W", "B"], true, 0], [["W", "B"], true, 0]], "Afterlife 2: two Spirit tokens, white and black, Rob's");
}
{
  const s = play("afterlife and the staff", [at(0, "battlefield", "Ministrant of Obligation", "Staff of the Storyteller", "Mountain"), at(0, "hand", "Lightning Bolt")],
    [{tap: "Mountain"}, {cast: "Lightning Bolt", targets: [{card: "Ministrant of Obligation"}]}, {resolve: true}, {resolve: true}, {resolve: true}]);
  eq(story(s), 1, "the two Spirits Afterlife makes at once are one event for the Staff: one story counter");
}
/* The runner's counters expectation (cards/scenario.mjs, added for the Staff) refuses a count that is not there. */
assert.throws(() => runScenario({name: "a wrong count", setup: [at(0, "battlefield", "Staff of the Storyteller")], steps: [],
  expect: [{seat: 0, counters: {card: "Staff of the Storyteller", counter: "story", count: 2}}]}, index.definition, FIX), /has 0 story counters, not 2/,
  "the scenario runner's counters expectation refuses a count that is not there"); checks += 1;
eq([missingFor({keywords: ["Afterlife"]}), missingFor({triggers: ["TokenCreatedOnce"]})], [[], []], "the catalog credits Afterlife and \"whenever you create one or more tokens\"");
for (const name of ["Ministrant of Obligation", "Staff of the Storyteller"]) ok(index.resolve(name)?.playable === true, `${name} is defined and playable`);

console.log(`engine-afterlife-tokens: ${checks} checks passed -- Afterlife's Spirits, white and black, as it dies; "whenever you create one or more creature tokens" once for all made at once, never for another player's, never for a land.`);
