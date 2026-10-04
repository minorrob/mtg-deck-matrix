/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* THE MANA SPENT TO CAST IT (Rob's Priority Batch 10.3, its twenty-first slice: Wistfulness and Emptiness).
 *
 * "When this creature enters, if {G}{G} was spent to cast it, ..." (Wistfulness), and adamant's "if at least three red
 * mana was spent to cast this spell": the mana paid for a spell, by color, is a fact of the object it is (CR 601.2h). The
 * cast records it on the spell (rules/actions.mjs) -- what the pool paid, tax and all; a creature that convoked it paid no
 * mana (CR 702.51a) -- and the permanent it becomes keeps it (rules/stack.mjs). A copy is not cast (CR 707.10), and a card
 * put onto the battlefield was never cast: neither has any. The condition (script/condition.mjs, `spent`) reads its own
 * object; a trigger remembers it as it triggers (rules/trigger.mjs), so that when its "if" is asked again as it resolves
 * (CR 603.4) and the permanent is gone -- an evoked Wistfulness sacrificed first -- it is read as it last was (CR 608.2h).
 *
 * The card scenarios play the cards: both of each card's triggers, either one, neither (evoked for one mana of each
 * color), the sacrifice resolved first, and Emptiness returned from a graveyard without being cast. This suite holds the
 * record itself, convoke's creatures, the trigger's memory, a spell's own adamant, the grammar, and the catalog.
 */
import assert from "node:assert/strict";
import {conditionProblems, conditionHolds} from "../game/engine/script/condition.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const DAMAGE = {effect: "dealDamage", amount: 2, targets: {target: 0}, who: {target: 0}};
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Wolf: {types: ["Creature"], subtypes: ["Wolf"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Elk: {types: ["Creature"], subtypes: ["Elk"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  /* Adamant, on a spell: its own condition reads the spell. */
  "Adamant Shock": {types: ["Instant"], manaCost: "{1}{R}{R}", colors: ["R"], spell: {id: "s0", text: "Adamant Shock deals 2 damage to target player. If at least three red mana was spent to cast this spell, it deals 2 more.",
    targets: [{what: "player"}], effects: [DAMAGE, {effect: "branch", if: {spent: {R: 3}}, then: [DAMAGE]}]}},
};
const play = (name, setup, steps, more = {}) => runScenario({name, setup, steps, ...more}, index.definition, FIX).state;
const named = (s, card, zone) => Object.values(s.objects).filter((o) => o.card === card && o.zone === zone);
const tapAll = (names) => names.map((n) => ({tap: n}));

/* ---- the record ---- */
{
  const lands = ["Forest", "Forest", "Island", "Island", "Wastes"];
  const s = play("cast", [at(0, "battlefield", ...lands), at(0, "hand", "Wistfulness")], [...tapAll(lands), {cast: "Wistfulness", evoke: false}]);
  const [spell] = named(s, "Wistfulness", "stack");
  eq(spell.spent, {G: 2, U: 2, C: 1}, "cast for {3}{G/U}{G/U} from {G}{G}{U}{U}{C}: all of it spent, by color, the generic's too");
  const t = play("resolved", [at(0, "battlefield", ...lands), at(0, "hand", "Wistfulness")], [...tapAll(lands), {cast: "Wistfulness", evoke: false}, {resolve: true}]);
  const [permanent] = named(t, "Wistfulness", "battlefield");
  eq(permanent.spent, {G: 2, U: 2, C: 1}, "the permanent it becomes keeps it");
  eq([...(t.pendingTriggers ?? []), ...t.stack].map((e) => e.spent), [{G: 2, U: 2, C: 1}, {G: 2, U: 2, C: 1}], "and each trigger remembers it as it triggers");
}
{
  const s = play("evoked, both resolved", [at(0, "battlefield", "Forest", "Forest"), at(0, "hand", "Wistfulness")],
    [{tap: "Forest"}, {tap: "Forest"}, {cast: "Wistfulness", evoke: true}, {resolve: true}, {answer: [0, 1]}, {settle: true}]);
  eq(named(s, "Wistfulness", "graveyard").map((o) => o.spent), [undefined], "sacrificed, the card in the graveyard is a new object (CR 400.7) and was never cast");
}
{
  /* Convoke (CR 702.51a): "tap an untapped creature ... rather than pay that mana" -- the creatures spend nothing. */
  const s = play("convoked", [at(0, "battlefield", "Island", "Island", "Bear", "Wolf", "Elk"), at(0, "hand", "Merrow Skyswimmer")],
    [{tap: "Island"}, {tap: "Island"}, {cast: "Merrow Skyswimmer", convoke: true}, {choose: ["Bear", "Wolf", "Elk"]}]);
  eq(named(s, "Merrow Skyswimmer", "stack")[0].spent, {U: 2}, "two Islands and three green creatures convoking: {U}{U} was spent, no green mana");
}

/* ---- adamant on a spell: its own condition reads the spell ---- */
{
  const red = play("{R}{R}{R}", [at(0, "battlefield", "Mountain", "Mountain", "Mountain"), at(0, "hand", "Adamant Shock")],
    [...tapAll(["Mountain", "Mountain", "Mountain"]), {cast: "Adamant Shock", targets: [{player: 1}]}, {resolve: true}]);
  const two = play("{R}{R}{C}", [at(0, "battlefield", "Mountain", "Mountain", "Wastes"), at(0, "hand", "Adamant Shock")],
    [...tapAll(["Mountain", "Mountain", "Wastes"]), {cast: "Adamant Shock", targets: [{player: 1}]}, {resolve: true}]);
  eq([red.players[1].life, two.players[1].life], [36, 38], "three red mana spent: 4 damage; two red and a colorless: 2");
}

/* ---- the condition, and its memory ---- */
{
  const lands = ["Forest", "Forest", "Island", "Island", "Wastes"];
  const s = play("read", [at(0, "battlefield", ...lands), at(0, "hand", "Wistfulness")], [...tapAll(lands), {cast: "Wistfulness", evoke: false}, {resolve: true}]);
  const id = named(s, "Wistfulness", "battlefield")[0].id;
  const holds = (spent, more = {}) => conditionHolds(s, {spent}, {controller: 0, source: id, ...more});
  eq([holds({G: 2}), holds({G: 2, U: 2}), holds({C: 1}), holds({G: 3}), holds({W: 1}), holds({U: 2, R: 1})], [true, true, true, false, false, false],
    "{G}{G}, {G}{G}{U}{U}, {C}: spent; {G}{G}{G}, {W}, {U}{U}{R}: not");
  eq([holds({G: 1}), holds({U: 1, C: 1})], [true, true], "at least that much, not exactly: {G} was spent when {G}{G} was");
  eq([conditionHolds(s, {spent: {G: 2}}, {controller: 0, source: null, spent: {G: 2}}), conditionHolds(s, {spent: {G: 2}}, {controller: 0, source: null}),
    conditionHolds(s, {spent: {G: 2}}, {controller: 0, source: 999999, spent: {G: 2}})], [true, false, true],
    "with its object gone: what the trigger remembered, or nothing spent");
}
{
  for (const good of [{G: 2}, {W: 1, B: 1}, {C: 3}, {R: 3}]) eq(conditionProblems({spent: good}), [], `the condition may ask ${JSON.stringify(good)}`);
  for (const bad of [{}, {X: 1}, {G: 0}, {G: 1.5}, {g: 2}, 2, [], null, "GG"]) ok(conditionProblems({spent: bad}).length > 0, `and refuses ${JSON.stringify(bad)}`);
}

eq(missingFor({counts: ["Adamant"]}), [], "the catalog credits adamant: mana of a color spent to cast it");
for (const name of ["Wistfulness", "Emptiness"]) ok(index.resolve(name)?.playable === true, `${name} is defined and playable`);

console.log(`engine-mana-spent: ${checks} checks passed -- the mana spent to cast a spell recorded by color, kept by its permanent and remembered by its triggers; convoke's creatures spend none, nor a card never cast; adamant on a spell; the grammar.`);
