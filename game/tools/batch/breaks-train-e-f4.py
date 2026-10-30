# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Train E, worker f4: sixteen of Rob's v43 library cards (Growth Curve; Grub, Storied Matriarch // Grub, Notorious Auntie;
Guac & Marshmallow Pizza; Hapatra, the Desert Fang; Hemosymbic Mite; Hungry Graffalon; Hydro-Channeler; Icy Reception;
Interjection; Intrepid Tenderfoot; Jhoira, Weatherlight Corsair; Knockout Maneuver; Koth of the Homestead; Lofty Dreams; Lose
Focus; Lyra, Archangel of Dawn). One break for each engine change they needed -- each guard, each branch -- and the suite that
catches it:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-train-e-f4.py
"""
SUITES = [
    'tests/engine-replicate-first-strike.mjs',
    'tests/engine-vocabulary.mjs',
    'tests/engine-cards.mjs',
    'tests/engine-combat.mjs',
]

TURN = 'game/engine/rules/turn.mjs'
COMBAT = 'game/engine/rules/combat.mjs'
ACTIONS = 'game/engine/rules/actions.mjs'
CARDS = 'game/engine/cards/index.mjs'
AMOUNT = 'game/engine/script/amount.mjs'
SCHEMA = 'game/engine/script/schema.mjs'
RESOURCES = 'game/engine/script/effects/resources.mjs'
ZONES = 'game/engine/script/effects/zones.mjs'
VOCAB = 'game/engine/vocabulary.mjs'
TIMING = 'game/engine/keywords/timing.mjs'

FIRST_STEP = 'firstStrike: (state) => CONDITIONS.attackers(state) && combatNeedsFirstStrike(state),'
STRUCK = '''    if (step === "first") state.combat.struckFirst = state.combat.attacks.flatMap((a) => [a.attacker, ...a.blockers])
      .filter((id) => onBattlefield(state, id) && dealsFirstStrike(state, id));
'''
SECOND = 'return Array.isArray(struck) ? !struck.includes(id) || hasNow(state, id, "Double Strike") : dealsRegular(state, id);'
FOR_EACH = '''    if (forEach !== undefined && !(ability.kind === "triggered" && forEach === "opponent" && (count?.min ?? 0) === 0 && count?.max === 1
      && (Array.isArray(selector.anyOf) ? selector.anyOf : [selector]).every((one) => (one?.what ?? "permanent") === "permanent")))'''
FOUND = 'if (name === "digUntil" && effect.found?.controller !== undefined && !(effect.found.controller === "you" && effect.found.to === "battlefield"))'
REPLICATE_TRIGGER = '''        script: {targets: [], effects: [{effect: "copySpell", spells: "that card", count: action.replicated, newTargets: true}]}});'''

BREAKS = [
    # Interjection: first strike read as the combat damage step begins (CR 510.4; rules/turn.mjs), not as blockers were declared.
    ('first strike: read as the damage step begins', TURN, FIRST_STEP,
     'firstStrike: (state) => CONDITIONS.attackers(state) && (state.combat?.firstStrike ?? false) === true,'),
    # The second step's creatures (CR 510.4; rules/combat.mjs, dealsIn and `struckFirst`).
    ('510.4: the first strikers kept', COMBAT, STRUCK, ''),
    ('510.4: only those still on the battlefield', COMBAT, STRUCK, STRUCK.replace('onBattlefield(state, id) && dealsFirstStrike(state, id)', 'dealsFirstStrike(state, id)')),
    ('510.4: only first and double strikers', COMBAT, STRUCK, STRUCK.replace('onBattlefield(state, id) && dealsFirstStrike(state, id)', 'onBattlefield(state, id)')),
    ('510.4: the second step, those that had neither', COMBAT, SECOND, SECOND.replace('!struck.includes(id) || ', '')),
    ('510.4: the second step, double strikers again', COMBAT, SECOND, SECOND.replace(' || hasNow(state, id, "Double Strike")', '')),
    ('510.4: no first strikers kept, the regular rule', COMBAT, SECOND, SECOND.replace(': dealsRegular(state, id);', ': true;')),
    ('510.4: read in the regular step', COMBAT, '  if (step === "first") return dealsFirstStrike(state, id);\n', '  if (step === "first" || true) return dealsFirstStrike(state, id);\n'),
    ('510.4: open asks who deals now', COMBAT,
     'if (!onBattlefield(state, a.attacker) || !dealsIn(state, a.attacker, step) || power(state, a.attacker) <= 0)',
     'if (!onBattlefield(state, a.attacker) || !dealsIn(state, a.attacker, "first") || power(state, a.attacker) <= 0)'),

    # Lose Focus: replicate (CR 702.56a; cards/index.mjs, rules/actions.mjs).
    ('replicate: compiled', CARDS, 'String(ability.keyword).toLowerCase() === "replicate") {', 'String(ability.keyword).toLowerCase() === "replicatex") {'),
    ('replicate: a mana cost', CARDS,
     '      if (!parsed || !parsed.symbols.length || parsed.variable > 0) problems.push(`${ability.text}: replicate is a mana cost`);\n', ''),
    ('replicate: instants and sorceries', CARDS,
     '      if (!(identity.types ?? []).some((t) => t === "Instant" || t === "Sorcery")) problems.push(`${ability.text}: replicate on a card that is not an instant or sorcery`);\n', ''),
    ('replicate: once', CARDS, '      if (replicate !== null) problems.push(`${ability.text}: a second replicate is not built (CR 702.56b)`);\n', ''),
    ('replicate: on a spell ability', CARDS,
     '  if (replicate !== null && !spell) problems.push("Replicate is on a spell with something to copy: its spell ability");\n  else if',
     '  if (false) problems.push("Replicate is on a spell with something to copy: its spell ability");\n  else if'),
    ('replicate: its additional cost', CARDS,
     '  else if (replicate !== null) spell = {...spell, additionalCost: [...(spell.additionalCost ?? []), {atom: "replicate", cost: replicate}]};',
     '  else if (false) spell = {...spell, additionalCost: [...(spell.additionalCost ?? []), {atom: "replicate", cost: replicate}]};'),
    ('replicate: each number of times its own cast', ACTIONS,
     'Array.from({length: MULTIKICK_MOST + 1}, (_, k) => ({...v, mana: v.mana + (atom.cost ?? "").repeat(k), replicated: k})));',
     'Array.from({length: 1}, (_, k) => ({...v, mana: v.mana + (atom.cost ?? "").repeat(k), replicated: k})));'),
    ('replicate: its mana paid', ACTIONS,
     'Array.from({length: MULTIKICK_MOST + 1}, (_, k) => ({...v, mana: v.mana + (atom.cost ?? "").repeat(k), replicated: k})));',
     'Array.from({length: MULTIKICK_MOST + 1}, (_, k) => ({...v, mana: v.mana, replicated: k})));'),
    ('replicate: the offer says how many times', ACTIONS, '        ...(variant.replicated ? {replicated: variant.replicated} : {}), ...(gift', '        ...(gift'),
    ('replicate: no action claims more copies', ACTIONS, '  && (a.replicated ?? 0) === (b.replicated ?? 0)\n', ''),
    ('replicate: its trigger', ACTIONS, '    if (action.replicated > 0) {\n      (state.pendingTriggers ??= []).push({abilityId: "replicate"',
     '    if (false) {\n      (state.pendingTriggers ??= []).push({abilityId: "replicate"'),
    ('replicate: none when unpaid', ACTIONS, '    if (action.replicated > 0) {\n      (state.pendingTriggers ??= []).push({abilityId: "replicate"',
     '    if (true) {\n      (state.pendingTriggers ??= []).push({abilityId: "replicate"'),
    ('replicate: a copy for each time', ACTIONS, REPLICATE_TRIGGER, REPLICATE_TRIGGER.replace('count: action.replicated', 'count: 1')),
    ('replicate: new targets', ACTIONS, REPLICATE_TRIGGER, REPLICATE_TRIGGER.replace('newTargets: true', 'newTargets: false')),
    ('replicate: declared', VOCAB, '  "replicate",\n', ''),
    ('replicate: built', TIMING, 'cast: Object.freeze(["Storm", "Replicate"]),', 'cast: Object.freeze(["Storm"]),'),

    # Hapatra: "for each opponent ... up to one target creature that player controls" on a triggered ability (script/schema.mjs).
    # Left in the selector, which the selector grammar refuses; still named, so the guard below it runs rather than throws.
    ('forEach: an ability target may say it', SCHEMA,
     'const {totalPowerAtMost, count, distinctFrom, onlyIf, differentControllers, differentManaValues, share, forEach, ownedByControllerOf, ...selector} = spec && typeof spec === "object" ? spec : {};',
     'const {totalPowerAtMost, count, distinctFrom, onlyIf, differentControllers, differentManaValues, share, ownedByControllerOf, ...selector} = spec && typeof spec === "object" ? spec : {}, {forEach} = selector;'),
    ('forEach: a triggered ability\'s', SCHEMA, FOR_EACH, FOR_EACH.replace('ability.kind === "triggered" && ', '')),
    ('forEach: for each opponent', SCHEMA, FOR_EACH, FOR_EACH.replace('forEach === "opponent" && ', '')),
    ('forEach: up to', SCHEMA, FOR_EACH, FOR_EACH.replace('(count?.min ?? 0) === 0 && ', '')),
    ('forEach: one', SCHEMA, FOR_EACH, FOR_EACH.replace('count?.max === 1', 'count?.max >= 1')),
    ('forEach: permanents', SCHEMA, FOR_EACH, FOR_EACH.replace('\n      && (Array.isArray(selector.anyOf) ? selector.anyOf : [selector]).every((one) => (one?.what ?? "permanent") === "permanent")', '')),

    # Hapatra: the greatest mana value among cards (script/amount.mjs).
    ('greatestManaValue: a kind', AMOUNT, '  "greatestManaValue",\n', ''),
    ('greatestManaValue: its selector held to the grammar', AMOUNT, '"planeswalkerTypesAmong", "fewestAmongPlayers", "greatestManaValue"]) {',
     '"planeswalkerTypesAmong", "fewestAmongPlayers"]) {'),
    ('greatestManaValue: counted', AMOUNT, '  } else if ("greatestManaValue" in value) {\n', '  } else if (false) {\n'),
    ('greatestManaValue: none is 0', AMOUNT, 'n = Math.max(0, ...matching(state, value.greatestManaValue, who)', 'n = Math.max(...matching(state, value.greatestManaValue, who)'),
    ('greatestManaValue: the greatest', AMOUNT, 'n = Math.max(0, ...matching(state, value.greatestManaValue, who)', 'n = Math.min(99, ...matching(state, value.greatestManaValue, who)'),

    # Knockout Maneuver: "then it deals damage equal to its power" (effects/resources.mjs, putCounter's `remember`).
    ('putCounter: remembers its creatures', RESOURCES, '  if (params.remember) context.remembered = [...(params.targets ?? [])];\n', ''),

    # Jhoira: a card found, put onto the battlefield under your control (effects/zones.mjs, digUntil; script/schema.mjs).
    ('digUntil: under your control', ZONES, '        ...(params.found?.controller === "you" ? {controller: context.controller} : {})}) : hit;', '}) : hit;'),
    ('schema: found under you only', SCHEMA, FOUND, FOUND.replace('effect.found.controller === "you" && ', '')),
    ('schema: found onto the battlefield only', SCHEMA, FOUND, FOUND.replace(' && effect.found.to === "battlefield"', '')),
]
