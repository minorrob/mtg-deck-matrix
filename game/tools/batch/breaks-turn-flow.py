# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The turn's flow, in the room (Rob's playtest notes, 2026-10-11): a person's own end step is always asked (`endAsks`), its
pass the end of their turn (`endsTurn`); step by step (`prefer`, on the tape); and which of their own turns it is (`yourTurn`).
The board's side is breaks-turn-flow-board.py.

Run from the repository root, with nothing else editing the worktree:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-turn-flow.py
"""
SUITES = ['tests/room-beats.mjs']
BREAKS = [
    ('the end step passes by itself', 'game/room/room.mjs',
     '((endAsks && state.phase === "END_OF_TURN") || prefs',
     '((false && state.phase === "END_OF_TURN") || prefs'),
    ('endAsks asked for by every game, made before it or not', 'game/room/room.mjs',
     'endAsks = beats.endAsks === true;',
     'endAsks = true;'),
    ('endAsks not kept with the room', 'game/room/room.mjs',
     '...(endAsks ? {endAsks} : {}), ',
     ''),
    ('the end step\'s pass does not say it ends the turn', 'game/room/room.mjs',
     '...(a.kind === "pass" && state && seat === state.activePlayer && state.phase === "END_OF_TURN" && !state.stack.length ? {endsTurn: true} : {}),',
     ''),
    ('every pass says it ends the turn', 'game/room/room.mjs',
     'a.kind === "pass" && state && seat === state.activePlayer && state.phase === "END_OF_TURN" && !state.stack.length ? {endsTurn: true}',
     'a.kind === "pass" ? {endsTurn: true}'),
    ('step by step not heard', 'game/room/room.mjs',
     '|| prefs[seats[seat].seatId]?.stepByStep === true));',
     '|| false));'),
    ('step by step for every seat', 'game/room/room.mjs',
     '|| prefs[seats[seat].seatId]?.stepByStep === true));',
     '|| Object.values(prefs).some((p) => p.stepByStep === true)));'),
    ('a way of playing not on the tape', 'game/room/room.mjs',
     '      tape({kind: "prefer", seat: seatId, stepByStep: on, ...(typeof askStack === "boolean" ? {askStack: ask} : {})});\n',
     ''),
    ('the same way of playing taped again', 'game/room/room.mjs',
     '      if ((was.stepByStep === true) === on && (was.askStack === true) === ask) return api;\n',
     ''),
    ('a replay skips a way of playing', 'game/room/room.mjs',
     'if (entry.kind === "prefer") return api.prefer(entry.seat, entry);',
     'if (entry.kind === "prefer") return api;'),
    ('an AI seat given a way of playing', 'game/room/room.mjs',
     '      if (seats[seat].pilot === "house") throw new RoomError(409, "An AI seat has no way of playing to set.");\n',
     ''),
    ('storage refuses a way of playing', 'game/engine/storage.mjs',
     '"end", "prefer", "yield"]',
     '"end", "yield"]'),
    ('a way of playing not kept with the room', 'game/room/room.mjs',
     'prefs = record.prefs || {};',
     'prefs = {};'),
    ('your turn not counted', 'game/room/room.mjs',
     '[seatId]: (turnsOf[seatId] ?? 0) + 1};',
     '[seatId]: 1};'),
    ('your turn said in another\'s', 'game/room/room.mjs',
     '...(turnsOf && state.activePlayer === seat && turnsOf[seatId] ? {yourTurn: turnsOf[seatId]} : {}),',
     '...(turnsOf && turnsOf[seatId] ? {yourTurn: turnsOf[seatId]} : {}),'),
]
