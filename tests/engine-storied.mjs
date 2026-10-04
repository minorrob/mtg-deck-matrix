/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* STORIED (CR 702.195), FOR ROB'S PRIORITY LIST: WHAT THE CARDS' SCENARIOS CANNOT REACH.
 *
 * "Any time you control three or more permanents that are artifacts, Sagas, and/or legendary and you don't have an enduring
 * story, you have an enduring story for the rest of the game" (702.195a) -- read where the game is checked, as
 * state-based actions are (keywords/designations.mjs, rules/sba.mjs). The designation is the player's: a permanent with
 * storied must be theirs, it stays when the permanents go, any number of players may have it (702.195b), and a player who
 * has none carries no key, so a game made before it hashes as it did. "As long as you have an enduring story" is the
 * condition `enduringStory`, which a layer's static, an attack tax (Dain) and "doesn't untap" (Bombur) read. And a layer's
 * either-or (`anyOf`): "artifacts and creatures you control have ward {1}" (Thorin) gives an artifact creature ward once.
 */
import assert from "node:assert/strict";
import {checkStateBasedActions} from "../game/engine/rules/sba.mjs";
import {abilitiesOf} from "../game/engine/rules/layers.mjs";
import {attackTax, ruleChanged} from "../game/engine/rules/statics.mjs";
import {conditionHolds, conditionProblems} from "../game/engine/script/condition.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {loadCardIndex} from "../game/tools/engine-cards.mjs";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks += 1; };
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const index = loadCardIndex();
const at = (seat, zone, ...cards) => ({seat, zone, cards});
const FIX = {Rock: {types: ["Artifact"], manaCost: "{1}", colors: []},
  "Iron Golem": {types: ["Artifact", "Creature"], subtypes: ["Golem"], manaCost: "{3}", colors: [], power: 3, toughness: 3},
  "Old Tale": {types: ["Enchantment"], subtypes: ["Saga"], manaCost: "{1}{W}", colors: ["W"]},
  "Old King": {types: ["Creature"], supertypes: ["Legendary"], subtypes: ["Human"], manaCost: "{W}", colors: ["W"], power: 1, toughness: 1},
  Bear: {types: ["Creature"], subtypes: ["Bear"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2}};
const play = (name, setup, steps = []) => runScenario({name, setup, steps}, index.definition, FIX).state;
const named = (s, card, seat = 0) => Object.values(s.objects).find((o) => o.card === card && o.zone === "battlefield" && o.controller === seat)?.id;

/* ---- the designation ---- */
{
  /* Ori (legendary), an artifact and a Saga: three of the kinds -- an enduring story, for Rob alone. */
  const s = play("three kinds", [at(0, "battlefield", "Ori, Keeper of Songs", "Rock", "Old Tale"), at(1, "battlefield", "Rock", "Rock", "Rock")]);
  eq([s.players[0].enduringStory, "enduringStory" in s.players[1]], [true, false], "Rob has one; Maya, with three artifacts and no storied permanent, has none and carries no key");
}
{
  const s = play("two", [at(0, "battlefield", "Ori, Keeper of Songs", "Rock", "Bear")]);
  eq("enduringStory" in s.players[0], false, "two of the kinds are not enough");
}
{
  /* Another player's storied permanent gives Rob nothing: Maya's Ori beside Rob's three artifacts. */
  const s = play("whose", [at(0, "battlefield", "Rock", "Rock", "Rock"), at(1, "battlefield", "Ori, Keeper of Songs")]);
  eq(["enduringStory" in s.players[0], "enduringStory" in s.players[1]], [false, false], "a storied permanent counts for its controller, with that player's permanents");
}
{
  /* For the rest of the game: the artifacts go, the story stays -- and it is told once. */
  const s = play("stays", [at(0, "battlefield", "Ori, Keeper of Songs", "Rock", "Iron Golem")]);
  ok(s.players[0].enduringStory === true, "Ori, a Rock and an Iron Golem: a story");
  eq(checkStateBasedActions(s).filter((e) => e.kind === "GameEventEnduringStory").length, 0, "checked again with the three still there, it is not told again");
  for (const card of ["Rock", "Iron Golem"]) { const id = named(s, card); s.zones.battlefield.splice(s.zones.battlefield.indexOf(id), 1); delete s.objects[id]; }
  const events = checkStateBasedActions(s);
  eq([s.players[0].enduringStory, events.filter((e) => e.kind === "GameEventEnduringStory").length], [true, 0], "with them gone it stays, and is not told again");
}
{
  /* As a player gets one, the game says so, once: Ori and a Rock, and a second Rock cast. */
  const {state: s, events} = runScenario({name: "told", setup: [at(0, "battlefield", "Ori, Keeper of Songs", "Rock", "Wastes"), at(0, "hand", "Rock")],
    steps: [{tap: "Wastes"}, {cast: "Rock"}, {resolve: true}]}, index.definition, FIX);
  eq([s.players[0].enduringStory, events.filter((e) => e.kind === "GameEventEnduringStory").map((e) => e.data.fields.player.playerId)], [true, [0]],
    "the third: Rob gets one, and the event names Rob once");
}

/* ---- the condition, and the rules that read it ---- */
{
  const s = play("conditions", [at(0, "battlefield", "Ori, Keeper of Songs", "Rock", "Rock"), at(1, "battlefield", "Bear")]);
  eq([conditionHolds(s, {enduringStory: true}, {controller: 0}), conditionHolds(s, {enduringStory: false}, {controller: 0}),
    conditionHolds(s, {enduringStory: true}, {controller: 1})], [true, false, false], "enduringStory: Rob's yes, Maya's no");
  eq([conditionProblems({enduringStory: true}), conditionProblems({enduringStory: "yes"}).length], [[], 1], "a definition says true or false");
}
{
  /* Dain's tax only while Maya has a story; Bombur stays tapped only while Rob has none. */
  const taxed = play("dain", [at(1, "battlefield", "Dáin, Lord of the Iron Hills", "Rock", "Rock")]);
  const untaxed = play("dain, no story", [at(1, "battlefield", "Dáin, Lord of the Iron Hills", "Rock")]);
  eq([attackTax(taxed, [{defenderId: 1}]), attackTax(untaxed, [{defenderId: 1}])], [1, 0], "{1} to attack Maya with a story, nothing without");
  const story = play("bombur", [at(0, "battlefield", "Bombur, Gentle Dreamer", "Rock", "Rock")]);
  const none = play("bombur, no story", [at(0, "battlefield", "Bombur, Gentle Dreamer", "Rock")]);
  eq([ruleChanged(story, "doesnt-untap", named(story, "Bombur, Gentle Dreamer")), ruleChanged(none, "doesnt-untap", named(none, "Bombur, Gentle Dreamer"))], [false, true],
    "Bombur doesn't untap unless Rob has a story");
}

/* ---- a layer's either-or ---- */
{
  /* Thorin's ward {1}, to "artifacts and creatures you control": the Iron Golem, both, has it once; the Rock and Thorin
     too; Maya's Bear not. */
  const s = play("anyOf", [at(0, "battlefield", "Thorin Oakenshield", "Rock", "Iron Golem"), at(1, "battlefield", "Bear")]);
  const wards = (id) => abilitiesOf(s, id).filter((a) => a.kind === "triggered" && a.text === "ward {1}").length;
  eq([wards(named(s, "Iron Golem")), wards(named(s, "Rock")), wards(named(s, "Thorin Oakenshield")), wards(named(s, "Bear", 1))], [1, 1, 1, 0],
    "ward {1} once on an artifact creature, on an artifact, on a creature, and on none of Maya's");
}

console.log(`engine-storied: ${checks} checks passed -- storied (CR 702.195): an enduring story for three artifacts, Sagas or legendaries, its controller's alone and for good; the condition read by statics, an attack tax and "doesn't untap"; a layer's either-or giving ward once.`);
