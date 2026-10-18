# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Full screen's tabletop (#734): Rob's art mats painted per seat, the drawn mats keeping their patterns, a lone other
seat spanning the back row, and the Camera's sliders kept on the device. Three of these are the successors of breaks
dropped from breaks-play-ui.py on 2026-10-17 ("the ground is felt, not the mat", "one other seat put at the left, not
the back", "3D forgotten"): their code went with the tabletop rewrite, and the candidates tried in their place were
missed by every suite (#741). The assertions that catch these are new: tests/table-tabletop.mjs records the art each
canvas mesh carries, compares each drawn mat's pattern with the same mat's outside the tabletop, and reloads the Camera;
tests/table-board.mjs measures the back row of its two-seat Full screen.

The drawn mats (felt, forge, cavern, sea, night) were plain in Full screen: the stage made every mat transparent for the
canvas's art, and the canvas paints no pattern. Rob, 2026-10-17: not intended; they show their own patterns.

Browser suites: run with GEOMETRY_REQUIRED=1, from the repository root, with nothing else editing the worktree:

    GEOMETRY_REQUIRED=1 python3 game/tools/batch/breaks.py game/tools/batch/breaks-play-tabletop.py
"""
SUITES = ['tests/table-tabletop.mjs', 'tests/table-board.mjs']
BREAKS = [
    ('every seat on the felt, not its art', 'crankmagic-board.js',
     'mats: [big, ...players().filter((p) => p.playerId !== big.playerId)].map((p) => matOf(p.playerId)),',
     'mats: [big, ...players().filter((p) => p.playerId !== big.playerId)].map(() => "felt"),'),
    ("the art in front not the viewed seat's", 'crankmagic-board.js',
     'mats: [big, ...players().filter((p) => p.playerId !== big.playerId)].map((p) => matOf(p.playerId)),',
     'mats: players().map((p) => matOf(p.playerId)),'),
    ('every drawn mat plain in Full screen', 'crankmagic-stage.css',
     ':is(.cm-stage-front,.cm-stage-mini)>.cm-mat:not([data-mat="felt"],[data-mat="forge"],[data-mat="cavern"],[data-mat="sea"],[data-mat="night"]){background:transparent!important}',
     ':is(.cm-stage-front,.cm-stage-mini)>.cm-mat{background:transparent!important}'),
    ('the night mat plain in Full screen', 'crankmagic-stage.css',
     ',[data-mat="sea"],[data-mat="night"]){background:transparent!important}',
     ',[data-mat="sea"]){background:transparent!important}'),
    ('a lone other seat cut to a third of the back row', 'crankmagic-stage.js',
     'count = clamp(seats,1,3)',
     'count = 3'),
    ('the Camera not kept on letting go of a slider', 'crankmagic-board.js',
     'if (el) keep(el.dataset.stageCamera === "tilt"',
     'if (el) String(el.dataset.stageCamera === "tilt"'),
    ('the kept Camera not read back', 'crankmagic-board.js',
     'const camera = {cards: Math.max(70, Math.min(150, Number(stored("cm-stage-card-size-v2")) || 100)), tilt: stored("cm-board-tilt-v2") === null ? 40 : Math.max(0, Math.min(60, Number(stored("cm-board-tilt-v2")) || 0)), zoom: Math.max(60, Math.min(120, Number(stored("cm-board-zoom-v2")) || 100))};',
     'const camera = {cards: 100, tilt: 40, zoom: 100};'),
]
