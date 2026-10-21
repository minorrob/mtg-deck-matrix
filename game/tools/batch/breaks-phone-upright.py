# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""ROB-18: one native Focused view on a phone, either way up (Rob, Oct 18: "the upright Focused phone layout"; Codex's
design). tests/table-board.mjs walks Maya's board as a phone held sideways, then upright.

Run from the repository root, with nothing else editing the worktree:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-phone-upright.py
"""
SUITES = ['tests/table-board.mjs']
C = 'crankmagic.css'
BREAKS = [
    ('the upright phone turned a quarter again', C,
     '.cm-board[data-phone="landscape"]{grid-template-columns:minmax(0,1fr) 110px;grid-template-rows:52px minmax(0,1fr)}',
     '.cm-board[data-phone="landscape"]{grid-template-columns:minmax(0,1fr) 110px;grid-template-rows:52px minmax(0,1fr)}'
     '.cm-board[data-phone="portrait"]{inset:auto;top:0;left:0;width:100vh;height:100vw;transform:translateX(100vw) rotate(90deg);transform-origin:top left}'),
    ('the battlefield not scrolling to its piles', C,
     '.cm-phone-battlefield{flex:1 1 auto;min-width:0;min-height:0;overflow:auto;',
     '.cm-phone-battlefield{flex:1 1 auto;min-width:0;min-height:0;overflow:hidden;'),
    ('the hand covering the turn', C,
     '.cm-board[data-phone] .cm-hand-show{position:fixed;inset:auto 0 0;',
     '.cm-board[data-phone] .cm-hand-show{position:fixed;inset:0;'),
    ('the seats not a column sideways', C,
     '.cm-board[data-phone="landscape"] .cm-phone-seats{grid-column:2;grid-row:2;flex-direction:column;',
     '.cm-board[data-phone="landscape"] .cm-phone-seats{grid-column:1;grid-row:3;flex-direction:column;'),
    ('Camera offering a view switch on a phone', 'crankmagic-board.js',
     '${phone() ? "" : switcher()}',
     '${switcher()}'),
]
