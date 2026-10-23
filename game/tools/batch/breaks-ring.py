# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Boromir and the Ring (CR 701.54): prove each new behavior can fail."""
SUITES = ['tests/engine-ring.mjs', 'tests/engine-vocabulary.mjs']
RING = 'game/engine/keywords/ring.mjs'
LAYERS = 'game/engine/rules/layers.mjs'
STATICS = 'game/engine/rules/statics.mjs'
SBA = 'game/engine/rules/sba.mjs'
FILTER = 'game/engine/script/filter.mjs'
BREAKS = [
 ('bearer designation', RING, 'state.players[player].ring.bearer = bearer;', 'state.players[player].ring.bearer = null;'),
 ('one emblem per player', RING, 'if (ring.emblem === null) {', 'if (true) {'),
 ('temptations accumulate', RING, 'ring.count += 1;', 'ring.count = 1;'),
 ('abilities stop at four', RING, 'ABILITIES.slice(0, Math.min(4, ring.count))', 'ABILITIES.slice(0, 1)'),
 ('no creatures still tempted', RING, '[...events, tempted(state, player, null)]', 'events'),
 ('only own creatures chosen', RING, 'controllerOf(state, id) === player && typesOf(state, id).includes("Creature")', 'typesOf(state, id).includes("Creature")'),
 ('bearer loses designation on control change', 'game/engine/script/effects/permanents.mjs', '      clearRingBearer(state, id);\n', ''),
 ('departure clears designation', RING, 'if (player.ring?.bearer != null && !isRingBearer(state, player.ring.bearer, player.id)) player.ring.bearer = null;', 'if (false) player.ring.bearer = null;'),
 ('loot draws', RING, 'effects: [{effect: "draw", count: 1}, {effect: "discard", count: 1}]', 'effects: [{effect: "discard", count: 1}]'),
 ('loot discards', RING, 'effects: [{effect: "draw", count: 1}, {effect: "discard", count: 1}]', 'effects: [{effect: "draw", count: 1}]'),
 ('blocked trigger waits until combat end', RING, 'at: "end of combat"', 'at: "end step"'),
 ('blocker sacrificed', RING, 'targets: "that card", to: "graveyard", sacrifice: true', 'targets: "self", to: "graveyard", sacrifice: true'),
 ('only combat damage triggers', RING, 'combat: true, who: "ring-bearer"', 'combat: false, who: "ring-bearer"'),
 ('all opponents lose life', RING, 'who: "opponent", amount: 3', 'who: "you", amount: 3'),
 ('ring watches its bearer only', 'game/engine/rules/trigger.mjs', '  if (condition.who === "ring-bearer" && !isRingBearer(state, id, controller)) return false;\n', ''),
 ('legendary applied through layers', LAYERS, 'if (change.addSupertypes) current.supertypes = [...new Set([...current.supertypes, ...change.addSupertypes])];', 'if (false) current.supertypes = [];'),
 ('legendary reaches last known information', LAYERS, 'supertypes: [...current.supertypes],', 'supertypes: [...(object.supertypes ?? [])],'),
 ('legend rule sees Ring', SBA, '!(characteristicsOf(state, id).supertypes ?? []).includes("Legendary")', '!(object.supertypes ?? []).includes("Legendary")'),
 ('selectors see legendary bearer', FILTER, 'if (selector.supertypes && !selector.supertypes.every((st) => (characteristicsOf(state, id).supertypes ?? []).includes(st)))', 'if (selector.supertypes && !selector.supertypes.every((st) => (object.supertypes ?? []).includes(st)))'),
 ('greater power cannot block', STATICS, '&& powerOf(state, blockerId) > powerOf(state, attackerId)) return true;', '&& false) return true;'),
 ('equal power can block', STATICS, '&& powerOf(state, blockerId) > powerOf(state, attackerId)) return true;', '&& powerOf(state, blockerId) >= powerOf(state, attackerId)) return true;'),
 ('other creatures can be blocked', STATICS, 'p.ring?.bearer === attackerId && controllerOf(state, attackerId) === p.id', 'p.ring?.bearer != null && controllerOf(state, attackerId) === p.id'),
]
