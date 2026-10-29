# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
SUITES = ['tests/engine-zone-action-operations.mjs']
Z = 'game/engine/rules/zone-operation.mjs'
E = 'game/engine/script/effects/zones.mjs'
BREAKS = [
    ('redirect returns actual child result', Z, '  if (frame.stage === "after-redirect") return {status: "done", result: frame.childResult};', ''),
    ('failed entry starts redirected move', Z, 'if (frame.preparedEntering?.to && frame.preparedEntering.to !== "battlefield")', 'if (false)'),
    ('failed entry uses selected destination', Z, 'to: frame.preparedEntering.to, options', 'to: "exile", options'),
    ('action stage does not replay payment', Z, '    if (!frame.stage) {', '    if (true) {'),
    ('sacrifice default controller read', Z, 'kind === "sacrifice-one" && object ? controllerOf(state, frame.id) : object?.owner', 'null'),
    ('payment required zone enforced', Z, 'object?.zone === zone', 'Boolean(object)'),
    ('departed payer refused', Z, '!state.players[player]?.lost', 'true'),
    ('sacrifice controller required', Z, 'controllerOf(state, frame.id) === player && !cantBeSacrificed(state, frame.id)', '!cantBeSacrificed(state, frame.id)'),
    ('sacrifice prohibition enforced', Z, 'controllerOf(state, frame.id) === player && !cantBeSacrificed(state, frame.id)', 'controllerOf(state, frame.id) === player'),
    ('discard requires payer hand', Z, 'state.zones.hand[player]?.includes(frame.id)', 'true'),
    ('refused payment has false result', Z, 'if (!eligible) return {status: "done", result: {moved: null, [field]: false}};', 'if (!eligible) return {status: "done", result: {moved: null, [field]: true}};'),
    ('token classification preserved', Z, 'frame.nontoken = object.token !== true;', 'frame.nontoken = true;'),
    ('action moves through live zone operation', Z, 'id: frame.id, to: "graveyard", options: {owner: object.owner}', 'id: frame.id, to: "exile", options: {owner: object.owner}'),
    ('departed payment result not successful', Z, 'if (moved === null) return {status: "done", result: {moved: null, [field]: false}};', 'if (false) return {status: "done", result: {moved: null, [field]: false}};'),
    ('payment marks exact zone event', Z, 'state.ruleOperation.events[child.zoneEventIndex].data.fields', 'state.ruleOperation.events.at(-1).data.fields'),
    ('action identity marked', Z, '    fields[field] = true;', ''),
    ('sacrificer marked', Z, '      fields.sacrificer = frame.player;', ''),
    ('nontoken sacrifice counted', Z, 'if (frame.nontoken) state.players[frame.player].sacrificedNontokenThisTurn', 'if (false) state.players[frame.player].sacrificedNontokenThisTurn'),
    ('discard counted', Z, '} else recordDiscard(state, frame.player);', '} else void 0;'),
    ('successful action result true', Z, 'result: {moved, [field]: true}', 'result: {moved, [field]: false}'),
    ('entry grant applied', E, 'if ((entering.gainsKeywords ?? []).length)', 'if (false)'),
    ('entry grant timestamp increments', E, 'const timestamp = state.nextTimestamp++;', 'const timestamp = state.nextTimestamp;'),
    ('entry grant targets new object', E, 'id: `entry-keywords:${moved}:${timestamp}`, layer: 6, affects: {ids: [moved]}', 'id: `entry-keywords:${moved}:${timestamp}`, layer: 6, affects: {ids: [id]}'),
    ('entry grant grants selected keywords', E, 'apply: {addKeywords: [...entering.gainsKeywords]}', 'apply: {addKeywords: []}'),
]
