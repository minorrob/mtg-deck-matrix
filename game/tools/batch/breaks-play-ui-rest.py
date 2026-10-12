# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The Play pass of 2026-10-12, the rest: the callouts' reading of a view (tests/board-callouts.mjs, in Node), the lobby's
launch line and color fans (tests/table-lobby.mjs) and Settings › Play's Overlay slider (tests/settings-r3.mjs). The
board's own breaks are breaks-play-ui.py.

Browser suites: run with GEOMETRY_REQUIRED=1, from the repository root, with nothing else editing the worktree:

    GEOMETRY_REQUIRED=1 python3 game/tools/batch/breaks.py game/tools/batch/breaks-play-ui-rest.py
"""
SUITES = ['tests/board-callouts.mjs', 'tests/settings-r3.mjs', 'tests/table-lobby.mjs']
BREAKS = [
    ('your turn never called out', 'crankmagic-board.js',
     '    if (next.state.turnPlayerId === next.seat && was.state.turnPlayerId !== next.seat) out.push(',
     '    if (false) out.push('),
    ('a face-down permanent named', 'crankmagic-board.js',
     '{tone: "harm", glyph: "burst", word: "DESTROYED", line: x.c.name || "A face-down permanent"}',
     '{tone: "harm", glyph: "burst", word: "DESTROYED", line: String(x.c.name)}'),
    ('a hit outside combat', 'crankmagic-board.js',
     '      if (d < 0 && LIFE_STEPS.has(next.state.phase)) out.push(',
     '      if (d < 0) out.push('),
    ('seven at once', 'crankmagic-board.js',
     '    return out.slice(0, 6);\n  }\n  globalThis.CrankBoard.calloutsFor = calloutsFor;',
     '    return out;\n  }\n  globalThis.CrankBoard.calloutsFor = calloutsFor;'),
    ('the Overlay not saved', 'crankmagic-settings.js',
     "values:{play:{...play,overlay:n}}",
     "values:{play:{...play}}"),
    ('no color fan on a seated deck', 'crankmagic-table.js',
     's.deck ? identityOf(s.deck) : []',
     '[]'),
    ('the launch line says Waiting again', 'crankmagic-table.js',
     '`Launches when all are ready · ${waiting',
     '`Waiting · ${waiting'),
]
