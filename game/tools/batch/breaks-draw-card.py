# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Draw card, acknowledged once (Linear ROB-73, the Oct 15 playtest's P05): the held draw in rules/turn.mjs (`drawBeat`),
the room's receipts that make a second submission draw nothing (game/room/room.mjs), the two-player first draw
(CR 103.8a) and drawing from an empty library (CR 704.5b), as tests/room-draw-card.mjs proves them.

Run from the repository root, with nothing else editing the worktree:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-draw-card.py
"""
SUITES = ['tests/room-draw-card.mjs']
T = 'game/engine/rules/turn.mjs'
BREAKS = [
    ('the draw never held for its Draw a card', T,
     '    else if (state.drawBeat) state.awaiting = {kind: "draw-card", player: state.activePlayer};\n',
     ''),
    ('Draw a card answered without a card drawn', T,
     '    state.awaiting = null;\n    draw(state, awaiting.player, events);\n    grantStepPriority(state, events);\n    return events;\n  }\n  /* Drawn, or dredged:',
     '    state.awaiting = null;\n    grantStepPriority(state, events);\n    return events;\n  }\n  /* Drawn, or dredged:'),
    ('an answer sent again taken as a new one', 'game/room/room.mjs',
     '        return {receipt: known.receipt, changed: false};\n      }\n      try{const cached=controller.refinementReceipt',
     '      }\n      try{const cached=controller.refinementReceipt'),
    ('the host\'s rule ignored: the first draw always skipped in a two-player game', T,
     'state.skipFirstDraw !== false && state.players.length === 2 && state.turn === 1',
     'state.players.length === 2 && state.turn === 1'),
    ('the first draw skipped at a table of three too', T,
     'state.skipFirstDraw !== false && state.players.length === 2 && state.turn === 1',
     'state.skipFirstDraw !== false && state.turn === 1'),
    ('drawing from an empty library not a loss', 'game/engine/rules/sba.mjs',
     '  if (player.drewFromEmpty === true) return "empty-library";',
     '  if (false) return "empty-library";'),
]
