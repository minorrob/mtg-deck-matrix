# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The board's rows and its stack (Rob's playtest notes, 2026-10-11): a row of lands, tapped ones among them, overlapped to
fit and scrolled past a readable strip of each; the spell on the stack seen as its card, and each entry's card shown
beside the box. crankmagic-board.js and crankmagic.css.

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
     '<h3>On the stack · ${items.length}</h3>${topCard}<ol>',
     '<h3>On the stack · ${items.length}</h3><ol>'),
    ('an entry shows nothing under the pointer', 'crankmagic-board.js',
     '    if (entry && event.pointerType === "mouse") stackPeek(entry);\n',
     ''),
    ('its card stays when the pointer leaves', 'crankmagic-board.js',
     '    else if (stackShown !== null && event.pointerType === "mouse" && !(event.target.closest && event.target.closest("#cm-stack-peek"))) stackPeek(null);\n',
     ''),
    ('a focus shows nothing', 'crankmagic-board.js',
     '  document.addEventListener("focusin", (event) => {const entry = event.target.closest && event.target.closest(".cm-board-stack .cm-stack-entry"); if (entry) stackPeek(entry);});\n',
     ''),
    ('Escape leaves it shown', 'crankmagic-board.js',
     '    if (event.key === "Escape" && stackShown !== null) stackPeek(null);\n',
     ''),
    ('drawn over the box, not beside it', 'crankmagic-board.js',
     "    div.style.left = `${Math.round(left)}px`; div.style.top = `${Math.round(top)}px`;",
     "    div.style.left = `${Math.round(box.left)}px`; div.style.top = `${Math.round(box.top)}px`;"),
]
