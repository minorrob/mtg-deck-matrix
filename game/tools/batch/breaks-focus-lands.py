# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""ROB-174: in Focus, the Lands caption clear of an untapped land at 1280x720, where the card's 92px floor left the row
17px short (play-journeys: "Lands · 3" under Temple of Triumph). The land starts at the frame, the caption keeps a tight
line, and Focus's rows are 4px deeper. tests/uat/play-journeys.mjs reads every caption at every size and view.

Run from the repository root, with nothing else editing the worktree:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-focus-lands.py
"""
SUITES = ['tests/uat/play-journeys.mjs']
C = 'crankmagic.css'
BREAKS = [
    ('Focus lands padded as before', C,
     '.cm-mat:is([data-fit="table"],[data-fit="focus"]):not(.is-bare) .cm-board-lands{padding-top:1px}',
     '.cm-mat[data-fit="table"]:not(.is-bare) .cm-board-lands{padding-top:1px}'),
    ('Focus rows no deeper than the table', C,
     '.cm-mat[data-fit="focus"]:not(.is-bare) .cm-mat-grid{--pile-row:calc(var(--bc) * 7 / 5 + 1.3em + 6px)}',
     '.cm-mat[data-fit="focus"]:not(.is-bare) .cm-mat-grid{--pile-row:calc(var(--bc) * 7 / 5 + 1.3em + 2px)}'),
]
