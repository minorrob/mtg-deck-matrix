/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* WHAT A PLAYER DID THIS TURN, COUNTED AND COMPARED (the plan's X5, D5 Shadrix Aristocrats; X5d).
 *
 * "If you gained 3 or more life this turn" (Indulging Patrician), "activate only if you created a token this turn" (Idol of
 * Oblivion), "activate only if an opponent controls more lands than you" (Weathered Wayfarer): a condition that counts and
 * compares (`compare`, script/condition.mjs; Forge's CheckSVar and SVarCompare), over amounts that read the turn's records
 * (script/amount.mjs: lifeGainedThisTurn, tokensCreatedThisTurn, mostAmongOpponents). Each player's life gained and tokens
 * made are kept as they happen -- every gain, lifelink's in combat included (effects/resources.mjs, rules/combat.mjs), every
 * token by its creator (effects/permanents.mjs, CR 111.2) -- and cleared as a turn begins (rules/turn.mjs).
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {conditionHolds, conditionProblems} from "../game/engine/script/condition.mjs";
import {legalActions} from "../game/engine/rules/actions.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {
  Leech: {types: ["Creature"], manaCost: "{1}{B}", colors: ["B"], power: 2, toughness: 2, keywords: ["Lifelink"]},
  "Big Heal": {types: ["Instant"], manaCost: "{W}", colors: ["W"], spell: {id: "s0", text: "You gain 3 life.", targets: [], effects: [{effect: "gainLife", amount: 3}]}},
  "Two Soldiers": {types: ["Sorcery"], manaCost: "{W}", colors: ["W"], spell: {id: "s0", text: "Create two 1/1 white Soldier creature tokens.", targets: [],
    effects: [{effect: "createToken", count: 2, token: {name: "Soldier", types: ["Creature"], subtypes: ["Soldier"], colors: ["W"], power: 1, toughness: 1}}]}},
};
const play = (name, setup, steps) => runScenario({name, setup, steps}, index.definition, FIX).state;

{
  /* Lifelink in combat is life gained: the Patrician's 1 and the Leech's 2 are 3 this turn. */
  const s = play("lifelink", [at(0, "battlefield", "Indulging Patrician", "Leech")],
    [{to: {turn: 3, phase: "MAIN1"}}, {attack: ["Indulging Patrician", "Leech"]}, {to: {turn: 3, phase: "END_OF_TURN"}}, {resolve: true}]);
  eq([s.players[0].life, s.players[1].life], [43, 34], "the Patrician and a Leech connect: Rob gains 3 through lifelink, and at his end step Maya loses 3 more (3 combat, 3 the trigger)");
}
{
  /* Cleared as a turn begins: 3 gained on turn 1 is nothing on turn 3. */
  const s = play("a new turn", [at(0, "battlefield", "Indulging Patrician", "Plains"), at(0, "hand", "Big Heal")],
    [{tap: "Plains"}, {cast: "Big Heal"}, {resolve: true}, {to: {turn: 1, phase: "END_OF_TURN"}}, {resolve: true}, {to: {turn: 3, phase: "END_OF_TURN"}}]);
  eq([s.players[1].life, s.players[0].gainedThisTurn ?? 0, s.stack.length], [37, 0, 0], "the 3 gained on turn 1 counted at turn 1's end step; by turn 3 it is gone, and nothing triggers");
}
{
  /* Another player's tokens are theirs: Maya makes two Soldiers, and Rob's Idol is still not his to use. */
  const s = play("Maya's tokens", [at(0, "battlefield", "Idol of Oblivion"), at(1, "battlefield", "Plains"), at(1, "hand", "Two Soldiers")],
    [{to: {turn: 2, phase: "MAIN1"}}, {tap: "Plains", seat: 1}, {cast: "Two Soldiers", seat: 1}, {resolve: true}, {pass: 1}]);
  eq([s.players[1].tokensThisTurn, s.priorityPlayer, legalActions(s, 0).filter((a) => a.kind === "activate" && a.label === "Idol of Oblivion").length], [2, 0, 0],
    "Maya created two tokens this turn, Rob none: holding priority on her turn, he is not offered the Idol's draw");
}
{
  /* "An opponent controls more lands than you": the most any one opponent has, three opponents. */
  const s = createState({matchId: "m", seed: "lands", players: ["Rob", "Maya", "Trey", "Sam"].map((name) => ({name}))});
  const lands = (seat, n) => { for (let i = 0; i < n; i += 1) addObject(s, {card: "Wastes", types: ["Land"], owner: seat, controller: seat}, "battlefield"); };
  lands(1, 1); lands(2, 4); lands(3, 2);
  const LANDS = {what: "permanent", types: ["Land"], controller: "you"};
  const more = {compare: {count: {mostAmongOpponents: LANDS}, moreThan: {count: LANDS}}};
  lands(0, 3);
  ok(conditionHolds(s, more, {controller: 0}), "Rob with 3 lands, Trey with 4 among his opponents: an opponent controls more lands than he does");
  lands(0, 1);
  ok(!conditionHolds(s, more, {controller: 0}), "with 4 of his own, none does -- Trey's 4 is not more");
  ok(!conditionHolds(s, {compare: {count: {lifeGainedThisTurn: "you"}, atLeast: 1}}, {controller: 0}) && conditionHolds(s, {compare: {count: {lifeGainedThisTurn: "you"}, atMost: 0}}, {controller: 0}),
    "nothing gained: at least 1 does not hold, at most 0 does");
  s.players[0].gainedThisTurn = 2;
  ok(!conditionHolds(s, {compare: {count: {lifeGainedThisTurn: "you"}, atMost: 1}}, {controller: 0}) && conditionHolds(s, {compare: {count: {lifeGainedThisTurn: "you"}, fewerThan: 3}}, {controller: 0}),
    "2 gained: at most 1 does not hold, fewer than 3 does");
}
{
  eq(conditionProblems({compare: {count: {lifeGainedThisTurn: "you"}, atLeast: 3}}), [], "the schema takes a counted comparison");
  ok(conditionProblems({compare: {count: {lifeGainedThisTurn: "you"}}}).some((p) => /against what/.test(p)), "and refuses one that compares against nothing");
  ok(conditionProblems({compare: {count: {lifeGainedThisTurn: "you"}, most: 3}}).some((p) => /no key "most"/.test(p)), "or has a key it does not know");
  ok(conditionProblems({compare: {count: {lifeGainedThisTurn: "everyone"}, atLeast: 1}}).some((p) => /"you" or "that player"/.test(p)), "or counts for a player it cannot name");
}
eq(missingFor({options: ["CheckSVar", "SVarCompare", "ConditionCheckSVar", "ConditionSVarCompare"], counts: ["LifeYouGainedThisTurn"]}), [],
  "the catalog credits a counted value and a counted comparison, in an ability's condition and an effect's, and life gained this turn");
for (const name of ["Idol of Oblivion", "Indulging Patrician", "Weathered Wayfarer"]) ok(index.resolve(name)?.playable === true, `${name} is defined and playable`);

console.log(`engine-turn-records: ${checks} checks passed -- life gained this turn (lifelink in combat too) and tokens made this turn, each player's, cleared as a turn begins; "an opponent controls more lands than you"; a condition that counts and compares.`);
