# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The actual inset spell must be castable, correctly typed, and linked to the creature that prepared it."""
SUITES = ['tests/room-prepared.mjs']
BREAKS = [
 ('prepared copy excluded from mana funding', 'game/engine/rules/actions.mjs',
  '(state.preparedTaps === true && from === "exile"', '(false && from === "exile"'),
 ('prepared cast loses its menu source', 'game/room/decision.mjs',
  'const preparedFrom = action?.kind === "cast" ? state.objects[action.objectId]?.prepareOf : undefined;',
  'const preparedFrom = undefined;'),
 ('prepared copy becomes a permanent', 'game/engine/script/effects/attributes.mjs',
  'const copy = addObject(state, {...spell, copy: true, owner: controller, controller}, "exile");',
  'const copy = addObject(state, {...spell, types: ["Creature"], copy: true, owner: controller, controller}, "exile");'),
]
