# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The Play board's first pass on the Replit concept (Rob, 2026-10-12): the seven steps in the strip, Full screen as the
table from your chair with its 3D switch, the right pane docked with Turn Resources, the hover card no taller than the
mat, the callouts. crankmagic-board.js and crankmagic.css, held by the board's browser suite.

Full screen is now the tabletop (#734): always 3D, with no switch, its depth the Camera's tilt, every other seat across
the back. "3D never on the board" breaks the tilt the board hands the stage, which tests/table-tabletop.mjs holds. Three
breaks went with what they broke (2026-10-17): "the ground is felt, not the mat" (the ground is now the Camera's Table
and Background, not the big board's mat), "one other seat put at the left, not the back" (no seat is placed by count
any more) and "3D forgotten" (the switch is gone; its successor, the tilt kept as cm-board-tilt-v2, is in no suite).

Browser suites: run with GEOMETRY_REQUIRED=1, from the repository root, with nothing else editing the worktree:

    GEOMETRY_REQUIRED=1 python3 game/tools/batch/breaks.py game/tools/batch/breaks-play-ui.py

The reading of the callouts, the lobby and Settings are in breaks-play-ui-rest.py, whose suites are quicker.
"""
SUITES = ['tests/table-board.mjs', 'tests/table-tabletop.mjs']
BREAKS = [
    ('the strip shows the step alone, not the seven', 'crankmagic-board.js',
     '      <span class="cm-board-tools cm-board-turnsteps">${turnRibbon()}${stepsOpen ? stepsMenu() : ""}</span>\n      <span class="cm-board-prompt">',
     '      <span class="cm-board-step">${e(stepInfo().step)}</span>\n      <span class="cm-board-prompt">'),
    ('no step lit in the ribbon', 'crankmagic-board.js',
     '      ? `<li class="is-now cm-board-step">${e(step)}${e(detail)}</li>`',
     '      ? `<li class="cm-board-step">${e(step)}${e(detail)}</li>`'),
    ('the pane under the mat, not beside it', 'crankmagic.css',
     '.cm-board-body.has-panel{grid-template-columns:var(--pane-w,168px) minmax(0,1fr) var(--panel-w,340px)}\n',
     ''),
    ("the pane's width forgotten", 'crankmagic-board.js',
     '    keep(PANELW_KEY, w);\n',
     ''),
    ('no Turn Resources tab', 'crankmagic-board.js',
     '  const PANEL_TABS = [["resources", "Turn Resources"], ["panel", "Panel"], ["history", "History"]];',
     '  const PANEL_TABS = [["panel", "Panel"], ["history", "History"]];'),
    ('every land counted as untapped', 'crankmagic-board.js',
     '<b>${r.up}/${r.all}</b>',
     '<b>${r.all}/${r.all}</b>'),
    ('the hover card taller than the mat', 'crankmagic.css',
     ',calc(var(--peek-max,100vh) * 5 / 7))',
     ')'),
    ('3D never on the board', 'crankmagic-board.js',
     'const opts = {tilt: camera.tilt, zoom: camera.zoom,',
     'const opts = {tilt: 0, zoom: camera.zoom,'),
    ('no layer for the callouts', 'crankmagic-board.js',
     '<div class="cm-board-callouts" id="cm-board-callouts" aria-hidden="true"></div>',
     ''),
]
