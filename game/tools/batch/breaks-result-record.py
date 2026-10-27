# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Each human's persisted game summary keeps the correct owner, identity, time and AI boundary."""
SUITES = ['tests/table-game-record.mjs']
BREAKS = [
 ('another seats private summary', 'game/room/table.mjs',
  '[seatName(mine)] ?? null)', '[seatName(0)] ?? null)'),
 ('AI recorded as a human', 'game/room/table.mjs',
  'room.seats.filter(s => s.pilot !== "house").map(s => {', 'room.seats.map(s => {'),
 ('client clock replaces game time', 'game/room/result-record.mjs',
  'new Date(now).toISOString()', 'new Date(0).toISOString()'),
 ('unstable record identity', 'game/room/result-record.mjs',
  'id: `game:table:${matchId}:${view.seatId}`', 'id: `game:table:${matchId}`'),
]
