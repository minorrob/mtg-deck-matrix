# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
SUITES = ['tests/board-result-bridge.mjs']
BREAKS = [
 ('premature client record', 'crankmagic-board.js', 'if (!matches(record) && v.resultRecordExpected)', 'if (false)'),
 ('wrong seat summary', 'crankmagic-board.js', 'r.seatId === v.seatId && r.id === gameId', 'true'),
 ('lose owner context at shared writer', 'crankmagic-board.js', 'account:context.account,tableId:context.tableId,matchId:context.matchId,seatId:context.seatId', 'account:null'),
]
