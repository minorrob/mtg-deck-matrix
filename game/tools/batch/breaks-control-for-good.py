# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Control gained for good, saved as a room saves it (CR 613.1b; storage.mjs refuses a state JSON would change).

Run from the repository root, with nothing else editing the worktree:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-control-for-good.py
"""
SUITES = ['tests/engine-control.mjs', 'tests/engine-cards.mjs', 'tests/engine-storage.mjs']
BREAKS = [
    ('a change for good says until: undefined', 'game/engine/script/effects/permanents.mjs',
     'to, ...(params.until ? {until: params.until} : {}), ...(params.until === "this leaves"',
     'to, until: params.until, ...(params.until === "this leaves"'),
    ('the save check sees no undefined', 'game/engine/storage.mjs',
     '    if (v === undefined) return `${at} is undefined`;\n', ''),
]
