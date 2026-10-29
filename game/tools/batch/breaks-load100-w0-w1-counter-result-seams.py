# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
SUITES = ['tests/engine-entry-counter-order.mjs', 'tests/engine-counters-replaced.mjs', 'tests/engine-battles.mjs']
BREAKS = [
    ('completed counter child restores an expired protector patch', 'game/engine/rules/pre-entry.mjs',
     '...frame.entryResult, ...frame.counterDone, objectPatch: frame.objectPatch,', '...frame.entryResult, ...frame.counterDone,'),
    ('prefix tracking changes the old public counter result shape', 'game/engine/rules/statics.mjs',
     'reportApplied = false', 'reportApplied = true'),
]
