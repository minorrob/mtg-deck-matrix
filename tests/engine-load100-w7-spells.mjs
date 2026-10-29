/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from "node:assert/strict";
import {play, at, later, compiled} from "./helpers/x11-keywords.mjs";
import {draw, singleDraws, drawQuestion} from "../game/engine/script/effects/zones.mjs";
import {beginResolution, answerResolution, resolutionChoice} from "../game/engine/script/resolution.mjs";
import {cardsIn} from "../game/engine/state/index.mjs";
import {runEffect} from "../game/engine/script/effects/index.mjs";
import {collectTriggers} from "../game/engine/rules/trigger.mjs";
import {createRng} from "../game/engine/rng.mjs";
import {amountOf} from "../game/engine/script/amount.mjs";

const state = play([at(0, "library", "Island", "Island"), at(1, "library", "Island", "Island"),
  at(2, "library", "Island", "Island"), at(3, "library", "Island", "Island")], [], {seats: 4});
state.activePlayer = 2;
assert.deepEqual(singleDraws(state, {who: "each", count: 2}, {controller: 0}), [2, 2, 3, 3, 0, 0, 1, 1],
  "CR 121.2c: each player completes their draws in APNAP order");
const events = draw(state, {who: "each", count: 1}, {controller: 0});
assert.deepEqual(events.filter((e) => e.data?.fields?.drawn).map((e) => state.objects[e.data.fields.drewAs].owner),
  [2, 3, 0, 1], "actual card movements follow APNAP order");
{
  const s = play([at(1, "battlefield", "Alms Collector"), at(2, "battlefield", "Alms Collector")], [], {seats: 4});
  s.activePlayer = 3;
  assert.equal(drawQuestion(s, {effect: "draw", who: "each", count: 2}, {controller: 0}).player, 3,
    "replacement questions follow the same APNAP draw order");
}
{
  // CR 121.2a, 616.1g; Alms Collector ruling dated 2017-08-25: the multi-card instruction is replaced first.
  const s = play([later(0, "graveyard", "Life from the Loam"), at(1, "battlefield", "Alms Collector")], [], {seats: 3});
  const hand = cardsIn(s, "hand", 1).length;
  beginResolution(s, [{effect: "draw", count: 2}], {controller: 0});
  assert.equal(s.awaiting.effect, "dredgeDraw");
  assert.equal(s.awaiting.player, 0);
  const choice = resolutionChoice(s, s.awaiting);
  assert.ok(choice.options.some((o) => /Dredge 3/.test(o.label)), "the remaining individual draw offers dredge");
  answerResolution(s, [choice.options.find((o) => /Dredge 3/.test(o.label)).index]);
  assert.equal(cardsIn(s, "hand", 1).length, hand + 1, "Collector's controller draws exactly one card");
  assert.ok(cardsIn(s, "hand", 0).some((id) => s.objects[id].card === "Life from the Loam"));
  assert.equal(s.resolving, null);
}
{
  const s = play([later(0, "graveyard", "Life from the Loam"), at(0, "battlefield", "Teferi's Ageless Insight")]);
  beginResolution(s, [{effect: "draw", count: 1}], {controller: 0});
  const choice = resolutionChoice(s, s.awaiting);
  assert.ok(choice.options.some((o) => /draw 2 cards instead/i.test(o.label)), "the drawer may apply the mandatory doubler before optional dredge");
  assert.ok(!choice.options.some((o) => o.label === "Draw a card"), "a mandatory replacement cannot be declined");
  const library = cardsIn(s, "library", 0).length;
  answerResolution(s, [choice.options.find((o) => /draw 2 cards instead/i.test(o.label)).index]);
  const after = resolutionChoice(s, s.awaiting);
  assert.ok(after.options.some((o) => /Dredge 3/.test(o.label)), "the doubled draw may be dredged");
  assert.ok(!after.options.some((o) => /draw 2 cards instead/i.test(o.label)), "that doubler cannot apply again to its resulting draw");
  assert.throws(() => answerResolution(structuredClone(s), [99]), /Invalid selection/);
  answerResolution(s, [after.options.find((o) => /Dredge 3/.test(o.label)).index]);
  assert.equal(s.resolving, null);
  assert.equal(cardsIn(s, "library", 0).length, library - 4, "one draw was dredged, the other drawn once");
  assert.ok(cardsIn(s, "hand", 0).some((id) => s.objects[id].card === "Life from the Loam"));
}
{
  const s = play([later(0, "graveyard", "Life from the Loam"), at(0, "battlefield", "Teferi's Ageless Insight", "Smoke Draw Doubler")], [], {}, {"Smoke Draw Doubler": {types: ["Enchantment"], abilities: [{id: "double", kind: "static", rule: "draws-more", affects: {who: "you"}, count: 2}]}});
  const library = cardsIn(s, "library", 0).length;
  beginResolution(s, [{effect: "draw", count: 1}], {controller: 0});
  for (let i = 0; s.awaiting && i < 20; i++) answerResolution(s, [0]);
  assert.equal(s.resolving, null, "each of two doublers applies once per descendant draw");
  assert.equal(cardsIn(s, "library", 0).length, library - 4, "two doublers produce four draws");
}
{
  const watcher = compiled([{kind: "triggered", text: "Whenever you roll one or more dice, draw a card.",
    trigger: {on: "die rolled", roller: "you", batch: true}, effects: [{effect: "draw", count: 1}]}]);
  assert.deepEqual(watcher.problems, [], "the compiler builds a die-roll watcher");
  assert.ok(compiled([{kind: "triggered", text: "x", trigger: {on: "die rolled", roller: "nobody"}, effects: [{effect: "draw", count: 1}]}]).problems.length,
    "an unsupported roller selector is refused");
  const s = play([later(0, "battlefield", "Smoke Roll Watcher")], [], {}, {"Smoke Roll Watcher": watcher.definition});
  const rng = createRng("load100-w7-dice"), context = {controller: 0, source: null};
  const events = [...runEffect(s, {effect: "rollDie", sides: 20}, context, rng), ...runEffect(s, {effect: "rollDie", sides: 20}, context, rng)];
  collectTriggers(s, events);
  assert.equal(s.pendingTriggers.length, 2, "separate roll instructions each trigger a one-or-more watcher");
  assert.equal(amountOf(s, {dieRolled: true}, {about: s.pendingTriggers[0].about}), events[0].data.fields.result, "a watcher reads the final roll it is about");
  s.pendingTriggers = [];
  collectTriggers(s, [events[0], structuredClone(events[0])]);
  assert.equal(s.pendingTriggers.length, 1, "retained dice from one roll instruction trigger a one-or-more watcher once");
  s.pendingTriggers = [];
  collectTriggers(s, runEffect(s, {effect: "rollDie", sides: 6}, {controller: 1, source: null}, rng));
  collectTriggers(s, runEffect(s, {effect: "rollDie", sides: 3, atRandom: true}, context, rng));
  collectTriggers(s, runEffect(s, {effect: "rollDie", sides: 6, planar: true}, context, rng));
  assert.equal(s.pendingTriggers.length, 0, "another player's roll, choosing a number at random, and planar dice outside Planechase do not trigger it");
}
console.log("engine-load100-w7-spells: APNAP, Collector-first, single-draw replacements and die-roll triggers passed.");
