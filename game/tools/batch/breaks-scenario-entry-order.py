# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
SUITES = ['tests/scenario-entry-order.mjs']
BREAKS = [
    ('missing-priority action queries the hand of nobody', 'game/engine/cards/scenario.mjs',
     '    if (!Number.isInteger(seat) || !state.players[seat])\n      fail(state.awaiting ? `answer ${state.awaiting.kind} before taking another action` : "no player has priority for this action",\n        {kind: state.awaiting ? "question-offer" : "action-offer"});\n', ''),
]
