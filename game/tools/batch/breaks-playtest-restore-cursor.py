# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Restore cursor regression with the original stream, privacy and replay reader baselines intact."""
SUITES = ['tests/room-restore-cursor.mjs', 'tests/room-events.mjs', 'tests/engine-projection.mjs', 'tests/game-replay.mjs']
BREAKS = [
    ('restored eventless input reuses the last written journal ID', 'game/room/room.mjs',
     'nextSeq = point.sequence + 1;', 'nextSeq = point.sequence;'),
]
