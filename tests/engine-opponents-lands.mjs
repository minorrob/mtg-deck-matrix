/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "THIS LAND ENTERS TAPPED UNLESS YOUR OPPONENTS CONTROL EIGHT OR MORE LANDS" (the Turbulent lands of Rob's live game,
 * 2026-10-04), AND "UNLESS YOU CONTROL A PLANESWALKER" (its Annexes and Commons).
 *
 * An arrival's `unless` reads what the entering land's controller's opponents control, all of them together
 * (`opponentsControl`, rules/replacement.mjs unlessHolds): at least `min`, at most `max`. A land of that player's own is
 * not one, nor is an opponent's creature; and "your opponents" are the opponents of whoever plays the land.
 *
 * The card scenarios play the cards. This suite holds the edges.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const lands = (n) => Array(n).fill("Wastes");
const FEW = {types: ["Land"], abilities: [{id: "r", kind: "replacement", text: "x",
  watches: {event: "enters", who: "self", unless: {opponentsControl: {what: "permanent", types: ["Land"]}, max: 2}}, change: {entersTapped: true}}]};
const FIX = {Ogre: {types: ["Creature"], subtypes: ["Ogre"], manaCost: "{2}{R}", colors: ["R"], power: 3, toughness: 3}, "Few Lands": FEW};
const CRATER = "Turbulent Crater";

/* Whether `land`, played from `by`'s hand in that player's first main phase, enters tapped. */
const tapped = (land, setup, {seats = 2, by = 0} = {}) => {
  const s = runScenario({name: `${land} by seat ${by}`, seats, at: {turn: by + 1, phase: "MAIN1"}, setup: [...setup, at(by, "hand", land)], steps: [{play: land}]},
    index.definition, FIX).state;
  return s.objects[s.zones.battlefield.find((id) => s.objects[id].card === land)].tapped;
};

/* ---- unless your opponents control eight or more lands ---- */
eq([tapped(CRATER, [at(1, "battlefield", ...lands(7))]), tapped(CRATER, [at(1, "battlefield", ...lands(8))])], [true, false],
  "Maya controls seven lands: tapped; eight: untapped");
eq(tapped(CRATER, [at(0, "battlefield", ...lands(8))]), true, "Rob's own eight are not Rob's opponents'");
eq(tapped(CRATER, [at(1, "battlefield", ...lands(7), "Ogre")]), true, "seven lands and an Ogre: the Ogre is no land");
eq([tapped(CRATER, [at(1, "battlefield", ...lands(4)), at(2, "battlefield", ...lands(4))], {seats: 3}),
  tapped(CRATER, [at(1, "battlefield", ...lands(4)), at(2, "battlefield", ...lands(3))], {seats: 3})], [false, true],
  "two opponents count together: four and four is eight, four and three is not");
eq(tapped(CRATER, [at(0, "battlefield", ...lands(3)), at(2, "battlefield", ...lands(3)), at(3, "battlefield", ...lands(2))], {seats: 4, by: 1}), false,
  "played by Maya: Rob, Trey and Sam are Maya's opponents, three, three and two");
eq(tapped(CRATER, [at(1, "battlefield", ...lands(8)), at(0, "battlefield", ...lands(2))], {by: 1}), true,
  "played by Maya: Maya's own eight count for nothing, Rob's two are not eight");
eq([0, 1, 2, 3].map((n) => tapped("Few Lands", [at(1, "battlefield", ...lands(n))])), [true, false, false, true],
  "at most `max` (and at least one): none, tapped; one or two, untapped; three, tapped");

/* ---- unless you control a planeswalker ---- */
const ANNEX = "Fatehold Annex", WALKER = "Elspeth, Sun's Champion";
eq([tapped(ANNEX, []), tapped(ANNEX, [at(0, "battlefield", WALKER)]), tapped(ANNEX, [at(1, "battlefield", WALKER)])], [true, false, true],
  "no planeswalker: tapped; Rob's Elspeth: untapped; Maya's Elspeth is not Rob's");

for (const name of ["Turbulent Crater", "Turbulent Shore", "Turbulent Wetlands", "Turbulent Steppe", "Dedicated Commons", "Fatehold Annex",
  "Meticulous Commons", "Stingerquill Annex", "Theorix Annex"]) eq(index.resolve(name)?.playable, true, `${name} is defined and playable`);

console.log(`engine-opponents-lands: ${checks} checks passed -- unless the opponents control eight lands, all of them together, a land of the player's own or an opponent's creature no land of theirs; unless you control a planeswalker, yours alone.`);
