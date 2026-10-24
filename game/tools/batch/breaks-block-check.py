# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""A draft of blocks, checked before Confirm (Linear ROB-75): rules/combat.mjs (legalBlocks on the decision, and
`blockers.check`, which the answer is refused by too), controller.mjs (`check`, any other choice of options) and
game/room/room.mjs (`check`, for the seat asked about the question open now, changing nothing).

Run from the repository root, with nothing else editing the worktree:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-block-check.py
"""
SUITES = ['tests/room-block-check.mjs']
C = 'game/engine/rules/combat.mjs'
K = 'game/engine/controller.mjs'
R = 'game/room/room.mjs'
BREAKS = [
    # What each creature may block
    ('no legalBlocks on the decision', C,
     '      legalBlocks: [...by].map(([blocker, attackers]) => ({blocker, attackers})),\n',
     ''),
    ('legalBlocks keeping only the last attacker of each blocker', C,
     'for (const o of options) by.set(o.cardId, [...(by.get(o.cardId) ?? []), o.attackerId]);',
     'for (const o of options) by.set(o.cardId, [o.attackerId]);'),
    # The draft, checked whole
    ('a draft told only its first reason', C,
     '      reasons.push(whyBlockersAreIllegal(state, attackerId, ids));\n',
     '      if (!reasons.length) reasons.push(whyBlockersAreIllegal(state, attackerId, ids));\n'),
    ('a creature blocking twice let through', C,
     '    for (const id of twice) reasons.push(`${shownName(state.objects[id])} can block only one attacker. Choose one attacker for it to block.`);\n',
     ''),
    ('menace not checked', C,
     '      if (blockersAreLegal(state, attackerId, ids)) continue;\n',
     '      continue;\n'),
    ('one option twice let through', C,
     ' || new Set(indices).size !== indices.length)\n      return {picked: [], reasons: ["Invalid selection"]};',
     ')\n      return {picked: [], reasons: ["Invalid selection"]};'),
    ('the answer not refused for what the check finds', C,
     '    if (reasons.length) throw new Error(reasons[0]);\n',
     ''),
    # Any other choice
    ('another choice checked as always legal', K,
     '      try {validateIndices(pending, {indices});} catch (error) {return error.message;}\n',
     ''),
    ('a choice of a number checked as one of options', K,
     '      if (!BY_INDICES(pending.mode)) return "Only a choice of options can be checked";\n',
     ''),
    ('a check of another question taken for this one', K,
     '      if (!pending || answered || choiceId !== pending.id) return "This choice has expired";\n',
     '      if (!pending || answered) return "This choice has expired";\n'),
    # The room
    ('another seat told about a question not theirs', R,
     'if (finished() || pendingSeat !== seat || !pending || pending.id !== choiceId)',
     'if (finished() || !pending || pending.id !== choiceId)'),
    ('a question gone checked as if it were open', R,
     'if (finished() || pendingSeat !== seat || !pending || pending.id !== choiceId)',
     'if (finished() || pendingSeat !== seat || !pending)'),
    ('a draft of blocks checked only as a choice of options', R,
     '      const reasons = state.awaiting?.kind === "declare-blockers"\n',
     '      const reasons = false\n'),
]
