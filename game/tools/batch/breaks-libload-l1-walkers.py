# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The library load's L1 (2026-10-21): planeswalkers, loyalty and two-faced cards -- what the lane's cards needed of the
engine: emblems (CR 114), loyalty abilities twice each turn (Oath of Teferi), opponents held to sorcery time and sorceries
cast as though they had flash until your next turn (Teferi, Time Raveler; CR 307.5), a loyalty cost an effect adds to (Carth
the Lion; CR 606.4-606.6), two mana of different colors (Interplanar Beacon), a hand and library exchanged (Mordenkainen;
CR 701.12d), "prevent all but 1" and "prevent 1" (CR 615.10) and a replacement's condition (Ajani Steadfast's emblem,
Hedron-Field Purists), a target player's life total (Vraska, Relic Seeker), what a delayed trigger's own effects remember
(Teferi, Hero of Dominaria), a static that works everywhere but the battlefield and a process repeated again (Grist, the
Hunger Tide; CR 113.6c). One break for each guard and each branch, and the suite that catches it:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-libload-l1-walkers.py
"""
SUITES = [
    'tests/engine-libload-l1.mjs',
    'tests/engine-cards.mjs',
]

ACTIONS = 'game/engine/rules/actions.mjs'
STATICS = 'game/engine/rules/statics.mjs'
TRIGGER = 'game/engine/rules/trigger.mjs'
REPLACEMENT = 'game/engine/rules/replacement.mjs'
LAYERS = 'game/engine/rules/layers.mjs'
PERMANENTS = 'game/engine/script/effects/permanents.mjs'
EFFECTS = 'game/engine/script/effects/index.mjs'
ZONES = 'game/engine/script/effects/zones.mjs'
SCHEMA = 'game/engine/script/schema.mjs'
BIND = 'game/engine/script/bind.mjs'
AMOUNT = 'game/engine/script/amount.mjs'
CARDS = 'game/engine/cards/index.mjs'
STATE = 'game/engine/state/index.mjs'
PROJECTION = 'game/engine/projection.mjs'
RESOURCES = 'game/engine/script/effects/resources.mjs'
DEFINITIONS = 'game/tools/engine-definitions.mjs'

BREAKS = [
    # ---- emblems (CR 114): made, compiled, and functioning from the command zone ----
    ('emblem: made in the command zone', PERMANENTS,
     '  const id = addObject(state, {card: named ? `${named} emblem` : "Emblem", emblem: true, owner: player, controller: player,\n',
     '  return [];\n  const id = addObject(state, {card: named ? `${named} emblem` : "Emblem", emblem: true, owner: player, controller: player,\n'),
    ('emblem: the object says it is one', STATE,
     '    ...(object.emblem === true ? {emblem: true} : {}),\n', ''),
    ('emblem: its abilities compiled', CARDS,
     '      if (definition) effect.abilities = definition.abilities;\n', ''),
    ('emblem: an empty list refused', CARDS,
     "      if (!Array.isArray(list) || !list.length) { problems.push(`${text}: an emblem's abilities are a list, with at least one`); continue; }\n",
     '      if (!Array.isArray(list)) continue;\n'),
    ("emblem: only what works from the command zone", CARDS,
     '''      for (const ability of list) if (!(["triggered", "replacement"].includes(ability?.kind) || (ability?.kind === "static" && typeof ability.rule === "string" && ability.affects?.what === "player")\n        || (ability?.kind === "static" && ability.rule === undefined && Number.isInteger(ability.layer))))''',
     '''      for (const ability of list) if (false)'''),
    ("emblem: its abilities' targets are its own", BIND,
     '    if (value.effect === "emblem") return;\n', ''),
    ('emblem: its triggered abilities trigger', TRIGGER,
     '  const emblems = (state.zones.command ?? []).flat().filter((id) => state.objects[id]?.emblem === true);\n',
     '  const emblems = [];\n'),
    ('emblem: a commander in the command zone is none', TRIGGER,
     '  const emblems = (state.zones.command ?? []).flat().filter((id) => state.objects[id]?.emblem === true);\n',
     '  const emblems = (state.zones.command ?? []).flat();\n'),
    ('emblem: its replacement effects apply', REPLACEMENT,
     '    for (const ability of holder.abilities ?? []) if (applies(state, ability, holder, proposal)) found.push({holderId: id, ability});\n',
     ''),
    ("emblem: a commander's replacement effect is not one", REPLACEMENT,
     '    const holder = state.objects[id];\n    if (holder?.emblem !== true) continue;\n    for (const ability of holder.abilities ?? []) if (applies(',
     '    const holder = state.objects[id];\n    for (const ability of holder.abilities ?? []) if (applies('),
    ('emblem: the rules it changes for players', STATICS,
     '      if (compileSelector(ability.affects)(state, player, {controller: holder.controller, source: id})) return true;\n',
     ''),
    ("emblem: a commander's player rule is not one", STATICS,
     '    const holder = state.objects[id];\n    if (holder?.emblem !== true) continue;\n    for (const ability of holder.abilities ?? []) {\n      if (ability.kind !== "static" || ability.rule !== rule',
     '    const holder = state.objects[id];\n    for (const ability of holder.abilities ?? []) {\n      if (ability.kind !== "static" || ability.rule !== rule'),
    ('emblem: shown as one', PROJECTION,
     '''    ...(object.emblem === true ? {emblem: true, text: object.emblemOracleText ?? (object.abilities ?? []).map((a) => a.text).filter(Boolean).join("\\n")} : {}),\n''', ''),
    # ---- "prevent all but 1" (Ajani Steadfast's emblem), "to you or a planeswalker you control" ----
    ('damage watched: any one of these', REPLACEMENT,
     '  if (Array.isArray(watches.anyOf)) {\n    const {anyOf, ...rest} = watches;', '  if (false) {\n    const {anyOf, ...rest} = watches;'),
    ('prevent all but N: applied', REPLACEMENT,
     '    if (Number.isInteger(ability.change.preventAllBut) && next.amount > ability.change.preventAllBut) next.amount = ability.change.preventAllBut;\n', ''),
    ('prevent all but N: weighed for the order', REPLACEMENT,
     '  if (Number.isInteger(change.preventAllBut)) return Math.min(amount, change.preventAllBut);\n', ''),
    ('prevent all but N: the schema', SCHEMA,
     '    if (ability.change?.preventAllBut !== undefined && !(Number.isInteger(ability.change.preventAllBut) && ability.change.preventAllBut >= 1))',
     '    if (false)'),
    # ---- "prevent 1 of that damage" (CR 615.10) and a replacement's condition (Hedron-Field Purists) ----
    ('prevent N: applied', REPLACEMENT,
     '    if (Number.isInteger(ability.change.prevent)) next.amount = Math.max(0, next.amount - ability.change.prevent);\n', ''),
    ('prevent N: weighed for the order', REPLACEMENT,
     '  if (Number.isInteger(change.prevent)) return Math.max(0, amount - change.prevent);\n', ''),
    ('prevent N: the schema', SCHEMA,
     '    if (ability.change?.prevent !== undefined && !(ability.change.prevent === true || (Number.isInteger(ability.change.prevent) && ability.change.prevent >= 1)))',
     '    if (false)'),
    ("a replacement's condition", REPLACEMENT,
     '  if (ability.condition !== undefined && holder && !conditionHolds(state, ability.condition, {controller: holder.controller, source: holder.id})) return false;\n', ''),
    # ---- loyalty abilities twice each turn (Oath of Teferi; CR 606.3) ----
    ('loyalty twice: a second time', ACTIONS,
     '''usesThisTurn(state, id, "loyalty") >= (ruleChanged(state, "loyalty-twice", id) ? 2 : 1)) continue;''',
     '''usesThisTurn(state, id, "loyalty") >= 1) continue;'''),
    ('loyalty twice: never a third', ACTIONS,
     '''usesThisTurn(state, id, "loyalty") >= (ruleChanged(state, "loyalty-twice", id) ? 2 : 1)) continue;''',
     '''usesThisTurn(state, id, "loyalty") >= (ruleChanged(state, "loyalty-twice", id) ? 3 : 1)) continue;'''),
    # ---- opponents held to sorcery time (Teferi, Time Raveler; CR 307.5) ----
    ('sorcery time only: refused outside it', STATICS,
     '  if (sorceryTimeOnly(state, player) !== null && !sorceryTimeFor(state, player)) return true;\n', ''),
    ('sorcery time: their own turn', STATICS,
     'const sorceryTimeFor = (state, player) => player === state.activePlayer && ["MAIN1", "MAIN2"].includes(state.phase) && state.stack.length === 0;',
     'const sorceryTimeFor = (state, player) => ["MAIN1", "MAIN2"].includes(state.phase) && state.stack.length === 0;'),
    ('sorcery time: a main phase', STATICS,
     'const sorceryTimeFor = (state, player) => player === state.activePlayer && ["MAIN1", "MAIN2"].includes(state.phase) && state.stack.length === 0;',
     'const sorceryTimeFor = (state, player) => player === state.activePlayer && state.stack.length === 0;'),
    ('sorcery time: the stack empty', STATICS,
     'const sorceryTimeFor = (state, player) => player === state.activePlayer && ["MAIN1", "MAIN2"].includes(state.phase) && state.stack.length === 0;',
     'const sorceryTimeFor = (state, player) => player === state.activePlayer && ["MAIN1", "MAIN2"].includes(state.phase);'),
    ("sorcery time only: the players it names", STATICS,
     '''      if (ability.kind !== "static" || ability.rule !== "cast-as-sorcery") continue;\n      const context = {controller: holder.controller, source: holderId};\n      if (!compileSelector({what: "player", ...(ability.affects ?? {})})(state, player, context)) continue;\n      return holder.card;''',
     '''      if (ability.kind !== "static" || ability.rule !== "cast-as-sorcery") continue;\n      return holder.card;'''),
    ('sorcery time only: its words', ACTIONS,
     '    if (holder !== null) return `${holder} lets you cast spells only in your own main phase, with nothing on the stack.`;\n', ''),
    ('sorcery time only: the registry', STATICS,
     '  "cast-as-sorcery": "rules/statics.mjs",\n', ''),
    # ---- sorceries as though they had flash until your next turn (Teferi, Time Raveler's +1) ----
    ('flash until your next turn: read', STATICS,
     '''  if ((state.effects ?? []).some((effect) => effect.rule === "cast-as-though-flash" && (effect.players ?? []).includes(player)''',
     '''  if (false && (state.effects ?? []).some((effect) => effect.rule === "cast-as-though-flash" && (effect.players ?? []).includes(player)'''),
    ('flash until your next turn: which spells', STATICS,
     '''    && (effect.spells === true || (effect.spells && typeof effect.spells === "object" && matchesSelector({...effect.spells, what: "card", zone: object.zone}, state, id, {controller: player})))))''',
     '''    && (effect.spells === true || Boolean(effect.spells)))'''),
    ('flash until your next turn: the players it is for', PERMANENTS,
     '''    ...(params.rule === "cast-as-though-flash" ? {players: Array.isArray(params.who) ? [...params.who] : [context.controller],''',
     '''    ...(params.rule === "cast-as-though-flash" ? {players: [],'''),
    # ---- a loyalty cost an effect adds to (Carth the Lion; CR 606.4-606.6) ----
    ('loyalty cost: what Carth adds', ACTIONS,
     '  const total = (ability.loyalty === "-X" ? -x : ability.loyalty) + more;\n', '  const total = (ability.loyalty === "-X" ? -x : ability.loyalty);\n'),
    ('loyalty cost: paid as its total', ACTIONS,
     '    for (const atom of costOf(state, player, ability, action.x ?? 0)) {\n', '    for (const atom of ability.cost ?? []) {\n'),
    ('loyalty cost: offered at its total', ACTIONS,
     '    const plain = costPayment(state, player, id, costOf(state, player, ability, X ?? 0), X ?? 0, abilityLess(state, player, id, ability, aim));\n',
     '    const plain = costPayment(state, player, id, ability.cost, X ?? 0, abilityLess(state, player, id, ability, aim));\n'),
    ('loyalty cost: -X past its loyalty', ACTIONS,
     '(state.objects[id]?.counters?.loyalty ?? 0) + loyaltyCostIncrease(state, player) + 1}, (_, n) => n);',
     '(state.objects[id]?.counters?.loyalty ?? 0) + 1}, (_, n) => n);'),
    ("loyalty cost: its activator's", STATICS,
     '''      if (ability.kind !== "static" || ability.rule !== "loyalty-costs-more") continue;\n      const context = {controller: holder.controller, source: holderId};\n      if (!compileSelector({what: "player", ...(ability.affects ?? {})})(state, player, context)) continue;\n''',
     '''      if (ability.kind !== "static" || ability.rule !== "loyalty-costs-more") continue;\n      const context = {controller: holder.controller, source: holderId};\n'''),
    ('loyalty cost: the registry', STATICS,
     '  "loyalty-costs-more": "rules/actions.mjs",\n', ''),
    ('loyalty twice: the registry', STATICS,
     '  "loyalty-twice": "rules/actions.mjs",\n', ''),
    # ---- the Wandering Emperor's condition, read ----
    ('loyalty at instant speed: its condition read', CARDS,
     '  "loyalty-at-instant-speed",\n  /* An activation forbidden', '  /* An activation forbidden'),
    # ---- two mana of different colors (Interplanar Beacon) ----
    ('different colors: compiled', CARDS,
     '        ...(first.distinct === true ? {distinct: true} : {})}', '        }'),
    ('different colors: no color twice', ACTIONS,
     '    .filter((m) => ability.distinct !== true || Object.values(m).every((n) => n <= 1));', '    ;'),
    # ---- a hand and library exchanged (Mordenkainen; CR 701.12d) ----
    ('exchange: the other zone taken first', ZONES,
     '  const exchanged = params.exchange === true ? [...(state.zones[params.to]?.[context.controller] ?? [])] : [];\n',
     '  const exchanged = [];\n'),
    ('exchange: the schema', SCHEMA,
     '  if (name === "moveZoneAll" && effect.exchange !== undefined && !(effect.exchange === true && effect.selector?.controller === "you"',
     '  if (false && effect.exchange !== undefined && !(effect.exchange === true && effect.selector?.controller === "you"'),
    # ---- a target player's life total (Vraska, Relic Seeker) ----
    ("life total: a target player's", AMOUNT,
     '    const player = playerOf(value.lifeTotal, context) ?? targetPlayer(value.lifeTotal, context);\n',
     '    const player = playerOf(value.lifeTotal, context);\n'),
    # ---- what a delayed trigger's own effects remember (Teferi, Hero of Dominaria) ----
    ("delayed trigger: what it remembers itself", BIND,
     '    if (own && effect.targets === "remembered") kept.targets = "remembered";\n', ''),
    # ---- a static everywhere but the battlefield (Grist, the Hunger Tide; CR 113.6c) ----
    ('away: applied off the battlefield', LAYERS,
     '  const away = awayEffects(state, id);\n', '  const away = [];\n'),
    ('away: in its own zone', LAYERS,
     '    .map((ability) => ({...ability, affects: {...ability.affects, zone: object.zone}, sourceId: id,',
     '    .map((ability) => ({...ability, sourceId: id,'),
    ('away: never on the battlefield', LAYERS,
     '  if (object.zone === "battlefield") return [];\n  return (object.abilities ?? []).filter((ability) => ability.kind === "static" && ability.worksFrom === "elsewhere")',
     '  return (object.abilities ?? []).filter((ability) => ability.kind === "static" && ability.worksFrom === "elsewhere")'),
    ('away: nothing on the battlefield', LAYERS,
     '      if (ability.worksFrom === "graveyard" || ability.worksFrom === "elsewhere") continue;\n',
     '      if (ability.worksFrom === "graveyard") continue;\n'),
    ('away: about itself, compiled', CARDS,
     '''    if (ability.kind === "static" && ability.worksFrom === "elsewhere" && !(ability.affects?.self === true && Object.keys(ability.affects).length === 1 && !ability.rule && !ability.condition))''',
     '''    if (false)'''),
    # ---- a process repeated again (Grist, the Hunger Tide) ----
    ('again: repeated', EFFECTS,
     '      if (!conditionHolds(state, params.again, {controller: context.controller, source: context.source ?? null, remembered: context.remembered, targets: context.targets})) break;\n',
     '      break;\n'),
    ('again: until it fails', EFFECTS,
     '      if (!conditionHolds(state, params.again, {controller: context.controller, source: context.source ?? null, remembered: context.remembered, targets: context.targets})) break;\n',
     ''),
    ('again: compiled', CARDS,
     '        if (effect.again !== undefined ? effect.each !== undefined || !effect.again || typeof effect.again !== "object" : !REPEAT_EACH.includes(effect.each))',
     '        if (effect.again === undefined && !REPEAT_EACH.includes(effect.each))'),
    ('again: its condition, the schema', SCHEMA,
     '  if (name === "repeatFor" && effect.again !== undefined) for (const message of conditionProblems(effect.again))',
     '  if (false) for (const message of conditionProblems(effect.again))'),
    # ---- what the state keeps of a damage order's question, saved as JSON (game/engine/storage.mjs, lostIn) ----
    ("damage order: no undefined toCard kept", RESOURCES,
     '        ...(hit.toCard !== undefined ? {toCard: hit.toCard} : {}), amount, sourceId: source, combat: false},\n',
     '        toCard: hit.toCard, amount, sourceId: source, combat: false},\n'),
    # ---- a card's words that read as Node's own, escaped in the generated module (tests/engine-storage.mjs) ----
    ('definitions: "process." escaped', DEFINITIONS,
     '.replace(/\\bprocess\\./g, "process\\\\u002e")},`;',
     '},`;'),
]
