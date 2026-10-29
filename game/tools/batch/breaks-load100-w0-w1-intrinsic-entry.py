# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Prospective intrinsic entry counters; retain the original pre-entry/copy reader union."""
SUITES = ['tests/engine-intrinsic-entry.mjs', 'tests/engine-battles.mjs', 'tests/engine-compleated.mjs',
          'tests/engine-load100-w2-stack.mjs', 'tests/engine-entering.mjs', 'tests/engine-enter-copy.mjs',
          'tests/engine-riot.mjs', 'tests/engine-wave4c-k3.mjs', 'tests/engine-wave4a-h3.mjs', 'tests/engine-cards.mjs']
CHARACTERISTICS = 'game/engine/rules/entry-characteristics.mjs'
ENTRY = 'game/engine/rules/pre-entry.mjs'
LEGACY = 'game/engine/rules/replacement.mjs'
BREAKS = [
    ('lost intrinsic ability still gives loyalty', CHARACTERISTICS,
     'if (current.types.includes("Planeswalker") && !current.lostAbilities && Number.isInteger(object.loyalty))',
     'if (current.types.includes("Planeswalker") && Number.isInteger(object.loyalty))'),
    ('nonplaneswalker still gets loyalty', CHARACTERISTICS,
     'if (current.types.includes("Planeswalker") && !current.lostAbilities && Number.isInteger(object.loyalty))',
     'if (!current.lostAbilities && Number.isInteger(object.loyalty))'),
    ('intrinsic printed loyalty omitted', CHARACTERISTICS,
     '  if (current.types.includes("Planeswalker") && !current.lostAbilities && Number.isInteger(object.loyalty)) counters.loyalty = object.loyalty;\n', ''),
    ('intrinsic loyalty read from prospective empty counters', CHARACTERISTICS,
     'counters.loyalty = object.loyalty;', 'counters.loyalty = object.counters.loyalty ?? 0;'),
    ('native intrinsic counters omitted', ENTRY,
     '  for (const [counter, count] of Object.entries(intrinsicEnteringCounters(object, current))) counters[counter] = (counters[counter] ?? 0) + count;\n', ''),
    ('native Compleated reads removed printed keyword', ENTRY,
     'frame.phyrexianLife > 0 && counters.loyalty > 0 && current.keywords.includes("Compleated")',
     'frame.phyrexianLife > 0 && counters.loyalty > 0 && (object.keywords ?? []).includes("Compleated")'),
    ('legacy Compleated reads removed printed keyword', LEGACY,
     'phyrexianLife > 0 && counters.loyalty > 0 && current.keywords.includes("Compleated")',
     'phyrexianLife > 0 && counters.loyalty > 0 && (state.objects[objectId]?.keywords ?? []).includes("Compleated")'),
    ('legacy entry derives actual old zone', LEGACY,
     'const view = prospectiveEnteringState(state, {objectId, player, candidate: {...state.objects[objectId], types: types ?? [], abilities: abilities ?? []}});',
     'const view = state;'),
    ('copied legacy entry derives actual old zone', LEGACY,
     'const view = prospectiveEnteringState(state, {objectId, player, candidate: {...state.objects[objectId], types: types ?? [], abilities: own}});',
     'const view = state;'),
    ('prospective entry retains actual old zone', CHARACTERISTICS,
     'id: frame.objectId, zone: "battlefield", zonePlayer: null,',
     'id: frame.objectId, zone: state.objects[frame.objectId]?.zone, zonePlayer: null,'),
    ('prospective own static effect omitted', CHARACTERISTICS,
     'effects: [...(state.effects ?? []), ...own]', 'effects: [...(state.effects ?? [])]'),
    ('intrinsic counters erase independent grants', ENTRY,
     '  for (const [counter, count] of Object.entries(intrinsicEnteringCounters(object, current))) counters[counter] = (counters[counter] ?? 0) + count;',
     '  for (const counter of Object.keys(counters)) delete counters[counter];\n  for (const [counter, count] of Object.entries(intrinsicEnteringCounters(object, current))) counters[counter] = count;'),
]
