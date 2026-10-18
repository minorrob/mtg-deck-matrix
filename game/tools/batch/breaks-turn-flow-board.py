# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The turn's flow, on the board and in Settings (Rob's playtest notes, 2026-10-11): End turn in your own end step; which of
your own turns it is; Settings' Stop at every step of my turn, told to the room once for each point of the game, a refusal
of it said nowhere; and the table launching its games with `endAsks`. The room's side is breaks-turn-flow.py.

Browser suites: run with GEOMETRY_REQUIRED=1, from the repository root, with nothing else editing the worktree:

    GEOMETRY_REQUIRED=1 python3 game/tools/batch/breaks.py game/tools/batch/breaks-turn-flow-board.py
"""
SUITES = ['tests/settings-r3.mjs', 'tests/table-board.mjs']
BREAKS = [
    ('no End turn', 'crankmagic-board.js',
     '    if (pass && pass.endsTurn) return "End turn";\n',
     ''),
    ('your turn not said', 'crankmagic-board.js',
     '${view.yourTurn ? ` (your ${ordinal(view.yourTurn)})` : ""}',
     ''),
    ('the way of playing never told to the room', 'crankmagic-board.js',
     '    socket.send(JSON.stringify({type: "prefer", stepByStep: want}));\n',
     ''),
    ('the way of playing told again at the same point of the game', 'crankmagic-board.js',
     '    if (preferSaid && preferSaid.key === key && preferSaid.revision >= view.revision) return;\n',
     ''),
    ('the way of playing never told again', 'crankmagic-board.js',
     'preferSaid.key === key && preferSaid.revision >= view.revision',
     'preferSaid.key === key'),
    ('a refused way of playing said as a notice', 'crankmagic-board.js',
     '    else if (frame.type === "refused" && frame.of === "prefer") {if (frame.view) adopt(frame.view, true);}\n',
     ''),
    ('the room\'s refusal not marked', 'cloud/game-room.mjs',
     'send({type: "refused", of: "prefer", ',
     'send({type: "refused", '),
    ('the table\'s games without endAsks', 'game/room/table.mjs',
     'passAfterCast: true, endAsks: true, untapMana: true,',
     'passAfterCast: true, untapMana: true,'),
    ('Settings does not save it', 'crankmagic-settings-play.js',
     "values:{play:{...play,stepByStep:on}}",
     "values:{}"),
    ('Settings shows it off whatever it is', 'crankmagic-settings-play.js',
     'stepByStep=(p.play||{}).stepByStep===true;',
     'stepByStep=false;'),
]
