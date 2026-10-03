/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* EVERY DEFINITION AND EVERY SCENARIO, FAST: the loop a card batch runs while it is being written.
 *
 * Each definition playable, faithful to its card and through its smoke game, and every scenario of every card run
 * through the rules -- what tests/engine-cards.mjs proves, printed card by card so a failure names its card and its
 * scenario at once. Exits non-zero when anything fails. Usage, from the repository root:
 *
 *   node --stack-size=4000 game/tools/batch/check-cards.mjs
 */
import {loadCardIndex, loadCardScenarios, loadCardScripts} from "../engine-cards.mjs";
import {runScenario} from "../../engine/cards/scenario.mjs";
import {checkFidelity, smokeTest} from "../../engine/cards/compile.mjs";

const index = loadCardIndex();
let problems = 0;
console.log(`${index.size} definitions`);
for (const name of index.names) {
  const resolved = index.resolve(name);
  if (!resolved.playable) { problems += 1; console.log("NOT PLAYABLE", name, resolved.problems); }
}
for (const {script} of loadCardScripts()) {
  const fidelity = checkFidelity(script);
  if (!fidelity.ok) { problems += 1; console.log("FIDELITY", script.identity.name, JSON.stringify(fidelity)); }
  const smoke = smokeTest(script, index.definition);
  if (!smoke.ok) { problems += 1; console.log("SMOKE", script.identity.name, smoke.problems.join("; ").slice(0, 200)); }
}
let runs = 0, failed = 0;
for (const {scenarios: file} of loadCardScenarios()) {
  for (const scenario of file.scenarios) {
    runs += 1;
    try { runScenario(scenario, index.definition, file.fixtures ?? {}); } catch (e) { failed += 1; console.log("FAIL", file.card, "|", e.message.slice(0, 240)); }
  }
}
console.log(`${runs} scenarios, ${failed} failed`);
process.exitCode = problems + failed > 0 ? 1 : 0;
