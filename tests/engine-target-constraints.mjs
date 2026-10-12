/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* CR 601.2c: conditional targets, different objects, different controllers, and one for each opponent (CR 608.2b). */
import {table, on, creature, context, checks, scenarios} from "./helpers/train-b6.mjs";
import {readFileSync} from "node:fs";
import {targetChoices, targetCandidates, countedChoice, differentControllersProblem, countOf, recheckTargets} from "../game/engine/script/bind.mjs";
import {validateScript} from "../game/engine/script/schema.mjs";
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
/* "For each opponent, destroy up to one target creature or planeswalker that player controls" (Lich's Relic; bind.mjs
   `forEach`, CR 601.2c, 608.2b): an opponent's, one of each opponent's, each held to the opponent it was chosen for. */
{
  const s = table(), mine = on(s, creature("Mine")), m1 = on(s, creature("M1"), 1), m2 = on(s, creature("M2"), 1), tr = on(s, creature("T1"), 2);
  const each = {anyOf: [{what: "permanent", types: ["Creature"]}, {what: "permanent", types: ["Planeswalker"]}], count: {min: 0, max: 1}, forEach: "opponent"};
  const ref = (id) => ({kind: "object", id});
  t.eq(countOf(each), {min: 0, max: null}, "up to one for each opponent: none at least, and no count but the one of each opponent's");
  const choice = countedChoice(s, each, context, {id: "pick", name: "Lich's Relic"});
  t.eq(choice.options.map((o) => o.label), ["M1 (Maya's)", "M2 (Maya's)", "T1 (Trey's)"], "only what an opponent controls is offered, never Rob's own");
  t.eq([choice.min, choice.max, choice.capped.most], [0, 3, {1: 1, 2: 1}], "none at least, and no more than one of each opponent's");
  t.ok(choice.title.includes("for each opponent, choose up to one target that player controls"), "the question says it in the card's words");
  t.eq(choice.options.map((o) => o.targets[0].forPlayer), [1, 1, 2], "each choice keeps the opponent it is chosen for");
  t.ok(choice.capped.why[1].includes("up to one of each opponent's: choose no more than one of Maya's"), "the cap says what is wrong and what to do instead");
  t.ok(differentControllersProblem(s, each, [ref(m1), ref(m2)], "Lich's Relic")?.includes("Choose no more than one of each opponent's"), "two of one opponent's are refused, with what to do instead");
  t.eq(differentControllersProblem(s, each, [ref(m1), ref(tr)], "Lich's Relic"), null, "one of each opponent's is allowed");
  const single = {what: "permanent", types: ["Creature"], count: {min: 0, max: 1}, forEach: "opponent"};
  t.eq(targetCandidates(s, single, context).map((c) => c.id), [m1, m2, tr], "one kind of target says it too (\"up to one target creature that player controls\"): forEach is no part of its selector");
  const chosen = [choice.options[0].targets[0], choice.options[2].targets[0]];
  t.eq(recheckTargets(s, [each], [chosen], context).targets, [chosen], "still each opponent's as it resolves: both legal");
  s.objects[m1].controller = 2;
  t.eq(recheckTargets(s, [each], [chosen], context).targets, [[chosen[1]]], "one that came under Trey's control is no longer Maya's (CR 608.2b), though Trey is an opponent too");
  t.eq(targetCandidates(s, each, context).some((c) => c.id === mine), false, "Rob's own creature is never a candidate");
  /* The schema: the one form built, on a reflexive trigger's target. */
  const relic = JSON.parse(readFileSync(new URL("../game/engine/cards/l/lichs-relic.json", import.meta.url), "utf8"));
  const reflexive = (script) => script.abilities[0].effects[0].effects[0];
  const variant = (change) => { const script = structuredClone(relic); change(reflexive(script).targets[0], script); return validateScript(script); };
  t.eq(validateScript(relic).errors, [], "Lich's Relic validates");
  const refused = (result) => result.errors.some((e) => /forEach/.test(e.path));
  t.ok(refused(variant((spec) => { spec.forEach = "player"; })), "for each player is not the form built: refused");
  t.ok(refused(variant((spec) => { spec.count = {min: 0, max: 2}; })), "up to two for each is refused");
  t.ok(refused(variant((spec) => { spec.count = {min: 1, max: 1}; })), "exactly one for each is not the form built: refused");
  t.ok(refused(variant((spec) => { spec.anyOf.push({what: "player"}); })), "a player is not a permanent that player controls: refused");
  t.ok(variant((spec, script) => { script.abilities[2].targets[0] = {what: "permanent", types: ["Creature"], count: {min: 0, max: 1}, forEach: "opponent"}; })
    .errors.some((e) => /no key "forEach"/.test(e.message)), "on an ability's own target it is not built, and refused");
  t.ok(scenarios("l/lichs-relic") >= 9, "and through real play: two to four players, up to one, a target stolen or gone in response");
}
t.done();
