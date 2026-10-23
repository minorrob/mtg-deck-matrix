# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Full screen's tabletop (#734): every seat's own mat, Rob's art drawn cropped and at full strength, the drawn mats
keeping their patterns, a lone other seat spanning the back row, and the Camera's sliders kept on the device. Three of
these are the successors of breaks dropped from breaks-play-ui.py on 2026-10-17 ("the ground is felt, not the mat",
"one other seat put at the left, not the back", "3D forgotten"): their code went with the tabletop rewrite, and the
candidates tried in their place were missed by every suite (#741). The assertions that catch these are new:
tests/table-tabletop.mjs reads each seat's mat, compares each drawn mat's pattern with the same mat's outside the
tabletop, and reloads the Camera; tests/table-board.mjs measures the back row of its two-seat Full screen.

The mats were the canvas's until 2026-10-18: it stretched Rob's art to each seat and tinted it with the green under it,
and the stage made every mat transparent for it, so the drawn mats (felt, forge, cavern, sea, night) came out plain.
Rob: the drawn mats show their own patterns (2026-10-17), and the art is drawn in HTML, cropped and true to the picture
(2026-10-18). The canvas now paints the table alone.

Browser suites: run with GEOMETRY_REQUIRED=1, from the repository root, with nothing else editing the worktree:

    GEOMETRY_REQUIRED=1 python3 game/tools/batch/breaks.py game/tools/batch/breaks-play-tabletop.py
"""
SUITES = ['tests/table-tabletop.mjs', 'tests/table-board.mjs']
BREAKS = [
    ('every mat transparent in Full screen again', 'crankmagic-stage.css',
     '.cm-stage-front>.cm-mat,.cm-stage-mini>.cm-mat{height:100%;width:100%;',
     '.cm-stage-front>.cm-mat,.cm-stage-mini>.cm-mat{background:transparent!important;height:100%;width:100%;'),
    ('the art dimmed by the wash in Full screen', 'crankmagic-stage.css',
     '.cm-stage-region{--mat-art-wash:linear-gradient(transparent,transparent)}',
     ''),
    ('a picture stretched to its mat, not cropped', 'crankmagic-mats.css',
     '[data-mat="falls-tree"]:is(.cm-board-mat,.cm-seatboard,.cm-full-ground){background:var(--mat-art-wash),url(assets/playmats/falls-tree.webp) center/cover',
     '[data-mat="falls-tree"]:is(.cm-board-mat,.cm-seatboard,.cm-full-ground){background:var(--mat-art-wash),url(assets/playmats/falls-tree.webp) center/100% 100%'),
    ('every board drawn with your own mat', 'crankmagic-board.js',
     'data-mat="${e(matOf(i))}"',
     'data-mat="${e(matOf(view.seat))}"'),
    ('a lone other seat cut to a third of the back row', 'crankmagic-stage.js',
     'count = clamp(seats,1,3)',
     'count = 3'),
    ('the Camera not kept on letting go of a slider', 'crankmagic-board.js',
     'if (el) keep(el.dataset.stageCamera === "rotation"',
     'if (el) String(el.dataset.stageCamera === "rotation"'),
    ('the kept Camera not read back', 'crankmagic-board.js',
     'const camera = {cards: Math.max(70, Math.min(CAMERA_MAX, Number(stored("cm-stage-card-size-v2")) || 100)), tilt: stored("cm-board-tilt-v2") === null ? 40 : Math.max(0, Math.min(60, Number(stored("cm-board-tilt-v2")) || 0)), zoom: Math.max(60, Math.min(CAMERA_MAX, Number(stored("cm-board-zoom-v2")) || 100))};',
     'const camera = {cards: 100, tilt: 40, zoom: 100};'),
]
