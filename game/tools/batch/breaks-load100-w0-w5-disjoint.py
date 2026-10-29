# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
import runpy
SUITES = list(runpy.run_path('game/tools/batch/breaks-load100-w0-w5-output-colors.py')['SUITES']) + ['tests/engine-control.mjs']
ACTIONS = 'game/engine/rules/actions.mjs'
MANA = 'game/engine/rules/mana.mjs'
BREAKS = [
    ('nonmana tappers precede mana choices', ACTIONS,
     'if (action.autoTap === true && !(state.sourceChoices === true && !Array.isArray(action.flashbackTap) && castTapCost(state, player, action)))',
     'if (action.autoTap === true)'),
    ('a rejected quick witness cannot admit an impossible cost', ACTIONS,
     'quick = built && (!acceptTaps || acceptTaps(built.taps)) ? witness(built) : null;',
     'quick = built ? witness(built) : null;'),
    ('the complete search respects reserved cost tappers', MANA,
     '        if (acceptTaps && !acceptTaps(taps)) continue;\n', ''),
    ('outside equivalent sources remain legal witnesses', ACTIONS,
     'for (const unit of complete) if (!reserved.has(unit.id)) outside.set',
     'for (const unit of complete) if (false) outside.set'),
    ('selected cost IDs cannot fund their own mana', ACTIONS,
     'const units = tapUnits(state, player, undefined, pooledTaps(state)).filter(unit => !chosen.has(unit.id));',
     'const units = tapUnits(state, player, undefined, pooledTaps(state));'),
    ('physical mana options exclude saved cost IDs', ACTIONS,
     'const units = tapUnits(state, player, undefined, pooledTaps(state)).filter(unit => !costTaps.has(unit.id));',
     'const units = tapUnits(state, player, undefined, pooledTaps(state));'),
    ('unpayable cost subsets refuse atomically', ACTIONS,
     '    if (action.autoTap === true && !castTapPlans(state, awaiting.player, action, 1).length) throw new Error("Those cost tappers leave no legal mana payment");\n', ''),
    ('forged cost IDs refuse before replacing the proposal', ACTIONS,
     'function performOffered(state, player, action, during) {\n  if (!during) {\n    if (state.sourceChoices === true && action.kind === "cast" && Array.isArray(action.flashbackTap)) {',
     'function performOffered(state, player, action, during) {\n  if (!during) {\n    if (false) {'),
    ('constrained memo keys preserve source prefixes', MANA,
     '${acceptTaps ? `|${taps.map(t => `${t.kind}=${t.color}`).join(";")}` : ""}', ''),
    ('concrete availability witnesses reserve actual cost tappers', ACTIONS,
     'if (!reserve) return plan;', 'return plan;'),
]
