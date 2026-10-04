/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* PHASING, AND A PLAYER'S PROTECTION (CR 702.26, 702.16, 119.7; Teferi's Reproach; the live-game plan of 2026-10-04, lane W6).
 *
 * `phaseOut` (script/effects/permanents.mjs): each permanent named leaves the battlefield's list for `state.phasedOut`, its
 * zone "phased" -- no zone change, so no new object -- out of combat, with anything attached to it (CR 702.26h). It phases
 * back in, the same object, as its controller's untap step begins, and untaps with the rest (rules/turn.mjs). And
 * effectUntil's player rules, until that player's next turn: `protection` from everything (rules/protection.mjs) and
 * `life-cant-change` (effects/resources.mjs, changeLife).
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";
import {phaseOut, phaseIn} from "../game/engine/script/effects/permanents.mjs";
import {changeLife} from "../game/engine/script/effects/resources.mjs";
import {protectedFrom} from "../game/engine/rules/protection.mjs";
import {selectMatching} from "../game/engine/script/filter.mjs";
import {zoneProblems} from "../game/engine/cards/compile.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const TR = "Teferi's Reproach";
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2}};
const SETUP = [at(0, "battlefield", "Plains", "Plains", "Plains"), at(0, "hand", TR), at(1, "battlefield", "Bear", "Forest")];
const CAST = [{tap: "Plains"}, {tap: "Plains"}, {tap: "Plains"}, {cast: TR, targets: [{player: 1}]}, {resolve: true}];
const play = (steps = []) => runScenario({name: "phasing", setup: SETUP, steps: [...CAST, ...steps]}, index.definition, FIX).state;
const named = (s, card) => Number(Object.keys(s.objects).find((id) => s.objects[id].card === card && s.objects[id].owner === 1));

{
  const s = play();
  const bear = named(s, "Bear");
  eq([s.objects[bear].zone, s.phasedOut, s.zones.battlefield.includes(bear)], ["phased", [bear], false], "the Bear phases out: in no zone's list, in phasedOut");
  eq(selectMatching(s, {what: "permanent", types: ["Creature"]}, {controller: 0}).includes(bear), false, "treated as though it does not exist: no selector finds it");
  eq(zoneProblems(s), [], "and the game's zones are sound");
  eq(protectedFrom(s, {player: 1}, named(s, "Forest")), true, "Maya has protection from everything");
  eq(protectedFrom(s, {player: 0}, named(s, "Forest")), false, "Rob does not");
  const life = s.players[1].life;
  changeLife(s, 1, -3, []); changeLife(s, 1, 2, []);
  eq(s.players[1].life, life, "Maya's life total can't change, up or down");
  const rob = s.players[0].life;
  changeLife(s, 0, -1, []);
  eq(s.players[0].life, rob - 1, "Rob's can");
  phaseIn(s, 0);
  eq(s.objects[bear].zone, "phased", "Rob's untap step does not phase in Maya's permanents");
}
{
  const s = play([{to: {turn: 2, phase: "MAIN1"}}]);
  const bear = named(s, "Bear");
  eq([s.objects[bear].zone, s.zones.battlefield.includes(bear), s.phasedOut, s.objects[bear].tapped ?? false], ["battlefield", true, [], false], "Maya's turn: the same Bear phases in, untapped");
  eq(protectedFrom(s, {player: 1}, named(s, "Forest")), false, "and the protection is over");
  const life = s.players[1].life;
  changeLife(s, 1, -1, []);
  eq(s.players[1].life, life - 1, "and their life can change again");
}
{
  /* Out of combat (CR 506.4), and what is attached goes with it, coming back as its host does (CR 702.26h). */
  const s = play([{to: {turn: 2, phase: "MAIN1"}}]);
  const bear = named(s, "Bear"), forest = named(s, "Forest");
  s.objects[forest].attachedTo = bear;
  s.objects[forest].controller = 0;
  s.combat = {attacks: [{attacker: bear, blockers: []}, {attacker: 99, blockers: [bear]}]};
  phaseOut(s, {targets: [bear]}, {controller: 0});
  eq([s.combat.attacks, s.objects[forest].zone, s.phasedOut], [[{attacker: 99, blockers: []}], "phased", [bear, forest]], "attacking or blocking, it leaves combat; what is attached phases out too, whoever controls it");
  phaseIn(s, 0);
  eq(s.objects[forest].zone, "phased", "the attached one phases in with its host, not at its own controller's untap");
  s.objects[bear].zone = "battlefield";
  eq(zoneProblems(s).length, 1, "a phased-out permanent that says it is elsewhere is a broken game");
  s.objects[bear].zone = "phased";
  phaseIn(s, 1);
  eq([s.objects[bear].zone, s.objects[forest].zone, s.objects[forest].attachedTo], ["battlefield", "battlefield", bear], "and both phase in, still attached");
}

console.log(`engine-phasing: ${checks} checks passed -- permanents phase out and in, the same objects; a player with protection from everything; a life total that can't change.`);
