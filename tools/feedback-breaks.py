# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
# Run with: GEOMETRY_REQUIRED=1 python game/tools/batch/breaks.py tools/feedback-breaks.py
# Send feedback names the release and the game the board holds (G-E), so a person's report can be replayed.
SUITES = ['tests/table-board.mjs']
APP, BOARD = 'crankmagic-app.js', 'crankmagic-board.js'
BREAKS = [
    ('the game left out of the mail', APP, 'const played=game?`Game:', 'const played=false?`Game:'),
    ('the release left out of the mail', APP, 'Version: ${version}\\n${played}', '${played}'),
    ('the board holds no game', BOARD, 'held() {return tableId && view && view.matchId ?', 'held() {return false ?'),
    ('a game over not said', BOARD, 'over: view.status === "finished"}', 'over: false}'),
    ('a game named with no board', APP, 'const game=C.board&&C.board.held?C.board.held():null;', 'const game={matchId: "x", turn: 1, over: false};'),
]
