# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Linear ROB-24: why a card can't be played now -- the engine's reasons (rules/actions.mjs, whyNot), said by the room on a
seat's own cards while it holds priority and on no other seat's view (room.mjs, whyNotFor), and shown by the board with the
card and where its options would be. tests/room-why-not.mjs and tests/board-commander-hand.mjs.

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-why-not.py
"""
SUITES = ['tests/room-why-not.mjs', 'tests/board-commander-hand.mjs']
A = 'game/engine/rules/actions.mjs'
R = 'game/room/room.mjs'
B = 'crankmagic-board.js'
BREAKS = [
    ('the mana counted without the sources', A,
     'const mana = poolSize(pool) + [...best.values()].reduce((n, v) => n + Math.max(0, v), 0);\n    const tax',
     'const mana = poolSize(pool);\n    const tax'),
    ('the commander tax left out', A,
     'const {cost, x} = castCost(state, player, id, tax);\n    const need = cost.generic + cost.symbols.filter((s) => s.kind !== "generic" && s.kind !== "variable").length + x;',
     'const {cost, x} = castCost(state, player, id, 0);\n    const need = cost.generic + cost.symbols.filter((s) => s.kind !== "generic" && s.kind !== "variable").length + x;'),
    ('a missing color not said', A,
     'if (missing) return `It needs {${missing}}, and nothing you have untapped makes it.`;',
     'if (false) return "";'),
    ('an offered card given a reason too', A,
     '  if (actions.some((a) => a.objectId === id && a.kind !== "activate-mana")) return null;\n  return deriving(state, () => {',
     '  return deriving(state, () => {'),
    ('the room saying no reasons', R,
     '      if (why) card.why = why;',
     '      if (false) card.why = why;'),
    ('reasons on a seat not holding priority', R,
     'if (!pending || pending.kind !== "priority" || state.priorityPlayer !== seat) return projected;',
     'if (false) return projected;'),
    ('the board not saying it with the card', B,
     ' : c.why ? `. ${c.why}` : ""}`;',
     ' : ""}`;'),
    ('a click on the card not saying why', B,
     '    if (!opts.length && findCard(id)?.why) return C.notice(findCard(id).why);\n',
     ''),
]
