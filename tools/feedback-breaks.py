# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
# Run with: GEOMETRY_REQUIRED=1 python3 game/tools/batch/breaks.py tools/feedback-breaks.py
# Send feedback names the release and the game the board holds (G-E; the feedback loop's CrankFeedback@1), so a person's
# report can be replayed from the record: what the board says it holds, what the report carries, and the mailto fallback.
SUITES = ['tests/table-board.mjs']
APP, BOARD, SHEET = 'crankmagic-app.js', 'crankmagic-board.js', 'crankmagic-feedback.js'
BREAKS = [
    ('the game left out of the mail', APP, 'const played=game?`Game:', 'const played=false?`Game:'),
    ('the release left out of the mail', APP, 'Version: ${version}\\n${played}', '${played}'),
    ('the board holds no game', BOARD, 'if (!(tableId && view && view.matchId)) return null;', 'return null;'),
    ('a game over not said', BOARD, 'over: view.status === "finished", step: stepName', 'over: false, step: stepName'),
    ('the step left out', BOARD, 'const stepName = (STEPS[stepAt(view.state.phase)] || [])[0], me = players()[view.seat] || {};', 'const stepName = undefined, me = players()[view.seat] || {};'),
    ('the seat left out', BOARD, 'turn: view.state.turn, over: view.status === "finished", step: stepName, seat: me.name,', 'turn: view.state.turn, over: view.status === "finished", step: stepName,'),
    ('the view left out', BOARD, 'view: phone() ? "Phone" : (VIEWS.find(([k]) => k === mode) || [])[2]};', 'view: undefined};'),
    ('the glyph gone from the strip', BOARD, '${ib("✉", "send-feedback", "Send feedback", {}, {cls: "compact cm-feedback-glyph"})}<button type="button" class="cm-profile-avatar"', '<button type="button" class="cm-profile-avatar"'),
    ('the report leaves the game out', SHEET, "game: game ? {tableId: game.tableId, matchId: game.matchId,", "game: false ? {tableId: game.tableId, matchId: game.matchId,"),
    ('a game named with no board', APP, 'const game=C.board&&C.board.held?C.board.held():null;', 'const game={matchId: "x", turn: 1, over: false};'),
]
