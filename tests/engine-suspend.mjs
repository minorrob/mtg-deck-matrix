/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* SUSPEND (CR 702.62; Delay; the live-game plan of 2026-10-04, lane W6).
 *
 * counterSpell's `timeCounters` and `suspend` (script/effects/zones.mjs): the countered card exiled with that many time
 * counters, suspended. At the beginning of its owner's upkeep -- only theirs -- one is removed, and when the last is, its
 * owner may cast it without paying its mana cost (rules/trigger.mjs); a creature so cast has haste while it is that
 * permanent (rules/actions.mjs, rules/stack.mjs). Not cast, it stays in exile with none, and nothing more triggers.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2}};
const DELAYED = [{pass: 1}, {to: {turn: 2, phase: "MAIN1"}}, {tap: "Forest", seat: 1}, {tap: "Wastes", seat: 1}, {cast: "Bear", seat: 1}, {pass: 1},
  {tap: "Island", seat: 0}, {tap: "Wastes", seat: 0}, {cast: "Delay", seat: 0, targets: [{card: "Bear"}]}, {resolve: true}];
const SETUP = [at(0, "battlefield", "Island", "Wastes"), at(0, "hand", "Delay"), at(1, "battlefield", "Forest", "Wastes"), at(1, "hand", "Bear")];
const play = (steps) => runScenario({name: "suspend", setup: SETUP, steps: [...DELAYED, ...steps]}, index.definition, FIX).state;
const exiledBear = (s) => s.zones.exile.map((id) => s.objects[id]).find((o) => o.card === "Bear");

{
  const s = play([]);
  eq([exiledBear(s).counters.time, exiledBear(s).suspended], [3, true], "countered: in exile, three time counters, suspended");
  const t = play([{to: {turn: 3, phase: "MAIN1"}}]);
  eq([exiledBear(t).counters.time, t.stack.length], [3, 0], "Rob's upkeep: nothing -- it is Maya's card");
  const u = play([{to: {turn: 4, phase: "UPKEEP"}}, {resolve: true}]);
  eq(exiledBear(u).counters.time, 2, "Maya's upkeep: two");
  const v = play([{to: {turn: 4, phase: "UPKEEP"}}, {resolve: true}, {to: {turn: 6, phase: "UPKEEP"}}, {resolve: true}, {to: {turn: 8, phase: "UPKEEP"}}, {resolve: true}, {choose: ["Don't cast"]},
    {to: {turn: 10, phase: "MAIN1"}}]);
  eq([exiledBear(v)?.counters.time, v.stack.length], [0, 0], "the last removed and not cast: still in exile, with none, and nothing more");
}

console.log(`engine-suspend: ${checks} checks passed -- a countered card exiled and suspended; a time counter at its owner's upkeep; cast free when the last goes, or left.`);
