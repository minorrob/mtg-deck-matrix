# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""`xTaps` (Oct 21): an {X} spell offered for each X the pool and its caster's untapped sources pay together, the sources
tapped as it is cast, in a table's new matches; a match launched before offers what it offered then.
tests/engine-tap-to-cast.mjs, tests/game-table.mjs and tests/game-leave.mjs.

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-x-taps.py
"""
SUITES = ['tests/engine-tap-to-cast.mjs', 'tests/game-table.mjs', 'tests/game-leave.mjs']
A = 'game/engine/rules/actions.mjs'
BREAKS = [
    ('X counted from the pool alone, as before', A,
     '  if (tapsForX) {\n',
     '  if (false) {\n'),
    ('the cast tapped for without its X', A,
     'const xs = xTaps(state) && cost.variable > 0 ? xCounted(cost, action.x ?? 0) : cost;',
     'const xs = cost;'),
    ('a match launched before tapped for X too', A,
     'const xTaps = (state) => state.xTaps === true && pooledTaps(state);',
     'const xTaps = (state) => pooledTaps(state);'),
    ('the state not keeping the key', 'game/engine/state/index.mjs',
     '...(pod?.xTaps === true ? {xTaps: true} : {}),',
     ''),
    ("a table's new match without it", 'game/room/table.mjs',
     '      xTaps: true,\n',
     ''),
    ('the G1 harness launching its games otherwise than the table', 'tools/fuzz-live.mjs',
     'pooledTaps: true, sourceChoices: true, pilotProvocation: true, xTaps: true, yieldTurn: true,',
     'pooledTaps: true, sourceChoices: true, pilotProvocation: true, yieldTurn: true,'),
]
