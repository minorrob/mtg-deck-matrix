# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The first draw step (CR 103.8a): in a two-player game the player who goes first skips the draw STEP of their first turn,
not only its draw -- it is never begun, so nothing triggers at its beginning (Teferi's Puzzle Box, Howling Mine) -- and a
draw step an added beginning phase brings (CR 500.8) is not that one. In a game of three or more nobody skips (103.8c).
And the table's house rule (Rob, 2026-10-12: "this can be toggled off in game setup by the lobby owner"): the host turns
the skip off, the table hands the room a pod that says so, the room plays it and keeps it with the match.

Run from the repository root, with nothing else editing the worktree:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-first-draw-step.py
"""
SUITES = ['tests/engine-turn.mjs', 'tests/engine-phases.mjs', 'tests/engine-combat-moments.mjs', 'tests/room-beats.mjs',
          'tests/game-table.mjs', 'tests/engine-cards.mjs']
BREAKS = [
    # The step itself.
    ('the draw step is not a conditional step', 'game/engine/rules/turn.mjs',
     '{phase: "DRAW", priority: true, when: "drawStep"},',
     '{phase: "DRAW", priority: true},'),
    ('every draw step happens, the first player\'s first too', 'game/engine/rules/turn.mjs',
     'drawStep: (state, added = false) => added || !skipsFirstDraw(state),',
     'drawStep: () => true,'),
    ('an added beginning phase\'s draw step skipped on that turn too', 'game/engine/rules/turn.mjs',
     'drawStep: (state, added = false) => added || !skipsFirstDraw(state),',
     'drawStep: (state) => !skipsFirstDraw(state),'),
    ('an added phase\'s step not said to be added', 'game/engine/rules/turn.mjs',
     'CONDITIONS[STEPS[queued].when](state, true)',
     'CONDITIONS[STEPS[queued].when](state)'),
    ('a pod of three or four skips it too (CR 103.8c)', 'game/engine/rules/turn.mjs',
     'state.skipFirstDraw !== false && state.players.length === 2 && state.turn === 1',
     'state.skipFirstDraw !== false && state.turn === 1'),
    ('the second player skips too', 'game/engine/rules/turn.mjs',
     'state.turn === 1 && state.activePlayer === state.startingPlayer;',
     'state.turn <= 2;'),
    # The house rule, in the engine.
    ('the house rule ignored by the turn', 'game/engine/rules/turn.mjs',
     'state.skipFirstDraw !== false && state.players.length === 2',
     'state.players.length === 2'),
    ('the house rule not kept in the state', 'game/engine/state/index.mjs',
     '...(pod?.skipFirstDraw === false ? {skipFirstDraw: false} : {}),',
     ''),
    ('every state carries the house rule\'s key', 'game/engine/state/index.mjs',
     '...(pod?.skipFirstDraw === false ? {skipFirstDraw: false} : {}),',
     'skipFirstDraw: pod?.skipFirstDraw !== false,'),
    ('a scenario cannot ask for the house rule', 'game/engine/cards/scenario.mjs',
     '...(scenario.skipFirstDraw === false ? {skipFirstDraw: false} : {})});',
     '});'),
    # The room.
    ('the room drops the pod\'s house rule', 'game/room/room.mjs',
     '...(pod && pod.skipFirstDraw === false ? {skipFirstDraw: false} : {})};',
     '};'),
    ('the match does not keep the table\'s rules', 'game/room/room.mjs',
     'await store.saveMatch({pod: {seats, ...rules, ...beats}, seed});',
     'await store.saveMatch({pod: {seats, ...beats}, seed});'),
    # The table.
    ('a new table turns the skip off', 'game/room/table.mjs',
     'skipFirstDraw: r.skipFirstDraw !== false};};',
     'skipFirstDraw: r.skipFirstDraw === true};};'),
    ('anything taken for the skip', 'game/room/table.mjs',
     'if (typeof skip !== "boolean") throw',
     'if (false) throw'),
    ('the host\'s choice not saved', 'game/room/table.mjs',
     'bracketLimit: limit, skipFirstDraw: skip}',
     'bracketLimit: limit}'),
    ('the pod does not carry the house rule', 'game/room/table.mjs',
     '...(rulesOf().skipFirstDraw === false ? {skipFirstDraw: false} : {}),',
     ''),
    # Not a break: the table handing the room `skipFirstDraw: true` changes nothing, since the room keeps the key only
    # when it is false (game/room/room.mjs, `rules`).
]
