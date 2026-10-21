# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Linear ROB-170: a person alone with AI seats is not on the five-minute clock when they drop -- nobody is waiting on
them -- so the game waits for them; with another person at the table, the clock is as before. tests/game-leave.mjs.

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-solo-away.py
"""
SUITES = ['tests/game-leave.mjs']
T = 'game/room/table.mjs'
BREAKS = [
    ('a person alone with AIs conceded after five minutes', T,
     'if (record.lifecycle.phase === "playing" && waitedOn) record.away[seat] = now + AWAY_LIMIT;',
     'if (record.lifecycle.phase === "playing") record.away[seat] = now + AWAY_LIMIT;'),
    ('an AI seat counted as someone waiting', T,
     'i !== seat && x.occupied && x.kind === "human"',
     'i !== seat && x.occupied'),
    ('nobody on the clock, even with another person waiting', T,
     'if (record.lifecycle.phase === "playing" && waitedOn) record.away[seat] = now + AWAY_LIMIT;',
     'if (false) record.away[seat] = now + AWAY_LIMIT;'),
]
