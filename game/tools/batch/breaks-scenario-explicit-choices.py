# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
SUITES = ['tests/scenario-explicit-choices.mjs', 'tests/card-check-cli.mjs', 'tests/ability-proof.mjs', 'tests/scenario-block-policy.mjs']
SCENARIO = 'game/engine/cards/scenario.mjs'
PROOF = 'game/tools/ability-proof.mjs'
BREAKS = [
    ('malformed requested kind accepted', SCENARIO, '    if (ask !== null && (typeof ask !== "string" || !ask)) failChoice("navigation ask must name a question kind");', ''),
    ('navigation ignores requested question', SCENARIO, '      if (ask && state.turn === turn && state.phase === phase && state.awaiting?.kind === ask) return;', ''),
    ('navigation accepts a different question', SCENARIO, '      if (!ask && state.turn === turn && state.phase === phase && state.awaiting && !["declare-attackers", "declare-blockers", "order-triggers"].includes(state.awaiting.kind)) return;', '      if (state.turn === turn && state.phase === phase && state.awaiting && !["declare-attackers", "declare-blockers", "order-triggers"].includes(state.awaiting.kind)) return;'),
    ('navigation returns before requested question', SCENARIO, '      if (!ask && state.turn === turn && state.phase === phase && state.priorityPlayer !== null && !state.awaiting) return;', '      if (state.turn === turn && state.phase === phase && state.priorityPlayer !== null && !state.awaiting) return;'),
    ('deferred counted target accepts a scalar', SCENARIO, '      if (w?.ask === true) return isChoosing(t);', '      if (w?.ask === true) return true;'),
    ('same-name physical attackers choose first', SCENARIO, '        if (explicitChoices && matches.length > 1) failChoice(`${name} has ambiguous physical attackers; answer by explicit indices`);', ''),
    ('same-name physical blockers choose first', SCENARIO, '        if (explicitChoices && matches.length > 1) failChoice(`${blocker} has ambiguous physical blockers; answer by explicit indices`);', ''),
    ('same-name physical targets choose first', SCENARIO, '        if (explicitChoices && matches.length > 1) failChoice(`${card} has ambiguous physical targets; answer by explicit indices`);', ''),
    ('skip missing optional action', SCENARIO, '      if (explicitChoices) failChoice(`optional move is unavailable: ${kind} ${card}`);', ''),
    ('first target accepted', SCENARIO, '    if (explicitChoices && step.targets === "any") failChoice("targets: any cannot supply explicit scenario evidence");', ''),
    ('first matching action accepted', SCENARIO, '    if (explicitChoices && found.length > 1) failChoice(`${card} has ${found.length} matching actions; select its ability, targets, cost or mana explicitly`);', ''),
    ('settle answers a question', SCENARIO, '          if (explicitChoices) failChoice(`settle cannot answer ${state.awaiting.kind}; script its explicit answer`);', ''),
    ('navigation answers a question', SCENARIO, '  const settleOne = () => {\n    if (explicitChoices) failChoice(`settle cannot answer ${state.awaiting.kind}; script its explicit answer`);', '  const settleOne = () => {'),
    ('routine chooses required attack', SCENARIO, '    if (explicitChoices && indices.length) failChoice("required attacks need an explicit declaration");', ''),
    ('routine chooses required block', SCENARIO, '    if (explicitChoices && indices.length) failChoice("required blocks need an explicit declaration");', ''),
    ('routine chooses trigger order', SCENARIO, '    if (explicitChoices && indices.length > 1) failChoice("trigger order needs an explicit answer");', ''),
    ('routine chooses legend', SCENARIO, '    if (explicitChoices && awaitingChoice(state).options.length > 1) failChoice("legend rule needs an explicit answer");', ''),
    ('first defending player accepted', SCENARIO, '        if (explicitChoices && !at && choice.options.filter(o => o.label.startsWith(`${name} → `)).length > 1)\n          failChoice(`${name} needs an explicit defending player`);', ''),
    ('duplicate labels choose first', SCENARIO, '        if (explicitChoices && matches.length > 1) failChoice(`option ${label} is ambiguous; answer by explicit indices`);', ''),
    ('normal checker uses legacy answers', 'game/tools/batch/check-cards.mjs', 'runScenario(scenario, cards, file.fixtures ?? {}, {explicitChoices: true})', 'runScenario(scenario, cards, file.fixtures ?? {}, {explicitChoices: false})'),
    ('runtime baseline uses legacy answers', PROOF, 'runScenario(scenario, cards, fixtures, {explicitChoices: true})', 'runScenario(scenario, cards, fixtures, {explicitChoices: false})'),
    ('runtime omission uses legacy answers', PROOF, 'runScenario(scenario, changedCards, fixtures, {explicitChoices: true})', 'runScenario(scenario, changedCards, fixtures, {explicitChoices: false})'),
    ('legacy passing baseline cache is trusted', PROOF, 'if (baselines.get(scenario)?.choicePolicy !== "explicit") {', 'if (!baselines.has(scenario)) {'),
    ('choice policy failure is behavior', PROOF, ', "choice-policy"].includes(assertion?.kind)', '].includes(assertion?.kind)'),
    ('legacy measurement passes independent gate', 'game/tools/card-check-policy.mjs', '  if (measurement?.choicePolicy !== "explicit") problems.push("Ability measurement did not enforce explicit scenario choices");\n', ''),
]
