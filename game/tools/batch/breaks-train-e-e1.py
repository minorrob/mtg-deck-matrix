# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Train E, worker e1: fifteen preparation cards of Rob's v43 library (CR 722). One break for each engine change they
needed -- each guard, each branch -- and the suite that catches it:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-train-e-e1.py

- Paradox Shaper // Omit Variables: "if this creature isn't prepared" -- the selector's `prepared` (script/filter.mjs).
- Harmonized Trio // Brainstorm: "{T}, Tap two untapped creatures you control" -- its own {T} taps it, so it is not one of
  the two (rules/actions.mjs, tapSets' `ownTap`; CR 602.2b, 601.2h).
"""
SUITES = [
    'tests/engine-filter.mjs',
    'tests/engine-cards.mjs',
]

FILTER = 'game/engine/script/filter.mjs'
ACTIONS = 'game/engine/rules/actions.mjs'

READ = '    if (selector.prepared !== undefined && (object.prepared === true) !== selector.prepared) return false;\n'
OWN_TAP = 'tapSets(state, player, id, tapper.selector, tapper.count, (ability.cost ?? []).some((a) => a?.atom === "{T}"))'

BREAKS = [
    # Paradox Shaper: the prepared designation, as a selector reads it (script/filter.mjs).
    ('prepared: a key of the grammar', FILTER,
     '  "prepared",\n',
     ''),
    ('prepared: read', FILTER, READ, ''),
    ('prepared: read the right way round', FILTER, READ,
     '    if (selector.prepared !== undefined && (object.prepared === true) === selector.prepared) return false;\n'),
    ('prepared: false read too, not only true', FILTER, READ,
     '    if (selector.prepared === true && object.prepared !== true) return false;\n'),
    ('prepared: true or false, nothing else', FILTER,
     '  if (selector.prepared !== undefined && typeof selector.prepared !== "boolean") throw new Error("A selector\'s prepared is true or false: whether the permanent is prepared (CR 722.3)");\n',
     ''),
    # Harmonized Trio: its own {T} keeps it out of the creatures the rest of its cost taps (rules/actions.mjs).
    ('own tap: the source left out', ACTIONS,
     '    && !(ownTap && id === sourceId)\n',
     ''),
    ('own tap: only when the cost has its own {T}', ACTIONS, OWN_TAP,
     'tapSets(state, player, id, tapper.selector, tapper.count, true)'),
    ('own tap: passed when it has', ACTIONS, OWN_TAP,
     'tapSets(state, player, id, tapper.selector, tapper.count, false)'),
]
