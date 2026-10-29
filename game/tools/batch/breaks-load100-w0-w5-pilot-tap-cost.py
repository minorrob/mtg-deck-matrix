# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
SUITES = ['tests/engine-load100-mana.mjs', 'tests/room-pooled-taps.mjs', 'tests/engine-house-pilot.mjs', 'tests/engine-tap-to-cast.mjs', 'tests/engine-control.mjs']
BREAKS = [
    ('the pilot preserves a complete visible mana witness', 'game/engine/pilots/house-pilot.mjs',
     'order.filter(i => !sources.has(options[i].cardId))', 'order'),
    ('native tap choices retain the complete factual witness', 'game/engine/rules/actions.mjs',
     'if (state.sourceChoices !== true || action.autoTap !== true) return choice;', 'return choice;'),
    ('the factual witness retains its actual production payload', 'game/engine/rules/actions.mjs',
     'mana: structuredClone(units.get(tap.id).outputs?.[tap.color] ?? {[tap.color]: 1})', 'mana: {}'),
]
