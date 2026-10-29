/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* An explicit player's policy remains executable after runtime Flying removal. Both games finish combat; only the
   final life/graveyard assertions distinguish them. No saved card or scenario is changed by these probes. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {tableCards} from "../cloud/game-room.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {runtimeAbilityRemoval, runtimeCardsWithoutAbility, proveRuntimeAbility, scenarioBehaviorFailure} from "../game/tools/ability-proof.mjs";
import {createExerciseLedger, exerciseSummary} from "../game/tools/ability-evidence.mjs";
import {checkScenarios} from "../game/tools/batch/check-cards.mjs";

let checks = 0;
const eq = (a, b, message) => {assert.deepEqual(a, b, message); checks += 1;};
const ok = (value, message) => {assert.ok(value, message); checks += 1;};
const failure = (fn, pattern, message) => {
  let error; try {fn();} catch (caught) {error = caught;}
  ok(error instanceof Error, message);
  assert.match(error.message, pattern); checks += 1;
  return error;
};
const sprite = "Zephyr Sprite", bear = "Ground Bear";
const script = JSON.parse(readFileSync(new URL("../game/engine/cards/z/zephyr-sprite.json", import.meta.url), "utf8"));
const fixtures = {
  [bear]: {types: ["Creature"], power: 2, toughness: 2},
  "Other Bear": {types: ["Creature"], power: 2, toughness: 2},
  "Other Attacker": {types: ["Creature"], power: 2, toughness: 2},
  "Menacing Brute": {types: ["Creature"], power: 3, toughness: 3, keywords: ["Menace"]},
  "Required Brute": {types: ["Creature"], power: 3, toughness: 3, keywords: ["Menace"],
    abilities: [{id: "must", kind: "static", rule: "must-be-blocked", affects: {what: "permanent", self: true}}]},
  "Question Spell": {types: ["Instant"], manaCost: "{0}", spell: {id: "s", effects: [{effect: "chooseColor"}]}},
  "Counted Spell": {types: ["Instant"], manaCost: "{0}", spell: {id: "s", targets: [{what: "permanent", types: ["Creature"], count: {min: 1, max: 2}}], effects: [{effect: "draw", count: 1}]}},
};
const scenario = {
  name: "Flying changes final combat damage under an explicit block policy",
  setup: [{seat: 0, zone: "battlefield", cards: [sprite]}, {seat: 1, zone: "battlefield", cards: [bear]}],
  steps: [{attack: [sprite], at: "Maya"}, {blockIfLegal: [bear, sprite], seat: 1}, {to: {turn: 1, phase: "MAIN2"}}],
  expect: [{seat: 1, life: 39}, {seat: 0, zone: "graveyard", cards: []}],
};
const run = (value = scenario, cards = tableCards) => runScenario(value, cards, fixtures);
const baseline = run();
eq([baseline.state.phase, baseline.state.players[1].life], ["MAIN2", 39], "actual loaded Flying Sprite deals final combat damage");
eq(baseline.policies.map((p) => [p.branch, p.indices, p.reasons]), [["declare-no-blocks", [], []]], "no-block branch is explicit, recorded and legal");
eq(baseline.policies[0].status, "answered", "the branch log distinguishes an executed answer from a refused proposal");
ok(baseline.events.some((e) => e.kind === "GameEventPlayerDamaged" && e.data.fields.amount === 1 && e.data.fields.combat), "the life loss is an actual combat damage event");
const ledger = createExerciseLedger([script]), ability = ledger.cards[sprite].abilities[0];
const original = tableCards(sprite), removal = runtimeAbilityRemoval(script, ability, original);
eq(removal.status, "ready", "one real loaded Flying ability can be omitted in memory");
const changed = runtimeCardsWithoutAbility(tableCards, sprite, removal.definition);
const control = run({...scenario, expect: [{seat: 1, life: 40}, {seat: 0, zone: "graveyard", cards: [sprite]}]}, changed);
eq([control.state.phase, control.state.players[1].life], ["MAIN2", 40], "removal control finishes valid combat with zero damage to the defender");
eq(control.policies.map((p) => [p.branch, p.indices.length, p.reasons]), [["block", 1, []]], "removed-Flying branch executes the legal named block");
ok(control.events.some((e) => e.kind === "GameEventBlockersDeclared"), "the control actually declares blockers");
const error = failure(() => run(scenario, changed), /Maya is at 40 life, not 39/, "the unchanged scenario fails on final life after removal");
eq(error.scenarioPolicies.map((p) => p.branch), ["block"], "the assertion failure preserves the removal's executed branch");
eq(tableCards(sprite), original, "runtime removal changes no saved or shared definition");

const proof = proveRuntimeAbility({script, ability, cards: tableCards, scenarios: [scenario], fixtures});
eq([proof.status, proof.baseline.status, proof.result.status], ["proved", "passed", "failed"], "existing counterfactual machinery proves this full-combat witness");
eq([proof.baseline.policies[0].branch, proof.result.policies[0].branch], ["declare-no-blocks", "block"], "both original and removal policies survive direct proof recording");
assert.match(proof.result.message, /Maya is at 40 life, not 39/); checks += 1;
const baselines = new Map();
eq(checkScenarios({files: [{card: sprite, scenarios: [scenario], fixtures}], scripts: [script], cards: tableCards,
  ledger, counterfactual: true, baselines, report: () => {}}), {runs: 1, failed: 0}, "the normal card checker uses the same valid baseline");
eq(exerciseSummary(ledger).scenarioReached, 1, "only this selected actual ability receives recorded behavioral proof");
eq([ledger.cards[sprite].abilities[0].counterfactual[0].baseline.policies[0].branch,
  ledger.cards[sprite].abilities[0].counterfactual[0].result.policies[0].branch], ["declare-no-blocks", "block"], "the prefilled checker baseline cache retains both branches in its ledger proof");
ok(!baselines.get(scenario).state && !baselines.get(scenario).result, "compact baseline metadata does not retain game states");

for (const pair of [null, false, "Ground Bear", [], [bear], [bear, sprite, "extra"], [bear, 3], ["", sprite], [" Ground Bear", sprite]]) {
  failure(() => run({...scenario, steps: [scenario.steps[0], {blockIfLegal: pair}]}), /requires exactly one named blocker\/attacker pair/, "malformed policy cannot be silently skipped");
}
for (const extra of [{optional: true}, {block: []}, {attack: [sprite]}, {settle: true}]) {
  failure(() => run({...scenario, steps: [scenario.steps[0], {blockIfLegal: [bear, sprite], ...extra}]}), /requires exactly one named blocker\/attacker pair/, "another action or fallback cannot mask a policy");
}
failure(() => run({...scenario, steps: [{blockIfLegal: [bear, sprite]}]}), /requires this combat's blocker declaration phase/, "policy before combat is refused");
failure(() => run({...scenario, steps: [...scenario.steps, {blockIfLegal: [bear, sprite]}]}), /requires this combat's blocker declaration phase/, "policy after combat is refused");
for (const [pair, pattern] of [[["Absent", sprite], /blocker Absent is missing/], [[bear, "Absent"], /attacker Absent is missing/], [[sprite, sprite], /not controlled by the defending player/]]) {
  failure(() => run({...scenario, steps: [scenario.steps[0], {blockIfLegal: pair}]}), pattern, "missing or wrong-controller pair is refused rather than counted as evasion");
}
for (const seat of [0, "1", -1]) failure(() => run({...scenario, steps: [scenario.steps[0], {blockIfLegal: [bear, sprite], seat}]}), /seat is not the defending player/, "policy must name the defending seat");
for (const [seat, name, pattern] of [[1, bear, /blocker Ground Bear is ambiguous/], [0, sprite, /attacker Zephyr Sprite is ambiguous/]]) {
  failure(() => run({...scenario, setup: [...scenario.setup, {seat, zone: "battlefield", cards: [name]}]}), pattern, "duplicate names cannot silently select the first object");
}
failure(() => run({...scenario, setup: [...scenario.setup, {seat: 1, zone: "battlefield", cards: ["Wastes"]}],
  steps: [scenario.steps[0], {blockIfLegal: ["Wastes", sprite]}]}), /blocker Wastes is not a creature/, "a land's absent blocker option is not an evasion witness");
failure(() => run({...scenario, setup: [...scenario.setup, {seat: 0, zone: "battlefield", cards: ["Other Attacker"]}],
  steps: [scenario.steps[0], {blockIfLegal: [bear, "Other Attacker"]}]}), /not attacking in this combat/, "the policy names an actual attack");
failure(() => run({...scenario, seats: 3, setup: [...scenario.setup, {seat: 0, zone: "battlefield", cards: ["Other Attacker"]}, {seat: 2, zone: "battlefield", cards: ["Other Bear"]}],
  steps: [{attack: ["Other Attacker", sprite], at: ["Maya", "Trey"]}, {blockIfLegal: ["Other Bear", sprite], seat: 2}]}), /not the defending player being asked/, "one defender's policy cannot answer a different defender's question");

const menace = {...scenario, name: "A single offered Menace pair is not a legal declaration", setup: [{seat: 0, zone: "battlefield", cards: ["Menacing Brute"]}, {seat: 1, zone: "battlefield", cards: [bear]}],
  steps: [{attack: ["Menacing Brute"], at: "Maya"}, {blockIfLegal: [bear, "Menacing Brute"]}, {to: {turn: 1, phase: "MAIN2"}}], expect: [{seat: 1, life: 37}]};
const menacing = run(menace);
eq(menacing.policies[0].branch, "declare-no-blocks", "native full-set legality rejects the individually offered single Menace block");
assert.match(menacing.policies[0].pairReasons[0], /menace/); checks += 1;
const required = {...menace, name: "Neither policy branch may violate blocking requirements", setup: [{seat: 0, zone: "battlefield", cards: ["Required Brute"]}, {seat: 1, zone: "battlefield", cards: [bear, "Other Bear"]}],
  steps: [{attack: ["Required Brute"], at: "Maya"}, {blockIfLegal: [bear, "Required Brute"]}]};
const refused = failure(() => run(required), /cannot declare legal blocks:.*must be blocked/, "an illegal single block does not permit an illegal no-block fallback");
ok(refused.scenarioPolicies[0].pairReasons.some((r) => /menace/.test(r)) && refused.scenarioPolicies[0].reasons.some((r) => /must be blocked/.test(r)), "failure records why each full declaration is illegal");
eq(refused.scenarioPolicies[0].status, "refused", "an illegal no-block proposal is not logged as an executed answer");
const noPair = {...scenario, name: "No offered pair still cannot evade another attack's requirement", setup: [{seat: 0, zone: "battlefield", cards: [sprite, "Required Brute"]}, {seat: 1, zone: "battlefield", cards: [bear, "Other Bear"]}],
  steps: [{attack: [sprite, "Required Brute"], at: "Maya"}, {blockIfLegal: [bear, sprite]}]};
failure(() => run(noPair), /cannot declare legal blocks:.*must be blocked/, "absent evasion pair still validates the no-block declaration");
const ordinary = runScenario({name: "No-policy result shape stays unchanged", expect: [{seat: 0, life: 40}]}, tableCards);
eq(Object.keys(ordinary).sort(), ["events", "passed", "state"], "old scenario results gain no empty policy field");
const oldError = failure(() => runScenario({name: "No-policy error shape stays unchanged", expect: [{seat: 0, life: 41}]}, tableCards), /not 41/, "ordinary assertion failures stay ordinary");
eq(Object.hasOwn(oldError, "scenarioPolicies"), false, "old errors gain no empty policy field");

/* The historical saved Serra scenario ends with an explicit empty block declaration. Its Flying removal only changes
   the offered-blocker list assertion before damage; that must be rejected as offer-only evidence. Saved files stay intact. */
const serraScript = JSON.parse(readFileSync(new URL("../game/engine/cards/s/serra-angel.json", import.meta.url), "utf8"));
const serraFile = JSON.parse(readFileSync(new URL("../game/engine/cards/s/serra-angel.scenarios.json", import.meta.url), "utf8"));
const serraAbility = createExerciseLedger([serraScript]).cards["Serra Angel"].abilities.find((a) => a.keyword === "flying");
const rejected = proveRuntimeAbility({script: serraScript, ability: serraAbility, cards: tableCards,
  scenarios: serraFile.scenarios, fixtures: serraFile.fixtures});
eq(rejected.status, "unobserved", "historical saved Serra blocker-availability failure earns no Flying credit");
ok(rejected.diagnostics.some((d) => d.error.includes("the creatures that may block")), "the rejected historical availability evidence remains visible");
const serraRemoval = runtimeAbilityRemoval(serraScript, serraAbility, tableCards("Serra Angel"));
const serraFailure = failure(() => runScenario(serraFile.scenarios[1], runtimeCardsWithoutAbility(tableCards, "Serra Angel", serraRemoval.definition), serraFile.fixtures),
  /the creatures that may block/, "the unchanged saved scenario reproduces its exact availability failure");
eq(serraFailure.scenarioAssertion, "blocker-offer", "blocker availability has explicit ineligible provenance");
for (const kind of ["keyword", "static", "triggered", "replacement", "activated", "mana", "spell"]) {
  for (const assertion of [{kind: "ability-offer", card: "Some other card", action: "cast"}, {kind: "action-offer", card: sprite, action: "cast"}, {kind: "question-offer"}, {kind: "policy-precheck"}, "blocker-offer"]) {
    const onlyOffer = new Error(`${scenario.name}: an offer changed`); onlyOffer.scenarioAssertion = assertion;
    eq(scenarioBehaviorFailure(onlyOffer, scenario, {subject: sprite, kind}), false, "availability never gets an ability-kind or identity escape");
  }
}
const missing = failure(() => runScenario({name: "Missing cast is a precheck", steps: [{cast: sprite}]}, tableCards), /not offered cast/, "a missing cast offer is identified before any attempt");
eq(missing.scenarioAssertion.kind, "action-offer", "missing legal-action prechecks cannot count as actual execution outcomes");
const castOffer = failure(() => runScenario({name: "Explicit cast offers are still availability", expect: [{offers: {kind: "cast", card: sprite}, count: 1}]}, tableCards), /0.*not 1|offered 0/, "cast-offer mismatch is identified");
eq(castOffer.scenarioAssertion.kind, "ability-offer", "all explicit offer assertions are tagged, not only activated or mana ones");
const question = {name: "Question availability is not an execution outcome", setup: [{seat: 0, zone: "hand", cards: ["Question Spell"]}], steps: [{cast: "Question Spell"}, {resolve: true}]};
for (const ask of [{seat: 1}, {options: ["Orange"]}, {min: 2}]) {
  const asked = failure(() => run({...question, expect: [{asks: ask}]}), /is asked|question offers|question takes/, "asked seat/options/min are availability assertions");
  eq(asked.scenarioAssertion.kind, "question-offer", "question availability has explicit ineligible provenance");
  eq(scenarioBehaviorFailure(asked, question), false, "a question-only mismatch earns no execution proof");
}
const questionCases = [
  [{name: "No question", expect: [{asks: {options: ["White"]}}]}, /nothing is being asked/],
  [{...question, steps: [...question.steps, {choose: ["Orange"]}]}, /no option Orange/],
  [{name: "No choice", steps: [{choose: ["White"]}]}, /nothing is being asked/],
  [{...question, steps: [...question.steps, {to: {turn: 1, phase: "MAIN2"}}]}, /scenario did not answer/],
  [{name: "Missing counted target option", setup: [{seat: 0, zone: "hand", cards: ["Counted Spell"]}, {seat: 1, zone: "battlefield", cards: [bear]}],
    steps: [{cast: "Counted Spell", targets: [[{card: "Absent"}]]}]}, /no .*Absent.* among/],
];
for (const [value, pattern] of questionCases) {
  const unavailable = failure(() => run(value), pattern, "missing question/option and unanswered prompt are availability failures");
  eq(unavailable.scenarioAssertion.kind, "question-offer", "all inspected question prechecks are tagged");
  eq(scenarioBehaviorFailure(unavailable, value), false, "question precheck does not masquerade as a paid or resolved outcome");
}
const emptyStack = failure(() => run({name: "No resolution attempt", steps: [{resolve: true}]}), /nothing on the stack/, "resolve requires an actual object before an attempt");
eq(emptyStack.scenarioAssertion.kind, "action-offer", "missing resolution precheck has ineligible provenance");
eq(scenarioBehaviorFailure(error, scenario), true, "actual final life failure remains eligible");
eq(scenarioBehaviorFailure(refused, required), false, "illegal policy precheck is not actual executed combat proof");

console.log(`scenario-block-policy: ${checks} checks passed; actual loaded Flying Sprite and runtime removal finish combat, both legal policy branches recorded, final damage/life distinguishes them; malformed and illegal declarations refused.`);
