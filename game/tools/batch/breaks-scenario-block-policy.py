# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
# Harness-only policy and metadata; no rule module or saved card is mutated.
SUITES = ['tests/scenario-block-policy.mjs']
RUNNER = 'game/engine/cards/scenario.mjs'
PROOF = 'game/tools/ability-proof.mjs'
CHECK = 'game/tools/batch/check-cards.mjs'
BREAKS = [
    ('policy pair has exactly two names', RUNNER, 'pair.length !== 2', 'false'),
    ('policy names are nonempty strings', RUNNER, 'typeof name !== "string" || !name || name.trim() !== name', 'false'),
    ('another action cannot mask the policy', RUNNER, 'Object.hasOwn(step, "blockIfLegal") && Object.keys(step).some((key) => !["blockIfLegal", "seat"].includes(key))', 'false'),
    ('policy belongs to this combat phase', RUNNER, 'if (!["COMBAT_DECLARE_ATTACKERS", "COMBAT_DECLARE_BLOCKERS"].includes(state.phase)) fail("blockIfLegal requires this combat\'s blocker declaration phase", unavailable);', ''),
    ('named objects must be unambiguous', RUNNER, 'if (ids.length !== 1) fail', 'if (ids.length === 0) fail'),
    ('a named blocker must be a creature', RUNNER, 'if (!typesOf(state, ids[0]).includes("Creature")) fail', 'if (false) fail'),
    ('named attacker is attacking', RUNNER, 'if (!attack) fail(`blockIfLegal ${pair[1]} is not attacking in this combat`, unavailable);', ''),
    ('blocker is controlled by defender', RUNNER, 'if (controllerOf(state, blocker) !== attack.defender) fail', 'if (false) fail'),
    ('specified seat is the defender', RUNNER, 'if (step.seat !== undefined && (!Number.isInteger(step.seat) || step.seat !== attack.defender)) fail', 'if (false) fail'),
    ('policy answers only the current defender', RUNNER, 'if (state.awaiting.player !== attack.defender) fail', 'if (false) fail'),
    ('whole proposed block must be legal', RUNNER, 'checked && checked.reasons.length === 0 ? proposed : []', 'checked ? proposed : []'),
    ('no-block declaration is validated too', RUNNER, 'const final = blockers.check(state, state.awaiting, indices);', 'const final = {reasons: []};'),
    ('illegal final declaration is refused', RUNNER, 'if (final.reasons.length) fail', 'if (false) fail'),
    ('policy actually declares its answer', RUNNER, 'record(resolveAwaiting(state, indices));\n      decision.status = "answered";', 'decision.status = "answered";'),
    ('executed branches are retained', RUNNER, 'policies.push(decision);', ''),
    ('failed assertion retains branch log', RUNNER, 'if (policies.length) error.scenarioPolicies = structuredClone(policies);', ''),
    ('old result shapes stay unchanged', RUNNER, '...(policies.length ? {policies} : {})', 'policies'),
    ('direct proof baseline retains policy', PROOF, 'if (result.policies) baselines.get(scenario).policies = structuredClone(result.policies);', ''),
    ('baseline proof includes its branch', PROOF, '...(baseline.policies ? {policies: structuredClone(baseline.policies)} : {})', ''),
    ('removal proof includes its branch', PROOF, '...(failure.scenarioPolicies ? {policies: structuredClone(failure.scenarioPolicies)} : {})', ''),
    ('cached checker baseline retains policy', CHECK, 'if (counterfactual && result.policies) baselines.get(scenario).policies = structuredClone(result.policies);', ''),
    ('availability classification has no kind escape', PROOF, '["ability-offer", "action-offer", "question-offer", "policy-precheck", "choice-policy"].includes(assertion?.kind)', '["ability-offer", "action-offer", "question-offer", "policy-precheck", "choice-policy"].includes(assertion?.kind) && arguments[2]?.kind === "mana"'),
    ('blocker availability is ineligible', PROOF, '|| assertion === "blocker-offer"', ''),
    ('blocker offer failure is tagged', RUNNER, ', "blocker-offer");', ');'),
    ('missing action precheck is tagged', RUNNER, ', {kind: "action-offer", card, action: kind});', ');'),
    ('explicit cast offers are tagged too', RUNNER, 'const assertion = {kind: "ability-offer", card: e.offers.card, action: e.offers.kind};', 'const assertion = e.offers.kind === "activate" ? {kind: "ability-offer", card: e.offers.card} : null;'),
    ('executed answer status is retained', RUNNER, 'decision.status = "answered";', ''),
    ('question availability is ineligible', PROOF, '"action-offer", "question-offer", "policy-precheck"', '"action-offer", "policy-precheck"'),
    ('policy prechecks are ineligible', PROOF, '"question-offer", "policy-precheck"', '"question-offer"'),
    ('asked seat options and min are tagged', RUNNER, 'const assertion = {kind: "question-offer"};', 'const assertion = null;'),
    ('missing choice question is tagged', RUNNER, 'fail("nothing is being asked", {kind: "question-offer"});', 'fail("nothing is being asked");'),
    ('unanswered question is tagged', RUNNER, 'fail(`the game asks ${state.awaiting.kind}, which the scenario did not answer`, {kind: "question-offer"});', 'fail(`the game asks ${state.awaiting.kind}, which the scenario did not answer`);'),
    ('missing named choice option is tagged', RUNNER, 'fail(`no option ${label}: ${choice.options.map((x) => x.label).join(", ")}`, {kind: "question-offer"});', 'fail(`no option ${label}: ${choice.options.map((x) => x.label).join(", ")}`);'),
    ('missing counted target option is tagged', RUNNER, 'fail(`${card}: no ${JSON.stringify(w)} among ${choice.options.map((o) => o.label).join(", ")}`, {kind: "question-offer"});', 'fail(`${card}: no ${JSON.stringify(w)} among ${choice.options.map((o) => o.label).join(", ")}`);'),
    ('missing stack precheck is tagged', RUNNER, 'fail("there is nothing on the stack to resolve", {kind: "action-offer", action: "resolve"});', 'fail("there is nothing on the stack to resolve");'),
]
