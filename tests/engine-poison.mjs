/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 64 (THE CATALOG'S ORDER): POISON COUNTERS (CR 122.1f; Forge's Poison) AND "CAN'T BE COUNTERED" (Forge's
 * Counter replacement).
 *
 * Poison counters go on each player an effect names -- as many as it says, reported as the board knows them -- and ten
 * lose the game (CR 704.5c). "Spells can't be countered" reaches everyone's spells; "each instant and sorcery card in your
 * graveyard has flashback" is a permanent's, its owner's cards only. And the greatest toughness, and a target's power.
 */
import assert from "node:assert/strict";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {amountOf} from "../game/engine/script/amount.mjs";
import {checkStateBasedActions} from "../game/engine/rules/sba.mjs";
import {flashbackCost} from "../game/engine/rules/actions.mjs";
import {cantBeCountered} from "../game/engine/rules/statics.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const card = (name) => ({...cards.definition(name), card: name});
const table = (seats = 2) => createState({matchId: "m", seed: "poison", players: Array.from({length: seats}, (_, i) => ({name: `P${i}`}))});
const put = (s, o, seat, zone = "battlefield") => addObject(s, {...o, owner: seat, controller: seat}, zone, ["battlefield", "stack", "exile"].includes(zone) ? null : seat);

{
  /* Each opponent, two each, in a three-player game -- not him -- each reported. */
  const s = table(3);
  const events = runEffects(s, [{effect: "poison", who: "opponent", count: 2}], {controller: 0, source: null});
  eq([s.players.map((p) => p.poison), events.map((e) => [e.kind, e.data.fields.receiver.playerId, e.data.fields.oldValue, e.data.fields.amount])],
    [[0, 2, 2], [["GameEventPlayerPoisoned", 1, 0, 2], ["GameEventPlayerPoisoned", 2, 0, 2]]], "two on each opponent, reported; none on him");
  eq(runEffects(s, [{effect: "poison", who: "opponent", count: 0}], {controller: 0, source: null}).length, 0, "none at all: nothing reported");
  /* Ten loses the game. */
  s.players[1].poison = 9;
  runEffects(s, [{effect: "poison", who: [1], count: 1}], {controller: 0, source: null});
  checkStateBasedActions(s);
  eq([s.players[1].lost, s.players[1].lostTo], [true, "poison"], "ten poison counters: lost");
}
{
  /* The greatest toughness among his creatures; a target's power. */
  const s = table();
  put(s, {card: "Wall", types: ["Creature"], power: 0, toughness: 5}, 0); put(s, {card: "Ogre", types: ["Creature"], power: 3, toughness: 3}, 0); put(s, {card: "Giant", types: ["Creature"], power: 7, toughness: 7}, 1);
  const ogre = s.zones.battlefield.find((id) => s.objects[id].card === "Ogre");
  eq([amountOf(s, {greatestToughness: {what: "permanent", types: ["Creature"], controller: "you"}}, {controller: 0, source: null}),
    amountOf(s, {powerOf: {target: 0}}, {controller: 0, source: null, targets: [{kind: "object", id: ogre}]})], [5, 3], "his greatest toughness 5 (not Maya's 7); the targeted Ogre's power 3");
}
{
  /* Lier (his): his instant in his graveyard has flashback for its mana cost; his creature card does not; Maya's instant
     does not. Spells can't be countered -- Maya's too. */
  const s = table();
  put(s, card("Lier, Disciple of the Drowned"), 0);
  const instant = put(s, {card: "Charm", types: ["Instant"], manaCost: "{1}{U}"}, 0, "graveyard"), bear = put(s, {card: "Bear", types: ["Creature"], manaCost: "{1}{G}"}, 0, "graveyard");
  const hers = put(s, {card: "Bolt", types: ["Instant"], manaCost: "{R}"}, 1, "graveyard");
  eq([flashbackCost(s, 0, instant)?.mana, flashbackCost(s, 0, bear), flashbackCost(s, 1, hers)], ["{1}{U}", null, null], "his instant {1}{U}; not his creature, not Maya's instant");
  const spell = put(s, {card: "Ritual", types: ["Sorcery"]}, 1, "stack");
  eq(cantBeCountered(s, spell), true, "Maya's spell can't be countered either");
  eq([missingFor({apis: ["Poison"]}), missingFor({replacements: ["Counter"]})], [[], []], "the catalog credits Poison and the Counter replacement");
}

console.log(`engine-poison: ${checks} checks passed — poison on each player named, reported; ten lose; spells can't be countered, everyone's; a graveyard's flashback from a permanent, its owner's cards only; the greatest toughness; a target's power.`);
