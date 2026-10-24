# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""ROB-28: each break must fail the browser's independent socket assertions.
Run with GEOMETRY_REQUIRED=1 and the installed UAT_CHROME, with no other suite
editing the worktree: python game/tools/batch/breaks.py this-file.
"""
SUITES = ["tests/board-yield.mjs"]
T = "crankmagic-board.js"
BREAKS = [
    ("Yield sends the wrong policy", T,
     'socket.send(JSON.stringify({type: "yield", on: yieldPending.on}));',
     'socket.send(JSON.stringify({type: "yield", on: !yieldPending.on}));'),
    ("pending start appears acknowledged", T,
     'const active = view.yielding === true, waiting = yieldPending !== null;',
     'const active = view.yielding === true || yieldPending?.on === true, waiting = yieldPending !== null;'),
    ("required choices hide active yield", T,
     'const active = view.yielding === true, waiting = yieldPending !== null;',
     'const active = view.yielding === true && !view.decision, waiting = yieldPending !== null;'),
    ("refused request stays pending", T,
     'if (frame.of === "yield") yieldPending = null;',
     'if (false) yieldPending = null;'),
    ("yield ignores the room permission", T,
     'if (view.status === "finished" || (!view.mayYield && !view.yielding)) return "";',
     'if (view.status === "finished") return "";'),
    ("phone loses its visible yield", T,
     '${passButton()}${view.state.turnPlayerId !== view.seat ? skipControl(true) : ""}</div>`',
     '${passButton()}</div>`'),
]
