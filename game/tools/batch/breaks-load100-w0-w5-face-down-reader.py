# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
import runpy
# Preserve the original face-down-play reader union, including its board consumer.
SUITES = list(runpy.run_path('game/tools/batch/breaks-flameshape.py')['SUITES'])
ACTIONS = 'game/engine/rules/actions.mjs'
BREAKS = [
    ('a funded hidden spell must spend its actual mana', ACTIONS,
     'const paid = spendFor(state, player, {spell: action.objectId}, payment.mana, action.riders ?? action.payRiders ?? null);',
     'const paid = spendFor(state, player, {spell: action.objectId}, {}, action.riders ?? action.payRiders ?? null);'),
    ('a closed named permission cannot offer the hidden card', ACTIONS,
     'if (ability.ids && permissionOpen(state, player, ability, source))',
     'if (ability.ids)'),
]
