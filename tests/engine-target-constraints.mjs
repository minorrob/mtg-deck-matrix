/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* CR 601.2c: conditional targets, different objects, and different controllers. */
import {table, on, creature, context, checks, scenarios} from "./helpers/train-b6.mjs";
import {targetChoices, targetCandidates, countedChoice, differentControllersProblem} from "../game/engine/script/bind.mjs";
const t = checks("engine-target-constraints");
{
  const s = table(), a = on(s, creature("A")), b = on(s, creature("B")), c = on(s, creature("C"), 1);
  const spec = {types: ["Creature"]}, ref = id => ({kind: "object", id});
  const ways = targetChoices(s, [spec, {...spec, distinctFrom: [0]}], context);
  t.eq(ways.length, 6, "three creatures give six ordered distinct pairs");
  t.ok(ways.every(w => w[0].id !== w[1].id), "no pair targets the same object twice");
  t.eq(targetCandidates(s, {...spec, distinctFrom: [0]}, {...context, chosenTargets: [[ref(a), ref(b)]]}), [ref(c)], "a counted earlier target excludes every object chosen");
  const conditional = {...spec, onlyIf: {cast: {mainPhase: true}}};
  t.eq(targetChoices(s, [conditional], {...context, cast: {mainPhase: false}}), [[[]]], "outside the caster's main phase the conditional target is absent");
  t.eq(targetChoices(s, [conditional], {...context, cast: {mainPhase: true}}).length, 3, "the casting record enables the main-phase target");
  const distinct = {...spec, count: {min: 0, max: 2}, differentControllers: true};
  const choice = countedChoice(s, distinct, context, {id: "pick", name: "Probe"});
  t.eq(choice.capped.most, {0: 1, 1: 1}, "the UI caps every controller at one");
  t.ok(differentControllersProblem(s, distinct, [ref(a), ref(b)], "Probe")?.includes("Choose no more than one"), "same-controller targets are refused with corrective instructions");
  t.eq(differentControllersProblem(s, distinct, [ref(a), ref(c)], "Probe"), null, "different-controller targets are allowed");
}
t.ok(scenarios("r/return-to-dust") >= 3, "conditional and distinct targets also work through real casting and resolution");
t.done();
