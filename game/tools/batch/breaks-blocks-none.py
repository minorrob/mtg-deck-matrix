# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""No creature that could block, no question (Oct 21, Rob's one-person, three-AI table; room.mjs `blocksNone`): Declare
blockers made for a person with none on offer, the history saying why; kept with the match, saved and reopened; a table's
new match launched with it. tests/room-blocks-none.mjs, tests/game-table.mjs.

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-blocks-none.py
"""
SUITES = ['tests/room-blocks-none.mjs', 'tests/game-table.mjs']
R = 'game/room/room.mjs'
T = 'game/room/table.mjs'
BREAKS = [
    ('blockers asked with none to make', R,
     'if (blocksNone && choice.id.startsWith("declare-blockers:") && choice.options.length === 0) {',
     'if (false) {'),
    ('blockers made with a block on offer', R,
     'if (blocksNone && choice.id.startsWith("declare-blockers:") && choice.options.length === 0) {',
     'if (blocksNone && choice.id.startsWith("declare-blockers:")) {'),
    ('blockers made in a match launched before', R,
     'if (blocksNone && choice.id.startsWith("declare-blockers:") && choice.options.length === 0) {',
     'if (choice.id.startsWith("declare-blockers:") && choice.options.length === 0) {'),
    ('the history not saying why', R,
     '          note(`${seats[seat].name} has no creature that can block: no blockers`);\n',
     ''),
    ('the key lost on reopening', R,
     '    blocksNone = record.blocksNone === true;\n',
     ''),
    ('the key not saved', R,
     ', ...(blocksNone ? {blocksNone} : {})',
     ''),
    ('the key not read from the pod', R,
     ',\n        ...(pod && pod.blocksNone === true ? {blocksNone: true} : {})};',
     '};'),
    ('a table launching without it', T,
     '      blocksNone: true,\n',
     ''),
]
