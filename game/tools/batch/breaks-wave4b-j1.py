# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Wave 4b, lane j1: remembered and moved objects, and the rules beside them that the lane's most-played cards needed
(Animate Dead; Urborg, Tomb of Yawgmoth; Akroma's Will; The One Ring; Utopia Sprawl; Bident of Thassa; Rise of the Dark
Realms). One break for each engine change -- each guard, each branch -- and the suite that catches it:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-wave4b-j1.py
"""
SUITES = [
    'tests/engine-wave4b-j1.mjs',
    'tests/engine-compile.mjs',
    'tests/engine-cards.mjs',
]

LAYERS = 'game/engine/rules/layers.mjs'
PROTECTION = 'game/engine/rules/protection.mjs'
SBA = 'game/engine/rules/sba.mjs'
STATICS = 'game/engine/rules/statics.mjs'
TRIGGER = 'game/engine/rules/trigger.mjs'
INDEX = 'game/engine/cards/index.mjs'
PERMANENTS = 'game/engine/script/effects/permanents.mjs'
ZONES = 'game/engine/script/effects/zones.mjs'
SCHEMA = 'game/engine/script/schema.mjs'
CONDITION = 'game/engine/script/condition.mjs'
COMPILE = 'game/engine/cards/compile.mjs'

PROTECTION_OVER = '''  if (card !== null && card !== undefined
    && (state.effects ?? []).some((e) => e.rule === "protection" && (e.affects?.ids ?? []).includes(card) && hasQuality(state, e.from, sourceId))) return true;
'''

BREAKS = [
    # Urborg, Tomb of Yawgmoth: a land given a basic land type has that type's mana ability (CR 305.6).
    ('urborg: the mana ability given with the type', LAYERS, '    if (BASIC_MANA[subtype]) current.granted.push(intrinsicMana(subtype));\n', ''),
    ('urborg: its own color', LAYERS, 'produces: {[BASIC_MANA[subtype]]: 1},', 'produces: {C: 1},'),
    ('urborg: no second ability for a type it has', LAYERS,
     'if (change.addSubtypes) for (const subtype of change.addSubtypes) if (!current.subtypes.includes(subtype)) {',
     'if (change.addSubtypes) for (const subtype of change.addSubtypes) {'),
    ('urborg: abilities read as changed', LAYERS, ' || apply.graveyardAbilities || givesBasicType(apply)));', ' || apply.graveyardAbilities));'),
    # Akroma's Will: protection over the permanents a spell named, and no player's (CR 702.16, 611.2c).
    ('akroma: protection over permanents', PROTECTION, PROTECTION_OVER, ''),
    ('akroma: only the permanents named', PROTECTION, '(e.affects?.ids ?? []).includes(card) && hasQuality(state, e.from, sourceId)', 'hasQuality(state, e.from, sourceId)'),
    ('akroma: from those colors only', PROTECTION, '(e.affects?.ids ?? []).includes(card) && hasQuality(state, e.from, sourceId)', '(e.affects?.ids ?? []).includes(card)'),
    ('akroma: no player protected', PERMANENTS,
     '\n      && !(params.rule === "protection" && (params.targets || params.selector))) ? {players:', ') ? {players:'),
    # The One Ring: "if you cast it".
    ('castByYou: read', CONDITION, '    if ((cast !== undefined && cast.by === controller) !== condition.castByYou) return false;', '    if (false) return false;'),
    ('castByYou: by its controller', CONDITION, '(cast !== undefined && cast.by === controller) !== condition.castByYou', '(cast !== undefined) !== condition.castByYou'),
    ('castByYou: true or false', CONDITION, '  if ("castByYou" in condition && typeof condition.castByYou !== "boolean") problems.push("castByYou is true or false");\n', ''),
    ('castByYou: a condition key', CONDITION, '"castFromYourHand", "castByYou",', '"castFromYourHand",'),
    # Utopia Sprawl: a triggered mana ability of the chosen color (CR 605.1b).
    ('sprawl: compiled a mana ability', INDEX, '(MANA(adds.mana) || adds.produced === true || adds.chosenColor === true)) {', '(MANA(adds.mana) || adds.produced === true)) {'),
    ('sprawl: of the chosen color', INDEX, 'adds.chosenColor === true ? {chosenColor: true} : {mana: {...adds.mana}};', '{mana: {...adds.mana}};'),
    ('sprawl: the color chosen', TRIGGER, 'const chosen = mana.chosenColor === true ? CHOSEN_COLOR_LETTER[holder.chosen] : undefined;',
     'const chosen = mana.chosenColor === true ? "G" : undefined;'),
    ('sprawl: none chosen, none', TRIGGER, 'mana.chosenColor === true ? (chosen ? {[chosen]: 1} : null) : mana.mana;', 'mana.chosenColor === true ? {[chosen]: 1} : mana.mana;'),
    # Bident of Thassa: "creatures your opponents control attack this turn if able" (CR 508.1d, 611.2c).
    ('bident: a requirement for the turn', STATICS,
     '    if (effect.rule === "attacks-each-combat" && effect.combat === undefined && staticAffects(state, effect, id, effect.sourceController)) sources.push(effect.sourceId);\n', ''),
    ('bident: not one combat\'s', STATICS, 'effect.combat === undefined && staticAffects', 'staticAffects'),
    ('bident: named by its source', PERMANENTS,
     '    ...(params.rule === "attacks-each-combat" ? {sourceId: context.source ?? null, sourceName: state.objects[context.source]?.card ?? context.lastKnown?.name ?? null} : {}),\n', ''),
    # Animate Dead: an Aura on a card in a graveyard (CR 303.4a, 704.5m), chosen as it enters uncast (CR 303.4f), its Enchant
    # then that one creature, and "that creature" kept for its leaving.
    ('animate: an Aura on a graveyard card is legal', SBA,
     'const inZone = host && (host.zone === "battlefield" || (object.enchant.what === "card" && host.zone === object.enchant.zone));',
     'const inZone = host && host.zone === "battlefield";'),
    ('animate: and stays attached to it', SBA,
     'const there = host && (host.zone === "battlefield" || (object.enchant?.what === "card" && host.zone === object.enchant.zone));',
     'const there = host && host.zone === "battlefield";'),
    ('animate: enchantOnly read', SBA, 'const legal = object.enchantOnly !== undefined ? ', 'const legal = false ? '),
    ('animate: enchantOnly that one creature', SBA, 'host.id === object.enchantOnly && ', ''),
    ('animate: enchantOnly while a creature', SBA, ' && typesOf(state, host.id).includes("Creature")\n        : inZone', '\n        : inZone'),
    ('animate: attach changes the Enchant', PERMANENTS,
     '  if (params.enchants === true && source && source.zone === "battlefield") source.enchantOnly = host && host.zone === "battlefield" ? hostId : null;\n', ''),
    ('animate: nothing to enchant', PERMANENTS, 'source.enchantOnly = host && host.zone === "battlefield" ? hostId : null;', 'source.enchantOnly = hostId;'),
    ('animate: chosen among cards in the zone', PERMANENTS,
     '  if (enchant?.what === "card" && typeof enchant.zone === "string" && !Array.isArray(enchant.anyOf)) return selectMatching(state, enchant, {controller});\n', ''),
    ('animate: that creature kept', ZONES, '    const entered = became.filter(id => state.objects[id]?.zone === "battlefield");\n', '    const entered = [];\n'),
    ('smoke: an Aura aimed at a graveyard card', COMPILE,
     '\n    || (a?.kind === "keyword" && String(a.keyword).toLowerCase() === "enchant" && JSON.stringify(a.target ?? {}).includes(\'"zone":"graveyard"\')));', ');'),
    ('schema: enchants', SCHEMA, '  if (effect.enchants !== undefined && !(name === "attach" && effect.enchants === true && effect.source === undefined))', '  if (false)'),
    ('schema: enchants, no other source', SCHEMA, '&& effect.enchants === true && effect.source === undefined))', '&& effect.enchants === true))'),
    # Rise of the Dark Realms: all of them under your control (CR 110.2a).
    ('rise: under your control', ZONES, 'const under = params.to === "battlefield" && params.controller === "you" ? context.controller : null;', 'const under = null;'),
    ('schema: moveZoneAll controller', SCHEMA,
     '  if (name === "moveZoneAll" && effect.controller !== undefined && !(effect.controller === "you" && effect.to === "battlefield"))', '  if (false)'),
]
