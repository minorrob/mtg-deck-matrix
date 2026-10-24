# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
# The library card load of 2026-10-21, lane L3 (the graveyard): one break per engine change, each guard and each branch.
# python3 game/tools/batch/breaks.py game/tools/batch/breaks-libload-l3-graveyard.py
SUITES = ['tests/engine-libload-graveyard.mjs', 'tests/engine-cards.mjs']

FILTER = 'game/engine/script/filter.mjs'
BIND = 'game/engine/script/bind.mjs'
ZONES = 'game/engine/script/effects/zones.mjs'
ACTIONS = 'game/engine/rules/actions.mjs'
INDEX = 'game/engine/cards/index.mjs'
ASKING = 'game/engine/script/effects/asking.mjs'
SCHEMA = 'game/engine/script/schema.mjs'
CONDITION = 'game/engine/script/condition.mjs'
AMOUNT = 'game/engine/script/amount.mjs'
STATE = 'game/engine/state/index.mjs'
SCENARIO = 'game/engine/cards/scenario.mjs'

BREAKS = [
    # Luminous Broodmoth: "a creature you control without flying dies", read as it last existed (CR 603.10a).
    ('lki: without a keyword', FILTER, '  if (s.nonKeywords && s.nonKeywords.some((word) => (lki.keywords ?? []).includes(word))) return false;\n', ''),
    ('lki: nonKeywords a key it may use', FILTER, 'none of them as it last existed. */\n  "nonKeywords",\n', 'none of them as it last existed. */\n'),

    # Amphin Mutineer: "that creature's controller creates", with no creature -- nobody.
    ('no creature, nobody creates', BIND, '    else if (fact === undefined && key === "controller") bound.controller = -1;\n', ''),

    # Hostage Taker: what exileUntil exiled, remembered; cast with mana of any type (CR 609.4b).
    ('exileUntil remembers', ZONES, '  if (params.remember) context.remembered = exiled;\n', ''),
    ('mayPlay keeps anyMana', ZONES, '    ...(params.anyMana === true ? {anyMana: true} : {}),\n', ''),
    ('the permission carries anyMana', ACTIONS, '      ...(e.anyMana === true ? {anyMana: true} : {}),\n', ''),
    ('anyMana is true', INDEX, '["free", "graveyardToLibraryBottom", "anyMana"]', '["free", "graveyardToLibraryBottom"]'),

    # Innocuous Rat: manifest dread (CR 701.62a), a dig of two, one manifested.
    ('dig manifests', ASKING, '      ...(params.manifest === true ? {faceDown: true, manifest: true} : {}),\n', ''),
    ('manifest dread asks in its words', ASKING, '        : awaiting.manifest ? "Manifest dread: choose 1 to manifest; the other goes into your graveyard"\n', ''),
    ('schema: manifest dread checked', SCHEMA, '  if (name === "dig" && effect.manifest !== undefined && !(', '  if (false && !('),
    ('schema: manifest is true', SCHEMA, 'effect.manifest === true && effect.to === "battlefield"', 'effect.to === "battlefield"'),
    ('schema: onto the battlefield', SCHEMA, '&& effect.to === "battlefield" && (effect.take ?? 1) === 1 && effect.rest === "graveyard"', '&& (effect.take ?? 1) === 1 && effect.rest === "graveyard"'),
    ('schema: one card', SCHEMA, '(effect.take ?? 1) === 1 && effect.rest === "graveyard"', 'effect.rest === "graveyard"'),
    ('schema: the rest into the graveyard', SCHEMA, ' && effect.rest === "graveyard"\n', '\n'),
    ('schema: no may', SCHEMA, '    && effect.upTo === undefined && effect.all === undefined', '    && effect.all === undefined'),
    ('schema: never all', SCHEMA, '&& effect.all === undefined && effect.selector === undefined && effect.reveal === undefined))', '&& effect.selector === undefined && effect.reveal === undefined))'),
    ('schema: from all of them', SCHEMA, '&& effect.selector === undefined && effect.reveal === undefined))', '&& effect.reveal === undefined))'),
    ('schema: not revealed', SCHEMA, ' && effect.reveal === undefined))', '))'),

    # Happily Ever After: three conditions at once, card types among two zones, the starting life total.
    ('allOf: every one holds', CONDITION, '  if (Array.isArray(condition.allOf) && !condition.allOf.every(', '  if (false && !condition.allOf.every('),
    ('allOf: a condition key', CONDITION, '  /* Every one of several conditions (Happily Ever After). */\n  "allOf",\n', ''),
    ('allOf: a list', CONDITION, 'if (!(Array.isArray(condition.allOf) && condition.allOf.length >= 2))', 'if (!(condition.allOf.length >= 2))'),
    ('allOf: two or more', CONDITION, 'condition.allOf.length >= 2', 'condition.allOf.length >= 1'),
    ('allOf: each held to the grammar', CONDITION, '    else condition.allOf.forEach((one, n) => problems.push(...conditionProblems(one).map((p) => `allOf[${n}]: ${p}`)));\n', ''),
    ('cardTypesAmong: a selector counted', AMOUNT, '  else if ("cardTypesAmong" in value)\n    n = new Set(matching(', '  else if (false)\n    n = new Set(matching('),
    ('cardTypesAmong: through the layers', AMOUNT, '(state.objects[id].zone === "battlefield" ? characteristicsOf(state, id).types : state.objects[id].types)', 'state.objects[id].types'),
    ('cardTypesAmong: remembered as before', AMOUNT, 'else if ("cardTypesAmong" in value && value.cardTypesAmong === "remembered") n =', 'else if (false) n ='),
    ('cardTypesAmong: remembered or a selector', AMOUNT, '!(value.cardTypesAmong && typeof value.cardTypesAmong === "object" && !Array.isArray(value.cardTypesAmong))', '!(value.cardTypesAmong && typeof value.cardTypesAmong === "object")'),
    ('cardTypesAmong: its selector held', AMOUNT, '["cardTypesAmong", "count", "greatestPower",', '["count", "greatestPower",'),
    ('cardTypesAmong: remembered is no selector', AMOUNT, '    if (!(key in value) || value[key] === "remembered") continue;', '    if (!(key in value)) continue;'),
    ('startingLife: counted', AMOUNT, '  else if ("startingLife" in value) n = startingLifeOf(state);\n', ''),
    ('startingLife: an amount', AMOUNT, '  /* The library load of 2026-10-21: "your starting life total" (Happily Ever After). */\n  "startingLife",\n', ''),
    ('startingLife: asked as "you"', AMOUNT, 'value.startingLife !== "you") problems.push', 'false) problems.push'),
    ('state: a starting life kept', STATE, '    ...(life !== STARTING_LIFE ? {startingLife: life} : {}),\n', ''),
    ('state: only when not 40', STATE, '...(life !== STARTING_LIFE ? {startingLife: life}', '...(true ? {startingLife: life}'),
    ('state: the starting life read', STATE, 'export const startingLifeOf = (state) => state.startingLife ?? STARTING_LIFE;', 'export const startingLifeOf = (state) => STARTING_LIFE;'),
    ("scenario: a table's starting life", SCENARIO, ', ...(Number.isInteger(scenario.startingLife) ? {startingLife: scenario.startingLife} : {})});', '});'),
]
