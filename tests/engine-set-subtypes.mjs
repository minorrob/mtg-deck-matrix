/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "ENCHANTED PERMANENT IS A COLORLESS FOREST LAND" (Song of the Dryads; the live-game plan of 2026-10-04, lane W6).
 *
 * Subtypes through the layers (rules/layers.mjs): derived from the printed ones, set in layer 4 (`setSubtypes`, every other
 * subtype lost, a changeling's every creature type too -- CR 205.1b), read by what asks a permanent's subtypes now: a
 * selector (script/filter.mjs), a static's `affects`, last known information. Song's three statics: the types and
 * subtypes set (4), colorless (5), and its abilities lost for "{T}: Add {G}" (6; CR 305.7).
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {typesOf, subtypesOf, colorsOf, everyCreatureTypeOf, lastKnown} from "../game/engine/rules/layers.mjs";
import {matchesSelector} from "../game/engine/script/filter.mjs";
import {amountOf} from "../game/engine/script/amount.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const SD = "Song of the Dryads";
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {"Big Bear": {types: ["Creature"], subtypes: ["Bear"], manaCost: "{3}{G}{G}", colors: ["G"], power: 5, toughness: 5, keywords: ["Changeling"]}};
const LANDS = ["Forest", "Wastes", "Wastes"];
const song = (target, seat = 1) => runScenario({name: "set subtypes", setup: [at(0, "battlefield", ...LANDS), at(0, "hand", SD), at(seat, "battlefield", target)],
  steps: [...LANDS.map((l) => ({tap: l})), {cast: SD, targets: [{card: target}]}, {resolve: true}]}, index.definition, FIX).state;
const idOf = (s, card) => s.zones.battlefield.find((id) => s.objects[id].card === card);

{
  const s = song("Big Bear");
  const bear = idOf(s, "Big Bear");
  eq([typesOf(s, bear), subtypesOf(s, bear), colorsOf(s, bear), everyCreatureTypeOf(s, bear)], [["Land"], ["Forest"], [], false],
    "a changeling Big Bear: a colorless Forest land, no creature type at all");
  eq([matchesSelector({what: "permanent", subtypes: ["Forest"]}, s, bear, {controller: 1}), matchesSelector({what: "permanent", subtypes: ["Bear"]}, s, bear, {controller: 1})], [true, false],
    "a selector asks its subtypes now: a Forest, no longer a Bear");
  eq(amountOf(s, {count: {types: ["Land"], subtypes: ["Forest"], controller: "you"}}, {controller: 1}), 1, "counted among Maya's Forests");
  eq(lastKnown(s, bear).subtypes, ["Forest"], "and as it last was, a Forest");
  const {runEffect} = await import("../game/engine/script/effects/index.mjs");
  const {keywordsOf} = await import("../game/engine/rules/layers.mjs");
  runEffect(s, {effect: "effectUntil", layer: 6, affects: {what: "permanent", subtypes: ["Forest"]}, apply: {addKeywords: ["Hexproof"]}}, {controller: 1});
  eq(keywordsOf(s, bear).includes("Hexproof"), true, "a static over Forests, in layer 6, reaches it");
}
{
  const s = song("Forest", 0);
  const forests = s.zones.battlefield.filter((id) => s.objects[id].card === "Forest");
  eq(forests.map((id) => subtypesOf(s, id)), [["Forest"], ["Forest"]], "a printed Forest's subtypes, as printed");
}

console.log(`engine-set-subtypes: ${checks} checks passed -- subtypes set in layer 4 and read as they now are; Song of the Dryads's colorless Forest land.`);
