# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
# The library load's combat lane (L4, 2026-10-21): one break per engine change. python3 game/tools/batch/breaks.py <this file>
SUITES = ['tests/engine-libload-l4-combat.mjs', 'tests/engine-cards.mjs', 'tests/engine-vocabulary.mjs']

COMBAT = 'game/engine/rules/combat.mjs'
KEYWORDS = 'game/engine/keywords/combat.mjs'
TRIGGER = 'game/engine/rules/trigger.mjs'
ACTIONS = 'game/engine/rules/actions.mjs'
INDEX = 'game/engine/cards/index.mjs'
SCHEMA = 'game/engine/script/schema.mjs'
PILOT = 'game/engine/pilots/house-pilot.mjs'

BREAKS = [
    # Revenge of Ravens: "or a planeswalker you control" beside defender "you"
    ('planeswalkers beside defender you', SCHEMA,
     '["opponent", "you"].includes(ability.trigger.defender)', 'ability.trigger.defender === "opponent"'),
    # Danitha, Spear of Agony: a spell that targets a player
    ('a cast trigger reads a player target', TRIGGER,
     '(selector.what === "player" ? t?.kind === "player" : ', '(selector.what === "player" ? false : '),

    # {Q} (Umbral Mantle)
    ('{Q} built', ACTIONS, 'const COST_ATOMS_BUILT = ["{T}", "{Q}", "mana", "payLife", "sacrifice"];',
     'const COST_ATOMS_BUILT = ["{T}", "mana", "payLife", "sacrifice"];'),
    ('{Q} only when tapped', ACTIONS, 'if (atom.atom === "{Q}" && (!object.tapped || sickForAbilities(state, id))) return null;',
     'if (atom.atom === "{Q}" && (sickForAbilities(state, id))) return null;'),
    ('{Q} waits for summoning sickness', ACTIONS, 'if (atom.atom === "{Q}" && (!object.tapped || sickForAbilities(state, id))) return null;',
     'if (atom.atom === "{Q}" && (!object.tapped)) return null;'),
    ('{Q} untaps', ACTIONS, '      if (atom.atom === "{Q}") {\n        object.tapped = false;\n', '      if (atom.atom === "{Q}") {\n'),

    # Bushido (Hand of Honor)
    ('bushido needs its number', INDEX, "      if (!(Number.isInteger(ability.amount) && ability.amount >= 1)) problems.push(`${ability.text}: bushido needs its number, 1 or more`);\n", ''),
    ('bushido is +N/+N', INDEX, 'effects: [{effect: "pump", targets: "self", power: ability.amount ?? 0, toughness: ability.amount ?? 0}]});\n      keywords.push("Bushido");',
     'effects: [{effect: "pump", targets: "self", power: 1, toughness: 1}]});\n      keywords.push("Bushido");'),
    ('bushido: blocks too', TRIGGER, 'flatMap((b) => [b.card?.cardId, b.blocking?.cardId])', 'flatMap((b) => [b.blocking?.cardId])'),
    ('bushido: becomes blocked once', TRIGGER, 'const named = new Set((fields.blockers ?? []).flatMap', 'const named = ((fields.blockers ?? []).flatMap'),
    ('bushido: this creature only', TRIGGER, 'fits(state, id, {who: condition.who}, sourceId, controller)).map((card) => ({card}))',
     'fits(state, id, {}, sourceId, controller)).map((card) => ({card}))'),
    ('bushido a keyword', 'game/engine/vocabulary.mjs', '  "bushido",\n', ''),

    # Can't be blocked by more than one creature (Safewright Cavalry)
    ('one blocker at most', KEYWORDS, '  if (blockers.length > 1 && ruleChanged(state, "blocked-by-one-at-most", attackerId)) return false;\n', ''),
    ('one blocker at most: the words', KEYWORDS,
     '  if (blockers.length > 1 && ruleChanged(state, "blocked-by-one-at-most", attackerId)) return oneBlockerWords(state, attackerId);\n', ''),
    ('one blocker at most: the record', COMBAT, 'const capped = one.length ? {by: "attackerId"', 'const capped = false ? {by: "attackerId"'),

    # Must be blocked if able (Vinebred Brawler)
    ('requirement in the record', COMBAT, '      ...(capped ? {capped} : {}),\n      ...(requires.length ? {requires} : {}),\n      options,\n      legalBlocks',
     '      ...(capped ? {capped} : {}),\n      options,\n      legalBlocks'),
    ('requirement checked', COMBAT, '      if (met < need.least) {\n', '      if (false) {\n'),
    ('requirement: menace by two', COMBAT, 'const per = (id) => (hasNow(state, id, "Menace") ? 2 : 1);', 'const per = () => 1;'),
    ('requirement: one at most never by two', COMBAT, 'if (n === 1 || !ruleChanged(state, "blocked-by-one-at-most", id)) pick(0, []);', 'pick(0, []);'),
    ('requirement: the most at once', COMBAT, '{ most = Math.max(most, blocked); return; }', '{ most = required.length; return; }'),
    ('requirement: each blocker once', COMBAT, 'walk(k + 1, new Set([...used, ...chosen]), blocked + 1)', 'walk(k + 1, used, blocked + 1)'),
    ('requirement: the per in the record', COMBAT, '...(twice.length ? {per: Object.fromEntries(twice.map((id) => [id, 2]))} : {}), why}]', 'why}]'),
    ('must-be-blocked a rule', 'game/engine/rules/statics.mjs', '  "must-be-blocked": "rules/combat.mjs",\n', ''),
    ('controller: per', 'game/engine/controller.mjs', 'taken.filter((t) => t === value).length >= (need.per?.[value] ?? 1)', 'taken.filter((t) => t === value).length >= 1'),
    ('meetRequirements: per', PILOT, 'const per = (value) => need.per?.[value] ?? 1;', 'const per = () => 1;'),
    ('meetRequirements: one option a blocker', PILOT,
     '    && (choice.exclusiveBy === undefined || !list.some((i) => options[i]?.[choice.exclusiveBy] === option[choice.exclusiveBy]))\n', ''),
    ('meetRequirements: capped by its field', PILOT, 'const cap = (option) => (choice.capped ? option[choice.capped.by ?? "planeswalkerId"] : undefined);', 'const cap = (option) => option.planeswalkerId;'),
    ('house pilot meets it', PILOT,
     '        return {indices: Array.isArray(choice.requires) && choice.requires.length ? meetRequirements(choice, kept) : kept};', '        return {indices: kept};'),
    ('scored pilot meets it', 'game/engine/pilots/scored-pilot.mjs',
     '    return {indices: Array.isArray(choice.requires) && choice.requires.length ? meetRequirements(choice, kept) : kept};', '    return {indices: kept};'),
    ('scenarios block as required', 'game/engine/cards/scenario.mjs',
     'if (kind === "declare-blockers") {\n    const indices = meetRequirements(awaitingChoice(state), []);', 'if (kind === "declare-blockers") {\n    const indices = [];'),

    # Kaalia of the Vast: tapped and attacking that opponent
    ('chooseCard: attacking', 'game/engine/script/effects/asking.mjs', '        ...(params.attacking ? {attacking: params.attacking} : {})}, source: context.source ?? null,',
     '        }, source: context.source ?? null,'),
    ('chooseCard: that player kept', 'game/engine/script/effects/asking.mjs', '        ...(params.attacking && context.about ? {about: structuredClone(context.about)} : {})} : {}),', '        } : {}),'),
    ('chooseCard: that player read', 'game/engine/script/effects/asking.mjs', ', ...(awaiting.about ? {about: awaiting.about} : {})});', '});'),

    # Saddle (Bounding Felidar)
    ('saddled read', 'game/engine/keywords/designations.mjs', 'effect.rule === "saddled" && staticAffects', 'effect.rule === "saddled-not" && staticAffects'),
    ('while saddled asked', 'game/engine/script/condition.mjs', '  if (condition.saddled !== undefined && isSaddled(state, source) !== condition.saddled) return false;\n', ''),
    ('saddled a condition', 'game/engine/script/condition.mjs', '  /* A Mount\'s saddled designation (CR 702.171b). */\n  "saddled",\n', ''),
    ('saddled true or false', 'game/engine/script/condition.mjs', '  if ("saddled" in condition && typeof condition.saddled !== "boolean") problems.push("saddled is true or false");\n', ''),
    ('attack trigger keeps while', INDEX, '    ...(t.while !== undefined ? {while: t.while} : {}),\n', ''),
    ('while on an attack trigger', SCHEMA, '!["spell cast", "attacks"].includes(on)', 'on !== "spell cast"'),
    ('attack trigger asks while', TRIGGER, '    if (condition.while !== undefined && !conditionHolds(state, condition.while, {controller, source: sourceId})) return [];\n', ''),
    ('saddle on a Mount', INDEX, "      if (!(identity.subtypes ?? []).includes(\"Mount\")) problems.push(`${ability.text}: saddle on a card that is not a Mount`);\n", ''),
    ('saddle needs its number', INDEX, "      if (!(Number.isInteger(ability.amount) && ability.amount >= 0)) problems.push(`${ability.text}: saddle needs its number`);\n", ''),
    ('saddle as a sorcery', INDEX, 'cost: [{atom: "crew", power: ability.amount ?? 0, saddle: true}], timing: "sorcery",', 'cost: [{atom: "crew", power: ability.amount ?? 0, saddle: true}],'),
    ('saddle not crewing as though', ACTIONS, 'a.rule === "crews-with-more" && !saddle)', 'a.rule === "crews-with-more")'),
    ('saddle a keyword', 'game/engine/vocabulary.mjs', '  "saddle",\n', ''),
]
