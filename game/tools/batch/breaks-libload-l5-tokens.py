# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
# The library card load of 2026-10-21, lane L5 (tokens, counters and sacrifice): one break per engine change.
#   python3 game/tools/batch/breaks.py game/tools/batch/breaks-libload-l5-tokens.py
ACTIONS = 'game/engine/rules/actions.mjs'
INDEX = 'game/engine/cards/index.mjs'
ASKING = 'game/engine/script/effects/asking.mjs'
AMOUNT = 'game/engine/script/amount.mjs'
CONDITION = 'game/engine/script/condition.mjs'
TRIGGER = 'game/engine/rules/trigger.mjs'
STATICS = 'game/engine/rules/statics.mjs'
ROOM = 'game/room/room.mjs'
SCENARIO = 'game/engine/cards/scenario.mjs'
VOCABULARY = 'game/engine/vocabulary.mjs'

SUITES = ['tests/engine-libload-l5.mjs', 'tests/engine-cards.mjs', 'tests/engine-prowess-toxic.mjs']

BREAKS = [
    # ---- Plumb the Forbidden: "you may sacrifice one or more creatures" (rules/actions.mjs, sacrificeAnyAtom) ----
    ('sacrifice any: its atom', ACTIONS, 'a?.atom === "sacrifice" && a.count === "any");', 'a?.atom === "sacrifice" && a.count === "none");'),
    ('sacrifice any: never one that cannot be sacrificed', ACTIONS,
     'fits(state, id, {controller: player}) && !cantBeSacrificed(state, id));\n};', 'fits(state, id, {controller: player}));\n};'),
    ('sacrifice any: the caster\'s own', ACTIONS,
     'const fits = compileSelector({...(atom?.selector ?? {}), what: "permanent", controller: "you"});\n  return state.zones.battlefield.filter((id) => fits(state, id, {controller: player}) && !cantBeSacrificed',
     'const fits = compileSelector({...(atom?.selector ?? {}), what: "permanent"});\n  return state.zones.battlefield.filter((id) => fits(state, id, {controller: player}) && !cantBeSacrificed'),
    ('sacrifice any: a cast naming another is refused', ACTIONS,
     'if (!Array.isArray(list) || new Set(list).size !== list.length || !list.every((id) => able.includes(id)))\n    throw new Error(`Those are not permanents',
     'if (false)\n    throw new Error(`Those are not permanents'),
    ('sacrifice any: the question', ACTIONS,
     '  if (action.sacrificeAny === true && !Array.isArray(action.sacrificeChosen)) {\n    const atom',
     '  if (false) {\n    const atom'),
    ('sacrifice any: picked from a range', ACTIONS, '.includes(choice.cost) || choice.cost === "sacrificeAny" ? ', '.includes(choice.cost) ? '),
    ('sacrifice any: the answer kept', ACTIONS, 'choice.cost === "sacrificeAny" ? {sacrificeChosen: ids} : ', ''),
    ('sacrifice any: not an offer per permanent', ACTIONS, 'a !== tapsAny && a !== sacrificesAny && a !== beholds', 'a !== tapsAny && a !== beholds'),
    ('sacrifice any: the offer says so', ACTIONS, '...(sacrificesAny ? {sacrificeAny: true} : {}), ', ''),
    ('sacrifice any: none to sacrifice, nothing asked', ACTIONS,
     '      if (!sacrificeAnyChoices(state, player, sacrificeAnyAtom(state.objects[action.objectId]?.spell?.additionalCost)).length)\n        action',
     '      if (false)\n        action'),
    ('sacrifice any: asked before anything is paid', ACTIONS,
     '    if (action.kind === "cast" && action.sacrificeAny === true && !Array.isArray(action.sacrificeChosen)) {',
     '    if (false) {'),
    ('sacrifice any: picked', ACTIONS, 'const sacrificedAny = action.sacrificeAny === true ? sacrificeAnyPicked(state, player, action) : [];', 'const sacrificedAny = [];'),
    ('sacrifice any: sacrificed', ACTIONS, '    for (const id of sacrificedAny) if (state.objects[id]?.zone === "battlefield") sacrificeOne(state, id, events);\n', ''),
    ('when you do: only when something was sacrificed', ACTIONS, 'if (whenYouDo && sacrificedAny.length) {', 'if (whenYouDo) {'),
    ('when you do: how many', ACTIONS, 'stackId: entry.stackId, sacrificed: sacrificedAny.length},', 'stackId: entry.stackId},'),
    ('sacrificedThisWay: counted', AMOUNT, 'else if ("sacrificedThisWay" in value) n = context.about?.sacrificed ?? 0;', 'else if ("sacrificedThisWay" in value) n = 1;'),
    ('sacrificedThisWay: an amount', AMOUNT, '"tappedThisWay", "sacrificedThisWay", ', '"tappedThisWay", '),
    ('sacrificedThisWay: its problem', AMOUNT, '  if ("sacrificedThisWay" in value && value.sacrificedThisWay !== true) problems.push("sacrificedThisWay is true");\n', ''),
    ('compiler: any number, a selector', INDEX,
     '          if (!fits) problems.push("sacrifice: an additional cost sacrifices', '          if (false) problems.push("sacrifice: an additional cost sacrifices'),
    ('compiler: a selector that is none', INDEX,
     '          try { if (fits) compileSelector({...atom.selector, what: "permanent"}); } catch { fits = false; }\n          if (!fits) problems.push("sacrifice',
     '          try { if (fits) compileSelector({...atom.selector, what: "permanent"}); } catch { fits = true; }\n          if (!fits) problems.push("sacrifice'),
    ('compiler: a reflexive trigger with no targets', INDEX, '!when.effects.length || when.targets !== undefined))', '!when.effects.length))'),
    ('compiler: a reflexive trigger\'s effects built', INDEX,
     '          else if (when !== undefined) for (const inner of effectsIn(when.effects))', '          else if (false) for (const inner of effectsIn(when.effects))'),

    # ---- Wall of Shards: cumulative upkeep, an opponent gains 1 life (cards/index.mjs, effects/asking.mjs) ----
    ('cumulative upkeep: an opponent gains life', INDEX,
     'const gains = cost.length === 1 && cost[0]?.atom === "opponentGainsLife" ? cost[0] : null;', 'const gains = null;'),
    ('cumulative upkeep: 1 life or more', INDEX,
     '        if (!(Number.isInteger(gains.amount) && gains.amount >= 1)) problems.push(', '        if (false) problems.push('),
    ('opponent gains: in words', ASKING, '  if (awaiting.opponentGainsLife) return gainsWords(awaiting.opponentGainsLife);\n', ''),
    ('opponent gains: whom, the options', ASKING,
     '  if (awaiting.gaining) return opponentsOf(state, awaiting.player).map(', '  if (false) return opponentsOf(state, awaiting.player).map('),
    ('opponent gains: once for each age counter', ASKING,
     'times: Math.max(0, amountOf(state, params.opponentGainsLife.times ?? 1, context))}', 'times: 1}'),
    ('opponent gains: the question of whom', ASKING,
     '    if (awaiting.gaining) {\n      const {amount, times} = awaiting.opponentGainsLife;', '    if (false) {\n      const {amount, times} = awaiting.opponentGainsLife;'),
    ('opponent gains: whom, answered', ASKING,
     '    if (awaiting.gaining) {\n      const gainer', '    if (false) {\n      const gainer'),
    ('opponent gains: an answer naming nobody', ASKING,
     '      if (gainer === undefined || (indices ?? []).length !== 1) throw new Error("Invalid selection");\n', ''),
    ('opponent gains: asked again for the next', ASKING,
     '      if (chosen.length < awaiting.opponentGainsLife.times) {', '      if (false) {'),
    ('opponent gains: paying it', ASKING, '    if (option.opponentsGain) {\n', '    if (false) {\n'),
    ('opponent gains: one opponent, no question', ASKING,
     '      if (opponents.length === 1) return unlessPaid(', '      if (false) return unlessPaid('),
    ('opponent gains: the life gained', ASKING,
     '  for (const gainer of new Set(option.gainers ?? [])) events.push(', '  for (const gainer of new Set([])) events.push('),
    ('opponent gains: all of one\'s at once', ASKING,
     'amount: awaiting.opponentGainsLife.amount * option.gainers.filter((id) => id === gainer).length, who: [gainer]}',
     'amount: awaiting.opponentGainsLife.amount, who: [gainer]}'),

    # ---- Acrobatic Cheerleader: "this ability triggers only once" (cards/index.mjs, rules/trigger.mjs) ----
    ('only once: compiled', INDEX, '        ...(ability.onlyOnce === true ? {onlyOnce: true} : {}),\n', ''),
    ('only once: not again', TRIGGER, '          if (ability.onlyOnce && (object.triggeredOnce ?? []).includes(ability.id)) continue;\n', ''),
    ('only once: kept', TRIGGER, '          if (ability.onlyOnce) object.triggeredOnce = [...(object.triggeredOnce ?? []), ability.id];\n', ''),

    # ---- Zimone, All-Questioning: a prime number, and a list of comparisons (script/condition.mjs) ----
    ('prime: asked', CONDITION, '      if (compare.prime === true && !isPrime(n)) return false;\n', ''),
    ('prime: 1 is not', CONDITION, 'Number.isInteger(n) && n >= 2 && Array.from', 'Number.isInteger(n) && n >= 1 && Array.from'),
    ('prime: no divisor', CONDITION, '(_, i) => i + 2).every((d) => n % d !== 0);', '(_, i) => i + 2).every(() => true);'),
    ('comparisons: every one', CONDITION, 'for (const compare of [].concat(condition.compare)) {', 'for (const compare of [].concat(condition.compare).slice(0, 1)) {'),
    ('comparisons: each held to the rules', CONDITION,
     'for (const compare of Array.isArray(condition.compare) && condition.compare.length ? condition.compare : [condition.compare]) {',
     'for (const compare of [condition.compare]) {'),
    ('prime: true, or refused', CONDITION, '      if ("prime" in compare && compare.prime !== true) problems.push(', '      if (false) problems.push('),
    ('prime: no amount', CONDITION, 'for (const key of COMPARE_KEYS.slice(0, -1)) if (key in compare)', 'for (const key of COMPARE_KEYS) if (key in compare)'),

    # ---- Blacksnag Buzzard: plot (cards/index.mjs, rules/actions.mjs, room/room.mjs, cards/scenario.mjs) ----
    ('plot: compiled', INDEX, '    if (word === "plot") {', '    if (word === "plotted") {'),
    ('plot: a mana cost', INDEX, '      if (!parsed || !parsed.symbols.length || parsed.variable > 0) problems.push(`${ability.text}: plot is a mana cost`);\n', ''),
    ('plot: a named rule', STATICS, '  "plot": "rules/actions.mjs",\n', ''),
    ('plot: a keyword', VOCABULARY, '  "plot",\n', ''),
    ('plot: your main phase, the stack empty', ACTIONS,
     '  if (!(player === state.activePlayer && MAIN_PHASES.includes(state.phase) && state.stack.length === 0)) return [];\n  return cardsIn(state, "hand", player).flatMap',
     '  return cardsIn(state, "hand", player).flatMap'),
    ('plot: offered', ACTIONS, 'actions.push(...suspendOffers(state, player), ...plotOffers(state, player));', 'actions.push(...suspendOffers(state, player));'),
    ('plot: a way to pay that is none', ACTIONS,
     '    if (!payment) throw new Error(`${object.card} cannot be plotted', '    if (false) throw new Error(`${object.card} cannot be plotted'),
    ('plot: its mana spent', ACTIONS,
     '    spend(state.players[player].manaPool, payment.mana);\n    if (payment.life > 0) changeLife(state, player, -payment.life, events);\n    const exiled = moveOne(state, action.objectId, "exile", events, {owner: object.owner});\n    if (exiled !== null && state.objects[exiled]?.zone === "exile") {\n      (state.effects',
     '    if (payment.life > 0) changeLife(state, player, -payment.life, events);\n    const exiled = moveOne(state, action.objectId, "exile", events, {owner: object.owner});\n    if (exiled !== null && state.objects[exiled]?.zone === "exile") {\n      (state.effects'),
    ('plot: its life paid', ACTIONS,
     '    if (payment.life > 0) changeLife(state, player, -payment.life, events);\n    const exiled = moveOne(state, action.objectId, "exile", events, {owner: object.owner});\n    if (exiled !== null && state.objects[exiled]?.zone === "exile") {\n      (state.effects',
     '    const exiled = moveOne(state, action.objectId, "exile", events, {owner: object.owner});\n    if (exiled !== null && state.objects[exiled]?.zone === "exile") {\n      (state.effects'),
    ('plot: on a later turn', ACTIONS, 'sorcery: true, until: "ever", afterTurn: state.turn, madeOnTurn', 'sorcery: true, until: "ever", afterTurn: state.turn - 1, madeOnTurn'),
    ('plot: without paying its mana cost', ACTIONS, 'spellsOnly: true, free: true, sorcery: true, until: "ever"', 'spellsOnly: true, sorcery: true, until: "ever"'),
    ('plot: as a sorcery, the permission', ACTIONS, 'spellsOnly: true, free: true, sorcery: true, until', 'spellsOnly: true, free: true, until'),
    ('plot: as a sorcery, carried', ACTIONS, '      ...(e.sorcery === true ? {sorcery: true} : {}),\n', ''),
    ('plot: as a sorcery, the timing', ACTIONS, 'const timely = (!permit?.ability.sorcery && (!sorcerySpeed(object)', 'const timely = ((!sorcerySpeed(object)'),
    ('plot: the room says it', ROOM, '    if (a.kind === "plot") {', '    if (false) {'),
    ('plot: without its reminder', ROOM, r'''const words = (a.text ?? "Plot").replace(/\s*\([^)]*\)\s*$/, "");''', '''const words = a.text ?? "Plot";'''),
    ('plot: and the mana that pays', ROOM, 'parts.push(a.payWith !== undefined ? `${words}, paying ${paymentWords(a.payment)}` : words);', 'parts.push(words);'),
    ('plot: a scenario\'s step', SCENARIO, '      : step.plot ? ["plot", step.plot] : ["activate", step.activate];', '      : ["activate", step.activate];'),
    ('plot: a scenario\'s move', SCENARIO, ' || step.suspend || step.plot) act(step);', ' || step.suspend) act(step);'),
]
