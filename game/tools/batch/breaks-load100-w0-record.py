# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The record's private-seed assertion catches a real leak even inside a string wrapper."""
SUITES = ['tests/table-record.mjs']
BREAKS = [
    ('private seed wrapped inside a seat record', 'game/room/table.mjs',
     '        gameRecord: structuredClone(record.gameRecords?.[id]?.[seatId] ?? null), chat: await lounge.chatRecord()};',
     '        seedLeak: `wrapped:${(await createMatchStore(storage, id).loadMatch()).seed}:tail`, gameRecord: structuredClone(record.gameRecords?.[id]?.[seatId] ?? null), chat: await lounge.chatRecord()};'),
]
