/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "THE NUMBER OF OPPONENTS THAT WERE DEALT COMBAT DAMAGE THIS TURN" (Rob's Priority Batch 10.3, its twenty-ninth slice:
 * Tymna the Weaver, the 69th card of Rob's list).
 *
 * A turn record and a count. As combat damage reaches a player (rules/combat.mjs), the player is marked dealt combat damage
 * this turn -- infect or not, since it was dealt (CR 510.2, 702.90b) -- and the mark goes as a turn begins (rules/turn.mjs).
 * `{playersDealtCombatDamage: "opponent" | "any"}` counts the players still in the game who carry it (script/amount.mjs):
 * the controller's opponents, or anyone. Damage that is not combat damage is not counted.
 *
 * "You may pay X life" counts its X like any amount: `life` is one of the parameters an effect may count
 * (AMOUNT_PARAMS), and with X of 0 the question is "Pay 0 life" -- paying 0 life is paying life (CR 119.4b) -- not "{0}".
 *
 * The card scenarios play Tymna: one opponent hit, two of three, none, and a Shock that is not combat damage. This suite
 * holds the record and when it goes, the count's whose and who has left, the counted life, and the schema.
 */
import assert from "node:assert/strict";
import {amountOf, countEffect, amountProblems} from "../game/engine/script/amount.mjs";
import {compileScript} from "../game/engine/cards/index.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Blight: {types: ["Creature"], subtypes: ["Horror"], manaCost: "{1}{B}", colors: ["B"], power: 1, toughness: 1, keywords: ["Infect"]},
  Shock: {types: ["Instant"], manaCost: "{R}", colors: ["R"], spell: {id: "s", text: "Shock deals 2 damage to target player.", targets: [{what: "player"}],
    effects: [{effect: "dealDamage", amount: 2, who: {target: 0}}]}}};
const play = (setup, steps, more = {}) => runScenario({name: "combat damaged", setup, steps, ...more}, index.definition, FIX).state;
const marked = (s) => s.players.map((p) => p.combatDamagedThisTurn === true);
const count = (s, who, controller) => amountOf(s, {playersDealtCombatDamage: who}, {controller});

/* ---- the record ---- */
{
  const hit = play([at(0, "battlefield", "Bear")], [{attack: ["Bear"]}, {to: {turn: 1, phase: "MAIN2"}}]);
  eq(marked(hit), [false, true], "Rob's Bear hits Maya: Maya was dealt combat damage this turn, Rob was not");
  eq([count(hit, "opponent", 0), count(hit, "opponent", 1), count(hit, "any", 0), count(hit, "any", 1)], [1, 0, 1, 1],
    "one of Rob's opponents; none of Maya's; one player in all, and from Maya's side Maya counts when anyone does");
  const next = play([at(0, "battlefield", "Bear")], [{attack: ["Bear"]}, {to: {turn: 2, phase: "UPKEEP"}}]);
  eq([marked(next), count(next, "opponent", 0)], [[false, false], 0], "the next turn begins: the mark is gone");
}
{
  const infected = play([at(0, "battlefield", "Blight")], [{attack: ["Blight"]}, {to: {turn: 1, phase: "MAIN2"}}]);
  eq([infected.players[1].poison, infected.players[1].life, marked(infected)[1]], [1, 40, true], "an infect creature's combat damage is poison counters, and still combat damage dealt");
}
{
  const shocked = play([at(0, "battlefield", "Mountain"), at(0, "hand", "Shock")], [{tap: "Mountain"}, {cast: "Shock", targets: [{player: 1}]}, {resolve: true}]);
  eq([shocked.players[1].life, marked(shocked)], [38, [false, false]], "a Shock is damage, not combat damage: no mark");
}
{
  const three = play([at(0, "battlefield", "Bear", "Bear")], [{attack: ["Bear", "Bear"], at: ["Maya", "Trey"]}, {to: {turn: 1, phase: "MAIN2"}}], {seats: 3});
  eq(count(three, "opponent", 0), 2, "three seats: Rob's Bears hit Maya and Trey, two opponents");
  three.players[2].lost = true;
  eq(count(three, "opponent", 0), 1, "a player who has left the game is no opponent, and not counted");
}

/* ---- "you may pay X life" ---- */
{
  const hit = play([at(0, "battlefield", "Bear")], [{attack: ["Bear"]}, {to: {turn: 1, phase: "MAIN2"}}]);
  const X = {playersDealtCombatDamage: "opponent"};
  eq(countEffect(hit, {effect: "unlessPays", who: "you", life: X, ifPaid: true, effects: []}, {controller: 0}).life, 1, "the life an unlessPays asks is counted, as an amount is");
  eq(countEffect(hit, {effect: "unlessPays", who: "you", life: 3, ifPaid: true, effects: []}, {controller: 0}).life, 3, "a number stays a number");
}

/* ---- the schema ---- */
eq(amountProblems({playersDealtCombatDamage: "opponent"}), [], "an amount may count the opponents dealt combat damage");
ok(amountProblems({playersDealtCombatDamage: "you"}).length > 0, "whose: \"opponent\" or \"any\"");
{
  const script = {schema: "CrankCardScript@1", identity: {name: "Test", oracleId: "00000000-0000-4000-8000-000000000000", types: ["Enchantment"], manaCost: "{1}", colors: []},
    oracleText: "At the beginning of each of your postcombat main phases, you may pay X life. If you do, draw X cards.", source: "hand",
    abilities: [{kind: "triggered", text: "At the beginning of each of your postcombat main phases, you may pay X life. If you do, draw X cards.", trigger: {on: "step", step: "MAIN2"},
      effects: [{effect: "unlessPays", who: "you", life: {playersDealtCombatDamage: "opponent"}, ifPaid: true, effects: [{effect: "draw", count: {playersDealtCombatDamage: "opponent"}}]}]}]};
  eq(compileScript(script).problems, [], "a script says it: the life and the draw both counted");
  ok(compileScript({...script, abilities: [{...script.abilities[0], effects: [{...script.abilities[0].effects[0], life: {playersDealtCombatDamage: "nobody"}}]}]}).problems.length > 0,
    "and the schema reads the life's amount too");
}
ok(index.resolve("Tymna the Weaver")?.playable === true, "Tymna the Weaver is defined and playable");

console.log(`engine-combat-damaged: ${checks} checks passed -- players dealt combat damage this turn, infect included and noncombat damage not, cleared as a turn begins; counted for the controller's opponents or anyone, a player who has left not; "pay X life" counted, its schema read.`);
