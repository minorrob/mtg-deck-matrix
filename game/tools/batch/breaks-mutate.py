# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Nethroi: a merged permanent, its physical cards and bounded target choices (CR 702.140, 730)."""
SUITES = ['tests/engine-mutate.mjs']
M = 'game/engine/keywords/mutate.mjs'
S = 'game/engine/state/index.mjs'
B = 'game/engine/script/bind.mjs'
BREAKS = [
 ('top characteristics', M, 'top = onTop ? incoming.values : previous;', 'top = previous;'),
 ('bottom characteristics', M, 'top = onTop ? incoming.values : previous;', 'top = incoming.values;'),
 ('inherited abilities', M, '...(incoming.values.abilities ?? [])', '...[]'),
 ('inherited keywords', M, '...(incoming.values.keywords ?? [])', '...[]'),
 ('mutation count', M, 'host.mutations = (host.mutations ?? 0) + 1;', 'host.mutations = 1;'),
 ('spell leaves stack', M, 'removeObject(state, spellId);', ''),
 ('commander component', M, 'host.commander = commanders.length > 0;', 'host.commander = false;'),
 ('token copy component', M, 'incoming.physical.token = true;', 'incoming.physical.token = false;'),
 ('top token determines permanent', M, 'host.token = onTop ? spell.token === true || spell.copy === true : host.token === true;', 'host.token = false;'),
 ('separate every physical card', S, 'current.merged.map(({physical}) => {', 'current.merged.slice(0, 1).map(({physical}) => {'),
 ('find every departed component', S, 'state.objects[id]?.departedTogether ?? [id]', '[id]'),
 ('mutate illegal target resolves normally', 'game/engine/rules/stack.mjs', 'entry.mutating !== true);', 'true);'),
 ('spell copy retains mutation', 'game/engine/rules/stack.mjs', 'if (original.mutating) {', 'if (false) {'),
 ('spell copy uses its own owner', 'game/engine/rules/stack.mjs', 'entry.overload.targets[0].owner = controller;', ''),
 ('owned by spell owner', 'game/engine/script/filter.mjs', 'if (Number.isInteger(selector.owner) && object.owner !== selector.owner) return false;', ''),
 ('not a Human', 'game/engine/rules/actions.mjs', 'nonSubtypes: ["Human"], owner: object.owner', 'owner: object.owner'),
 ('total power bound', B, '> spec.totalPowerAtMost)', '> 999)'),
 ('power budget offered', B, 'most: spec.totalPowerAtMost,', 'most: 999,'),
 ('trigger choice enforces power bound', 'game/engine/rules/trigger.mjs', 'if (together) throw new Error(together);', ''),
 ('every commander deals damage', 'game/engine/rules/commander.mjs', 'for (const card of commanders) {', 'for (const card of commanders.slice(0, 1)) {'),
 ('library ordering before next effect', 'game/engine/script/resolution.mjs', 'if (mergedOrderToAsk(state) && resolving.queue[0]?.effect !== "orderMerged")', 'if (false)'),
 ('graveyard card arrivals are separate', 'game/engine/rules/trigger.mjs', 'return objectsAfterMove(state, arrival.becomes).flatMap(id => subjects(state,', 'return objectsAfterMove(state, arrival.becomes).slice(0, 1).flatMap(id => subjects(state,'),
 ('merged transforming components', S, 'if (object?.merged) {', 'if (false) {'),
]
