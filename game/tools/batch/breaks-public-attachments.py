# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
SUITES = ['tests/engine-projection.mjs']
BREAKS = [
 ('token status omitted', 'game/engine/projection.mjs', '...(object.token === true ? {token: true} : {})', '{}'),
 ('hidden and stale attachments included', 'game/engine/projection.mjs', '(object.attachments ?? []).filter(id => state.objects[id]?.zone === "battlefield" && state.objects[id].attachedTo === object.id)', '(object.attachments ?? [])'),
 ('attachment claims old host', 'game/engine/projection.mjs', ' && state.objects[id].attachedTo === object.id', ''),
]
