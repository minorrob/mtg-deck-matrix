# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The spell on the stack is seen as its card in the shared drawer.
R3's whole-card rows replace the old overlap-to-fit behavior; its navigation, wrapping,
rotation and image-fitting mutations are in tools/breaks-play-r3-zones.py.
ROB-99 replaces the desktop hover-only stack with the ordered, keyboard-operable pile already
used by Full. Its obsolete hover/Escape placement mutations are replaced by the pile visibility
break below; table-tabletop.mjs retains the multi-entry browsing and ordering checks.

Browser suite: run with GEOMETRY_REQUIRED=1, from the repository root, with nothing else editing the worktree:

    GEOMETRY_REQUIRED=1 python3 game/tools/batch/breaks.py game/tools/batch/breaks-board-rows-stack.py
"""
# R3 replaces the four overlap mutations with tools/breaks-play-r3-zones.py.
SUITES = ['tests/table-board.mjs']
BREAKS = [
    ('the spell not seen on the stack', 'crankmagic-board.js',
     '<div class="cm-stack-image"><button',
     '<div class="cm-stack-image" hidden><button'),
]
