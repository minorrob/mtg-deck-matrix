# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
SUITES = ['tests/engine-departed-protection.mjs', 'tests/engine-protection-color.mjs', 'tests/engine-protection-multicolored.mjs']
R = 'game/engine/script/effects/resources.mjs'
P = 'game/engine/rules/protection.mjs'
BREAKS = [
    ('departed source loses its original identity', R, 'context.source ?? context.lastKnown?.cardId ?? null;', 'context.source ?? null;'),
    ('unrelated snapshot lends its qualities', R, '.find(was => named !== null && was?.cardId === named)', '.find(was => was)'),
    ('trigger subject snapshot ignored', R, '[context.lastKnown, context.about?.lastKnown]', '[context.lastKnown]'),
    ('divided damage drops its source snapshot', R, 'return {source, sourceLastKnown, amount: Math.max', 'return {source, amount: Math.max'),
    ('actual damage drops its source snapshot', R,
     '      ...(sourceLastKnown ? {sourceLastKnown} : {}),\n    }, {orders:',
     '    }, {orders:'),
    ('dry order question drops its source snapshot', R,
     '        ...(sourceLastKnown ? {sourceLastKnown} : {}),\n', ''),
    ('damage prevention drops its source snapshot', 'game/engine/rules/replacement.mjs',
     'current.sourceId, current.sourceLastKnown)', 'current.sourceId)'),
    ('quality view is never built', P, 'if (!state.objects[sourceId] && sourceLastKnown)', 'if (false)'),
    ('old snapshot overrides live characteristics', P, 'if (!state.objects[sourceId] && sourceLastKnown)', 'if (sourceLastKnown)'),
    ('quality view discards final color', P, '...sourceLastKnown, zone: "last-known"', '...sourceLastKnown, colors: [], zone: "last-known"'),
    ('quality view discards final types', P, '...sourceLastKnown, zone: "last-known"', '...sourceLastKnown, types: [], zone: "last-known"'),
    ('quality view discards final subtypes', P, '...sourceLastKnown, zone: "last-known"', '...sourceLastKnown, subtypes: [], zone: "last-known"'),
]
