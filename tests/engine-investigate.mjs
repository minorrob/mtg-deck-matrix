/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* INVESTIGATE (Rob's Priority Batch 10.3, its twenty-second slice: Wavesifter, Fateful Absence).
 *
 * "Investigate" means "create a Clue token" (CR 701.16a), and a Clue is "a colorless Clue artifact token with '{2},
 * Sacrifice this token: Draw a card'" (CR 111.10f) -- the engine's predefined Clue (effects/permanents.mjs). The effect
 * is createToken's, with the Clue: "investigate twice" is `count: 2`, and "its controller investigates" (Fateful Absence)
 * names whose Clue it is as a token's controller is named, `{controllerOf: {target: 0}}`, read once as the spell begins
 * to resolve, so the controller of a creature it has just destroyed is still known (CR 608.2h).
 *
 * The card scenarios play the cards (Wavesifter, Fateful Absence, Tireless Tracker, Confirm Suspicions, Trail of
 * Evidence, Tamiyo's Journal). This suite holds the Clue itself, the count, whose it is, and the catalog.
 */
import assert from "node:assert/strict";
import {runEffect, isBuilt} from "../game/engine/script/effects/index.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {legalActions} from "../game/engine/rules/actions.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const play = (name, setup, steps) => runScenario({name, setup, steps}, index.definition, {}).state;
const clues = (s) => Object.values(s.objects).filter((o) => o.zone === "battlefield" && o.card === "Clue");

{
  const s = play("empty", [], []);
  const events = runEffect(s, {effect: "investigate"}, {controller: 0, source: null});
  const [clue] = clues(s);
  eq([clues(s).length, clue.controller, clue.owner, clue.token, clue.types, clue.subtypes, clue.colors ?? []], [1, 0, 0, true, ["Artifact"], ["Clue"], []],
    "investigate: one Clue token, its controller's -- a colorless Clue artifact (CR 111.10f)");
  eq(clue.abilities.map((a) => [a.kind, a.text, a.cost, a.effects]),
    [["activated", "{2}, Sacrifice this artifact: Draw a card.", [{atom: "mana", cost: "{2}"}, {atom: "sacrifice", self: true}], [{effect: "draw", count: 1}]]],
    "with \"{2}, Sacrifice this artifact: Draw a card.\"");
  eq(events.filter((e) => e.kind === "GameEventCardChangeZone").map((e) => e.data.fields.createdAsToken), [true], "and it is created, as a token is (for what watches tokens made)");
  runEffect(s, {effect: "investigate", count: 2}, {controller: 0, source: null});
  eq(clues(s).length, 3, "investigate twice: two more");
  runEffect(s, {effect: "investigate", controller: 1}, {controller: 0, source: null});
  eq(clues(s).map((o) => o.controller).sort(), [0, 0, 0, 1], "and one under another player's control, when the effect names them");
}
{
  /* The Clue's ability, with {2} to pay: offered; without, not. */
  const s = play("crack", [at(0, "battlefield", "Wastes", "Wastes")], [{tap: "Wastes"}, {tap: "Wastes"}]);
  runEffect(s, {effect: "investigate"}, {controller: 0, source: null});
  eq(legalActions(s, 0).filter((a) => a.kind === "activate" && a.label === "Clue").length, 1, "{2} in the pool: the Clue may be cracked");
}

ok(isBuilt("investigate"), "investigate is an effect the engine performs");
eq(missingFor({apis: ["Investigate"]}), [], "and the catalog credits it");
for (const name of ["Wavesifter", "Fateful Absence", "Tireless Tracker", "Confirm Suspicions", "Trail of Evidence", "Tamiyo's Journal"])
  ok(index.resolve(name)?.playable === true, `${name} is defined and playable`);

console.log(`engine-investigate: ${checks} checks passed -- investigate makes a Clue token, its controller's or the named player's, as many as it says; the Clue cracked for {2}.`);
