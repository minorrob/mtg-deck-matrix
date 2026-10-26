# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
SUITES = ['tests/board-result-bridge.mjs']
BREAKS = [
 ('premature client record', 'crankmagic-board.js', 'if (!matches(record) && v.resultRecordExpected)', 'if (false)'),
 ('wrong seat summary', 'crankmagic-board.js', 'r.seatId === v.seatId && r.id === gameId', 'true'),
 ('client date instead of server', 'crankmagic-board.js', 'playedAt:record?.playedAt || new Date().toISOString()', 'playedAt:new Date().toISOString()'),
]
