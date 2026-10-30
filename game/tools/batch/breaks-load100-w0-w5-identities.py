# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
SUITES = ['tests/engine-load100-mana.mjs', 'tests/engine-tap-to-cast.mjs', 'tests/engine-mana-riders.mjs', 'tests/engine-mana-provenance.mjs', 'tests/room-pooled-taps.mjs', 'tests/game-table.mjs']
ACTIONS = 'game/engine/rules/actions.mjs'
BREAKS = [
    ('a sole pattern still asks exact identities', ACTIONS,
     'if (state.sourceChoices !== true) return {taps: plan.taps};', 'return {taps: plan.taps};'),
    ('earlier output identities cannot be reused', ACTIONS,
     'kind(unit) === group.kind && !used.has(unit.id)', 'kind(unit) === group.kind'),
    ('saved identity blocks remain live and legal', ACTIONS,
     ' || ids.some(id => !eligible.some(unit => unit.id === id))', ''),
    ('the actual chosen identities activate', ACTIONS,
     'for (const tap of identity.taps) events.push(...perform', 'for (const tap of tapped.taps) events.push(...perform'),
    ('layer two controls mana offers', ACTIONS,
     'function manaOffers(state, player) {\n  const actions = [];\n  for (const id of state.zones.battlefield) {\n    const object = state.objects[id];\n    if (controllerOf(state, id) !== player) continue;',
     'function manaOffers(state, player) {\n  const actions = [];\n  for (const id of state.zones.battlefield) {\n    const object = state.objects[id];\n    if (object.controller !== player) continue;'),
    ('layer two controls public mana sources', ACTIONS,
     'if (controllerOf(state, id) !== player || object.faceDown) continue;',
     'if (object.controller !== player || object.faceDown) continue;'),
    ('current scenarios require exact identities', 'game/engine/cards/scenario.mjs',
     '    sourceChoices: true,', '    sourceChoices: false,'),
    ('new table games require exact identities', 'game/room/table.mjs',
     '      sourceChoices: true,', '      sourceChoices: false,'),
    ('the room retains exact identity rules', 'game/room/room.mjs',
     '...(pod?.sourceChoices === true ? {sourceChoices: true} : {})', '...({})'),
]
