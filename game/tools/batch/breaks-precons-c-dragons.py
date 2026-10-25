# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The precon card load (2026-10-25), lane C (Reign of Dragons): one break for each engine change.

- Discover's "cast it ... or put it into your hand" (Hit the Mother Lode; CR 701.57a): `play`'s `otherwise` and `rememberCast`,
  script/effects/asking.mjs, held to the grammar in script/schema.mjs.
- Behold as an effect (Sarkhan, Dragon Ascendant; CR 701.4a): chooseCard's `behold`, script/effects/asking.mjs.
- "For each of those cards that are still exiled" (Dragonhawk, Fate's Tempest): an amount's `still`, script/amount.mjs and
  script/bind.mjs.
- "Each other opponent" (Parapet Thrasher): script/bind.mjs.
- "You don't lose unspent red mana as steps and phases end" (Leyline Tyrant; CR 500.4): rules/turn.mjs, rules/restricted-mana.mjs,
  rules/statics.mjs.
- Dethrone (CR 702.105a) and "if it's attacking the player with the most life or tied for most life" (Scourge of the Throne):
  cards/index.mjs, rules/trigger.mjs, script/condition.mjs, vocabulary.mjs.
- Pack tactics (Minion of the Mighty): rules/combat.mjs, script/condition.mjs.
- Read ahead (CR 702.155a; The Elder Dragon War): cards/index.mjs, rules/replacement.mjs, rules/entering.mjs, rules/trigger.mjs,
  vocabulary.mjs.

Run from the repository root, with nothing else editing the worktree:

    python -u game/tools/batch/breaks.py game/tools/batch/breaks-precons-c-dragons.py
"""
SUITES = ['tests/engine-precons-c.mjs']
AS = 'game/engine/script/effects/asking.mjs'
SC = 'game/engine/script/schema.mjs'
AM = 'game/engine/script/amount.mjs'
BI = 'game/engine/script/bind.mjs'
TU = 'game/engine/rules/turn.mjs'
RM = 'game/engine/rules/restricted-mana.mjs'
ST = 'game/engine/rules/statics.mjs'
CO = 'game/engine/script/condition.mjs'
CB = 'game/engine/rules/combat.mjs'
IX = 'game/engine/cards/index.mjs'
TR = 'game/engine/rules/trigger.mjs'
RP = 'game/engine/rules/replacement.mjs'
EN = 'game/engine/rules/entering.mjs'
VO = 'game/engine/vocabulary.mjs'
BREAKS = [
    # Hit the Mother Lode: discover's two ways
    ('nothing castable: nothing otherwise', AS,
     '    if (!choices.length) return otherwise.otherwise ? {events: [], splice: otherwise.otherwise} : false;\n',
     '    if (!choices.length) return false;\n'),
    ('declined: nothing otherwise', AS,
     'if (index === awaiting.choices.length) return awaiting.otherwise ? {events: [], splice: structuredClone(awaiting.otherwise)} : {events: []};',
     'if (index === awaiting.choices.length) return {events: []};'),
    ('otherwise never kept for the question', AS, '      ...otherwise, ...(params.rememberCast === true', '      ...(params.rememberCast === true'),
    ('the spell cast not remembered', AS, '    if (awaiting.rememberCast && !awaiting.again) {', '    if (false) {'),
    ('the spell cast remembered as nothing', AS, '      return {events, remembered: cast ? [cast.objectId] : []};', '      return {events, remembered: []};'),
    ('otherwise of any shape', SC,
     'if (name === "play" && effect.otherwise !== undefined && !(Array.isArray(effect.otherwise) && effect.otherwise.length))',
     'if (false)'),
    ('otherwise unchecked', SC,
     '  if (name === "play" && Array.isArray(effect.otherwise)) effect.otherwise.forEach((child, index) => checkEffect(child, `${path}.otherwise[${index}]`, errors));\n', ''),
    ('rememberCast of any value', SC,
     'if (name === "play" && effect.rememberCast !== undefined && !(effect.rememberCast === true && effect.anyNumber !== true))', 'if (false)'),
    # Sarkhan, Dragon Ascendant: behold
    ('behold offers nothing from the hand', AS, '      .concat(beholding ? cardsIn(state, "hand", player)', '      .concat(false ? cardsIn(state, "hand", player)'),
    ('behold reads a hand card as a permanent', AS, ': beholding ? [beheldFits] : matchers)', ': matchers)'),
    ('behold reveals nothing', AS,
     'if (awaiting.reveal || (awaiting.behold && state.objects[id]?.zone === "hand")) events.push(',
     'if (awaiting.reveal) events.push('),
    ('behold labels no reveal', AS,
     '        if (awaiting.behold && object?.zone === "hand") return {...option, label: `${option.label} (reveal it from your hand)`};\n', ''),
    ('behold not kept for the question', AS, '      ...(beholding ? {behold: true} : {}),\n', ''),
    # Dragonhawk: still exiled
    ('still counted as the delayed trigger is made', BI, '    if (bound[key].still === true) bound[key] = {...bound[key], still: [...(context.remembered ?? [])]};\n    else bound[key]',
     '    bound[key]'),
    ('still reads nothing', AM, '(Array.isArray(value.still) ? value.still.filter((id) => state.objects[id]) : context.remembered ?? [])',
     '(context.remembered ?? [])'),
    ('still counts the gone', AM, 'value.still.filter((id) => state.objects[id])', 'value.still'),
    ('still not a key of the grammar', AM, 'const AMOUNT_EXTRAS = ["still", "counter",', 'const AMOUNT_EXTRAS = ["counter",'),
    ('still of any value', AM,
     '  if ("still" in value && !(value.still === true && "rememberedCount" in value)) problems.push(', '  if (false) problems.push('),
    # Parapet Thrasher: each other opponent
    ('each other opponent is nobody', BI,
     '    return (state?.players ?? []).map((p) => p.id).filter((id) => id !== context.controller && id !== context.about?.player);',
     '    return [];'),
    ('each other opponent includes that opponent', BI, 'id !== context.controller && id !== context.about?.player', 'id !== context.controller'),
    # Leyline Tyrant: red mana kept
    ('red mana lost', TU, '    if (redKept) kept.R = player.manaPool.R ?? 0;\n', ''),
    ('restricted red lost', TU, '    emptyRestricted(player, redKept ? ["R"] : []);', '    emptyRestricted(player);'),
    ('every kind of restricted mana kept', RM, '  const kept = (list) => list.filter((entry) => keep.includes(entry.key));', '  const kept = (list) => list;'),
    ('keeps-red-mana no rule', ST, '  "keeps-red-mana": "rules/turn.mjs",\n', ''),
    # Scourge of the Throne: dethrone and the most life
    ('ties are not the most', CO, '&& state.players.every((p) => p.lost || p.life <= state.players[player].life);',
     '&& state.players.every((p) => p.lost || p.id === player || p.life < state.players[player].life);'),
    ('a player who left still counted', CO, '&& state.players.every((p) => p.lost || p.life <= state.players[player].life);',
     '&& state.players.every((p) => p.life <= state.players[player].life);'),
    ('one who left can be the most', CO, 'export const hasMostLife = (state, player) => Boolean(state.players[player]) && !state.players[player].lost',
     'export const hasMostLife = (state, player) => Boolean(state.players[player])'),
    ('attackingMostLife always holds', CO, '    if (!attack || !hasMostLife(state, attack.defender)) return false;\n', ''),
    ('attackingMostLife counts a planeswalker attacked', CO,
     'const attack = (state.combat?.attacks ?? []).find((a) => a.attacker === source && a.planeswalker === undefined);',
     'const attack = (state.combat?.attacks ?? []).find((a) => a.attacker === source);'),
    ('attackingMostLife of any value', CO,
     '  if ("attackingMostLife" in condition && condition.attackingMostLife !== true) problems.push(', '  if (false) problems.push('),
    ('attackingMostLife not a key', CO, '  "attackingMostLife", "attackedWithPowerAtLeast"];', '  "attackedWithPowerAtLeast"];'),
    ('dethrone reads no life', TR,
     '      .filter((a) => condition.defenderMostLife !== true || (a.defender?.playerId !== undefined && !a.defender.planeswalker && hasMostLife(state, a.defender.playerId)));',
     '      ;'),
    ('dethrone counts a planeswalker attacked', TR, '!a.defender.planeswalker && hasMostLife(state, a.defender.playerId)', 'hasMostLife(state, a.defender.playerId)'),
    ('dethrone not passed to the trigger', IX, '    ...(t.defenderMostLife === true ? {defenderMostLife: true} : {}),\n', ''),
    ('dethrone puts no counter', IX, 'effects: [{effect: "putCounter", targets: "self", counter: "+1/+1", count: 1}]});\n      keywords.push("Dethrone");',
     'effects: []});\n      keywords.push("Dethrone");'),
    ('dethrone not a keyword', VO, '  "dethrone", "read ahead",\n', '  "read ahead",\n'),
    # Minion of the Mighty: pack tactics
    ('no power recorded as attackers are declared', CB,
     '  state.combat.declaredPower = state.combat.attacks.reduce((sum, attack) => sum + powerOf(state, attack.attacker), 0);\n', ''),
    ('pack tactics always holds', CO, '    && !(state.combat?.attackingPlayerId === controller && (state.combat.declaredPower ?? 0) >= condition.attackedWithPowerAtLeast)) return false;',
     '    && false) return false;'),
    ('pack tactics of any value', CO,
     '  if ("attackedWithPowerAtLeast" in condition && !(Number.isInteger(condition.attackedWithPowerAtLeast) && condition.attackedWithPowerAtLeast >= 1))',
     '  if (false)'),
    # The Elder Dragon War: read ahead
    ('read ahead not a keyword', VO, '  "dethrone", "read ahead",\n', '  "dethrone",\n'),
    ('read ahead on any card', IX,
     '      if (!(identity.subtypes ?? []).includes("Saga")) problems.push(`${ability.text}: read ahead on a card that is not a Saga`);\n', ''),
    ('read ahead offers one chapter', IX,
     'abilities.push({id, kind: "replacement", text: ability.text, watches: {event: "enters", who: "self"}, change: {readAhead: final}});',
     'abilities.push({id, kind: "replacement", text: ability.text, watches: {event: "enters", who: "self"}, change: {readAhead: 1}});'),
    ('read ahead never asked', RP,
     '  if (Number.isInteger(ability.change?.readAhead) && ability.change.readAhead >= 1) next.asks = [...(next.asks ?? []), {readAhead: ability.change.readAhead}];', ''),
    ('read ahead arrival not held', EN, '((q.copyOf || q.discardInstead) || q.readAhead)', '((q.copyOf || q.discardInstead))'),
    ('read ahead asked as a life payment', EN,
     '    if (q.readAhead) { state.awaiting = {kind: "entering-choice", player: object.controller, objectId: q.objectId, readAhead: q.readAhead}; return true; }\n', ''),
    ('read ahead lore counters not put', EN,
     '    saga.counters.lore = was + enteringCountersPlaced(state, awaiting.objectId, "lore", option.readAhead, saga.controller);',
     '    saga.counters.lore = was;'),
    ('read ahead chosen not kept', EN, '    saga.readAhead = option.readAhead;\n', ''),
    ('skipped chapters trigger', TR,
     '  if (Number.isInteger(condition.chapter) && (state.objects[sourceId]?.readAhead ?? 0) > condition.chapter) return false;\n', ''),
]
