# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
# Run with: GEOMETRY_REQUIRED=1 python game/tools/batch/breaks.py tools/table-away-breaks.py
# Newest wins for who is away: a table read asked before the room's "away" frame came does not take the flag down.
SUITES = ['tests/table-board.mjs']
BOARD, LOBBY = 'crankmagic-board.js', 'crankmagic-table.js'
BREAKS = [
    ('the frame is not remembered', BOARD,
     'awaySaid.set(seat, {until: frame.until, at: performance.now()}); ', ''),
    ('a read overrides newer frames', BOARD,
     '      for (const [seat, w] of awaySaid) if (w.at > asked) heard(seat, w.until);\n', ''),
    ('older frames override a read', BOARD,
     'if (w.at > asked) heard(seat, w.until);', 'if (w.at < asked) heard(seat, w.until);'),
    ('the board is not told when the read was asked', LOBBY,
     'return C.board.show(t, asked);', 'return C.board.show(t);'),
    ('the lobby does not say when it asked', LOBBY,
     '    draw(table, asked);\n', '    draw(table);\n'),
    ('the read is timed when it lands', LOBBY,
     '    const asked = performance.now();   /* the board weighs the read against the room\'s newer frames by when it was asked */\n    const {table, now} = await api("GET", tableUrl(id));\n',
     '    const {table, now} = await api("GET", tableUrl(id));\n    const asked = performance.now();\n'),
]
