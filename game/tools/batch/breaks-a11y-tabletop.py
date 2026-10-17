# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The accessibility walk on the tabletop's Full screen (2026-10-17): the suite's Full screen section was rewritten for
the tabletop after the rewrite of 2026-10-14 removed the rail it drove (ROB-15). These breaks prove the new checks can
fail, and the tabletop's fixes of the same day too: the profile menu losing its name, the table panel losing its scroll,
the rear seat label losing its plate over the mat art, and the renderer destroyed on leaving Full screen (Pixi 8's
accessibility listeners then reach a null renderer on the next Tab).

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
    ('the rear seat label without its plate', 'crankmagic-stage.css',
     'padding:2px 6px;background:#091b1de6;border:0;border-radius:6px;white-space:nowrap}',
     'padding:2px 6px;background:none;border:0;white-space:nowrap}'),
    ('the renderer destroyed on leaving Full screen', 'crankmagic-stage.js',
     '    if (s.app) {for (const child of s.app.stage.removeChildren()) child.destroy({children: true}); s.app.canvas.remove();}',
     '    if (s.app) {s.app.destroy(true, {children: true}); kept = null;}'),
]
