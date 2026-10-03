/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 54 (THE CATALOG'S ORDER): NINJUTSU (CR 702.49a).
 *
 * "{cost}, Return an unblocked attacking creature you control to its owner's hand: Put this card onto the battlefield from
 * your hand tapped and attacking." An ability of the card in hand, offered once blockers are declared, one offer per
 * unblocked attacker; the Ninja attacks whom the returned creature attacked, and was never declared an attacker, so
 * nothing that watches attacks sees it (CR 508.4). And a trigger's target may be described by what the trigger is about:
 * "target creature that player controls".
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {createState, addObject} from "../game/engine/state/index.mjs";
import {matchesSelector} from "../game/engine/script/filter.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const at = (seat, zone, ...names) => ({seat, zone, cards: names});
const BEAR = {types: ["Creature"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2};
const fixtures = {Bear: BEAR, Cub: {...BEAR}, Ogre: {...BEAR, power: 4, toughness: 4},
  /* "Whenever a creature you control attacks, you gain 1 life": it sees the declared Bear, not the Ninja put in attacking. */
  Herald: {types: ["Enchantment"], abilities: [{id: "h", kind: "triggered", text: "Whenever a creature you control attacks, you gain 1 life.",
    trigger: {on: "GameEventAttackersDeclared", who: "any", filter: {types: ["Creature"], controller: "you"}}, effects: [{effect: "gainLife", amount: 1}]}]}};
const run = (scenario) => runScenario({name: "ninjutsu", ...scenario}, cards.definition, fixtures);
const ninja = "Ninja of the Deep Hours";
const blocks = [{attack: ["Bear", "Cub"]}, {to: {turn: 1, phase: "COMBAT_DECLARE_BLOCKERS"}}, {tap: "Island"}, {tap: "Wastes"}];

{
  /* Offered once blockers are declared -- one offer per unblocked attacker -- and not before, and not from the battlefield. */
  eq(run({setup: [at(0, "battlefield", "Bear", "Cub", "Island", "Wastes"), at(0, "hand", ninja)], steps: blocks,
    expect: [{offers: {kind: "activate", card: ninja}, count: 2}]}).passed.length, 1, "after blockers: two unblocked attackers, two offers");
  eq(run({setup: [at(0, "battlefield", "Bear", "Island", "Wastes"), at(0, "hand", ninja)], steps: [{attack: ["Bear"]}, {tap: "Island"}, {tap: "Wastes"}],
    expect: [{offers: {kind: "activate", card: ninja}, count: 0}]}).passed.length, 1, "attackers declared, blockers not yet: none");
  eq(run({setup: [at(0, "battlefield", ninja, "Bear", "Island", "Wastes")], steps: [{attack: ["Bear"]}, {to: {turn: 1, phase: "COMBAT_DECLARE_BLOCKERS"}}, {tap: "Island"}, {tap: "Wastes"}],
    expect: [{offers: {kind: "activate", card: ninja}, count: 0}]}).passed.length, 1, "a Ninja on the battlefield: no ninjutsu");
}
{
  /* The Bear returned, the Ninja tapped and attacking Maya; the Herald saw the declared attackers only; the Cub still hits. */
  const {passed} = run({setup: [at(0, "battlefield", "Bear", "Cub", "Island", "Wastes", "Herald"), at(0, "hand", ninja)],
    steps: [{attack: ["Bear", "Cub"]}, {settle: true}, {to: {turn: 1, phase: "COMBAT_DECLARE_BLOCKERS"}}, {tap: "Island"}, {tap: "Wastes"},
      {activate: ninja, sacrifice: "Bear"}, {resolve: true}, {expect: [{seat: 0, tapped: ninja}, {seat: 0, zone: "hand", cards: ["Bear"]}]},
      {to: {turn: 1, phase: "COMBAT_DAMAGE"}}, {resolve: true}, {choose: ["No"]}],
    expect: [{seat: 1, life: 36}, {seat: 0, life: 42}]});
  eq(passed.length, 4, "the Bear in hand, the Ninja tapped; Maya takes the Ninja's 2 and the Cub's 2; the Herald's two attackers, not three");
}
{
  /* A trigger's target described by what it is about: Throat Slitter's "target nonblack creature that player controls". */
  const {passed} = run({setup: [at(0, "battlefield", "Bear", "Cub", "Swamp", "Wastes", "Wastes"), at(0, "hand", "Throat Slitter"), at(1, "battlefield", "Ogre")],
    steps: [{attack: ["Bear"]}, {to: {turn: 1, phase: "COMBAT_DECLARE_BLOCKERS"}}, {tap: "Swamp"}, {tap: "Wastes"}, {tap: "Wastes"}, {activate: "Throat Slitter"}, {resolve: true},
      {to: {turn: 1, phase: "COMBAT_DAMAGE"}}],
    expect: [{asks: {seat: 0, options: ["Ogre"]}}]});
  eq(passed.length, 1, "Maya's Ogre is the one choice: not Rob's own Cub");
}
{
  /* "Unblocked": attacking, blockers declared, and none blocking it. */
  const s = createState({matchId: "m", seed: "ninjutsu", players: [{name: "Rob"}, {name: "Maya"}]});
  const a = addObject(s, {...BEAR, card: "Bear", owner: 0, controller: 0}, "battlefield", null), b = addObject(s, {...BEAR, card: "Cub", owner: 0, controller: 0}, "battlefield", null);
  s.phase = "COMBAT_DECLARE_BLOCKERS";
  s.combat = {attacks: [{attacker: a, defender: 1, blocked: false, blockers: []}, {attacker: b, defender: 1, blocked: true, blockers: [99]}]};
  const unblocked = (id) => matchesSelector({what: "permanent", attacking: true, unblocked: true}, s, id, {controller: 0});
  eq([unblocked(a), unblocked(b)], [true, false], "the unblocked Bear yes, the blocked Cub no");
}
{
  eq(missingFor({keywords: ["Ninjutsu"]}), [], "the catalog credits Ninjutsu");
}

console.log(`engine-ninjutsu: ${checks} checks passed — offered after blockers, per unblocked attacker, from the hand only; attacking whom the returned creature attacked, never declared; a target that player controls.`);
