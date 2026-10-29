/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* EVERY DEFINITION AND EVERY SCENARIO, FAST: the loop a card batch runs while it is being written.
 *
 * Each definition playable, faithful to its card and through its smoke game, and every scenario of every card run
 * through the rules, with actual ability evidence and runtime-removal probes always enabled. Missing proof fails.
 * Unknown flags fail; selected/custom directories are diagnostics, not the canonical gate. Usage:
 *
 *   node --stack-size=4000 game/tools/batch/check-cards.mjs
 */
import {CARDS_DIR, loadCardIndex, loadCardScenarios, loadCardScripts} from "../engine-cards.mjs";
import {runScenario} from "../../engine/cards/scenario.mjs";
import {checkFidelity, smokeTest} from "../../engine/cards/compile.mjs";
import {writeFileSync, mkdtempSync} from "node:fs";
import {fileURLToPath} from "node:url";
import {tmpdir} from "node:os";
import path from "node:path";
import {createExerciseLedger, addExerciseEvidence, exerciseSummary, scenarioResolved} from "../ability-evidence.mjs";
import {proveRuntimeAbility, recordRuntimeProof} from "../ability-proof.mjs";
import {parseCardCheckArgs, cardCheckSource, cardInputHashes, abilityLedgerProblems} from "../card-check-policy.mjs";

/** Passing scenarios supply events; the authorized runtime-only supplement supplies explicit counterfactual proofs.
    The CLI always requests both. Exported diagnostic helpers cannot substitute for the canonical directory gate. */
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
  if (!ledger) return 1;
  const unreached = ledger ? exerciseSummary(ledger).abilities - exerciseSummary(ledger).scenarioReached : 0;
  return problems + failed + unreached > 0 ? 1 : 0;
}

export function main(argv = []) {
  const options = parseCardCheckArgs(argv);
  if (options.help) {
    console.log("check-cards [--ability-ledger <out.json>] [--cards <exact names separated by |>] [--card-root <read-only directory>] [--counterfactual]\nStrict ability evidence and runtime-removal probes are always enabled. Selections/custom roots are diagnostics, never the canonical directory gate.");
    return 0;
  }
  const selected = options.selected, cardRoot = path.resolve(options.cardRoot ?? CARDS_DIR);
  const ledgerPath = path.resolve(options.ledgerPath ?? path.join(mkdtempSync(path.join(tmpdir(), "crank-card-check-")), "ability-ledger.json"));
  console.log(`ability ledger: ${ledgerPath}`);
  writeFileSync(ledgerPath, JSON.stringify({measurement: {complete: false}}) + "\n");
  const index = loadCardIndex(cardRoot), allScripts = loadCardScripts(cardRoot).map(({script}) => script);
  if (!allScripts.length) throw new Error("No final definitions in the requested card directory");
  if (selected) for (const name of selected) if (!allScripts.some((script) => script.identity.name === name)) throw new Error(`No final definition named ${name}.`);
  const scripts = selected ? allScripts.filter((script) => selected.includes(script.identity.name)) : allScripts;
  const files = loadCardScenarios(cardRoot).map(({scenarios}) => scenarios).filter((file) => !selected || selected.includes(file.card));
  if (files.some(file => !Array.isArray(file.scenarios))) throw new Error("Each saved scenario file must contain a scenarios array");
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
  const source = {...cardCheckSource(repoRoot), inputs: cardInputHashes(scripts, files)};
  const canonical = !selected && cardRoot === path.resolve(CARDS_DIR);
  const scope = {directory: !selected, canonical, cardDirectory: canonical ? "game/engine/cards" : null, ...(selected ? {selected} : {}), cardRoot};
  if (scope.canonical && source.dirty) throw new Error("Commit source before measuring the canonical gate; keep the output ledger outside the working tree");
  if (scope.canonical && files.some(file => file.scenarios.some(scenario => scenario.sourceChoices === false)))
    throw new Error("Legacy source-choice scenarios belong in replay tests, not the current canonical card gate");
  const ledger = createExerciseLedger(scripts);
  const snapshot = measurement => ({...ledger, scope, source, measurement, summary: exerciseSummary(ledger)});
  let problems = 0;
  console.log(selected ? `${scripts.length} selected definitions of ${allScripts.length}` : `${scripts.length} definitions${scope.canonical ? "" : " in a custom directory (diagnostic only)"}`);
  for (const script of scripts) {
    const name = script.identity.name, resolved = index.resolve(name);
    if (!files.some(file => file.card === name && file.scenarios.length)) {problems += 1; console.log("MISSING SCENARIOS", name);}
    if (!resolved.playable) {problems += 1; console.log("NOT PLAYABLE", name, resolved.problems);}
    const fidelity = checkFidelity(script);
    if (!fidelity.ok) {problems += 1; console.log("FIDELITY", name, JSON.stringify(fidelity));}
    const smoke = smokeTest(script, index.definition);
    if (!smoke.ok) {problems += 1; console.log("SMOKE", name, smoke.problems.join("; ").slice(0, 200));}
  }
  const {runs, failed} = checkScenarios({files, scripts, cards: index.definition, ledger, counterfactual: true,
    onProgress: measurement => writeFileSync(ledgerPath, JSON.stringify(snapshot({...measurement, complete: false}), null, 2) + "\n")});
  console.log(`${runs} scenarios, ${failed} failed`);
  if (ledger) {
    const summary = exerciseSummary(ledger);
    const completed = snapshot({complete: true, counterfactual: true, definitions: scripts.length, scenarios: runs, problems, failed});
    writeFileSync(ledgerPath, JSON.stringify(completed, null, 2) + "\n");
    console.log(`ability coverage: ${summary.scenarioReached} of ${summary.abilities} reached by passing scenarios (${summary.counterfactualReached} by runtime-removal proof); ${summary.abilities - summary.scenarioReached} unreached; ${scope.canonical ? "whole canonical directory" : "diagnostic scope only"}`);
    if (scope.canonical) {
      const gateProblems = abilityLedgerProblems(completed, {scripts, files, cardRoot, source: cardCheckSource(repoRoot)});
      for (const problem of gateProblems) console.log("GATE", problem);
      if (gateProblems.length) return 1;
    }
  }
  return cardCheckExit({problems, failed, ledger});
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) process.exitCode = main(process.argv.slice(2));
