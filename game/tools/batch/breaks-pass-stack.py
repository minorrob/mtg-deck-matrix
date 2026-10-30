# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""ROB-102, first half: new matches pass the stack for a person with no answer, and the board calls out a spell that came and went."""
SUITES = ["tests/board-callouts.mjs", "tests/game-table.mjs"]
B = "crankmagic-board.js"
T = "game/room/table.mjs"
BREAKS = [
    ("new matches still stop a person at every spell", T,
     "...(rulesOf().passStack ? {passStack: true} : {}),",
     "...(false ? {passStack: true} : {}),"),
    ("the host cannot turn it off", T,
     "...(rulesOf().passStack ? {passStack: true} : {}),",
     "...(true ? {passStack: true} : {}),"),
    ("a new table's rules have it off", T,
     "skipFirstDraw: r.skipFirstDraw !== false, passStack: r.passStack !== false,",
     "skipFirstDraw: r.skipFirstDraw !== false, passStack: r.passStack === true,"),
    ("a spell that came and went is not called out", B,
     "if (next.revision !== was.revision) {\n      const evs = next.events || []",
     "if (false) {\n      const evs = next.events || []"),
    ("your own cast called out to you", B,
     'x.kind === "cast" && x.player !== next.seat && !onStack.has(x.stackId)',
     'x.kind === "cast" && !onStack.has(x.stackId)'),
    ("a spell still on the stack called CAST", B,
     'x.kind === "cast" && x.player !== next.seat && !onStack.has(x.stackId)',
     'x.kind === "cast" && x.player !== next.seat'),
    ("a resolved spell not said resolved", B,
     '${resolved.has(x.stackId) ? " · resolved" : ""}',
     '${""}'),
    ("a countered spell also called CAST", B,
     ' && !countered.has(x.stackId)).slice(0, 3);',
     ').slice(0, 3);'),
    ("no limit on CASTs from one view", B,
     ' && !countered.has(x.stackId)).slice(0, 3);',
     ' && !countered.has(x.stackId));'),
]
