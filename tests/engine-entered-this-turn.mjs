/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* "THE NUMBER OF CREATURES THAT ENTERED THE BATTLEFIELD UNDER YOUR CONTROL THIS TURN" (Rob's Priority Batch 10.3, its
 * forty-third slice: Kinbinding, the 179th card of Rob's list, and Wary Farmer, the 184th).
 *
 * What entered the battlefield is kept for its controller as each arrival's events are read for triggers (rules/
 * trigger.mjs, recordArrivals) -- once, as "whenever a creature you control enters" reads it, and as it then is: under
 * the control an effect put it under. Each is kept as what it was, so one that has left since still counts, and the
 * record is cleared as a turn begins (rules/turn.mjs). `{permanentsEnteredThisTurn: "you", filter}` (script/amount.mjs)
 * counts what fits the filter, read as a last known snapshot is: "creatures", and "another creature" (not this one).
 *
 * The card scenarios play the cards. This suite holds the record: a land and a creature, each player's own, one put
 * onto the battlefield under its caster's control from an opponent's graveyard, one destroyed since, "another", the next
 * turn, and the schema.
 */
import assert from "node:assert/strict";
import {amountOf, amountProblems} from "../game/engine/script/amount.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const sorcery = (manaCost, colors, text, targets, effects) => ({types: ["Sorcery"], manaCost, colors, spell: {id: "s", text, targets, effects}});
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Doom: sorcery("{B}", ["B"], "Destroy target creature.", [{what: "permanent", types: ["Creature"]}], [{effect: "destroy", targets: {target: 0}}]),
  Exhume: sorcery("{B}", ["B"], "Put target creature card from a graveyard onto the battlefield under your control.", [{what: "card", zone: "graveyard", types: ["Creature"]}],
    [{effect: "moveZone", targets: {target: 0}, to: "battlefield", controller: "you"}]),
};
const play = (setup, steps = [], more = {}) => runScenario({name: "entered this turn", setup, steps, ...more}, index.definition, FIX).state;
const record = (s, seat) => (s.players[seat].enteredThisTurn ?? []).map((was) => [was.controller, ...was.types]);
const CREATURES = {permanentsEnteredThisTurn: "you", filter: {types: ["Creature"]}};
const count = (s, seat, amount, source = null) => amountOf(s, amount, {controller: seat, source});
const BEAR = [{tap: "Forest"}, {tap: "Forest"}, {cast: "Bear"}, {resolve: true}];

/* ---- what entered, and under whose control ---- */
{
  const s = play([at(0, "battlefield", "Forest", "Forest"), at(0, "hand", "Bear", "Plains")], [{play: "Plains"}, ...BEAR]);
  eq(record(s, 0), [[0, "Land"], [0, "Creature"]], "a land played and a creature cast: each kept for Rob, as what it was");
  eq([count(s, 0, {permanentsEnteredThisTurn: "you"}), count(s, 0, CREATURES), count(s, 1, CREATURES)], [2, 1, 0], "two permanents entered, one a creature, none for Maya");
  const bear = s.zones.battlefield.find((id) => s.objects[id].card === "Bear");
  const another = {permanentsEnteredThisTurn: "you", filter: {types: ["Creature"], another: true}};
  eq([count(s, 0, another, bear), count(s, 0, another, s.zones.battlefield[0])], [0, 1], "\"another creature\": not the one asking");
  const next = play([at(0, "battlefield", "Forest", "Forest"), at(0, "hand", "Bear")], [...BEAR, {to: {turn: 2, phase: "UPKEEP"}}]);
  eq([record(next, 0), count(next, 0, CREATURES)], [[], 0], "a turn begins: cleared");
}
{
  const s = play([at(1, "battlefield", "Forest", "Forest"), at(1, "hand", "Bear")], BEAR, {at: {turn: 2, phase: "MAIN1"}});
  eq([record(s, 1), record(s, 0)], [[[1, "Creature"]], []], "Maya's Bear on Maya's turn: kept for Maya, not Rob");
}
{
  const s = play([at(0, "battlefield", "Swamp"), at(0, "hand", "Exhume"), at(1, "graveyard", "Bear")], [{tap: "Swamp"}, {cast: "Exhume", targets: [{card: "Bear"}]}, {resolve: true}]);
  eq([s.objects[s.zones.battlefield.find((id) => s.objects[id].card === "Bear")]?.controller, record(s, 0), record(s, 1)], [0, [[0, "Creature"]], []],
    "Maya's Bear card put onto the battlefield under Rob's control: it entered under Rob's, not its owner's");
}
{
  const s = play([at(0, "battlefield", "Forest", "Forest", "Swamp"), at(0, "hand", "Bear", "Doom")], [...BEAR, {tap: "Swamp"}, {cast: "Doom", targets: [{card: "Bear"}]}, {resolve: true}]);
  eq([s.zones.battlefield.some((id) => s.objects[id].card === "Bear"), count(s, 0, CREATURES)], [false, 1], "the Bear destroyed since still entered this turn");
}

/* ---- the schema ---- */
eq(amountProblems(CREATURES), [], "a count of the creatures that entered under your control");
ok(amountProblems({permanentsEnteredThisTurn: "you", filter: {tapped: true}}).some((p) => p.includes("cannot use `tapped`")), "its filter is what a snapshot of what entered can answer");
ok(amountProblems({permanentsLeftThisTurn: "you", filter: {types: ["Creature"]}}).some((p) => p.includes("Only permanentsEnteredThisTurn takes a filter")), "and no other count takes one");
ok(amountProblems({permanentsEnteredThisTurn: "everyone"}).some((p) => p.includes("permanentsEnteredThisTurn is \"you\" or \"that player\"")), "whose: you, or that player");
for (const name of ["Kinbinding", "Wary Farmer"]) ok(index.resolve(name)?.playable === true, `${name} is defined and playable`);

console.log(`engine-entered-this-turn: ${checks} checks passed -- what entered the battlefield this turn, kept for the player it entered under the control of, as it was; "another"; cleared as a turn begins.`);
