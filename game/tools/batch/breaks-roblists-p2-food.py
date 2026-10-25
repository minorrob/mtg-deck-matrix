# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Breaks for Rob's priority lists, lane P2 (Food; the card load of 2026-10-24): one per engine change, each guard and each
branch. Run from the repository root: python -u game/tools/batch/breaks.py game/tools/batch/breaks-roblists-p2-food.py"""

SUITES = ['tests/engine-roblists-food.mjs']

COND = 'game/engine/script/condition.mjs'
STATICS = 'game/engine/rules/statics.mjs'
ACTIONS = 'game/engine/rules/actions.mjs'
ZONES = 'game/engine/script/effects/zones.mjs'
COMBAT = 'game/engine/rules/combat.mjs'
STATE = 'game/engine/state/index.mjs'
TURN = 'game/engine/rules/turn.mjs'
KWCOMBAT = 'game/engine/keywords/combat.mjs'
INDEX = 'game/engine/cards/index.mjs'
REPLACEMENT = 'game/engine/rules/replacement.mjs'
ENTERING = 'game/engine/rules/entering.mjs'
LAYERS = 'game/engine/rules/layers.mjs'
SCHEMA = 'game/engine/script/schema.mjs'
VOCAB = 'game/engine/vocabulary.mjs'

BREAKS = [
    # Frodo: the Ring-bearer and the count of temptations (CR 701.54).
    ('ring-bearer condition', COND, '  if (condition.ringBearer === true && !isRingBearer(state, source, controller)) return false;\n', ''),
    ('ring tempted count', COND, '  if (condition.ringTemptedAtLeast !== undefined && (state.players[controller]?.ring?.count ?? 0) < condition.ringTemptedAtLeast) return false;\n', ''),
    ('ring-bearer problem', COND, '  if ("ringBearer" in condition && condition.ringBearer !== true) problems.push', '  if (false) problems.push'),
    ('ring tempted problem', COND, '  if ("ringTemptedAtLeast" in condition && !(Number.isInteger(condition.ringTemptedAtLeast)', '  if (false && !(Number.isInteger(condition.ringTemptedAtLeast)'),
    # Canonized in Blood: descend (CR 700.11).
    ('descended condition', COND, '  if (condition.descended === true && !((state.players[controller]?.descendedThisTurn ?? 0) > 0)) return false;\n', ''),
    ('descended problem', COND, '  if ("descended" in condition && condition.descended !== true) problems.push', '  if (false) problems.push'),
    ('descend counted', STATE, '    state.players[from.owner].descendedThisTurn = (state.players[from.owner].descendedThisTurn ?? 0) + 1;', '    void 0;'),
    ('descend permanent cards only', STATE, '&& (from.types ?? []).some((type) => PERMANENT_TYPES.includes(type)) &&', '&&'),
    ('descend no token', STATE, 'if (zone === "graveyard" && from.token !== true && (from.types', 'if (zone === "graveyard" && (from.types'),
    ('descend this turn only', TURN, '      if (player.descendedThisTurn) player.descendedThisTurn = 0;\n', ''),
    # Gollum: combat damage this game by a name.
    ('combat damage names kept', COMBAT, '          if (named && !names.includes(named)) names.push(named);\n', ''),
    ('combat damaged by condition', COND, '  if (condition.combatDamagedBy !== undefined && !(state.players[about?.player]?.combatDamagedByNames ?? []).includes(condition.combatDamagedBy.named)) return false;\n', ''),
    ('combat damaged by problem', COND, '  if ("combatDamagedBy" in condition && !(typeof', '  if (false && !(typeof'),
    # Skulk (CR 702.118b).
    ('skulk', KWCOMBAT, '  if (has(state, attackerId, "Skulk") && powerOf(state, blockerId) > powerOf(state, attackerId)) return false;\n', ''),
    ('skulk greater, not equal', KWCOMBAT, 'powerOf(state, blockerId) > powerOf(state, attackerId)) return false;\n', 'powerOf(state, blockerId) >= powerOf(state, attackerId)) return false;\n'),
    ('skulk has behavior', KWCOMBAT, '    "Skulk"]),', '    ]),'),
    ('skulk a keyword', VOCAB, '  "devour", "skulk"];', '  "devour"];'),
    # Sam: activated abilities of Foods cost {1} less (CR 602.2b, 601.2f).
    ('ability reduction read', ACTIONS, '\n  + abilityCostReduction(state, id);', ';'),
    ('ability reduction of what it affects', STATICS, '      if (!matchesSelector({...(ability.affects ?? {}), what: "permanent"}, state, objectId, context)) continue;\n', ''),
    ('ability reduction its rule alone', STATICS, '      if (ability.kind !== "static" || ability.rule !== "abilities-cost-less") continue;\n', '      if (ability.kind !== "static") continue;\n'),
    # Bilbo: that much life plus 1.
    ('life plus', STATICS, '      if (Number.isInteger(ability.plus)) plus += ability.plus;\n', ''),
    ('life plus before twice', STATICS, '  return (amount + plus) * times;', '  return amount * times + plus;'),
    ('life plus schema', SCHEMA, '      if (!(Number.isInteger(ability.plus) && ability.plus >= 1 && ability.times === undefined))', '      if (false)'),
    # Chatterfang: that many Squirrels, and sacrifice X.
    ('that many', STATICS, 'count: ability.thatMany === true ? tokensIn(live(event)) : 1}', 'count: 1}'),
    ('that many schema', SCHEMA, '      if (ability.thatMany !== undefined && ability.thatMany !== true) errors.push', '      if (false) errors.push'),
    ('sacrifice X values', ACTIONS, '  if (sacrificeX) return Array.from', '  if (false) return Array.from'),
    ('sacrifice X counted', ACTIONS, 'atom = printedAtom?.count === "X" ? {...printedAtom, count: sacrificeCount(printedAtom, X)} : printedAtom;', 'atom = printedAtom;'),
    ('sacrifice none', ACTIONS, ': atom?.count === 0 ? [{sacrifice: []}] : atom ?', ': atom ?'),
    ('sacrifice X picked later', ACTIONS, '      const n = sacrificeCount(sacrificeAtom(ability.cost), action.x), able', '      const n = sacrificeAtom(ability.cost)?.count ?? 1, able'),
    ('sacrifice X asked', ACTIONS, '  const n = sacrificeCount(atom, action.x);', '  const n = atom?.count ?? 1;'),
    # Banquet Guests: a reduction left over takes off X's mana (CR 601.2f, 107.3a).
    ('X counted and reduced', ACTIONS, '  if (less > 0 && cost.variable > 0 && Number.isInteger(X) && X > 0) {', '  if (false) {'),
    ('X reduced', ACTIONS, '    counted.generic -= Math.min(counted.generic, less);\n', ''),
    ('X offered higher', ACTIONS, '  const most = Math.floor((poolSize(pool) - rest + less) / cost.variable);', '  const most = Math.floor((poolSize(pool) - rest) / cost.variable);'),
    ('X offer reckoned', ACTIONS, '  const atX = (X) => (reckoned.less > 0 &&', '  const atX = (X) => (false &&'),
    ('X tapped for', ACTIONS, 'generic: Math.max(0, xCounted(cost, X).generic + x - reckoned.less)}, 1, sources)', 'generic: xCounted(cost, X).generic + x}, 1, sources)'),
    ('X convoked', ACTIONS, 'generic: Math.max(0, xCounted(cost, X).generic + x - reckoned.less)}, helpers)', 'generic: xCounted(cost, X).generic + x}, helpers)'),
    ('X convoke paid', ACTIONS, 'action.lifeInstead !== undefined ? "" : null, action.extraMana ?? "", action.targets, action.x);', 'action.lifeInstead !== undefined ? "" : null, action.extraMana ?? "", action.targets);'),
    ('X paid more than one way', ACTIONS, ' action.extraMana ?? "", action.targets, action.x);\n  const {x} = reckoned, cost = anyTypeCost(reckoned.cost, permission);\n  return paymentOptions',
     ' action.extraMana ?? "", action.targets);\n  const {x} = reckoned, cost = anyTypeCost(reckoned.cost, permission);\n  return paymentOptions'),
    ('X tapped for, paid', ACTIONS, 'castCost(state, player, action.objectId, tax, false, null, action.extraMana ?? "", action.targets, action.x));', 'castCost(state, player, action.objectId, tax, false, null, action.extraMana ?? "", action.targets));'),
    ('X paid', ACTIONS, '    const reckoned = castCost(state, player, action.objectId, tax, Boolean(free), lifeCost !== null ? "" : back ? back.mana : fled ? fled.mana : way ? way.mana : manaInstead, action.extraMana ?? "", action.targets, action.x);',
     '    const reckoned = castCost(state, player, action.objectId, tax, Boolean(free), lifeCost !== null ? "" : back ? back.mana : fled ? fled.mana : way ? way.mana : manaInstead, action.extraMana ?? "", action.targets);'),
    # Lobelia: a linked card played free, one only.
    ('may play linked', ZONES, '  const named = params.linked === true ? linkedMoving(state, {}, context) : params.targets ?? [];', '  const named = params.targets ?? [];'),
    ('may play count kept', ZONES, '\n    ...(Number.isInteger(params.count) ? {count: params.count} : {}),\n', '\n'),
    ('may play count read', ACTIONS, '      ...(Number.isInteger(e.count) ? {count: e.count} : {}),\n      /* "Its owner may cast it', '      /* "Its owner may cast it'),
    ('may play linked schema', SCHEMA, '  if (name === "mayPlay" && effect.linked !== undefined && !(effect.linked === true', '  if (false && !(effect.linked === true'),
    ('may play linked count schema', SCHEMA, '  if (name === "mayPlay" && effect.linked === true && effect.count !== undefined', '  if (false && effect.count !== undefined'),
    # Feasting Hobbit: devour (CR 702.82a, 702.82c).
    ('devour compiled', INDEX, '        change: {devour: {amount: ability.amount ?? 1, of: structuredClone(ability.of ?? {types: ["Creature"]})}}});', '        change: {}});'),
    ('devour number', INDEX, '      if (!(Number.isInteger(ability.amount) && ability.amount >= 1)) problems.push(`${ability.text}: devour needs its number, 1 or more`);\n', ''),
    ('devour enters', INDEX, '      if ((identity.types ?? []).some((t) => t === "Instant" || t === "Sorcery")) problems.push(`${ability.text}: devour on a card that never enters the battlefield`);\n', ''),
    ('devour a keyword', VOCAB, '  "devour", "skulk"];', '  "skulk"];'),
    ('devour asked', REPLACEMENT, '  if (ability.change?.devour) next.asks = [...(next.asks ?? []), {devour: structuredClone(ability.change.devour)}];\n', ''),
    ('devour none, nothing asked', ENTERING, '    if (fodder && !fodder.length) { queue.shift(); continue; }\n', ''),
    ('devour not itself', ENTERING, 'const devourable = (state, player, q) => state.zones.battlefield.filter((id) => id !== q.objectId\n',
     'const devourable = (state, player, q) => state.zones.battlefield.filter((id) => true\n'),
    ('devour N each', ENTERING, '"+1/+1", awaiting.devour.amount * eaten, devourer.controller)', '"+1/+1", eaten, devourer.controller)'),
    ('devour sacrifices', ENTERING, '      if (state.objects[id]?.zone === "battlefield" && sacrificeOne(state, id, events) !== null) eaten += 1;', '      eaten += 1;'),
    ('devour what was offered', ENTERING, 'if (!Array.isArray(indices) || picked.length !== indices.length || picked.some((i) => !awaiting.devour.ids[i])) throw new Error("Invalid selection");', ''),
    # Pristine Talisman: the sentence library never covers a permanent's sentence with a spell (CR 113.3a).
    ('no spell on a permanent', 'game/engine/cards/sentences.mjs', '      if (spell && !spells) continue;\n', ''),
    ('a permanent is no spell', 'game/engine/cards/sentences.mjs', '(card?.identity?.types ?? []).some((t) => t === "Instant" || t === "Sorcery");', 'true;'),
    # Agent of the Iron Throne: commander creatures you own.
    ('commander you own', LAYERS, '  if (rule.owner === "you" && state.objects[current.id]?.owner !== sourceController) return false;\n', ''),
]
