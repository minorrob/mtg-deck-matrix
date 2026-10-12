# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The table's basic lands are basic lands (Rob, 2026-10-11: Rampant Growth found nothing in a library of nineteen basics).

Run from the repository root, with nothing else editing the worktree:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-table-basics.py
"""
SUITES = ['tests/table-basics.mjs']
BREAKS = [
    ('the room\'s bare basics first, as before', 'cloud/game-room.mjs',
     'export const tableCards = (name) => tableDefinition(name) ?? basicCards(name);',
     'export const tableCards = (name) => basicCards(name) ?? tableDefinition(name);'),
    ('the room\'s basics not Basic', 'game/room/room.mjs',
     'return color ? {types: ["Land"], supertypes: ["Basic"], subtypes:',
     'return color ? {types: ["Land"], supertypes: [], subtypes:'),
    ('the room\'s basics of no land type', 'game/room/room.mjs',
     'subtypes: name === "Wastes" ? [] : [name],',
     'subtypes: [],'),
]
