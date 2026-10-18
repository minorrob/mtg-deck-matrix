# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Card resolution (2026-10-18, Linear ROB-131): tests/card-resolve.mjs holds card-resolve.js on two hundred
real-world lines. These breaks prove the checks can fail: the accept threshold lowered admits a wrong card (Mana Crypt,
not in a Commander store, becomes Mana Sculpt), the margin removed decides a coin flip, the containment guard removed
takes Ur-Drago for a dragon lord, the alias layer moved ahead of the exact name (a flavor name shadows a real
card), and the fold that forgets accents. From the repository root:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-card-resolve.py
"""
SUITES = ['tests/card-resolve.mjs']
BREAKS = [
    ('the threshold lowered admits a wrong card', 'card-resolve.js',
     'const DEFAULTS = Object.freeze({accept: 0.84, hold: 0.55, margin: 0.04, candidates: 5, scan: 160});',
     'const DEFAULTS = Object.freeze({accept: 0.7, hold: 0.55, margin: 0.04, candidates: 5, scan: 160});'),
    ('the margin removed decides a coin flip', 'card-resolve.js',
     'const DEFAULTS = Object.freeze({accept: 0.84, hold: 0.55, margin: 0.04, candidates: 5, scan: 160});',
     'const DEFAULTS = Object.freeze({accept: 0.84, hold: 0.55, margin: 0, candidates: 5, scan: 160});'),
    ('the containment guard removed', 'card-resolve.js',
     '      const contained = top && !top.partial && near.find((c) => c.partial);',
     '      const contained = null;'),
    ('the alias layer tried before the exact name', 'card-resolve.js',
     '      return pick(exact.get(whole), "exact", whole)',
     '      return pick(alias.get(f), "alias", whole) || pick(exact.get(whole), "exact", whole)'),
    ('the fold forgets accents', 'card-resolve.js',
     '      .replace(/[\\u0300-\\u036f]/g, "")\n',
     ''),
]
