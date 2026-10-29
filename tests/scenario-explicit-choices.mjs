/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {tableCards} from "../cloud/game-room.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {awaitingChoice} from "../game/engine/rules/turn.mjs";
import {checkScenarios} from "../game/tools/batch/check-cards.mjs";
import {createExerciseLedger, exerciseSummary} from "../game/tools/ability-evidence.mjs";
import {proveRuntimeAbility, scenarioBehaviorFailure} from "../game/tools/ability-proof.mjs";

let checks = 0;
const eq = (actual, expected, message) => {assert.deepEqual(actual, expected, message); checks++;};
const ok = (value, message) => {assert.ok(value, message); checks++;};
const fixtures = {
  "Ground Bear": {types: ["Creature"], power: 2, toughness: 2},
  "Free Bear": {types: ["Creature"], manaCost: "{0}", power: 2, toughness: 2},
  "Legendary Bear": {types: ["Creature"], supertypes: ["Legendary"], manaCost: "{0}", power: 2, toughness: 2},
  "Required Bear": {types: ["Creature"], power: 2, toughness: 2,
    abilities: [{kind: "static", rule: "attacks-each-combat", affects: {what: "permanent", self: true}}]},
  "Required Block Bear": {types: ["Creature"], power: 2, toughness: 2,
    abilities: [{kind: "static", rule: "must-be-blocked", affects: {what: "permanent", self: true}}]},
  "Question Spell": {types: ["Instant"], manaCost: "{0}", spell: {id: "s", effects: [{effect: "chooseColor"}]}},
  "Prompt Bear": {types: ["Creature"], manaCost: "{0}", power: 2, toughness: 2, abilities: [{id: "enter", kind: "triggered",
    trigger: {on: "GameEventCardChangeZone", to: "Battlefield", who: "self"}, effects: [{effect: "chooseColor"}, {effect: "gainLife", amount: 1}]}]},
  "Two Color Rock": {types: ["Artifact"], abilities: [{id: "g", kind: "mana", tapSelf: true, produces: {G: 1}},
    {id: "u", kind: "mana", tapSelf: true, produces: {U: 1}}]},
  "Counted Spell": {types: ["Instant"], manaCost: "{0}", spell: {id: "s", targets: [{what: "permanent", types: ["Creature"], count: {min: 1, max: 2}}],
    effects: [{effect: "draw", count: 1}]}},
};
const run = (scenario, explicitChoices = true) => runScenario(scenario, tableCards, fixtures, {explicitChoices});
const rejects = (scenario, pattern) => {
  let error; try {run(scenario);} catch (caught) {error = caught;}
  ok(error instanceof Error, "strict evidence rejects the actual native scenario");
  assert.match(error.message, pattern); checks++;
  eq(error.scenarioAssertion?.kind, "choice-policy", "the failure identifies missing scenario decisions");
  eq(scenarioBehaviorFailure(error, scenario), false, "a policy failure cannot prove a removed ability");
  return error;
};
const missing = {name: "unavailable optional land", steps: [{play: "Wastes", optional: true}], expect: [{seat: 0, life: 40}]};
eq(run(missing, false).state.players[0].life, 40, "the former runner silently skipped this unavailable move");
rejects(missing, /optional move is unavailable/);
rejects({...missing, name: "saved scenarios cannot opt out", explicitChoices: false}, /optional move is unavailable/);
const present = {...missing, name: "available optional land is actually played", setup: [{seat: 0, zone: "hand", cards: ["Wastes"]}],
  expect: [{seat: 0, zone: "battlefield", cards: ["Wastes"]}]};
eq(run(present).state.zones.battlefield.length, 1, "an available optional move still has to execute");

const any = {name: "any target is not explicit", setup: [{seat: 0, zone: "hand", cards: ["Lightning Bolt"]},
  {seat: 0, zone: "battlefield", cards: ["Mountain"]}], steps: [{tap: "Mountain", mana: {R: 1}}, {cast: "Lightning Bolt", targets: "any"}, {settle: true}], expect: [{stack: 0}]};
eq(run(any, false).state.stack.length, 0, "the former runner picked an aim and resolved a real Bolt");
rejects(any, /targets: any/);
const bolt = {...any, name: "explicit Bolt resolves through settle without answering anything",
  steps: [any.steps[0], {cast: "Lightning Bolt", targets: [{player: 1}]}, {settle: true}], expect: [{seat: 1, life: 37}, {stack: 0}]};
eq(run(bolt).state.players[1].life, 37, "settle may resolve a stack that presents no choices");

const automatic = {name: "settle cannot select a color", setup: [{seat: 0, zone: "hand", cards: ["Question Spell"]}],
  steps: [{cast: "Question Spell"}, {settle: true}], expect: [{stack: 0}]};
eq(run(automatic, false).state.awaiting, null, "the old settle implementation supplied its first color");
rejects(automatic, /settle cannot answer/);
rejects({...automatic, name: "navigation cannot select a color", steps: [{cast: "Question Spell"}, {resolve: true}, {to: {turn: 2, phase: "MAIN1", settle: true}}]}, /settle cannot answer/);
const answered = {...automatic, name: "explicit color answer resumes once", steps: [{cast: "Question Spell"}, {resolve: true}, {choose: ["Red"]}, {settle: true}]};
eq(run(answered).state.awaiting, null, "an explicit answer completes the actual question");

const colors = {name: "mana output is selected explicitly", setup: [{seat: 0, zone: "battlefield", cards: ["Two Color Rock"]}],
  steps: [{tap: "Two Color Rock"}], expect: [{seat: 0, pool: {G: 1}}]};
rejects(colors, /matching actions/);
eq(run({...colors, steps: [{tap: "Two Color Rock", mana: {U: 1}}], expect: [{seat: 0, pool: {G: 0, U: 1}}]}).state.players[0].manaPool.U, 1,
  "the other legal output is executable with a named mana choice");

const multiplayer = {name: "attacks name their defender", seats: 3, setup: [{seat: 0, zone: "battlefield", cards: ["Ground Bear"]}],
  steps: [{attack: ["Ground Bear"]}], expect: [{seat: 1, life: 40}]};
rejects(multiplayer, /explicit defending player/);
eq(run({...multiplayer, steps: [{attack: ["Ground Bear"], at: "Trey"}, {to: {turn: 1, phase: "MAIN2"}}], expect: [{seat: 2, life: 38}]}).state.players[2].life, 38,
  "the named third seat receives actual combat damage");
const duplicateAttack = {name: "same-name attackers need physical choices", setup: [{seat: 0, zone: "battlefield", cards: ["Ground Bear", "Ground Bear"]}],
  steps: [{attack: ["Ground Bear"], at: "Maya"}]};
rejects(duplicateAttack, /physical attackers/);
eq(run({...duplicateAttack, steps: [{to: {turn: 1, phase: "COMBAT_DECLARE_ATTACKERS", ask: "declare-attackers"}}, {answer: [1]}, {to: {turn: 1, phase: "MAIN2"}}],
  expect: [{seat: 1, life: 38}]}).state.players[1].life, 38, "an indexed physical attacker executes the intended single attack");
for (const ask of [0, false, [], {}, ""]) rejects({name: `invalid requested question ${JSON.stringify(ask)}`, steps: [{to: {turn: 1, phase: "MAIN2", ask}}]}, /ask must name/);
assert.throws(() => run({name: "priority is not the requested question", steps: [{to: {turn: 1, phase: "MAIN1", ask: "choose-targets"}}]}), /never reached/); checks++;
assert.throws(() => run({...automatic, name: "requested kind must match the pending question", steps: [{cast: "Question Spell"}, {resolve: true},
  {to: {turn: 1, phase: "MAIN1", ask: "legend-rule"}}]}), /scenario did not answer/); checks++;
const duplicateBlock = {name: "same-name blockers need physical choices", setup: [{seat: 0, zone: "battlefield", cards: ["Ground Bear"]},
  {seat: 1, zone: "battlefield", cards: ["Ground Bear", "Ground Bear"]}], steps: [{attack: ["Ground Bear"], at: "Maya"}, {block: [["Ground Bear", "Ground Bear"]]}]};
rejects(duplicateBlock, /physical blockers/);
eq(run({...duplicateBlock, steps: [duplicateBlock.steps[0], {to: {turn: 1, phase: "COMBAT_DECLARE_BLOCKERS", ask: "declare-blockers"}}, {answer: [1]}, {to: {turn: 1, phase: "MAIN2"}}],
  expect: [{seat: 1, life: 40}]}).state.players[1].life, 40, "an indexed physical blocker prevents the actual combat hit");
const duplicateTarget = {name: "same-name counted targets need physical choices", setup: [{seat: 0, zone: "hand", cards: ["Counted Spell"]},
  {seat: 1, zone: "battlefield", cards: ["Ground Bear", "Ground Bear"]}], steps: [{cast: "Counted Spell", targets: [[{card: "Ground Bear", seat: 1}]]}]};
rejects(duplicateTarget, /physical targets/);
eq(run({...duplicateTarget, steps: [{cast: "Counted Spell", targets: [{ask: true}]}, {answer: [1]}, {settle: true}], expect: [{seat: 0, zone: "hand", cards: ["Wastes"]}]}).state.zones.hand[0].length, 1,
  "an explicit counted target index commits and the real spell effect resolves");
eq(run({...duplicateTarget, steps: [{cast: "Counted Spell", targets: [{ask: true}]}]}).state.awaiting.kind, "choose-targets", "deferred target selection remains a real pending question");
assert.throws(() => run({...bolt, name: "scalar target is not a deferred counted question", steps: [bolt.steps[0], {cast: "Lightning Bolt", targets: [{ask: true}]}]}), /not offered/); checks++;
const required = {name: "navigation does not choose a forced attack", seats: 3, setup: [{seat: 0, zone: "battlefield", cards: ["Required Bear"]}],
  steps: [{to: {turn: 1, phase: "MAIN2"}}], expect: [{seat: 1, life: 38}]};
rejects(required, /required attacks/);
eq(run({...required, steps: [{attack: ["Required Bear"], at: "Trey"}, {to: {turn: 1, phase: "MAIN2"}}], expect: [{seat: 2, life: 38}]}).state.players[2].life, 38,
  "explicit declaration satisfies the required attack against the chosen defender");
const blocking = {name: "navigation does not choose a forced block", setup: [{seat: 0, zone: "battlefield", cards: ["Required Block Bear"]},
  {seat: 1, zone: "battlefield", cards: ["Ground Bear"]}], steps: [{attack: ["Required Block Bear"], at: "Maya"}, {to: {turn: 1, phase: "MAIN2"}}]};
rejects(blocking, /required blocks/);
eq(run({...blocking, steps: [blocking.steps[0], {block: [["Ground Bear", "Required Block Bear"]]}, blocking.steps[1]],
  expect: [{seat: 1, life: 40}, {seat: 0, zone: "graveyard", cards: ["Required Block Bear"]}]}).state.players[1].life, 40,
  "the explicit required block resolves actual combat");
const ordered = {name: "trigger order cannot be inferred", setup: [{seat: 0, zone: "battlefield", cards: ["Soul Warden", "Soul Warden"]},
  {seat: 0, zone: "hand", cards: ["Free Bear"]}], steps: [{cast: "Free Bear"}, {resolve: true}, {to: {turn: 1, phase: "MAIN2"}}]};
rejects(ordered, /trigger order/);
const triggerOptions = awaitingChoice(run({...ordered, steps: ordered.steps.slice(0, 2)}).state).options;
eq(triggerOptions[0].label, triggerOptions[1].label, "the two actual Soul Warden sources have identical option labels");
rejects({...ordered, name: "same-name trigger options require indices", steps: [...ordered.steps.slice(0, 2), {choose: triggerOptions.map(o => o.label)}]}, /ambiguous/);
eq(run({...ordered, steps: [ordered.steps[0], ordered.steps[1], {answer: [1, 0]}, {settle: true}], expect: [{seat: 0, life: 42}]}).state.players[0].life, 42,
  "both real Soul Warden triggers resolve after the explicit permutation");
const legend = {name: "legend rule cannot keep the first object", setup: [{seat: 0, zone: "battlefield", cards: ["Legendary Bear"]},
  {seat: 0, zone: "hand", cards: ["Legendary Bear"]}], steps: [{cast: "Legendary Bear"}, {resolve: true}, {to: {turn: 1, phase: "MAIN2"}}]};
rejects(legend, /legend rule/);
eq(run({...legend, steps: [...legend.steps.slice(0, 2), {answer: [1]}, legend.steps[2]], expect: [{seat: 0, zone: "graveyard", cards: ["Legendary Bear"]}]}).state.zones.graveyard[0].length, 1,
  "an explicit physical legend choice survives and the other goes to its graveyard");

const script = JSON.parse(readFileSync(new URL("../game/engine/cards/g/glorious-anthem.json", import.meta.url)));
const witness = {...automatic, name: "automatic answers cannot supply a static behavior baseline",
  setup: [...automatic.setup, {seat: 0, zone: "battlefield", cards: ["Glorious Anthem", "Ground Bear"]}],
  expect: [{seat: 0, stats: {card: "Ground Bear", power: 3, toughness: 3}}]};
eq(run(witness, false).passed.length, 1, "a legacy passing baseline includes an actual static boost");
const ledger = createExerciseLedger([script]), ability = ledger.cards[script.identity.name].abilities[0];
const cached = new Map([[witness, {passed: true, checks: 1, events: 0}]]);
const proof = proveRuntimeAbility({script, ability, cards: tableCards, scenarios: [witness], fixtures, baselines: cached});
eq(proof.status, "unobserved", "an untagged legacy passing cache cannot bypass strict baseline execution");
ok(proof.diagnostics.some(d => d.reason === "baseline failed" && /settle cannot answer/.test(d.error)), "the actual baseline's missing answer is retained");
eq(cached.get(witness).choicePolicy, "explicit", "cached failures preserve which policy was actually checked");
const result = checkScenarios({files: [{card: script.identity.name, scenarios: [witness], fixtures}], scripts: [script], cards: tableCards,
  ledger, counterfactual: true, report: () => {}});
eq(result, {runs: 1, failed: 1}, "the normal checker enforces the native strict failure");
eq(exerciseSummary(ledger).scenarioReached, 0, "failed automatic scenarios contribute no journal or omission evidence");
const explicitWitness = {...witness, name: "explicit static witness", steps: answered.steps};
eq(proveRuntimeAbility({script, ability, cards: tableCards, scenarios: [explicitWitness], fixtures}).status, "proved",
  "the same original final stat assertion proves the static ability after its answer is explicit");
const orbScript = JSON.parse(readFileSync(new URL("../game/engine/cards/e/elesh-norn-mother-of-machines.json", import.meta.url)));
const orbAbility = createExerciseLedger([orbScript]).cards[orbScript.identity.name].abilities.find(a => a.text.includes("don't cause"));
const orbScenario = {name: "removal cannot introduce an automatic answer", setup: [{seat: 1, zone: "battlefield", cards: [orbScript.identity.name]},
  {seat: 0, zone: "hand", cards: ["Prompt Bear"]}], steps: [{cast: "Prompt Bear"}, {settle: true}], expect: [{seat: 0, life: 40}]};
eq(run(orbScenario).state.players[0].life, 40, "actual Elesh Norn suppresses the real opposing ETB trigger in the baseline");
const orbProof = proveRuntimeAbility({script: orbScript, ability: orbAbility, cards: tableCards, scenarios: [orbScenario], fixtures});
eq(orbProof.status, "unobserved", "the changed runtime must obey the same explicit-answer policy");
ok(orbProof.diagnostics.some(d => /settle cannot answer/.test(d.error)), `the removal's actual unanswered question receives no behavior credit: ${JSON.stringify(orbProof)}`);
console.log(`scenario-explicit-choices: ${checks} checks; native missing decisions fail without ability credit; explicit outcomes still execute`);
