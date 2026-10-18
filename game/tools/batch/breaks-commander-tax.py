# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Commander tax badges and castability highlighting in the command zone (ROB-29; crankmagic-board.js). The board reads
`commanderTax` from `CrankRoomView@1`, highlights only the commanders that are currently castable, and shows a small tax
badge when the tax is greater than zero. It never decides for the player and never auto-casts. The board renders only
what the engine provides; it doesn't compute the tax.

A browser suite, so Playwright must be there; GEOMETRY_REQUIRED=1 makes its absence a failure rather than a pass. Run
from the repository root, with nothing else editing the worktree:

    GEOMETRY_REQUIRED=1 python3 game/tools/batch/breaks.py game/tools/batch/breaks-commander-tax.py
"""
SUITES = ['tests/board-commander-tax.mjs']
BOARD = 'crankmagic-board.js'
BREAKS = [
    # The tax badge rendering.
    ('the tax badge never shown', BOARD,
     "${tax ? `<span class=\"cm-bcard-marks\"><span class=\"cm-bcard-mark cm-commander-tax\">{${tax}}</span></span>` : \"\"}",
     ""),
    ('the tax badge always shown, even when zero', BOARD,
     "${tax ? `<span class=\"cm-bcard-marks\"><span class=\"cm-bcard-mark cm-commander-tax\">{${tax}}</span></span>` : \"\"}",
     "<span class=\"cm-bcard-marks\"><span class=\"cm-bcard-mark cm-commander-tax\">{0}</span></span>"),
    ('the tax badge shown without the braces', BOARD,
     "<span class=\"cm-bcard-mark cm-commander-tax\">{${tax}}</span>",
     "<span class=\"cm-bcard-mark cm-commander-tax\">${tax}</span>"),
    
    # Castability highlighting.
    ('commanders always bright, regardless of castability', BOARD,
     "const bright = mine && opts.length > 0, chosen = opts.some((o) => picked.includes(o.index));",
     "const bright = true, chosen = opts.some((o) => picked.includes(o.index));"),
    ('commanders never bright, even when castable', BOARD,
     "const bright = mine && opts.length > 0, chosen = opts.some((o) => picked.includes(o.index));",
     "const bright = false, chosen = opts.some((o) => picked.includes(o.index));"),
    
    # The commandZone function itself.
    ('commandZone falls back to pile for all zones', BOARD,
     "function commandZone(zone) {",
     "function commandZone_unused(zone) {"),
    ('commandZone ignores commanders and shows only the top card', BOARD,
     "const commanders = zone.cards.filter((c) => c.commander);",
     "const commanders = [];"),
    ('the command zone tax read from the wrong field', BOARD,
     "const tax = c.commanderTax !== undefined && c.commanderTax > 0 ? c.commanderTax : 0;",
     "const tax = c.tax !== undefined && c.tax > 0 ? c.tax : 0;"),
    ('the tax included in aria-label without the braces', BOARD,
     "${tax ? `, commander tax {${tax}}` : \"\"}",
     "${tax ? `, commander tax ${tax}` : \"\"}"),
]
