# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The room's socket frames for a reconnect, Yield turn and a draft (Linear ROB-77, ROB-13, ROB-75): cloud/game-room.mjs
passes `after` on {type:"view"}, answers {type:"yield"} as `prefer` is answered and moves every seat's view, and answers
{type:"check"} to its sender alone.

Run from the repository root, with nothing else editing the worktree:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-socket-frames.py
"""
SUITES = ['tests/game-room.mjs']
W = 'cloud/game-room.mjs'
BREAKS = [
    ('a reconnect\'s `after` ignored', W,
     'room.view(seatId, typeof frame.after === "string" ? {after: frame.after} : {})',
     'room.view(seatId)'),
    ('a yield never taken', W,
     '    if (frame && frame.type === "yield") {\n',
     '    if (false) {\n'),
    ('a refused yield called something else', W,
     'send({type: "refused", of: "yield",',
     'send({type: "refused", of: "prefer",'),
    ('a yield that moves only the sender', W,
     '      this.broadcast();\n      return this.schedule();\n',
     '      return send({type: "view", view: room.view(seatId)});\n'),
    ('a draft checked as always open and legal', W,
     '...room.check(seatId, {choiceId: frame.choiceId, indices: frame.indices})',
     'ok: true, open: true, reasons: []'),
    ('a check answer not naming its question', W,
     'send({type: "checked", choiceId: frame.choiceId ?? null, ',
     'send({type: "checked", '),
]
