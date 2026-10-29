/* Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE. */

/* Rob authorized this supplemental proof on October 28, 2026: omit one ability in a CLONED RUNTIME definition and
   require an originally passing scenario to fail. Saved cards and rules are never changed. No mutated script is
   validated or checked for fidelity: those failures would prove only that its text and structure changed.
   Compound face representations and abilities without a simple runtime component stay unobserved. */
import {runScenario} from "../engine/cards/scenario.mjs";
import {foldName} from "../engine/cards/index.mjs";

export function runtimeAbilityRemoval(script, ability, definition) {
  if (!definition) return {status: "unobserved", reason: "no runtime definition"};
  if (script.back || script.adventure || script.prepare || !ability.path.startsWith("abilities["))
    return {status: "unobserved", reason: "compound face representation requires a separate runtime-removal proof"};
  const changed = structuredClone(definition);
  const found = (changed.abilities ?? []).map((a, i) => ({a, i})).filter(({a}) => a.id === ability.runtimeId);
  if (found.length === 1) {
    changed.abilities.splice(found[0].i, 1);
    return {status: "ready", definition: changed, mutation: {path: `abilities[${found[0].i}]`, id: ability.runtimeId, kind: found[0].a.kind}};
  }
  if (found.length > 1) return {status: "unobserved", reason: "ambiguous runtime ability id"};
  const keyword = String(ability.keyword ?? "").toLowerCase();
  const matches = (changed.keywords ?? []).map((value, i) => ({value, i})).filter(({value}) => String(value).toLowerCase() === keyword);
  if (ability.kind === "keyword" && keyword && matches.length === 1) {
    changed.keywords.splice(matches[0].i, 1);
    return {status: "ready", definition: changed, mutation: {path: `keywords[${matches[0].i}]`, keyword: matches[0].value, kind: "keyword"}};
  }
  return {status: "unobserved", reason: "no single removable runtime ability or intrinsic keyword"};
}

/* runScenario's own assertion/action failures name the scenario. A generic rules exception or validation error is not
   proof that a valid counterfactual changed an observed behavior. */
export function scenarioBehaviorFailure(error, scenario) {
  const assertion = error?.scenarioAssertion;
  /* Availability is not execution, regardless of the subject or kind of ability being removed. */
  const offerOnly = ["ability-offer", "action-offer", "question-offer", "policy-precheck", "choice-policy"].includes(assertion?.kind) || assertion === "blocker-offer";
  return error instanceof Error && !offerOnly && !["keyword-presence", "step-limit"].includes(assertion)
    && error.message.startsWith(`${scenario.name}: `);
}

export function runtimeCardsWithoutAbility(cards, name, changed) {
  const lookup = (asked) => {
    if (foldName(asked) !== foldName(name)) return cards(asked);
    lookup.uses += 1;
    return structuredClone(changed);
  };
  lookup.uses = 0;
  return lookup;
}

export function proveRuntimeAbility({script, ability, cards, scenarios, fixtures = {}, baselines = new Map(), maxProbeMs = 30000, now = () => performance.now()}) {
  const name = script.identity.name;
  const removal = runtimeAbilityRemoval(script, ability, cards(name));
  if (removal.status !== "ready") return removal;
  const diagnostics = [];
  for (const [i, scenario] of scenarios.entries()) {
    if (baselines.get(scenario)?.choicePolicy !== "explicit") {
      try {
        const result = runScenario(scenario, cards, fixtures, {explicitChoices: true});
        baselines.set(scenario, {passed: true, choicePolicy: "explicit", checks: result.passed.length, events: result.events.length});
        if (result.policies) baselines.get(scenario).policies = structuredClone(result.policies);
      }
      catch (error) {baselines.set(scenario, {choicePolicy: "explicit", error: String(error.message ?? error)});}
    }
    const baseline = baselines.get(scenario);
    if (!baseline.passed) {diagnostics.push({scenario: scenario.name, reason: "baseline failed", error: baseline.error}); continue;}
    const changedCards = runtimeCardsWithoutAbility(cards, name, removal.definition);
    const started = now();
    let failure = null;
    try {runScenario(scenario, changedCards, fixtures, {explicitChoices: true});} catch (error) {failure = error;}
    const elapsedMs = now() - started;
    if (elapsedMs > maxProbeMs) {
      diagnostics.push({scenario: scenario.name, reason: "probe time budget exceeded", elapsedMs, maxProbeMs});
      continue;
    }
    if (failure) {
      if (changedCards.uses > 0 && scenarioBehaviorFailure(failure, scenario, {subject: name, kind: removal.mutation.kind})) return {
        status: "proved", method: "runtime-ability-removal", scenario: scenario.name, scenarioIndex: i,
        baseline: {status: "passed", choicePolicy: "explicit", checks: baseline.checks, events: baseline.events,
          ...(baseline.policies ? {policies: structuredClone(baseline.policies)} : {})},
        mutation: removal.mutation, result: {status: "failed", message: failure.message,
          ...(failure.scenarioPolicies ? {policies: structuredClone(failure.scenarioPolicies)} : {})}, elapsedMs,
      };
      diagnostics.push({scenario: scenario.name, reason: changedCards.uses > 0 ? "generic exception, presence assertion, or step limit is not behavior proof" : "the subject's runtime definition was not used", error: String(failure.message ?? failure)});
    }
  }
  return {status: "unobserved", reason: "no passing scenario failed because of this runtime removal", diagnostics};
}

export function recordRuntimeProof(ledger, name, abilityPath, proof) {
  const ability = ledger.cards[name]?.abilities.find((a) => a.path === abilityPath);
  if (!ability) throw new Error(`No ledger ability ${name} ${abilityPath}.`);
  if (proof.status !== "proved" || proof.baseline?.status !== "passed" || proof.result?.status !== "failed") return false;
  (ability.counterfactual ??= []).push(proof);
  const label = `${name}: ${proof.scenario}`;
  if (!ability.scenarios.includes(label)) ability.scenarios.push(label);
  return true;
}
