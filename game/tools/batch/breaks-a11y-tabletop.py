# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The accessibility walk on the tabletop's Full screen (2026-10-17): the suite's Full screen section was rewritten for
the tabletop after the rewrite of 2026-10-14 removed the rail it drove (ROB-15). These breaks prove the new checks can
fail: the profile menu losing its name, and the table panel losing its scroll.

Browser suite: run with GEOMETRY_REQUIRED=1, from the repository root, with nothing else editing the worktree:

    GEOMETRY_REQUIRED=1 python3 game/tools/batch/breaks.py game/tools/batch/breaks-a11y-tabletop.py
"""
SUITES = ['tests/a11y-board.mjs']
BREAKS = [
    ('the profile menu not a named group', 'crankmagic-board.js',
     'class="cm-profile-menu" role="group" aria-label="Profile"',
     'class="cm-profile-menu"'),
    ('the table panel never scrolls', 'crankmagic-stage.css',
     'color:#edf6ef;overflow:auto}',
     'color:#edf6ef;overflow:hidden}'),
]
