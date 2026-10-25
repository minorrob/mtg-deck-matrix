# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The precon load of 2026-10-25, lane D (Tramplesaurus Rex): one break for each engine change.

- "The greatest mana value among your commanders" (Tangleweave Armor; CR 903.3, 202.3): script/amount.mjs `commanderManaValue`.
- "Each of those tokens fights a different one of those creatures" (Ezuri's Predation): a fight's `against`
  (script/schema.mjs), the pairing asked (script/resolution.mjs, script/effects/asking.mjs `fightPartners`), and every fight
  at once (script/effects/resources.mjs, fightCalls' `pairs`).
- "X damage divided as you choose among any number of target creatures" (Monstrous Onslaught; CR 601.2d): a spell's
  `divided` (script/schema.mjs, cards/index.mjs), the targets capped and the division asked and checked as it is cast
  (rules/actions.mjs, rules/turn.mjs), kept on the spell and a copy (rules/stack.mjs), carried into the resolution
  (script/resolution.mjs) and dealt (script/effects/resources.mjs, damageHits' `divided`); the scenario runner's amounts
  (game/engine/cards/scenario.mjs).

Run from the repository root, with nothing else editing the worktree:

    python -u game/tools/batch/breaks.py game/tools/batch/breaks-precons-d-dinosaurs.py
"""
SUITES = ['tests/engine-precons-d.mjs']
AM = 'game/engine/script/amount.mjs'
AS = 'game/engine/script/effects/asking.mjs'
RE = 'game/engine/script/resolution.mjs'
RS = 'game/engine/script/effects/resources.mjs'
ST = 'game/engine/rules/stack.mjs'
AC = 'game/engine/rules/actions.mjs'
TU = 'game/engine/rules/turn.mjs'
IX = 'game/engine/cards/index.mjs'
SC = 'game/engine/script/schema.mjs'
SN = 'game/engine/cards/scenario.mjs'
BREAKS = [
    # Tangleweave Armor
    ('commanderManaValue not a kind of amount', AM, '  "commanderManaValue"]);', '  ]);'),
    ('commanderManaValue taken for anything', AM,
     'if ("commanderManaValue" in value && value.commanderManaValue !== "you") problems', 'if (false && value.commanderManaValue !== "you") problems'),
    ('anyone\'s commanders counted', AM, 'o.commander === true && o.owner === context.controller)', 'o.commander === true)'),
    ('a commander spell\'s X not counted', AM, '{x: xOnStack(state, o.id)}', '{x: 0}'),
    # Ezuri's Predation
    ('which fights which never asked', AS, '    if (left.length > 1) {\n      state.awaiting = {...awaiting, pairs};', '    if (false) {\n      state.awaiting = {...awaiting, pairs};'),
    ('the foes always paired in turn', AS, 'byFoe: fighters.length >= foes.length', 'byFoe: true'),
    ('the fighters always paired in turn', AS, 'byFoe: fighters.length >= foes.length', 'byFoe: false'),
    ('alike tokens not numbered', AS, 'alike.forEach((o, k) => { o.label = `${named(o.cardId)} (${k + 1})`; });', 'void alike;'),
    ('the pairing chosen turned around', AS,
     'pairs: [...awaiting.pairs, awaiting.byFoe ? [chosen, one] : [one, chosen]]', 'pairs: [...awaiting.pairs, awaiting.byFoe ? [one, chosen] : [chosen, one]]'),
    ('fightPartners asks nothing', AS, '  fightPartners,\n', ''),
    ('a fight against never paired', RE, 'else if (effect?.effect === "fight" && effect.against !== undefined)', 'else if (false)'),
    ('the pairs never fight', RS, 'if (Array.isArray(params.pairs)) return', 'if (false) return'),
    ('against on anything', SC,
     'if (name !== "fight" || effect.from === undefined || effect.targets !== undefined || !effect.against || typeof effect.against !== "object")',
     'if (!effect.against || typeof effect.against !== "object")'),
    ('against not held to the selector grammar', SC, '    else checkSelector(effect.against, `${path}.against`, errors);\n', ''),
    # Monstrous Onslaught
    ('divided dropped from the spell', IX, '...(ability.divided ? {divided: structuredClone(ability.divided)} : {}),', ''),
    ('targets not capped by the total', AC,
     'return {specs: specs.map((spec, index) => (index === divided.target ? {...spec, count: {min: Math.min(1, total), max: total}} : spec)), context};',
     'return {specs, context};'),
    ('none at most still asked', AC, ' && countOf(specs[index], context)?.max !== 0) return index;', ') return index;'),
    ('the division never asked', AC,
     '      if (among.length > 1) {\n        state.awaiting = {kind: "choose-cost", player, action: structuredClone(action)};',
     '      if (false) {\n        state.awaiting = {kind: "choose-cost", player, action: structuredClone(action)};'),
    ('one target given none of it', AC, 'division: among.length ? [dividedTotal(state, player, action.objectId)] : []};', 'division: among.length ? [0] : []};'),
    ('a division taken with the cast never checked', AC,
     '    if (divided) { const problem = divisionProblem(state, player, action); if (problem) throw new Error(problem); }\n', ''),
    ('a division answered never checked first', AC,
     '    const problem = divisionProblem(state, awaiting.player, action);\n    if (problem) throw new Error(problem);\n    state.awaiting = null;',
     '    state.awaiting = null;'),
    ('a division of less than 1 to a target', AC, 'amounts.some((n) => !Number.isInteger(n) || n < 1)', 'amounts.some((n) => !Number.isInteger(n))'),
    ('a division of less than all of it', AC, ' || amounts.reduce((a, b) => a + b, 0) !== total)\n    return `${name} divides', ')\n    return `${name} divides'),
    ('the division question never put', AC,
     '  if (divided && !Array.isArray(action.division)) {\n    const among = dividedTargets(action, divided), total',
     '  if (false) {\n    const among = dividedTargets(action, divided), total'),
    ('the division not kept on the spell', AC, 'if (dividing && Array.isArray(action.division))', 'if (false)'),
    ('the division answered by indices alone', TU, 'resolveCastCost(state, awaiting, indices, amounts)', 'resolveCastCost(state, awaiting, indices)'),
    ('a copy without the division', ST, '  if (original.division) entry.division = structuredClone(original.division);\n', ''),
    ('the division not read as it resolves', ST, '    ...(entry.division ? {division: entry.division} : {}),\n', ''),
    ('the division not carried into the resolution', RE, '      ...(context.division ? {division: context.division} : {}),\n', ''),
    ('divided damage dealt as no amount', RS, '  if (params.divided !== undefined) {\n    const division', '  if (false) {\n    const division'),
    ('divided on an uncounted target', SC, ' || !spec || spec.count === undefined || ', ' || !spec || '),
    ('divided with any number for its total', SC, '(typeof divided.total === "number" && !(Number.isInteger(divided.total) && divided.total >= 1))', 'false'),
    ('divided with any total', SC, ' || amountProblems(divided.total ?? null).length', ''),
    ('divided with no dealDamage of it', SC, '\n      || !(ability.effects ?? []).some((effect) => effect?.divided === divided.target))', ')'),
    ('a dealDamage divided beside an amount', SC, ' && effect.targets?.target === effect.divided && effect.amount === undefined))', ' && effect.targets?.target === effect.divided))'),
    ('a settle gives a division none to each', SN, 'const amounts = choice.options.map(() => choice.minEach ?? 0);', 'const amounts = choice.options.map(() => 0);'),
    ('a step\'s amounts not answered', SN, 'resolveAwaiting(state, step.answer, step.amounts ?? null,', 'resolveAwaiting(state, step.answer, null,'),
]
