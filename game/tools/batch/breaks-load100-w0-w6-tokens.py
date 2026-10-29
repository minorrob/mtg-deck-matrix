# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
# Every departure hook, identity guard and token-face branch must be observed by the focused behavioral suite.
SUITES = ['tests/engine-load100-tokens.mjs']
MEMORY = 'game/engine/rules/spell-memory.mjs'
STACK = 'game/engine/rules/stack.mjs'
ZONES = 'game/engine/script/effects/zones.mjs'
ASKING = 'game/engine/script/effects/asking.mjs'
PERMANENTS = 'game/engine/script/effects/permanents.mjs'

BREAKS = [
    ('only spell memory', MEMORY, 'if (entry?.kind !== "spell") return;', 'if (false) return;'),
    ('memory is of the stack object', MEMORY, 'if (object?.zone !== "stack") return;', 'if (false) return;'),
    ('memory object identity', MEMORY, 'about?.card !== entry.objectId || about.stackId !== entry.stackId', 'about.stackId !== entry.stackId'),
    ('memory stack identity', MEMORY, 'about?.card !== entry.objectId || about.stackId !== entry.stackId', 'about?.card !== entry.objectId'),
    ('pending references remembered', MEMORY, '...(state.pendingTriggers ?? []).map((trigger) => trigger.about)', '...[]'),
    ('stack references remembered', MEMORY, '...state.stack.map((other) => other.about)', '...[]'),
    ('delayed references remembered', MEMORY, '...(state.delayedTriggers ?? []).map((trigger) => trigger.about)', '...[]'),
    ('active resolution remembered', MEMORY, 'state.resolving?.context?.about,', 'null,'),
    ('saved resolution context remembered', MEMORY, '...(state.resolving?.queue ?? []).filter((effect) => effect.effect === "__about").map((effect) => effect.about)', '...[]'),
    ('only saved context entries', MEMORY, '.filter((effect) => effect.effect === "__about")', ''),
    ('entry choices frozen', MEMORY, 'entry: structuredClone(entry)', 'entry: entry'),
    ('copiable characteristics frozen', MEMORY, 'object.faceDown === true && key === "colorIdentity" ? [] : structuredClone(object[key])', 'object.faceDown === true && key === "colorIdentity" ? [] : object[key]'),
    ('copiable fields only', MEMORY, 'COPY_FIELDS.filter((key) => object[key] !== undefined)', 'Object.keys(object)'),
    ('recorded face-down identity hidden', MEMORY, 'object.faceDown === true && key === "colorIdentity" ? [] : structuredClone(object[key])', 'structuredClone(object[key])'),
    ('normal resolution remembers', STACK, '  rememberDepartingSpell(state, entry);\n', ''),
    ('zone departure remembers', ZONES, '    rememberDepartingSpell(state, state.stack[leaving]);\n', ''),
    ('counter departure remembers', ZONES, '    rememberDepartingSpell(state, state.stack[at]);\n', ''),
    ('owner departure remembers', 'game/engine/rules/sba.mjs', '    rememberDepartingSpell(state, entry);\n', ''),
    ('gone reference copied', ASKING, '    const remembered = context.about?.spellLastKnown;', '    const remembered = null;'),
    ('request must name remembered spell', ASKING, '(params.spells ?? []).includes(context.about.card)', 'true'),
    ('recorded object identity checked', ASKING, 'remembered.entry?.objectId === context.about.card && remembered.entry.stackId === context.about.stackId', 'remembered.entry.stackId === context.about.stackId'),
    ('recorded stack identity checked', ASKING, 'remembered.entry?.objectId === context.about.card && remembered.entry.stackId === context.about.stackId', 'remembered.entry?.objectId === context.about.card'),
    ('live and recorded original not duplicated', ASKING, '!originals.some((entry) => entry.stackId === remembered.entry.stackId)', 'true'),
    ('copy uses recorded source', ASKING, 'recordedSource: original.recordedSource ?? null', 'recordedSource: null'),
    ('original reference remains visible', ASKING, 'cardRef(state, original.objectId) ?? original.recordedReference ?? null', 'cardRef(state, original.objectId)'),
    ('live copy source has precedence', STACK, 'live?.zone === "stack" ? live : recordedSource', 'recordedSource ?? live'),
    ('preparation definition copied on spell', STACK, '...(object.preparation ? {preparation: structuredClone(object.preparation)} : {})', ''),
    ('live face-down identity hidden', STACK, 'colorIdentity: object.faceDown === true ? [] : object.colorIdentity,', 'colorIdentity: object.colorIdentity,'),
    ('created copies keep faces', PERMANENTS, '...copiedTokenFaces(original, except),', ''),
    ('ordinary copies not double faced', PERMANENTS, '!original.mdfc || original.merged || original.faceDown === true', 'original.merged || original.faceDown === true'),
    ('merged permanent not double faced', PERMANENTS, '!original.mdfc || original.merged || original.faceDown === true', '!original.mdfc || original.faceDown === true'),
    ('face-down characteristics hide faces', PERMANENTS, '!original.mdfc || original.merged || original.faceDown === true', '!original.mdfc || original.merged'),
    ('existing copy effects apply to both faces', PERMANENTS, 'original.copyEffects?.length ? original : side', 'side'),
    ('copy exceptions affect both faces', PERMANENTS, 'copiable(original.copyEffects?.length ? original : side, except)', 'copiable(original.copyEffects?.length ? original : side)'),
    ('back-face orientation copied', PERMANENTS, '...(original.face === "back" ? {face: "back"} : {})', ''),
]
