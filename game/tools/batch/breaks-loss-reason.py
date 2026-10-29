# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""How a game ended, as data (`result.ending`; Linear ROB-166, the Requests table's row 10): every seat's outcome and the
engine's loss reason, and the kind of ending -- won, draw, eliminated, conceded, timed-out, ended -- in
game/room/ending.mjs; the order the seats went out in, kept with the room, and `ending` in every view's result
(game/room/room.mjs), as tests/room-ending.mjs proves them, with game-leave, room-slices and table-record.

Run from the repository root, with nothing else editing the worktree:

    python3 -u game/tools/batch/breaks.py game/tools/batch/breaks-loss-reason.py
"""
SUITES = ['tests/room-ending.mjs', 'tests/table-record.mjs', 'tests/room-slices.mjs', 'tests/game-leave.mjs']
E = 'game/room/ending.mjs'
R = 'game/room/room.mjs'
# The seated view, present before the later spectator view added a second endingOf call.
SEATED = '          /* And how it ended, as data (ending.mjs; Linear ROB-166): who lost and why, beside the words, which stay as they were. */\n'
BREAKS = [
    # Each seat's outcome
    ('the winner not said to have won', E,
     '  if (over.winner === index) return {seatId: seat.seatId, outcome: "won", reason: null};\n',
     ''),
    ('a seat that left not said to have left', E,
     '  if (gone && (!player.lost || player.lostTo === "conceded")) return',
     '  if (false && gone && (!player.lost || player.lostTo === "conceded")) return'),
    ('a seat whose time ran out said to have conceded', E,
     'return {seatId: seat.seatId, outcome: gone, reason: "conceded"};',
     'return {seatId: seat.seatId, outcome: "conceded", reason: "conceded"};'),
    ('a loss by the rules said as the leaving after it', E,
     '(!player.lost || player.lostTo === "conceded")',
     '(true)'),
    ('a seat that left before the engine conceded them not said to have left', E,
     '(!player.lost || player.lostTo === "conceded")',
     '(player.lostTo === "conceded")'),
    ('the engine\'s loss reason not said', E,
     'outcome: "lost", reason: player.lostTo ?? null};',
     'outcome: "lost", reason: null};'),
    ('a seat still in the game not said to be playing', E,
     '  return {seatId: seat.seatId, outcome: "playing", reason: null};\n}',
     '  return {seatId: seat.seatId, outcome: "lost", reason: null};\n}'),
    # The kind
    ('a person ending the game not said to have ended it', E,
     '  if (ended && ended.why !== "no-person") return',
     '  if (false) return'),
    ('every person out said to be a person ending it', E,
     'ended.why !== "no-person") return',
     'ended.why !== "no-persons") return'),
    ('who ended it not said', E,
     '{kind: "ended", seatId: ended.by ?? null,',
     '{kind: "ended", seatId: null,'),
    ('an AI seat out after the last person taken for them', E,
     '.reverse().find((id) => people.has(id))',
     '.reverse().find((id) => true)'),
    ('the first person out taken for the last', E,
     '[...outs].reverse().find(',
     '[...outs].find('),
    ('with no order kept, the first person by seat, not the last', E,
     '?? [...people].at(-1) ?? null;',
     '?? [...people][0] ?? null;'),
    ('a person out by the rules not said eliminated', E,
     'const kind = lastEnd && lastEnd.outcome !== "lost" ? lastEnd.outcome : "eliminated";',
     'const kind = lastEnd ? lastEnd.outcome : "eliminated";'),
    ('a person out by leaving said eliminated', E,
     'const kind = lastEnd && lastEnd.outcome !== "lost" ? lastEnd.outcome : "eliminated";',
     'const kind = "eliminated";'),
    ('the last person\'s loss reason not said', E,
     'reason: lastEnd ? lastEnd.reason : null, seats: each};',
     'reason: null, seats: each};'),
    ('a draw said to be won', E,
     'return {kind: "draw", seatId: null,',
     'return {kind: "won", seatId: null,'),
    ('the winner\'s seat not said', E,
     'return {kind: "won", seatId: seats[over.winner].seatId,',
     'return {kind: "won", seatId: null,'),
    # The room
    ('the seats going out not kept in order', R,
     '      if (said && said.kind === "lost") outs = [...outs, seats[said.player].seatId];\n',
     ''),
    ('the order not saved with the room', R,
     'ended, ...(outs.length ? {outs} : {}), history,',
     'ended, history,'),
    ('the order not read back when the room wakes', R,
     'outs = record.outs || [];',
     'outs = [];'),
    ('no ending in the result', R,
     SEATED + '          ending: endingOf({over, ended, seats, players: state.players, departures, outs})} : null,',
     SEATED + '          } : null,'),
    ('the room\'s departures not read for the ending', R,
     SEATED + '          ending: endingOf({over, ended, seats, players: state.players, departures, outs})',
     SEATED + '          ending: endingOf({over, ended, seats, players: state.players, departures: {}, outs})'),
    ('the room\'s own end not read for the ending', R,
     SEATED + '          ending: endingOf({over, ended, seats, players: state.players, departures, outs})',
     SEATED + '          ending: endingOf({over, seats, players: state.players, departures, outs})'),
]
