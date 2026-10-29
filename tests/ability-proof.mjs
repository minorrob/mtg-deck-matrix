/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {tableCards} from "../cloud/game-room.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {createExerciseLedger, exerciseSummary} from "../game/tools/ability-evidence.mjs";
import {runtimeAbilityRemoval, proveRuntimeAbility, recordRuntimeProof, scenarioBehaviorFailure, runtimeCardsWithoutAbility} from "../game/tools/ability-proof.mjs";
import {checkScenarios, cardCheckExit} from "../game/tools/batch/check-cards.mjs";

let checks = 0;
const ok = (c, m) => {assert.ok(c, m); checks += 1;};
const eq = (a, b, m) => {assert.deepEqual(a, b, m); checks += 1;};
const read = (file) => JSON.parse(readFileSync(new URL(`../game/engine/cards/${file}.json`, import.meta.url), "utf8"));
const scripts = [read("t/thran-dynamo"), read("g/glorious-anthem"), read("s/serra-angel")];
const ledger = createExerciseLedger(scripts);
const fixtures = {"Ground Bear": {types: ["Creature"], colors: ["G"], power: 2, toughness: 2}};
const files = [
  {card: "Thran Dynamo", scenarios: [{name: "Mana is actually produced", setup: [{seat: 0, zone: "battlefield", cards: ["Thran Dynamo"]}], steps: [{tap: "Thran Dynamo"}], expect: [{seat: 0, pool: {C: 3}}]}]},
  {card: "Glorious Anthem", fixtures, scenarios: [{name: "The other creature is actually boosted", setup: [{seat: 0, zone: "battlefield", cards: ["Glorious Anthem", "Ground Bear"]}], expect: [{seat: 0, stats: {card: "Ground Bear", power: 3, toughness: 3}}]}]},
  {card: "Serra Angel", fixtures, scenarios: [{name: "Flying actually prevents a ground block and vigilance prevents tapping", setup: [{seat: 0, zone: "battlefield", cards: ["Serra Angel"]}, {seat: 1, zone: "battlefield", cards: ["Ground Bear"]}],
    steps: [{attack: ["Serra Angel"], at: "Maya"}, {blockIfLegal: ["Ground Bear", "Serra Angel"]}, {to: {turn: 1, phase: "MAIN2"}}],
    expect: [{seat: 1, life: 36}, {seat: 0, tapped: "Serra Angel", is: false}]}]},
];
for (const file of files) for (const scenario of file.scenarios) ok(runScenario(scenario, tableCards, file.fixtures).passed.length > 0, `${file.card}: baseline behavior passes before any runtime mutation`);
const before = tableCards("Thran Dynamo");
const removed = runtimeAbilityRemoval(scripts[0], ledger.cards["Thran Dynamo"].abilities[0], before);
eq(removed.status, "ready", "one compiled mana ability can be removed without changing script structure");
eq(removed.definition.abilities.length, before.abilities.length - 1, "exactly that runtime ability is omitted");
eq(tableCards("Thran Dynamo"), before, "the saved/runtime source is unchanged");
const replaced = runtimeCardsWithoutAbility(tableCards, "Thran Dynamo", removed.definition);
eq(replaced("Plains"), tableCards("Plains"), "every other card keeps its original runtime definition");
eq(replaced.uses, 0, "supporting-card lookups do not claim the subject was used");
eq(replaced("thran dynamo"), removed.definition, "only the named subject gets the omitted ability, with normal folded-name lookup");
eq(replaced.uses, 1, "the subject lookup is observed");
const first = proveRuntimeAbility({script: scripts[0], ability: ledger.cards["Thran Dynamo"].abilities[0], cards: tableCards, scenarios: files[0].scenarios});
eq(first.status, "unobserved", "a missing activation offer does not prove actual mana production changed");
ok(first.diagnostics.some((d) => d.error.includes("not offered activate-mana")), "the rejected missing-offer evidence is retained as a diagnostic");
const boosted = proveRuntimeAbility({script: scripts[1], ability: ledger.cards["Glorious Anthem"].abilities[0], cards: tableCards, scenarios: files[1].scenarios, fixtures});
eq([boosted.status, boosted.baseline.status, boosted.result.status], ["proved", "passed", "failed"], "actual changed creature stats prove the static behavior against a green baseline");
ok(recordRuntimeProof(ledger, "Glorious Anthem", "abilities[0]", boosted), "a passed-baseline behavior failure is recorded");
ok(!recordRuntimeProof(ledger, "Glorious Anthem", "abilities[0]", {...boosted, baseline: {status: "failed"}}), "a red baseline cannot prove the removal");
const unused = proveRuntimeAbility({script: scripts[1], ability: ledger.cards["Glorious Anthem"].abilities[0], cards: tableCards,
  scenarios: [{name: "Presence alone proves nothing", setup: [{seat: 0, zone: "battlefield", cards: ["Glorious Anthem"]}], expect: [{seat: 0, zone: "battlefield", count: 1}]}]});
eq(unused.status, "unobserved", "merely placing an ability on the battlefield is not evidence it applied");
const offerOnly = proveRuntimeAbility({script: scripts[0], ability: ledger.cards["Thran Dynamo"].abilities[0], cards: tableCards,
  scenarios: [{name: "An ability is only offered", setup: [{seat: 0, zone: "battlefield", cards: ["Thran Dynamo"]}], expect: [{offers: {kind: "activate-mana", card: "Thran Dynamo"}, count: 1}]}]});
eq(offerOnly.status, "unobserved", "an ability offer without activation is not execution proof");
let clockCalls = 0;
const timedOut = proveRuntimeAbility({script: scripts[0], ability: ledger.cards["Thran Dynamo"].abilities[0], cards: tableCards, scenarios: files[0].scenarios,
  now: () => (clockCalls++ === 0 ? 0 : 31000)});
eq(timedOut.status, "unobserved", "an over-budget probe never supplies execution proof");
ok(timedOut.diagnostics.some((d) => d.reason === "probe time budget exceeded" && d.elapsedMs === 31000), "the exact probe budget failure is retained");
const keywordPresence = proveRuntimeAbility({script: scripts[2], ability: ledger.cards["Serra Angel"].abilities[0], cards: tableCards,
  scenarios: [{name: "A keyword marker is present", setup: [{seat: 0, zone: "battlefield", cards: ["Serra Angel"]}], expect: [{seat: 0, keywords: {card: "Serra Angel", has: ["Flying"]}}]}]});
eq(keywordPresence.status, "unobserved", "a keyword-list assertion alone does not prove flying evasion applied");
const markerError = new Error("Probe: lacks Flying"); markerError.scenarioAssertion = "keyword-presence";
ok(!scenarioBehaviorFailure(markerError, {name: "Probe"}), "counterfactual proof excludes keyword-presence assertion provenance");
const limitError = new Error("Probe: never reached main phase"); limitError.scenarioAssertion = "step-limit";
ok(!scenarioBehaviorFailure(limitError, {name: "Probe"}), "a step limit is not credited as execution proof");
const badBaseline = proveRuntimeAbility({script: scripts[0], ability: ledger.cards["Thran Dynamo"].abilities[0], cards: tableCards,
  scenarios: [{...files[0].scenarios[0], expect: [{seat: 0, pool: {C: 99}}]}]});
eq(badBaseline.status, "unobserved", "an already failing scenario cannot be credited");
ok(badBaseline.diagnostics.some((d) => d.reason === "baseline failed"), "the failed baseline is named");
ok(!scenarioBehaviorFailure(new Error("invalid runtime effect"), {name: "Probe"}), "a generic engine exception is not proof");
ok(!scenarioBehaviorFailure(new Error("FIDELITY missing text"), {name: "Probe"}), "fidelity validation is not behavior proof");
ok(!scenarioBehaviorFailure(new Error("SCHEMA invalid shape"), {name: "Probe"}), "schema validation is not behavior proof");
eq(runtimeAbilityRemoval({...scripts[0], back: {}}, ledger.cards["Thran Dynamo"].abilities[0], before).status, "unobserved", "compound runtime representations remain unknown");
eq(runtimeAbilityRemoval(scripts[0], ledger.cards["Thran Dynamo"].abilities[0], {...before, abilities: [...before.abilities, ...before.abilities]}).status, "unobserved", "ambiguous runtime IDs cannot claim one-ability removal");
eq(runtimeAbilityRemoval(scripts[0], {...ledger.cards["Thran Dynamo"].abilities[0], runtimeId: "missing"}, before).status, "unobserved", "an absent runtime component stays unknown");
const shadow = proveRuntimeAbility({script: scripts[1], ability: ledger.cards["Glorious Anthem"].abilities[0], cards: tableCards, scenarios: files[1].scenarios,
  fixtures: {...fixtures, "Glorious Anthem": tableCards("Glorious Anthem")}});
eq(shadow.status, "unobserved", "a fixture hiding the subject's definition cannot supply counterfactual evidence");
const cachedBaselines = new Map();
const result = checkScenarios({files, scripts, cards: tableCards, ledger, counterfactual: true, report: () => {}, baselines: cachedBaselines});
eq([result.runs, result.failed], [3, 0], "the original scenarios remain green; only valid runtime omissions make their counterfactuals fail");
ok([...cachedBaselines.values()].every((b) => b.passed === true && typeof b.checks === "number" && !b.state && !b.result), "a full-directory sweep retains baseline counts, not thousands of game states");
const summary = exerciseSummary(ledger);
eq([summary.abilities, summary.scenarioReached, summary.counterfactualReached], [4, 3, 3], "static boost, final Flying damage and vigilance have behavior proof; missing mana offer remains unproved");
ok(!summary.scenarioComplete, "the missing mana behavior proof keeps the selected gate red");
eq(summary.exercised, 0, "scenario proof is never credited as a clean whole-game card exercise");
ok(ledger.cards["Serra Angel"].abilities.every((a) => a.counterfactual?.[0].result.message.includes("Flying actually prevents")), "each keyword's proof preserves its scenario and failing behavior");
const untouched = createExerciseLedger(scripts);
checkScenarios({files, scripts, cards: tableCards, ledger: untouched, counterfactual: false, report: () => {}});
ok(!exerciseSummary(untouched).scenarioComplete, "journal-only observations still leave the unobservable abilities unmet");
eq(cardCheckExit({ledger: untouched}), 1, "an ability-ledger run exits nonzero for unreached abilities even with passing original scenarios");
eq(cardCheckExit({ledger}), 1, "a rejected missing-offer proof cannot make the gate green");
const complete = createExerciseLedger([scripts[1]]);
recordRuntimeProof(complete, "Glorious Anthem", "abilities[0]", boosted);
eq(cardCheckExit({ledger: complete}), 0, "a fully reached selected static behavior passes the ability portion of the check");
eq(cardCheckExit({ledger, failed: 1}), 1, "a failed original scenario cannot be hidden by ability evidence");
const bolt = read("l/lightning-bolt"), boltLedger = createExerciseLedger([bolt]);
const boltFile = {card: "Lightning Bolt", scenarios: [{name: "The spell really resolves", setup: [{seat: 0, zone: "battlefield", cards: ["Mountain"]}, {seat: 0, zone: "hand", cards: ["Lightning Bolt"]}],
  steps: [{tap: "Mountain"}, {cast: "Lightning Bolt", targets: [{player: 1}]}, {resolve: true}], expect: [{seat: 1, life: 37}]}]};
eq(checkScenarios({files: [boltFile], scripts: [bolt], cards: tableCards, ledger: boltLedger, report: () => {}}).failed, 0, "observable spell behavior passes its original scenario");
eq(exerciseSummary(boltLedger).scenarioReached, 1, "check-cards wires actual scenario resolution events into the ability ledger");
console.log(`ability-proof: ${checks} checks passed; baseline-verified runtime removal proves static, final Flying damage and vigilance behavior; missing offers receive no credit, without saved card/rule edits.`);
