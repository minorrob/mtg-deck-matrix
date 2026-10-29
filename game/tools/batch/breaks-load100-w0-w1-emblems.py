# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Existing object-rule timing permissions from actual command-zone emblems (CR 114.4, 606.3)."""
SUITES = ['tests/engine-load100-w1-faces.mjs']
INDEX = 'game/engine/cards/index.mjs'
STATICS = 'game/engine/rules/statics.mjs'
BREAKS = [
    ('object-rule loyalty timing emblem compiles', INDEX,
     ' || (ability.rule === "loyalty-at-instant-speed" && ability.affects?.what === "permanent")', ''),
    ('unsupported specialized object rules remain refused', INDEX,
     'ability.rule === "loyalty-at-instant-speed" && ability.affects?.what === "permanent"', 'ability.affects?.what === "permanent"'),
    ('object rules read command-zone emblems', STATICS,
     'for (const holderId of [...state.zones.battlefield, ...emblems])', 'for (const holderId of state.zones.battlefield)'),
    ('ordinary command-zone cards are not emblems', STATICS,
     '.filter((holderId) => state.objects[holderId]?.emblem === true)', ''),
    ('emblems work for every seat', STATICS,
     '(state.zones.command ?? []).flat().filter((holderId)', '(state.zones.command?.slice(0, 1) ?? []).flat().filter((holderId)'),
    ('the emblem controller owns its permission', STATICS,
     'for (const holderId of [...state.zones.battlefield, ...emblems]) {\n    const holder = state.objects[holderId];',
     'for (const holderId of [...state.zones.battlefield, ...emblems]) {\n    const holder = {...state.objects[holderId], controller: 0};'),
]
