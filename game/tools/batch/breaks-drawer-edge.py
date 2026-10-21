# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The right drawer's resize line on its edge (Rob, Oct 18; Codex's fix, carried in ROB-98's PR): it sat 17px inside the
drawer, over its modules. tests/table-shared-shell.mjs measures the line against the drawer's edge in Table and Focus.

Run from the repository root, with nothing else editing the worktree:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-drawer-edge.py
"""
SUITES = ['tests/table-shared-shell.mjs']
BREAKS = [
    ('the resize line drifts onto the drawer modules', 'crankmagic-stage.css',
     '.cm-stage-side>.cm-board-panelgrip{position:absolute;left:0;top:0;height:100%;width:12px;margin:0}',
     '.cm-stage-side>.cm-board-panelgrip{position:absolute;left:18px;top:0;height:100%;width:12px;margin:0}'),
]
