# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""ROB-343: a modal double-faced card's shown face leaves state a room can save, with the original reader baselines intact."""
SUITES = ['tests/engine-mdfc-face-state.mjs', 'tests/room-mdfc-land-play.mjs', 'tests/engine-mdfc.mjs']
SHOW = '  for (const [key, value] of Object.entries(faceOf(object.mdfc, face))) {\n'
BREAKS = [
    ('a characteristic the shown face lacks is copied as undefined again', 'game/engine/state/index.mjs',
     SHOW + '    if (value === undefined || (PRESENT_ONLY.includes(key) && Array.isArray(value) && !value.length)) delete object[key];\n',
     SHOW + '    if (PRESENT_ONLY.includes(key) && Array.isArray(value) && !value.length) delete object[key];\n'),
    ('an empty subtypes, supertypes or colors is kept, as addObject would not hold it', 'game/engine/state/index.mjs',
     SHOW + '    if (value === undefined || (PRESENT_ONLY.includes(key) && Array.isArray(value) && !value.length)) delete object[key];\n',
     SHOW + '    if (value === undefined) delete object[key];\n'),
    ('putting the front face back leaves the card marked as shown face back', 'game/engine/state/index.mjs',
     '  if (face === "back") object.face = "back"; else delete object.face;\n',
     '  if (face === "back") object.face = "back";\n'),
]
