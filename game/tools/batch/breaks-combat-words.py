# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""ROB-168: same-named attackers and blockers said apart in a person's view of the combat question."""
SUITES = ["tests/room-combat-words.mjs"]
R = "game/room/room.mjs"
BREAKS = [
    ("what is still alike is not numbered", R,
     'if (clash.get(w) > 1) {const k = (seen.get(w) || 0) + 1;',
     'if (false) {const k = (seen.get(w) || 0) + 1;'),
    ("size not said where names clash", R,
     '[c, clash.get(w) > 1 ? `${w}${shape(c)}` : w]',
     '[c, w]'),
    ("a block on an attack at a planeswalker not said", R,
     '${pw ? ` (attacking ${shownName(pw)})` : ""}',
     '${""}'),
    ("a choice with no two alike rewritten anyway", R,
     'if (![...clash.values()].some((n) => n > 1)) return choice;',
     'if (false) return choice;'),
    ("the seat's view keeps the engine's words", R,
     'decision: mine ? describeDecision(state, combatWords(state, structuredClone(controller.pending)), pendingActions, projected) : null,',
     'decision: mine ? describeDecision(state, structuredClone(controller.pending), pendingActions, projected) : null,'),
]
