# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The synergies model (2026-10-18, Linear ROB-115): tests/deck-synergies.mjs holds deck-synergies.js on Krenko's
hundred. These breaks prove the checks can fail: the "fires" edge dropped from the chain reading (the known engine is
lost), a completion that never walks back through the deck, a pool that forgets the color fence, and a pair floor that
admits every pair. From the repository root:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-deck-synergies.py
"""
SUITES = ['tests/deck-synergies.mjs']
BREAKS = [
    ('the pair floor that admits every pair', 'deck-synergies.js',
     '        if (r.strength < cfg.minStrength && !declaredHit.length) continue;',
     '        if (false) continue;'),
    ('a completion that never walks back', 'deck-synergies.js',
     '        const path = reach(o.to, ins, cfg.completionLen);',
     '        const path = null;'),
    ('a pool that forgets the color fence', 'deck-synergies.js',
     '    const fits = (row) => colorsOf(row).every((c) => allowed.has(c));',
     '    const fits = (row) => true;'),
    ('the Staff kept on a chain it is not in', 'deck-synergies.js',
     "          cards: loop.steps.map((s) => s.name),",
     "          cards: loop.steps.map((s) => s.name).concat(['Thornbite Staff']),"),
]
