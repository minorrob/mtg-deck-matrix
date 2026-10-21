# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""ROB-102, second half: a table's new matches wait for their player's Draw card (`drawBeat`), as the Oct 15 playtest's
confirmed decisions ask, and the board says so: the button reads Draw card and the library is the same button. The held
draw itself is breaks-draw-card.py's.

Run from the repository root, with nothing else editing the worktree:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-draw-card-on.py
"""
SUITES = ['tests/game-table.mjs', 'tests/game-leave.mjs', 'tests/table-board.mjs']
B = 'crankmagic-board.js'
BREAKS = [
    ('new matches still draw by themselves', 'game/room/table.mjs',
     '      drawBeat: true,\n',
     ''),
    ('the G1 harness drawing otherwise than the table', 'tools/fuzz-live.mjs',
     'yieldTurn: true, drawBeat: true, passStack: true, seats:',
     'yieldTurn: true, passStack: true, seats:'),
    ('the button still says Draw a card', B,
     'return b("Draw card", "board-draw", {}, true,',
     'return b("Draw a card", "board-draw", {}, true,'),
    ('the library not lit while the draw waits', B,
     '{back: true, draw: you && !!view.decision && view.decision.kind === "draw"',
     '{back: true, draw: false && !!view.decision && view.decision.kind === "draw"'),
    ('the library not saying what a click does', B,
     'aria-label="Draw card: your library, ${zone.count}"',
     'aria-label="Your library, ${zone.count}"'),
]
