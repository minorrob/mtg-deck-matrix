/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* M4 PHASE 3, BATCH 72 (THE CATALOG'S ORDER): ONE WAY OR THE OTHER (Forge's Branch) AND A REFLEXIVE TRIGGER (Forge's
 * ImmediateTrigger, CR 603.12).
 *
 * `branch`: "if you control six or more lands, create a token that's a copy of this creature instead", "draw a card if
 * its power is 3 or greater. Otherwise, put two +1/+1 counters on it" -- its condition asked as it reaches the head of
 * the resolution, and the effects of the way it goes spliced in front of what follows, so one of them may ask.
 * `immediateTrigger`: "Sacrifice it. When you do, search your library ..." -- it triggers as the resolution does what it
 * names, and goes on the stack the next time a player would receive priority, its own targets chosen then. Besides:
 * "snow artifact tokens" have their supertype.
 */
import assert from "node:assert/strict";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {passPriority} from "../game/engine/rules/priority.mjs";
import {advance, awaitingChoice} from "../game/engine/rules/turn.mjs";
import {runEffects} from "../game/engine/script/effects/index.mjs";
import {beginResolution} from "../game/engine/script/resolution.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
import {missingFor} from "../game/tools/engine-constructs.mjs";
import {loadCardIndex, loadCardScripts} from "../game/tools/engine-cards.mjs";

let checks = 0;
const eq = (a, b, m) => { assert.deepEqual(a, b, m); checks += 1; };

const cards = loadCardIndex();
const at = (seat, zone, ...names) => ({seat, zone, cards: names});
const FIX = {Bear: {types: ["Creature"], manaCost: "{1}{G}", colors: ["G"], power: 2, toughness: 2}};
const scenario = (setup, steps = [], seats = 2, more = {}) => runScenario({name: "branch", seats, setup, steps, expect: [], ...more}, cards.definition, FIX).state;
const named = (s, name, zone = "battlefield") => Object.values(s.objects).filter((o) => o.card === name && o.zone === zone).map((o) => o.id);
const scriptOf = (name) => structuredClone(loadCardScripts().find(({script}) => script.identity.name === name).script);
const life = (n) => ({effect: "gainLife", amount: n});

{
  /* The catalog's credits. */
  eq([missingFor({apis: ["Branch"]}), missingFor({apis: ["ImmediateTrigger"]})], [[], []], "Branch and ImmediateTrigger are built");
}
{
  /* Called directly, it runs one side; the condition sees what the effect before it remembered, and what the ability is
     about. In a resolution, the same. */
  const s = scenario([at(0, "hand", "Bear")]);
  runEffects(s, [{effect: "branch", if: {handEmpty: true}, then: [life(2)], otherwise: [life(5)]}], {controller: 0, source: null});
  eq(s.players[0].life, 45, "a card in hand: the other way");
  const [bear] = named(s, "Bear", "hand");
  runEffects(s, [{effect: "branch", if: {about: "remembered", is: {types: ["Creature"]}}, then: [life(1)], otherwise: [life(100)]}], {controller: 0, source: null, remembered: [bear]});
  eq(s.players[0].life, 46, "what was remembered is read");
  const t = scenario([at(0, "graveyard", "Bear")]);
  const outcome = beginResolution(t, [{effect: "moveZone", targets: named(t, "Bear", "graveyard"), to: "hand", remember: true},
    {effect: "branch", if: {about: "remembered", is: {zone: "hand"}}, then: [life(3)], otherwise: [life(7)]}], {controller: 0, source: null});
  eq([outcome.status, t.players[0].life], ["done", 43], "in a resolution: the card it moved, in his hand now");
}
{
  /* Replicating Ring's eighth night counter: all removed, and eight snow artifact tokens that tap for mana. Other tokens
     carry no supertypes they were not given. */
  const s = scenario([at(0, "battlefield", "Replicating Ring")]);
  const [ring] = named(s, "Replicating Ring");
  s.objects[ring].counters.night = 7;
  const upkeep = s.objects[ring].abilities.find((a) => a.kind === "triggered");
  beginResolution(s, upkeep.effects, {controller: 0, source: ring});
  const tokens = named(s, "Replicated Ring");
  eq([s.objects[ring].counters.night, tokens.length, s.objects[tokens[0]].supertypes, s.objects[tokens[0]].types], [0, 8, ["Snow"], ["Artifact"]], "the eighth: none left, eight snow artifact tokens");
  eq(s.objects[tokens[0]].abilities.some((a) => a.kind === "mana" && a.anyColor === true), true, "each with \"{T}: Add one mana of any color\"");
  runEffects(s, [{effect: "createToken", token: {name: "Insect", types: ["Creature"], power: 1, toughness: 1}}], {controller: 0, source: null});
  eq("supertypes" in s.objects[named(s, "Insect")[0]], false, "an Insect token has no supertypes");
  const t = scenario([at(0, "battlefield", "Replicating Ring")]);
  const [one] = named(t, "Replicating Ring");
  t.objects[one].counters.night = 3;
  beginResolution(t, t.objects[one].abilities.find((a) => a.kind === "triggered").effects, {controller: 0, source: one});
  eq([t.objects[one].counters.night, named(t, "Replicated Ring").length], [4, 0], "the fourth: nothing more");
}
{
  /* "When you do": the land gone before its trigger resolved is not sacrificed, so nothing triggers -- no search, no life. */
  const s = scenario([at(0, "hand", "Riveteers Overlook")], [{play: "Riveteers Overlook"}], 2, {library: ["Mountain"]});
  runEffects(s, [{effect: "moveZone", targets: named(s, "Riveteers Overlook"), to: "hand"}], {controller: 1, source: null});
  for (let n = 0; n < 20 && s.stack.length && !s.awaiting; n += 1) if (passPriority(s).outcome === "step-ends") advance(s);
  eq([s.stack.length, s.awaiting, (s.pendingTriggers ?? []).length, s.players[0].life, named(s, "Mountain").length], [0, null, 0, 40, 0], "not sacrificed: nothing triggers");
}
{
  /* A reflexive trigger is about what its resolution was about ("that player"), from its source by name; it waits, and goes
     on the stack when a player would next receive priority. */
  const s = scenario([at(0, "battlefield", "Scute Swarm")]);
  const [swarm] = named(s, "Scute Swarm");
  runEffects(s, [{effect: "immediateTrigger", text: "When you do, that player loses 2 life.", effects: [{effect: "loseLife", who: "that player", amount: 2}]}],
    {controller: 0, source: swarm, about: {player: 1}});
  eq([s.pendingTriggers.at(-1).source.name, s.pendingTriggers.at(-1).about, s.players[1].life], ["Scute Swarm", {player: 1}, 40], "waiting, about Maya");
  for (let n = 0; n < 20 && (s.pendingTriggers.length || s.stack.length) && !s.awaiting; n += 1) if (passPriority(s).outcome === "step-ends") advance(s);
  eq(s.players[1].life, 38, "on the stack and resolved: Maya loses 2");
}
{
  /* The reflexive trigger's own targets, chosen as it goes on the stack (CR 603.3d): with two opponents, Rob is asked. */
  const s = scenario([{...at(0, "battlefield", "Generous Plunderer"), sick: true}], [{to: {turn: 4, phase: "UPKEEP"}}, {resolve: true}, {choose: ["Yes"]}], 3);
  eq([s.awaiting?.kind, awaitingChoice(s).options.map((o) => o.label).sort()], ["trigger-targets", ["Maya", "Trey"]], "which opponent: Maya or Trey");
}
{
  /* The grammar: a reflexive trigger's targets are its own -- the ability around it declares none and is valid; an effect
     naming a target it does not declare is refused. A branch says what decides it, and its ways are lists. */
  const plunderer = scriptOf("Generous Plunderer");
  eq(validateScript(plunderer).valid, true, "Generous Plunderer as written: its upkeep ability declares no target, its reflexive trigger one");
  plunderer.abilities[1].effects[1].effects[0].controller = {target: 1};
  eq(validateScript(plunderer).errors.some((e) => e.message.includes("reflexive trigger's effect names target 1")), true, "target 1 of one: refused");
  const wrong = scriptOf("Generous Plunderer");
  wrong.abilities[1].effects[1].targets = [{what: "player", whom: "opponent"}];
  eq(validateScript(wrong).errors.some((e) => e.path.endsWith("effects[1].targets[0]")), true, "a target the selector grammar lacks a word for: refused");
  const swarm = scriptOf("Scute Swarm");
  delete swarm.abilities[0].effects[0].if;
  const tree = scriptOf("Tribute to the World Tree");
  tree.abilities[0].effects[0].if = {powerOver: 3};
  const composer = scriptOf("Composer of Spring");
  composer.abilities[0].effects[0].then = {effect: "draw"};
  eq([validateScript(swarm).errors.some((e) => e.path.endsWith(".if")), validateScript(tree).errors.some((e) => e.path.endsWith(".if")),
    validateScript(composer).errors.some((e) => e.path.endsWith(".then"))], [true, true, true], "no test, a test the grammar lacks, a way that is not a list: refused");
}

console.log(`engine-branch-reflexive: ${checks} checks passed`);
