/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* AN ABILITY ON THE STACK AS A TARGET (CR 115.1, 115.2, 113.7a; Bolt Bend: "change the target of target spell or ability
 * with a single target", CR 115.7a, 115.9a).
 *
 * An activated or triggered ability on the stack is no object, so a selector about one (`what: "ability"`,
 * script/filter.mjs) is matched against the stack's entries, and what is chosen is `{kind: "ability", id}`, the entry's
 * stack id (script/bind.mjs). It is checked again as the spell resolves (CR 608.2b): an ability that has left the stack is
 * no longer there to be its target. An effect names the entries among a target by `stack: {target: n}` -- an ability by
 * its stack id, a spell by its entry's -- and changeTargets changes the target of either, to another its own requirements
 * allow (effects/asking.mjs): never itself (CR 115.5), "another" read against the ability's source (CR 113.7a). Its name
 * is its source's; the room's offer says so, and the house pilots read whose it is off the stack, never off a card.
 */
import assert from "node:assert/strict";
import {legalActions} from "../game/engine/rules/actions.mjs";
import {awaitingChoice} from "../game/engine/rules/turn.mjs";
import {selectMatching, compileSelector} from "../game/engine/script/filter.mjs";
import {targetCandidates, recheckTargets, bindEffect, targetName} from "../game/engine/script/bind.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {offerDetails} from "../game/room/room.mjs";
import {housePilot} from "../game/engine/pilots/house-pilot.mjs";
import {scoredPilot} from "../game/engine/pilots/scored-pilot.mjs";
import {projectFor} from "../game/engine/projection.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const ANY = {anyOf: [{what: "permanent", types: ["Creature"]}, {what: "player"}]};
const ping = (id, targets, more = {}) => ({id, kind: "activated", text: "{T}: This creature deals 1 damage to any target.", cost: [{atom: "{T}"}], targets,
  effects: targets.map((_, n) => ({effect: "dealDamage", amount: 1, targets: {target: n}, who: {target: n}})), ...more});
const FIX = {
  Ogre: {types: ["Creature"], subtypes: ["Ogre"], manaCost: "{C}", colors: ["R"], power: 4, toughness: 4},
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{C}", colors: ["G"], power: 2, toughness: 2},
  Pinger: {types: ["Creature"], manaCost: "{C}", colors: ["R"], power: 1, toughness: 1, abilities: [ping("a0", [ANY])]},
  /* "Deals 1 damage to another target creature": another than its source. */
  Picker: {types: ["Creature"], manaCost: "{C}", colors: ["R"], power: 1, toughness: 1, abilities: [ping("a0", [{what: "permanent", types: ["Creature"], another: true}])]},
  Stifler: {types: ["Creature"], manaCost: "{C}", colors: ["U"], power: 1, toughness: 1, abilities: [{id: "a0", kind: "activated", text: "{T}: Counter target activated ability.",
    cost: [{atom: "{T}"}], targets: [{what: "ability"}], effects: [{effect: "counterSpell", stack: {target: 0}}]}]},
  Twinbolt: {types: ["Creature"], manaCost: "{C}", colors: ["R"], power: 1, toughness: 1, abilities: [ping("a0", [ANY, {...ANY, distinctFrom: [0]}])]},
  Flamecaller: {types: ["Creature"], manaCost: "{C}", colors: ["R"], power: 1, toughness: 1, abilities: [{id: "a0", kind: "triggered", text: "When this creature enters, it deals 2 damage to any target.",
    trigger: {on: "GameEventCardChangeZone", to: "Battlefield", who: "self"}, targets: [ANY], effects: [{effect: "dealDamage", amount: 2, targets: {target: 0}, who: {target: 0}}]}]},
  Study: {types: ["Instant"], manaCost: "{C}", colors: [], spell: {id: "s", text: "Draw a card.", targets: [], effects: [{effect: "draw", count: 1}]}},
  Shock: {types: ["Instant"], manaCost: "{R}", colors: ["R"], spell: {id: "s", text: "Shock deals 2 damage to any target.", targets: [ANY],
    effects: [{effect: "dealDamage", amount: 2, targets: {target: 0}, who: {target: 0}}]}},
};
const board = (setup, steps) => runScenario({name: "board", at: {turn: 2, phase: "MAIN1"}, setup, steps}, index.definition, FIX).state;
const ability = (s, name) => s.stack.find((e) => e.kind !== "spell" && e.name === name);

{
  /* Maya's Pinger at Rob, Maya's Twinbolt at Rob and his Ogre, and her Study: the abilities are what `what: "ability"` finds. */
  const s = board([at(0, "battlefield", "Ogre"), at(1, "battlefield", "Pinger", "Twinbolt", "Wastes"), at(1, "hand", "Study")],
    [{activate: "Pinger", seat: 1, targets: [{player: 0}]}, {activate: "Twinbolt", seat: 1, targets: [{player: 0}, {card: "Ogre"}]},
      {tap: "Wastes", seat: 1}, {cast: "Study", seat: 1}]);
  const pinger = ability(s, "Pinger").stackId, twin = ability(s, "Twinbolt").stackId;
  eq(selectMatching(s, {what: "ability"}, {controller: 0}), [pinger, twin], "the abilities on the stack, by stack id, bottom up -- not the Study spell");
  eq(selectMatching(s, {what: "ability", singleTarget: true}, {controller: 0}), [pinger], "with a single target: the Pinger's, not the Twinbolt's two (CR 115.9a)");
  eq([selectMatching(s, {what: "ability", controller: "opponent"}, {controller: 0}).length, selectMatching(s, {what: "ability", controller: "you"}, {controller: 0}).length],
    [2, 0], "whose: both Maya's, an opponent's to Rob");
  eq([selectMatching(s, {what: "ability", controller: "opponent"}, {controller: 1}).length, selectMatching(s, {what: "ability", controller: "you"}, {controller: 1}).length],
    [0, 2], "and Maya's own to her");
  eq(targetCandidates(s, {anyOf: [{what: "spell", singleTarget: true}, {what: "ability", singleTarget: true}]}, {controller: 0}), [{kind: "ability", id: pinger}],
    "Bolt Bend's choices: the Pinger's ability alone -- the Study has no target, the Twinbolt two");
  assert.throws(() => compileSelector({what: "ability", types: ["Creature"]}), /ability on the stack is chosen by/); checks += 1;
  eq([targetName(s, {kind: "ability", id: pinger}), targetName(s, {kind: "object", id: s.stack.find((e) => e.name === "Study").objectId})], ["Pinger's activated ability", "Study"],
    "an ability is said by its source");
  /* `stack: {target: n}`: the entries among the target, an ability's by its own id, a spell's by its entry's. */
  const study = s.stack.find((e) => e.name === "Study");
  eq(bindEffect({effect: "changeTargets", stack: {target: 0}}, {targets: [{kind: "ability", id: pinger}]}, s).stack, [pinger], "an ability target binds to its stack id");
  eq(bindEffect({effect: "changeTargets", stack: {target: 0}}, {targets: [{kind: "object", id: study.objectId}]}, s).stack, [study.stackId], "a spell target to its entry's");
  /* Gone from the stack, the target is illegal (CR 608.2b): a spell aimed only at it does nothing. */
  const spec = [{anyOf: [{what: "spell", singleTarget: true}, {what: "ability", singleTarget: true}]}];
  eq(recheckTargets(s, spec, [{kind: "ability", id: pinger}], {controller: 0}).fizzles, false, "while it is on the stack, still legal");
  s.stack.splice(s.stack.findIndex((e) => e.stackId === pinger), 1);
  eq(recheckTargets(s, spec, [{kind: "ability", id: pinger}], {controller: 0}).fizzles, true, "once it has left, the spell has no legal target");
  eq(targetName(s, {kind: "ability", id: pinger}), "an ability, now gone", "and it is said to be gone");
}
{
  /* A triggered ability is said as one. */
  const s = board([at(1, "battlefield", "Wastes"), at(1, "hand", "Flamecaller")], [{tap: "Wastes", seat: 1}, {cast: "Flamecaller", seat: 1}, {resolve: true}, {choose: ["Rob"]}]);
  eq(targetName(s, {kind: "ability", id: ability(s, "Flamecaller").stackId}), "Flamecaller's triggered ability", "a trigger is a triggered ability");
}
{
  /* Bolt Bend on an ability whose target is "another target creature": the choices read "another" against the ability's
     source -- not the Picker itself -- and never the ability itself (CR 115.5). */
  const s = board([at(0, "hand", "Bolt Bend"), at(0, "battlefield", "Ogre", "Mountain", "Bear"), at(1, "battlefield", "Picker")],
    [{activate: "Picker", seat: 1, targets: [{card: "Ogre"}]}, {pass: 1}, {tap: "Mountain", seat: 0}, {cast: "Bolt Bend", seat: 0, targets: [{ability: "Picker"}]}, {resolve: true}]);
  eq(awaitingChoice(s).options.map((o) => o.label), ["Bear"], "its new target: another creature than the Ogre it has, and never the Picker, its source");
}
{
  /* An ability that targets an ability -- Rob's Stifler, "counter target activated ability", at Maya's Pinger's -- bent by
     Maya: the only other ability on the stack is the Stifler's own, never its own target (CR 115.5), so its target stays and
     nobody is asked (CR 115.7a). And the Stifler then counters the Pinger's ability: Rob is dealt nothing. */
  const s = board([at(0, "battlefield", "Stifler"), at(1, "battlefield", "Pinger", "Ogre", "Mountain"), at(1, "hand", "Bolt Bend")],
    [{activate: "Pinger", seat: 1, targets: [{player: 0}]}, {pass: 1}, {activate: "Stifler", seat: 0, targets: [{ability: "Pinger"}]},
      {pass: 1}, {tap: "Mountain", seat: 1}, {cast: "Bolt Bend", seat: 1, targets: [{ability: "Stifler"}]}, {resolve: true}]);
  eq([s.awaiting, s.stack.map((e) => e.name)], [null, ["Pinger", "Stifler"]], "Bolt Bend resolved and nothing was asked: the Stifler's ability still on the stack");
  eq(ability(s, "Stifler").targets, [{kind: "ability", id: ability(s, "Pinger").stackId}], "still aimed at the Pinger's");
  const {state: t} = runScenario({name: "stifled", at: {turn: 2, phase: "MAIN1"}, setup: [at(0, "battlefield", "Stifler"), at(1, "battlefield", "Pinger")],
    steps: [{activate: "Pinger", seat: 1, targets: [{player: 0}]}, {pass: 1}, {activate: "Stifler", seat: 0, targets: [{ability: "Pinger"}]}, {resolve: true}],
    expect: [{seat: 0, life: 40}, {stack: 0}]}, index.definition, FIX);
  eq(t.players[0].life, 40, "countered by its stack entry, the Pinger's ability never deals its damage");
}
{
  /* The room says what the cast is aimed at; the pilots read whose the ability is off the stack. */
  const s = board([at(0, "hand", "Bolt Bend"), at(0, "battlefield", "Ogre", "Mountain"), at(1, "battlefield", "Pinger")],
    [{activate: "Pinger", seat: 1, targets: [{player: 0}]}, {pass: 1}, {tap: "Mountain", seat: 0}]);
  const offers = legalActions(s, 0).filter((a) => a.kind === "cast" && a.label === "Bolt Bend");
  eq(offers.map((a) => a.targetNames), [["Pinger's activated ability"]], "one offer, at the Pinger's ability");
  eq(offerDetails(s, 0, offers), ["→ Pinger's activated ability"], "the room's offer says so");
  /* Bolt Bend changes a target, no harm meant: the pilots aim it at their own side's, so Maya's ability is not theirs to bend --
     even when its stack id is also the id of one of Rob's own permanents. */
  const entry = ability(s, "Pinger");
  entry.stackId = s.zones.battlefield.find((id) => s.objects[id].card === "Ogre");
  for (const pilot of [housePilot({seat: 0, cards: () => ({manaValue: 1, types: ["Instant"]})}), scoredPilot({seat: 0, cards: () => ({manaValue: 1, types: ["Instant"]})})]) {
    const actions = legalActions(s, 0);
    ok(actions.some((a) => a.kind === "cast" && a.label === "Bolt Bend"), "Bolt Bend is offered");
    eq(pilot.choose(projectFor(s, 0), actions).label === "Bolt Bend", false, `${pilot.id} does not bend Maya's ability, read as hers off the stack`);
  }
}

console.log(`engine-ability-target: ${checks} checks passed -- abilities on the stack chosen by their entries, by whose and "with a single target"; said by their source, gone once they leave; an effect's stack entries; Bolt Bend's new target held to the ability's own requirements; the room's offer and the pilots' aim read off the stack`);
