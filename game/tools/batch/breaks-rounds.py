# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The round and the turn within it (Linear ROB-76): rules/turn.mjs (nextRound, kept as each turn begins and said in its
event), projection.mjs (the view's labels) and game/room/events.mjs (the table's `turn` event).

Run from the repository root, with nothing else editing the worktree:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-rounds.py
"""
SUITES = ['tests/engine-rounds.mjs']
T = 'game/engine/rules/turn.mjs'
P = 'game/engine/projection.mjs'
BREAKS = [
    # The rule
    ('an extra turn beginning a round', T,
     '      if (!extra && nextRound(state, orderFrom, state.activePlayer)) {',
     '      if (nextRound(state, orderFrom, state.activePlayer)) {'),
    ('rounds counted from seat 0, not the starting player', T,
     '    if (at === state.startingPlayer) return true;\n',
     '    if (at === 0) return true;\n'),
    ('a round begun only at the starting player\'s own turn, so never once they have left', T,
     '    if (at === state.startingPlayer) return true;\n    if (at === to) return false;\n',
     '    if (at === to) return to === state.startingPlayer;\n'),
    ('the turns in a round not counted', T,
     '      else state.turnInRound += 1;\n',
     ''),
    ('a new round counting on from the last', T,
     '{ state.round += 1; state.turnInRound = 1; }',
     '{ state.round += 1; }'),
    ('a game saved before rounds were kept given one partway', T,
     '    if (Number.isInteger(state.round)) {\n      if (!extra',
     '    if (true) {\n      if (!extra'),
    ('a game begun with no round', T,
     '  state.round = 1;\n  state.turnInRound = 1;\n',
     ''),
    ('a turn\'s beginning not saying its round', T,
     '    ...(state.phase === "UNTAP" && Number.isInteger(state.round) ? {round: state.round, turnInRound: state.turnInRound} : {}),\n',
     ''),
    # The view
    ('a view with no round where the game has one', P,
     '    round: Number.isInteger(state.round) ? state.round : null,\n',
     '    round: null,\n'),
    ('a game saved before rounds were kept showing an undefined count', P,
     '    turnInRound: Number.isInteger(state.turnInRound) ? state.turnInRound : null,\n',
     '    turnInRound: state.turnInRound,\n'),
    ('a turn id for a game not begun', P,
     '    turnId: state.turn > 0 ? `turn:${state.turn}` : null,\n',
     '    turnId: `turn:${state.turn}`,\n'),
    ('an extra turn not called one', P,
     '    extraTurn: state.extraTurn === true,\n',
     '    extraTurn: false,\n'),
    # The table's events
    ('the table\'s turn event without its round', 'game/room/events.mjs',
     ', ...(Number.isInteger(f.round) ? {round: f.round, turnInRound: f.turnInRound} : {})',
     ''),
]
