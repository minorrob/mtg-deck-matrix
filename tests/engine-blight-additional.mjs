/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "AS AN ADDITIONAL COST TO CAST THIS SPELL, YOU MAY BLIGHT 1" (Rob's Priority Batch 10.3, its thirty-ninth slice:
 * Burning Curiosity, the 198th card of Rob's list, and Cinder Strike, the 506th).
 *
 * A spell's `additionalCost` may be `{atom: "blight", count}` (rules/actions.mjs, additionalChoices): the -1/-1 counters
 * on a creature of the caster's, chosen as it is cast, one offer each (CR 601.2b, 701.68a) -- and `optional: true`, "you
 * may", the offer that pays nothing as well. The counters are put as the rest of the cost is paid (CR 601.2h). What it
 * was cast with says whether it was paid (`cast.additionalPaid`), for "if this spell's additional cost was paid"
 * (script/condition.mjs).
 *
 * The card scenarios play the cards. This suite holds the offers, the payment, the condition and the compiler.
 */
import assert from "node:assert/strict";
import {legalActions, applyAction} from "../game/engine/rules/actions.mjs";
import {conditionHolds, conditionProblems} from "../game/engine/script/condition.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const toll = (additionalCost) => ({types: ["Sorcery"], manaCost: "{B}", colors: ["B"], spell: {id: "s", text: "As an additional cost to cast this spell, blight 1.\nDraw a card.",
  targets: [], additionalCost, effects: [{effect: "draw", count: 1}]}});
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  /* "As an additional cost to cast this spell, blight 1. Draw a card." -- a cost that must be paid. */
  Toll: toll([{atom: "blight", count: 1}]),
  /* "... you may blight 1. Draw a card." */
  "Toll of Choice": toll([{atom: "blight", count: 1, optional: true}]),
};
const run = (setup, steps = []) => runScenario({name: "blight", setup, steps}, index.definition, FIX).state;
const casts = (s, card) => legalActions(s, 0).filter((a) => a.kind === "cast" && a.label === card);
const idOf = (s, card) => s.zones.battlefield.find((x) => s.objects[x].card === card);

/* ---- the offers ---- */
{
  const s = run([at(0, "battlefield", "Swamp", "Bear", "Bear"), at(0, "hand", "Toll", "Toll of Choice")], [{tap: "Swamp"}]);
  eq(casts(s, "Toll").map((a) => a.costNames), [["Bear"], ["Bear"]], "a blight that must be paid: one offer for each of Rob's Bears");
  eq(casts(s, "Toll of Choice").map((a) => a.costNames), [[], ["Bear"], ["Bear"]], "\"you may\": the offer that pays nothing first, then one for each Bear");
  const none = run([at(0, "battlefield", "Swamp"), at(0, "hand", "Toll", "Toll of Choice")], [{tap: "Swamp"}]);
  eq([casts(none, "Toll").length, casts(none, "Toll of Choice").length], [0, 1], "no creature: the Toll can't be cast; Toll of Choice only without paying");
}

/* ---- the payment, and what the spell knows ---- */
{
  const s = run([at(0, "battlefield", "Swamp", "Bear"), at(0, "hand", "Toll of Choice")], [{tap: "Swamp"}]);
  applyAction(s, 0, casts(s, "Toll of Choice").find((a) => a.costNames.includes("Bear")));
  eq([s.objects[idOf(s, "Bear")].counters["-1/-1"], s.stack.at(-1).cast.additionalPaid], [1, true], "paid: the Bear's counter as it is cast, and the spell knows it was paid");
  const t = run([at(0, "battlefield", "Swamp", "Bear"), at(0, "hand", "Toll of Choice")], [{tap: "Swamp"}]);
  applyAction(t, 0, casts(t, "Toll of Choice").find((a) => a.costNames.length === 0));
  eq([t.objects[idOf(t, "Bear")].counters["-1/-1"] ?? 0, t.stack.at(-1).cast.additionalPaid ?? false], [0, false], "not paid: no counter, and the spell knows that too");
}

/* ---- the condition ---- */
eq([conditionHolds(null, {cast: {additionalPaid: true}}, {controller: 0, cast: {from: "hand", additionalPaid: true}}),
  conditionHolds(null, {cast: {additionalPaid: true}}, {controller: 0, cast: {from: "hand"}})], [true, false], "\"if this spell's additional cost was paid\": as it was cast");
eq([conditionProblems({cast: {additionalPaid: true}}), conditionProblems({cast: {additionalPaid: false}}).length], [[], 1], "the schema: additionalPaid is true");

/* ---- the compiler ---- */
const spell = (additionalCost) => compileScript({schema: "CrankCardScript@1", identity: {name: "Odd Toll", oracleId: "x", types: ["Sorcery"], subtypes: [], manaCost: "{B}", colors: ["B"], colorIdentity: ["B"]},
  oracleText: "Draw a card.", source: "hand", abilities: [{kind: "spell", text: "Draw a card.", additionalCost, targets: [], effects: [{effect: "draw", count: 1}]}]}).problems.length;
eq([spell([{atom: "blight", count: 1}]), spell([{atom: "blight", count: 2, optional: true}]), spell([{atom: "blight", count: 0}]), spell([{atom: "discard", optional: true}])], [0, 0, 1, 1],
  "read: blight 1, \"you may\" blight 2; refused: blight 0, an optional discard (not built)");

for (const name of ["Cinder Strike", "Burning Curiosity"]) ok(index.resolve(name)?.playable === true, `${name} is defined and playable`);

console.log(`engine-blight-additional: ${checks} checks passed -- blight as a spell's additional cost: one offer for each creature of the caster's, "you may" the offer that pays nothing too; paid as it is cast; "if this spell's additional cost was paid" read as it was cast.`);
