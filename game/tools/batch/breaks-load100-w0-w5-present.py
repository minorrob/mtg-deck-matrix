# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
SUITES = ['tests/engine-static-conditions.mjs', 'tests/engine-conditions.mjs', 'tests/engine-filter.mjs', 'tests/engine-effect-conditions.mjs', 'tests/engine-condition-compare.mjs']
CONDITION = 'game/engine/script/condition.mjs'
BREAKS = [
    ('present grammar compiles once per query', CONDITION,
     'const matches = compileSelector(condition.present);',
     'const matches = (state, id, context) => compileSelector(condition.present)(state, id, context);'),
    ('self uses the exact source identity', CONDITION,
     'state.zones.battlefield.includes(source) ? [source] : []',
     'state.zones.battlefield.includes(source) ? [state.zones.battlefield[1]] : []'),
    ('OR overrides retain the full candidate set', CONDITION,
     ' && condition.present.anyOf === undefined;', ';'),
    ('present conditions read live counters', CONDITION,
     'if (n < least) return false;',
     'if (n < least) return true;'),
]
