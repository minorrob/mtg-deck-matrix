/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.

   THE VIEW SAYS WHAT A PERMANENT LOOKS LIKE WHEN IT IS NOT ITS CARD (ROB-329, Rob's playtest of 2026-10-30; the contract is
   docs/ui-lane/view-appearance-contract.md; game/engine/projection.mjs and rules/layers.mjs `lookOf`).

   Rob used Oko, Thief of Crowns to turn an artifact into a 3/3 green Elk: the board showed 3/3, the picture stayed the artifact's.
   The view carried a name and no word for the new look. It now carries `appearance: {token, colors, subtypes, power, toughness}`.

     1. Oko's +1 on an artifact: `appearance` says Elk, green, 3/3, to every seat; the name is still the artifact's.
     2. Oko's +1 on a creature: the same.
     3. The effect ends (an until-end-of-turn version of it, the turn over): the key is gone, the name never changed.
     4. An ordinary card, a Food token, and a permanent that was only made a creature (it kept its abilities) carry none: a look
        needs creature types set AND all abilities lost. A card in the hand carries none, and a permanent that left the
        battlefield and came back is a new object with none.

     node tests/room-view-appearance.mjs
*/
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {advance, resolveAwaiting} from "../game/engine/rules/turn.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";

let checks = 0;
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const index = loadCardIndex();
const FIX = {
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2},
  Rock: {types: ["Artifact"], subtypes: [], manaCost: "{1}", colors: [], power: null, toughness: null},
};
const oko = (target) => runScenario({name: `Oko +1 on ${target}`, setup: [{seat: 0, zone: "battlefield", cards: ["Oko, Thief of Crowns", target]}],
  steps: [{activate: "Oko, Thief of Crowns", ability: "a1", targets: [{card: target}]}, {resolve: true}], expect: []}, index.definition, FIX).state;
const board = (state, viewer) => projectFor(state, viewer).players[0].zones.Battlefield.cards;
const card = (state, viewer, name) => board(state, viewer).find((c) => c.name === name);
const idOf = (state, name) => state.zones.battlefield.find((id) => state.objects[id].card === name);
const ELK = {token: "Elk", colors: ["G"], subtypes: ["Elk"], power: 3, toughness: 3};

for (const target of ["Rock", "Bear"]) {
  const s = oko(target);
  for (const viewer of [0, 1]) {
    const c = card(s, viewer, target);
    eq(c.appearance, ELK, `Oko's +1 on ${target}: seat ${viewer} is told it looks like a 3/3 green Elk`);
    eq([c.name, c.types.includes("Creature"), c.power, c.toughness], [target, true, 3, 3], `${target} keeps its own name and its current 3/3`);
  }
  eq(card(s, 0, "Oko, Thief of Crowns").appearance, undefined, "Oko himself looks like his card");
}

/* The effect ends: the same effect, until end of turn, and the turn over. */
{
  const s = runScenario({name: "temporary", setup: [{seat: 0, zone: "battlefield", cards: ["Rock"]}], steps: [], expect: []}, index.definition, FIX).state;
  const rock = idOf(s, "Rock");
  const layer = (n, apply) => runEffect(s, {effect: "effectUntil", layer: n, targets: [rock], apply, until: "end-of-turn"}, {controller: 0});
  eq(card(s, 1, "Rock").appearance, undefined, "before: a Rock looks like a Rock");
  layer(4, {addTypes: ["Creature"], setCreatureTypes: ["Elk"]});
  eq(card(s, 1, "Rock").appearance, undefined, "creature types set but its abilities kept: still its card");
  layer(5, {setColors: ["G"]}); layer(6, {removeAllAbilities: true}); layer(7, {setPower: 3, setToughness: 3});
  eq(card(s, 1, "Rock").appearance?.token, "Elk", "with its abilities lost too: an Elk");
  for (let n = 0; n < 200 && s.turn < 2; n += 1) { if (s.awaiting?.kind === "declare-attackers") { resolveAwaiting(s, []); continue; } if (s.awaiting) break; if (s.priorityPlayer === null) advance(s); else if (passPriority(s, null).outcome === "step-ends") advance(s); }
  eq(card(s, 1, "Rock").appearance, undefined, "the turn over, the effect gone: the key is gone with it");
  eq(card(s, 1, "Rock").types.includes("Creature"), false, "and it is a plain artifact again");
}

/* Ordinary cards. */
{
  const s = runScenario({name: "plain", setup: [{seat: 0, zone: "battlefield", cards: ["Bear", "Rock", "Oko, Thief of Crowns"]}, {seat: 0, zone: "hand", cards: ["Bear"]}],
    steps: [{activate: "Oko, Thief of Crowns", ability: "a0"}, {resolve: true}], expect: []}, index.definition, FIX).state;
  eq(board(s, 1).length >= 4 && board(s, 1).every((c) => !("appearance" in c)), true, "a Bear, a Rock, Oko and a freshly made Food token: none looks like anything else");
  eq(projectFor(s, 0).players[0].zones.Hand.cards.every((c) => !("appearance" in c)), true, "a card in the hand carries none");
}

/* Leaving the battlefield: the Elk is gone with the object. */
{
  const s = oko("Rock");
  runEffect(s, {effect: "moveZone", targets: [idOf(s, "Rock")], to: "hand"}, {controller: 0});
  eq(card(s, 1, "Rock"), undefined, "bounced: no longer on the battlefield");
  const inHand = projectFor(s, 0).players[0].zones.Hand.cards.find((c) => c.name === "Rock");
  eq([inHand !== undefined, inHand && "appearance" in inHand], [true, false], "in the hand it is a Rock and says nothing");
}

console.log(`room-view-appearance: ${checks} checks passed -- a permanent Oko made an Elk says so to every seat while the effect holds, and nothing else carries an appearance.`);
