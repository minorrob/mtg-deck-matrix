# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The board's rows and its stack (Rob's playtest notes, 2026-10-11): a row of lands, tapped ones among them, overlapped to
fit and scrolled past a readable strip of each; the spell on the stack seen as its card, and each entry's card shown
in the shared drawer. crankmagic-board.js and crankmagic.css.
ROB-99 replaces the desktop hover-only stack with the ordered, keyboard-operable pile already
used by Full. Its obsolete hover/Escape placement mutations are replaced by the pile visibility
break below; table-tabletop.mjs retains the multi-entry browsing and ordering checks.

Browser suite: run with GEOMETRY_REQUIRED=1, from the repository root, with nothing else editing the worktree:

    GEOMETRY_REQUIRED=1 python3 game/tools/batch/breaks.py game/tools/batch/breaks-board-rows-stack.py
"""
SUITES = ['tests/table-board.mjs']
BREAKS = [
    ('a tapped card does not overlap', 'crankmagic.css',
     '.cm-board-cards>.cm-bcard.is-tapped:not(:first-child){margin-left:calc(var(--bc) * .22 + var(--lap,0px))}\n',
     ''),
    ('the row measured without its margins', 'crankmagic-board.js',
     'return k.offsetWidth + (parseFloat(cs.marginLeft) || 0) + (parseFloat(cs.marginRight) || 0);',
     'return k.offsetWidth;'),
    ('no readable strip: overlapped for good', 'crankmagic-board.js',
     'const most = mat ? Math.min(...kids.map((k) => k.offsetWidth)) * (1 - READABLE) + 6 : Infinity;',
     'const most = Infinity;'),
    ('a full row never scrolls', 'crankmagic.css',
     '.cm-board-cards.is-scrolling{overflow-x:auto;',
     '.cm-board-cards.is-scrolling{overflow-x:hidden;'),
    ('the spell not seen on the stack', 'crankmagic-board.js',
     '<div class="cm-stack-image"><button',
     '<div class="cm-stack-image" hidden><button'),
]
