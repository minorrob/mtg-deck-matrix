# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""ROB-98: the Full-view front mat keeps 48px clear at its foot, so the hand fan never covers a land's upper half
(Rob, Oct 18: "Go with the 48px land spacing"). tests/table-tabletop.mjs hit-tests every land at rest and with each
card of the fan hovered, at 1400x900, 1024x768 and 1280x720.

Run from the repository root, with nothing else editing the worktree:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-land-spacing.py
"""
SUITES = ['tests/table-tabletop.mjs']
BREAKS = [
    ('the front mat without its 48px foot', 'crankmagic-stage.css',
     '.cm-stage-front>.cm-mat{padding-bottom:48px}',
     '.cm-stage-front>.cm-mat{padding-bottom:0}'),
]
