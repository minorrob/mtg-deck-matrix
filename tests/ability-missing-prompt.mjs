/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */
/* A missing entry-choice prompt is availability, not an executed ability. These actual-card regressions protect the
   current classifier from the stale verifier that credited the three choose replacements in an 8/10 selected ledger. */
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {tableCards} from "../cloud/game-room.mjs";
import {runScenario} from "../game/engine/cards/scenario.mjs";
import {createExerciseLedger} from "../game/tools/ability-evidence.mjs";
import {proveRuntimeAbility, runtimeAbilityRemoval, runtimeCardsWithoutAbility, recordRuntimeProof, scenarioBehaviorFailure} from "../game/tools/ability-proof.mjs";

let checks = 0;
const eq = (actual, expected, message) => {assert.deepEqual(actual, expected, message); checks += 1;};
const ok = (value, message) => {assert.ok(value, message); checks += 1;};
for (const [slug, path, scenarioName] of [
  ["a/adaptive-automaton", "abilities[0]", "Elf: his other Elf 2/2; the Automaton an Elf too, not pumped by itself"],
  ["m/metallic-mimic", "abilities[0]", "Elf: the next Elf enters with a +1/+1 counter"],
  ["r/roaming-throne", "abilities[1]", "Elf: chosen as it enters"],
]) {
  const script = JSON.parse(readFileSync(new URL(`../game/engine/cards/${slug}.json`, import.meta.url), "utf8"));
  const file = JSON.parse(readFileSync(new URL(`../game/engine/cards/${slug}.scenarios.json`, import.meta.url), "utf8"));
  const name = script.identity.name, original = tableCards(name), ledger = createExerciseLedger([script]);
  const ability = ledger.cards[name].abilities.find((entry) => entry.path === path);
  eq(ability.kind, "replacement", `${name}: probe removes the actual entry-choice replacement`);
  const scenarios = file.scenarios.filter((scenario) => scenario.name === scenarioName);
  eq(scenarios.length, 1, `${name}: exactly the original prompt scenario is selected; future behavioral witnesses remain eligible`);
  const scenario = scenarios[0], fixtures = file.fixtures ?? {};
  const baseline = runScenario(scenario, tableCards, fixtures);
  ok(baseline.passed.length > 0, `${name}: unchanged actual card finishes its valid choice scenario`);
  const removal = runtimeAbilityRemoval(script, ability, original);
  eq(removal.status, "ready", `${name}: exactly its compiled replacement is removable`);
  const proof = proveRuntimeAbility({script, ability, cards: tableCards, scenarios: [scenario], fixtures});
  eq(proof.status, "unobserved", `${name}: missing prompt cannot be credited as actual replacement execution`);
  ok(proof.diagnostics.some((entry) => entry.error.endsWith(": nothing is being asked")), `${name}: exact rejected missing-prompt evidence is retained`);
  eq(recordRuntimeProof(ledger, name, path, proof), false, `${name}: rejected availability cannot enter the ability ledger`);
  let failure;
  try {runScenario(scenario, runtimeCardsWithoutAbility(tableCards, name, removal.definition), fixtures);} catch (error) {failure = error;}
  ok(failure instanceof Error && failure.message.endsWith(": nothing is being asked"), `${name}: removal reaches the precise missing-prompt precheck`);
  eq(failure.scenarioAssertion, {kind: "question-offer"}, `${name}: the existing choose precheck preserves availability provenance`);
  eq(scenarioBehaviorFailure(failure, scenario), false, `${name}: availability is universally ineligible`);
  eq(tableCards(name), original, `${name}: the runtime probe leaves saved/shared cards unchanged`);
}
console.log(`ability-missing-prompt: ${checks} checks passed; actual Automaton, Mimic and Throne entry-choice omissions stay unproved; missing prompts earn no ability credit.`);
