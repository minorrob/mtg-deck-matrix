# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Breaks for the card load of Rob's Orzhov deck (2026-10-27): one per engine change, each caught by the load's suite.

    python game/tools/batch/breaks.py game/tools/batch/breaks-deck-load-1027.py
"""
SUITES = ['tests/engine-deck-load-1027.mjs']

FILTER = 'game/engine/script/filter.mjs'
TOKENS = 'game/engine/script/effects/permanents.mjs'
TRIGGER = 'game/engine/rules/trigger.mjs'
ACTIONS = 'game/engine/rules/actions.mjs'
STATICS = 'game/engine/rules/statics.mjs'
INDEX = 'game/engine/cards/index.mjs'
BIND = 'game/engine/script/bind.mjs'
SCHEMA = 'game/engine/script/schema.mjs'

BREAKS = [
    # Vanishing Verse: monocolored is exactly one color.
    ('monocolored: any colors at all', FILTER,
     'if (selector.monocolored === true && colorsOf(state, id).length !== 1) return false;',
     'if (selector.monocolored === true && colorsOf(state, id).length < 0) return false;'),
    ('monocolored: false is refused', FILTER,
     '  if (selector.monocolored !== undefined && selector.monocolored !== true) throw new Error("A selector\'s monocolored is true: exactly one color");\n',
     ''),
    # Kamber, Moonstone Eulogist: the Blood token.
    ('Blood token: costs {2}', TOKENS,
     'text: "{1}, {T}, Discard a card, Sacrifice this artifact: Draw a card.", targets: [],\n      cost: [{atom: "mana", cost: "{1}"}',
     'text: "{1}, {T}, Discard a card, Sacrifice this artifact: Draw a card.", targets: [],\n      cost: [{atom: "mana", cost: "{2}"}'),
    # Tainted Adversary: decayed.
    ('decayed: can block', TOKENS,
     '{id: "decayed-block", kind: "static", rule: "cant-block"',
     '{id: "decayed-block", kind: "static", rule: "cant-attack"'),
    ('decayed: kept past the combat', TOKENS,
     'effects: [{effect: "delayedTrigger", at: "end of combat", text: "Sacrifice it at end of combat."',
     'effects: [{effect: "delayedTrigger", at: "end step", text: "Sacrifice it at end of combat."'),
    # Deep Gnome Terramancer: without being played.
    ('played: the arrival is not asked', TRIGGER,
     '    if (condition.played !== undefined && (fields.played === true) !== condition.played) return false;\n',
     ''),
    ('played: a land play not marked', ACTIONS,
     'arrival.data.fields.played = true;',
     'arrival.data.fields.played = false;'),
    ('played: not carried from the definition', INDEX,
     '      ...(t.played !== undefined ? {played: t.played} : {}),\n',
     ''),
    # Defiler of Faith: pay life, cost {W} less.
    ('life-for-less: any spell', STATICS,
     '      if (!matchesSelector({...(own.affects ?? {}), what: "card", zone: object.zone}, state, cardId, {controller: holder.controller, source: holderId})) continue;\n      found.push',
     '      found.push'),
    ('life-for-less: anyone\'s Defiler', STATICS,
     '    if (holder.controller !== player) continue;\n    for (const own of held(holderId)) {\n      if (own.kind !== "static" || own.rule !== "life-for-less") continue;',
     '    for (const own of held(holderId)) {\n      if (own.kind !== "static" || own.rule !== "life-for-less") continue;'),
    ('life-for-less: the life is not paid', ACTIONS,
     'life: (v.life ?? 0) + grant.life, mana: v.mana + grant.less',
     'life: (v.life ?? 0), mana: v.mana + grant.less'),
    ('life-for-less: no mana comes off', ACTIONS,
     '    if (at >= 0) { cost.symbols.splice(at, 1); cost.colored[color] -= 1; }\n',
     ''),
    ('life-for-less: the rule is unknown', STATICS,
     '  "life-for-less": "rules/actions.mjs",\n',
     ''),
    # Gix: discard X cards.
    ('discard X: no X announced', ACTIONS,
     '  if (discardX) return Array.from({length: cardsIn(state, "hand", player).filter((c) => c !== id).length + 1}, (_, n) => n);\n',
     ''),
    ('discard X: one card whatever X is', ACTIONS,
     'const toss = tossPrinted?.count === "X" ? {...tossPrinted, count: X ?? 0} : tossPrinted;',
     'const toss = tossPrinted?.count === "X" ? {...tossPrinted, count: 1} : tossPrinted;'),
    ('discard X: X of 0 discards a card each way', ACTIONS,
     '  if (count === 0) return [[]];\n',
     ''),
    # Agadeem's Awakening: each with a different mana value.
    ('different mana values: no cap', BIND,
     'most: Object.fromEntries(values.map((v) => [v, 1])),',
     'most: Object.fromEntries(values.map((v) => [v, 99])),'),
    ('different mana values: no mana value on the option', BIND,
     '...(spec.differentManaValues === true && c.kind === "object" ? {manaValue: manaValueOfObject(state, c.id)} : {}), label:',
     'label:'),
    ('different mana values: words', BIND,
     '(spec.differentManaValues === true ? ", each with a different mana value" : ", each controlled by a different player")',
     '(spec.differentManaValues === true ? "" : ", each controlled by a different player")'),
    ('different mana values: on a target with no count', SCHEMA,
     'if (differentManaValues !== undefined && !(differentManaValues === true && count !== undefined))',
     'if (differentManaValues !== undefined && !(differentManaValues === true))'),
]
