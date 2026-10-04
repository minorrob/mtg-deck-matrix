/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* ROB'S PRIORITY BATCH 10.3, THE TWENTY-FIFTH SLICE: WHAT ITS SCENARIOS CANNOT REACH.
 *
 * Eleven cards of Rob's list that the inventory never measured, and one thing they needed: a creature's toughness, as an
 * amount. Condemn's "its controller gains life equal to its toughness" is a fact about its target read once as it begins to
 * resolve (script/bind.mjs, `toughnessOf`), so it is still known after the creature has gone to the library (CR 608.2h);
 * the card scenario plays that. "Its own toughness" (`{toughnessOf: "self"}`, script/amount.mjs) is read from the object
 * on the battlefield, and from its last known information once it has left: this suite holds that, and the grammar.
 */
import assert from "node:assert/strict";
import {amountOf, amountProblems} from "../game/engine/script/amount.mjs";
import {factsOf} from "../game/engine/script/bind.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const FIX = {"Tall Bear": {types: ["Creature"], subtypes: ["Bear"], manaCost: "{2}{G}", colors: ["G"], power: 2, toughness: 4}};
const s = runScenario({name: "board", setup: [{seat: 0, zone: "battlefield", cards: ["Tall Bear"]}, {seat: 0, zone: "graveyard", cards: ["Tall Bear"]}], steps: []}, index.definition, FIX).state;
const [onBattlefield] = Object.values(s.objects).filter((o) => o.card === "Tall Bear" && o.zone === "battlefield");
const [inGraveyard] = Object.values(s.objects).filter((o) => o.card === "Tall Bear" && o.zone === "graveyard");

eq(amountOf(s, {toughnessOf: "self"}, {controller: 0, source: onBattlefield.id}), 4, "its own toughness, on the battlefield: 4 (its power is 2)");
eq(amountOf(s, {toughnessOf: "self"}, {controller: 0, source: inGraveyard.id, lastKnown: {toughness: 3}}), 3, "gone from the battlefield: as it last was");
eq(amountOf(s, {toughnessOf: "self"}, {controller: 0, source: null}), 0, "with no object, 0");
eq(factsOf(s, [{kind: "object", id: onBattlefield.id}]).map((f) => [f.powerOf, f.toughnessOf]), [[2, 4]], "a target's facts, read as it begins to resolve: its power and its toughness, each its own");
eq([amountProblems({toughnessOf: "self"}), amountProblems({toughnessOf: {target: 0}})], [[], []], "the grammar takes it, of itself or of a target");
for (const name of ["Last Gasp", "Yargle, Glutton of Urborg", "Illusionist's Stratagem", "Unsummon", "Deceiver Exarch", "Village Bell-Ringer", "Drift of Phantasms",
  "Final Parting", "Dark Petition", "Splinter Twin", "Condemn"]) ok(index.resolve(name)?.playable === true, `${name} is defined and playable`);

console.log(`engine-cards-pb25: ${checks} checks passed -- a creature's toughness as an amount, on the battlefield and as it last was, and as a target's fact.`);
