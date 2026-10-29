# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
# Rob's authorized runtime-only supplemental evidence; no saved card/rule mutation is evidence.
SUITES = ['tests/ability-proof.mjs']
PROOF = 'game/tools/ability-proof.mjs'
EVIDENCE = 'game/tools/ability-evidence.mjs'
CHECK = 'game/tools/batch/check-cards.mjs'
RUNNER = 'game/engine/cards/scenario.mjs'
BREAKS = [
    ('runtime mutations clone their source', PROOF, 'const changed = structuredClone(definition);', 'const changed = definition;'),
    ('compound runtime representations stay unknown', PROOF, 'if (script.back || script.adventure || script.prepare || !ability.path.startsWith("abilities["))', 'if (false)'),
    ('one unambiguous runtime component is removed', PROOF, 'if (found.length === 1) {', 'if (found.length > 0) {'),
    ('compiled ability is actually omitted', PROOF, 'changed.abilities.splice(found[0].i, 1);', ''),
    ('intrinsic keyword is actually omitted', PROOF, 'changed.keywords.splice(matches[0].i, 1);', ''),
    ('only the named subject is mutated', PROOF, 'if (foldName(asked) !== foldName(name)) return cards(asked);', ''),
    ('mutant lookup is observed', PROOF, 'lookup.uses += 1;', ''),
    ('an already-red baseline cannot prove behavior', PROOF, 'if (!baseline.passed) {diagnostics.push', 'if (false) {diagnostics.push'),
    ('generic errors are not behavioral evidence', PROOF, '&& error.message.startsWith(`${scenario.name}: `)', '&& true'),
    ('keyword presence does not prove keyword behavior', PROOF, '!["keyword-presence", "step-limit"].includes(assertion)', 'true'),
    ('keyword assertion provenance is retained', RUNNER, 'if (assertion) error.scenarioAssertion = assertion;', ''),
    ('proof requires a green baseline', PROOF, 'proof.baseline?.status !== "passed"', 'false'),
    ('runtime proof counts toward reachability', EVIDENCE, 'if (proof || scenarioResolved(a)) scenarioReached += 1;', 'if (scenarioResolved(a)) scenarioReached += 1;'),
    ('passing scenario events reach the ledger', CHECK, 'if (ledger) addExerciseEvidence(ledger, result.events, {scenario: `${file.card}: ${scenario.name}`});', ''),
    ('the supplement is wired into scenario checks', CHECK, 'if (ledger && counterfactual) for (const script of scripts)', 'if (false) for (const script of scripts)'),
    ('unreached abilities fail the requested ledger gate', CHECK, 'return problems + failed + unreached > 0 ? 1 : 0;', 'return problems + failed > 0 ? 1 : 0;'),
    ('ability offers are not execution proof', PROOF, 'error instanceof Error && !offerOnly', 'error instanceof Error'),
    ('over-budget probes are not proof', PROOF, 'if (elapsedMs > maxProbeMs) {', 'if (false) {'),
    ('baseline cache does not retain game states', CHECK, 'baselines.set(scenario, {passed: true, checks: result.passed.length, events: result.events.length});', 'baselines.set(scenario, {passed: true, checks: result.passed.length, events: result.events.length, state: result.state});'),
]
