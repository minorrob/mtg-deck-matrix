/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* EVERY DEFINITION AND EVERY SCENARIO, FAST: the loop a card batch runs while it is being written.
 *
 * Each definition playable, faithful to its card and through its smoke game, and every scenario of every card run
 * through the rules -- what tests/engine-cards.mjs proves, printed card by card so a failure names its card and its
 * scenario at once. Exits non-zero when anything fails. Usage, from the repository root:
 *
 *   node --stack-size=4000 game/tools/batch/check-cards.mjs
 */
import {CARDS_DIR, loadCardIndex, loadCardScenarios, loadCardScripts} from "../engine-cards.mjs";
import {runScenario} from "../../engine/cards/scenario.mjs";
import {checkFidelity, smokeTest} from "../../engine/cards/compile.mjs";
import {writeFileSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {createExerciseLedger, addExerciseEvidence, exerciseSummary, scenarioResolved} from "../ability-evidence.mjs";
import {proveRuntimeAbility, recordRuntimeProof} from "../ability-proof.mjs";

/** Passing scenarios supply events; the authorized runtime-only supplement supplies explicit counterfactual proofs.
    Unreached or unobservable abilities remain failures when --ability-ledger is requested. A selected --cards run is
    labeled as a selection and never represented as the whole directory. */
export function checkScenarios({files, scripts, cards, ledger = null, counterfactual = false, report = console.log, onProgress = () => {}, baselines = new Map()}) {
  let runs = 0, failed = 0;
  for (const file of files) {
    for (const scenario of file.scenarios) {
      runs += 1;
      try {
        const result = runScenario(scenario, cards, file.fixtures ?? {});
        if (counterfactual) baselines.set(scenario, {passed: true, checks: result.passed.length, events: result.events.length});
        if (counterfactual && result.policies) baselines.get(scenario).policies = structuredClone(result.policies);
        if (ledger) addExerciseEvidence(ledger, result.events, {scenario: `${file.card}: ${scenario.name}`});
      } catch (error) {
        failed += 1; baselines.set(scenario, {error: error.message});
        report("FAIL", file.card, "|", error.message.slice(0, 240));
      }
    }
  }
  if (ledger) onProgress({phase: "scenarios", scriptsDone: 0});
  let scriptsDone = 0;
  if (ledger && counterfactual) for (const script of scripts) {
    const name = script.identity.name, file = files.find((f) => f.card === name);
    if (!file) continue;
    for (const ability of ledger.cards[name].abilities) {
      if (scenarioResolved(ability)) continue;
      const proof = proveRuntimeAbility({script, ability, cards, scenarios: file.scenarios, fixtures: file.fixtures ?? {}, baselines});
      if (proof.status === "proved") recordRuntimeProof(ledger, name, ability.path, proof);
      else ability.counterfactualUnobserved = {reason: proof.reason, diagnostics: proof.diagnostics ?? []};
    }
    scriptsDone += 1;
    if (scriptsDone % 250 === 0) {report(`ability progress: ${scriptsDone} of ${scripts.length} definitions`); onProgress({phase: "counterfactual", scriptsDone});}
  }
  return {runs, failed};
}

export function cardCheckExit({problems = 0, failed = 0, ledger = null}) {
  const unreached = ledger ? exerciseSummary(ledger).abilities - exerciseSummary(ledger).scenarioReached : 0;
  return problems + failed + unreached > 0 ? 1 : 0;
}

export function main(argv = []) {
  const arg = (name) => {const i = argv.indexOf(name); return i < 0 ? null : argv[i + 1];};
  const ledgerPath = arg("--ability-ledger"), selected = arg("--cards")?.split("|") ?? null, cardRoot = arg("--card-root") ?? CARDS_DIR;
  if (argv.includes("--ability-ledger") && (!ledgerPath || ledgerPath.startsWith("--"))) throw new Error("--ability-ledger needs an output path.");
  if (argv.includes("--counterfactual") && !ledgerPath) throw new Error("--counterfactual requires --ability-ledger.");
  if (argv.includes("--cards") && (!selected?.length || selected.some((name) => !name))) throw new Error("--cards takes exact names separated by |.");
  if (argv.includes("--card-root") && (!arg("--card-root") || arg("--card-root").startsWith("--"))) throw new Error("--card-root needs a read-only card-directory path.");
  const index = loadCardIndex(cardRoot), allScripts = loadCardScripts(cardRoot).map(({script}) => script);
  if (selected) for (const name of selected) if (!allScripts.some((script) => script.identity.name === name)) throw new Error(`No final definition named ${name}.`);
  const scripts = selected ? allScripts.filter((script) => selected.includes(script.identity.name)) : allScripts;
  const files = loadCardScenarios(cardRoot).map(({scenarios}) => scenarios).filter((file) => !selected || selected.includes(file.card));
  let problems = 0;
  console.log(selected ? `${scripts.length} selected definitions of ${index.size}` : `${index.size} definitions`);
  for (const script of scripts) {
    const name = script.identity.name, resolved = index.resolve(name);
    if (!resolved.playable) {problems += 1; console.log("NOT PLAYABLE", name, resolved.problems);}
    const fidelity = checkFidelity(script);
    if (!fidelity.ok) {problems += 1; console.log("FIDELITY", name, JSON.stringify(fidelity));}
    const smoke = smokeTest(script, index.definition);
    if (!smoke.ok) {problems += 1; console.log("SMOKE", name, smoke.problems.join("; ").slice(0, 200));}
  }
  const ledger = ledgerPath ? createExerciseLedger(scripts) : null;
  const scope = {...(selected ? {selected} : {directory: true}), cardRoot};
  const {runs, failed} = checkScenarios({files, scripts, cards: index.definition, ledger, counterfactual: argv.includes("--counterfactual"),
    onProgress: (measurement) => writeFileSync(ledgerPath, JSON.stringify({...ledger, scope, measurement: {...measurement, complete: false}, summary: exerciseSummary(ledger)}, null, 2) + "\n")});
  console.log(`${runs} scenarios, ${failed} failed`);
  if (ledger) {
    const summary = exerciseSummary(ledger);
    writeFileSync(ledgerPath, JSON.stringify({...ledger, scope, measurement: {complete: true}, summary}, null, 2) + "\n");
    console.log(`ability coverage: ${summary.scenarioReached} of ${summary.abilities} reached by passing scenarios (${summary.counterfactualReached} by runtime-removal proof); ${summary.abilities - summary.scenarioReached} unreached; ${selected ? "selection only" : "whole directory"}`);
  }
  return cardCheckExit({problems, failed, ledger});
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main(process.argv.slice(2));
