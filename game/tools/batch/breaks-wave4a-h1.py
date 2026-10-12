# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Wave 4a, lane h1: "you may play / cast that card" from another zone (Forge's MayPlay) -- seventeen of the most-played
Commander cards (Conduit of Worlds; Gravecrawler; Muldrotha, the Gravetide; Augur of Autumn; Exploration Broodship; Chainer,
Nightmare Adept; Elven Chorus; Case of the Locked Hothouse; One with the Multiverse; Eladamri, Korvecdal; Rivaz of the Claw;
Tinybones, Bauble Burglar; Demon of Fate's Design; The Indomitable; Szarel, Genesis Shepherd; Gwenom, Remorseless; Evendo
Brushrazer). One break for each engine change they needed -- each guard, each branch -- and the suite that catches it:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-wave4a-h1.py
"""
SUITES = [
    'tests/engine-play-from-zones.mjs',
    'tests/engine-play-from.mjs',
    'tests/engine-may-play.mjs',
    'tests/engine-cards.mjs',
]

ACTIONS = 'game/engine/rules/actions.mjs'
STACK = 'game/engine/rules/stack.mjs'
STATICS = 'game/engine/rules/statics.mjs'
TURN = 'game/engine/rules/turn.mjs'
PROJECTION = 'game/engine/projection.mjs'
INDEX = 'game/engine/cards/index.mjs'
SCENARIO = 'game/engine/cards/scenario.mjs'
AMOUNT = 'game/engine/script/amount.mjs'
CONDITION = 'game/engine/script/condition.mjs'
SCHEMA = 'game/engine/script/schema.mjs'
ATTRIBUTES = 'game/engine/script/effects/attributes.mjs'
PERMANENTS = 'game/engine/script/effects/permanents.mjs'
ZONES = 'game/engine/script/effects/zones.mjs'

OPEN_TYPES = 'const openTypes = (state, ability, source, id, kind) => (kind === "land" ? ["Land"] : PERMANENT_SPELL_TYPES'
TYPES = 'const PERMANENT_SPELL_TYPES = ["Artifact", "Battle", "Creature", "Enchantment", "Planeswalker"];'
ZONE_FORM = 'zone: e.from, spells: e.spells ?? true, lands: !e.spellsOnly,'
SPENT_LIMIT = '  if (permission.ability.limit !== undefined) recordUse(state, permission.source, playKey(permission.ability));\n  if (permission.ability.perType'
SPENT_TYPE = '  if (permission.ability.perType === true) recordUse(state, permission.source, typeKey(permission.ability, kind === "land" ? "Land" : asType));\n'
SPENT_COUNT = '  if (effect && (effect.count -= 1) <= 0) state.effects = state.effects.filter((e) => e !== effect);\n'
ANY_GATE = 'const anyTypeCost = (cost, permission) => (permission?.ability.anyMana !== true ? cost'
ANY_KINDS = 'const ANY_TYPE_PAYS = ["colored", "hybrid", "monohybrid"];'
FREE_LIFE_TERMS = '  const lifeCost = way ? null : free ? freeLife(object, free) : lifeInstead(object, permission);'
FREE_LIFE = 'const freeLife = (object, free) => (free?.payLife === "manaValue" ?'
PAID_LIFE = '  const paidLife = freely ? freeLife(object, free) : lifeCost;'
UNLIMITED = 'const unlimited = (ability) => ability.limit === undefined && ability.perType !== true && ability.count === undefined;'
DOES = '  ability.additionalCost ?? null, ability.anyMana === true]);'
TYPE_WAYS = '  return permission?.ability.perType === true ? openTypes(state, permission.ability, permission.source, id, "spell") : [null];'
SELF_FROM = '      && conditionHolds(state, a.condition, {controller: player, source: id})) && !found.includes(id)) found.push(id);'
OWN_EXTRA = ' && !(permission?.ability.additionalCost && !(object.spell?.additionalCost ?? []).length))'
LAND_DROPS = '.filter(({ability, source}) => conditionHolds(state, ability.condition, {controller: player, source})).length'
MAY_PLAY_FROM = '  if (params.from !== undefined) {\n    const player = context.controller;'
MAY_PLAY_UNIQUE = '    do { id = `may-play:${params.from}:${serial++}`; } while (effects.some(e => e.id === id));'
MAY_PLAY_NAME = 'player, name: state.objects[context.source]?.card ?? context.lastKnown?.name ?? "Effect",\n      from: params.from,'
MAY_PLAY_UNTIL = '...(Number.isInteger(params.count) ? {count: params.count} : {}),\n      until: params.until ?? "end-of-turn", madeOnTurn: state.turn, sourceController: player});'
EXILE_COUNTERS = '  if (destination === "exile" && counters && state.objects[moved])\n'
SACRIFICED = '  if (object.token !== true && state.players[sacrificer]) state.players[sacrificer].sacrificedNontokenThisTurn = (state.players[sacrificer].sacrificedNontokenThisTurn ?? 0) + 1;'
CAST_HAND = '    if ((cast?.zone === "hand" && cast.by === controller) !== condition.castFromYourHand) return false;'
FOLLOWS = '      if (to === "battlefield" && effect.layer !== undefined && Array.isArray(effect.affects?.ids) && effect.affects.ids.includes(entry.objectId))\n'
FOLLOWED = '        effect.affects = {...effect.affects, ids: effect.affects.ids.map((id) => (id === entry.objectId ? arrived : id))};\n'
CANT_CAST_OK = '    if (!(typeof params.named === "string" || params.allSpells === true) || !Array.isArray(who) || !who.length) return [];'
CANT_CAST_ALL = 'spells: params.allSpells === true ? {} : {named: params.named},'
LOOK_PLAYERS = '"damage-doubled", "look-at-top"].includes(params.rule)'
LOOK_EFFECT = '  if ((state.effects ?? []).some((e) => e.rule === "look-at-top" && (e.players ?? []).includes(owner))) looked = true;\n'
LOOK_CONDITION = '      if (ability.rule === "look-at-top" && conditionHolds(state, ability.condition, {controller: owner, source: id})) looked = true;'
READS = '  "play-from", "cast-self-from",\n'
WITH_COUNTERS = '["battlefield", "exile"].includes(effect.to) && effect.withCounters'
MAY_PLAY_ZONES = 'if (!["graveyard", "library-top"].includes(effect.from)) errors.push'
NAMES_NONE = '    if (effect.targets !== undefined || effect.zone !== undefined || effect.onlyIf !== undefined)\n'
FROM_ONLY = '["spells", "payLife", "count"].some((key) => effect[key] !== undefined)'
CANT_CAST_SCHEMA = '((effect.named === undefined) === (effect.allSpells !== true) || effect.who === undefined\n    || (effect.allSpells !== undefined && effect.allSpells !== true)))'
TRUE_KEYS = '["free", "graveyardToLibraryBottom", "perType", "anyMana"]'
EXTRA_SHAPE = 'Array.isArray(ability.additionalCost) && ability.additionalCost.length && ability.additionalCost.every((a) => a?.atom === "sacrifice" && a.count === undefined)'

BREAKS = [
    # "During each of your turns, you may play a land and cast a permanent spell of each permanent type from your graveyard"
    # (Muldrotha, the Gravetide): a permission kept by type.
    ('per type: a type used is closed', ACTIONS, '  .filter((type) => usesThisTurn(state, source, typeKey(ability, type)) < 1);',
     '  .filter((type) => usesThisTurn(state, source, typeKey(ability, type)) < 9);'),
    ('per type: a land is a land', ACTIONS, OPEN_TYPES, OPEN_TYPES.replace('["Land"]', '["Artifact"]')),
    ('per type: permanent types only', ACTIONS, TYPES, TYPES.replace('"Planeswalker"]', '"Planeswalker", "Sorcery"]')),
    ('per type: none open, not permitted', ACTIONS, '    && (ability.perType !== true || openTypes(state, ability, source, id, kind).length > 0);',
     '    && (ability.perType !== true || openTypes(state, ability, source, id, kind).length >= 0);'),
    ('per type: each type its own offer', ACTIONS, TYPE_WAYS, '  return [null];'),
    ('per type: the type in the offer', ACTIONS, '...viaOf(state, via), ...(asType ? {asType} : {}), ...(paidLife', '...viaOf(state, via), ...(paidLife'),
    ('per type: in the castable entry', ACTIONS, '.map((asType) => ({id, from: state.objects[id].zone, via, ...(asType ? {asType} : {})})))),',
     '.map((asType) => ({id, from: state.objects[id].zone, via})))),'),
    ('per type: a forged type refused', ACTIONS, '  && (a.asType ?? null) === (b.asType ?? null)\n', ''),

    # What a card played through a permission uses up (spendPermission).
    ('spent: a limit', ACTIONS, SPENT_LIMIT, '  if (permission.ability.perType'),
    ('spent: a type', ACTIONS, SPENT_TYPE, ''),
    ('spent: a land as a land', ACTIONS, SPENT_TYPE, SPENT_TYPE.replace('kind === "land" ? "Land" : asType', 'asType')),
    ('spent: so many cards', ACTIONS, SPENT_COUNT, ''),
    ('spent: only once they are all played', ACTIONS, SPENT_COUNT, SPENT_COUNT.replace('<= 0', '< 0')),
    ('spent: a land played', ACTIONS, '    spendPermission(state, permission, "land");\n', ''),
    ('spent: a spell cast', ACTIONS, '    spendPermission(state, permission, "spell", action.asType);\n', ''),
    ('unlimited first: a type kept', ACTIONS, UNLIMITED, UNLIMITED.replace(' && ability.perType !== true', '')),
    ('unlimited first: a count kept', ACTIONS, UNLIMITED, UNLIMITED.replace(' && ability.count === undefined', '')),
    ('which permission: an additional cost', ACTIONS, DOES, '  ability.anyMana === true]);'),
    ('which permission: mana of any type', ACTIONS, DOES, '  ability.additionalCost ?? null]);'),

    # A permission an effect gives for a zone's cards (Chainer, Nightmare Adept; Gwenom, Remorseless).
    ('zone permission: read as a zone', ACTIONS, '    ability: e.from !== undefined ? {id: e.id, zone: e.from,', '    ability: e.from === "never" ? {id: e.id, zone: e.from,'),
    ('zone permission: its spells', ACTIONS, ZONE_FORM, 'zone: e.from, spells: true, lands: !e.spellsOnly,'),
    ('zone permission: spells only', ACTIONS, ZONE_FORM, 'zone: e.from, spells: e.spells ?? true, lands: true,'),
    ('zone permission: its life', ACTIONS, '...(e.payLife ? {payLife: e.payLife} : {}),\n      ...(Number.isInteger(e.count)', '\n      ...(Number.isInteger(e.count)'),
    ('zone permission: its count', ACTIONS, '      ...(Number.isInteger(e.count) ? {count: e.count} : {})}\n', '      }\n'),
    ('mayPlay from a zone', ZONES, MAY_PLAY_FROM, MAY_PLAY_FROM.replace('!== undefined', '=== "never"')),
    ('mayPlay from a zone: a name of its own', ZONES, MAY_PLAY_UNIQUE, '    id = `may-play:${params.from}:${serial++}`;'),
    ('mayPlay from a zone: named for its source', ZONES, MAY_PLAY_NAME, 'player, name: "Effect",\n      from: params.from,'),
    ('mayPlay from a zone: its spells', ZONES, 'spells: structuredClone(params.spells ?? true),', 'spells: true,'),
    ('mayPlay from a zone: spells only', ZONES, '...(params.spellsOnly === true ? {spellsOnly: true} : {}),\n      ...(params.payLife', '\n      ...(params.payLife'),
    ('mayPlay from a zone: its life', ZONES, '      ...(params.payLife ? {payLife: params.payLife} : {}), ...(Number.isInteger(params.count)', '      ...(Number.isInteger(params.count)'),
    ('mayPlay from a zone: its count', ZONES, MAY_PLAY_UNTIL, MAY_PLAY_UNTIL.replace('...(Number.isInteger(params.count) ? {count: params.count} : {}),', '')),
    ('mayPlay from a zone: this turn', ZONES, MAY_PLAY_UNTIL, MAY_PLAY_UNTIL.replace('params.until ?? "end-of-turn"', '"ever"')),
    ('mayPlay from a zone: made this turn', ZONES, MAY_PLAY_UNTIL, MAY_PLAY_UNTIL.replace(' madeOnTurn: state.turn,', '')),

    # "Mana of any type can be spent to cast those spells" (Tinybones, Bauble Burglar; CR 118.14).
    ('any type: only through such a permission', ACTIONS, ANY_GATE, 'const anyTypeCost = (cost, permission) => (false ? cost'),
    ('any type: a colored symbol', ACTIONS, ANY_KINDS, 'const ANY_TYPE_PAYS = ["hybrid", "monohybrid"];'),
    ('any type: a hybrid symbol', ACTIONS, ANY_KINDS, 'const ANY_TYPE_PAYS = ["colored", "monohybrid"];'),
    ('any type: a {2/R} symbol', ACTIONS, ANY_KINDS, 'const ANY_TYPE_PAYS = ["colored", "hybrid"];'),
    ('any type: not a Phyrexian symbol', ACTIONS, ANY_KINDS, 'const ANY_TYPE_PAYS = ["colored", "hybrid", "monohybrid", "phyrexian"];'),
    ('any type: offered', ACTIONS, '  const {x} = reckoned, cost = anyTypeCost(reckoned.cost, permit);', '  const {x} = reckoned, cost = reckoned.cost;'),
    ('any type: which way asked', ACTIONS, '  const {x} = reckoned, cost = anyTypeCost(reckoned.cost, permission);\n  return paymentOptions',
     '  const {x} = reckoned, cost = reckoned.cost;\n  return paymentOptions'),
    ('any type: paid', ACTIONS, '    const {x} = reckoned, cost = anyTypeCost(reckoned.cost, permission);\n', '    const {x} = reckoned, cost = reckoned.cost;\n'),

    # "By sacrificing a land in addition to paying its other costs" (Exploration Broodship).
    ("permission's cost: asked", ACTIONS, ', ...(back?.extra ?? []), ...(permit?.ability.additionalCost ?? [])])) {', ', ...(back?.extra ?? [])])) {'),
    ("permission's cost: not the spell's own", ACTIONS, OWN_EXTRA, ')'),
    ('station: the land drop at 3+', ACTIONS, LAND_DROPS, '.length'),

    # "Pay life equal to its mana value rather than pay its mana cost" (Demon of Fate's Design).
    ('life for mana: as cast', ACTIONS, FREE_LIFE_TERMS, FREE_LIFE_TERMS.replace('free ? freeLife(object, free)', 'free ? null')),
    ("life for mana: only the Demon's free cast", ACTIONS, FREE_LIFE, 'const freeLife = (object, free) => (free ?'),
    ('life for mana: offered for it', ACTIONS, PAID_LIFE, '  const paidLife = lifeCost;'),
    ('life for mana: within his life', ACTIONS, '  if (paidLife !== null && paidLife > state.players[player].life) continue;\n', ''),
    ('life for mana: the free cast says so', STATICS, '...(ability.payLife ? {payLife: ability.payLife} : {})};', '};'),

    # "You may cast this card from your graveyard as long as you control a Zombie" (Gravecrawler).
    ("cast from its own zone: its condition", ACTIONS, SELF_FROM, '      && true) && !found.includes(id)) found.push(id);'),
    # A land of another player's, played (Tinybones): under its player's control.
    ("a land played is its player's", ACTIONS, '    const arrived = moveOne(state, action.objectId, "battlefield", events, {controller: player});',
     '    const arrived = moveOne(state, action.objectId, "battlefield", events);'),
    # "The sacrificed enchantment's mana value" (Demon of Fate's Design).
    ('sacrificed: its mana value kept', ACTIONS, '{...was, manaValue: cost ? manaValue(parseManaCost(cost)) : 0}', '{...was, manaValue: 0}'),
    ('sacrificed: its mana value read', AMOUNT, '  else if (value.manaValueOf === "sacrificed") n = (context.sacrificed ?? [])[0]?.manaValue ?? 0;\n', ''),

    # "Exile it ... with a stash counter on it" (Tinybones).
    ('exiled with counters', ZONES, EXILE_COUNTERS, '  if (false)\n'),
    ('exiled with counters: allowed', INDEX, WITH_COUNTERS, '["battlefield"].includes(effect.to) && effect.withCounters'),
    ('exiled with counters: nowhere else', INDEX, WITH_COUNTERS, '["battlefield", "exile", "graveyard"].includes(effect.to) && effect.withCounters'),

    # "As long as you've sacrificed a nontoken permanent this turn" (Evendo Brushrazer).
    ('sacrificed: a token is none', ZONES, SACRIFICED, SACRIFICED.replace('object.token !== true && ', '')),
    ('sacrificed: counted', ZONES, SACRIFICED, SACRIFICED.replace('(state.players[sacrificer].sacrificedNontokenThisTurn ?? 0) + 1', '0')),
    ('sacrificed: cleared each turn', TURN, '      if (player.sacrificedNontokenThisTurn) player.sacrificedNontokenThisTurn = 0;\n', ''),
    ('sacrificed: the condition', CONDITION, '  if (condition.sacrificedNontokenThisTurn === true && !((state.players[controller]?.sacrificedNontokenThisTurn ?? 0) > 0)) return false;\n', ''),

    # "If you didn't cast it from your hand" (Chainer, Nightmare Adept).
    ('cast from: kept on the permanent', STACK, '    if (to === "battlefield" && entry.cast?.from !== undefined) state.objects[arrived].castFrom = {zone: entry.cast.from, by: entry.playerId};\n', ''),
    ('cast from your hand: yours', CONDITION, CAST_HAND, CAST_HAND.replace(' && cast.by === controller', '')),
    ('cast from your hand: your hand', CONDITION, CAST_HAND, CAST_HAND.replace('cast?.zone === "hand" && ', '')),

    # CR 400.7a: an effect that changed the spell goes on applying to the permanent (Rivaz of the Claw).
    ('CR 400.7a: followed', STACK, FOLLOWED, '        ;\n'),
    ('CR 400.7a: characteristics only', STACK, FOLLOWS, FOLLOWS.replace(' && effect.layer !== undefined', '')),

    # A Case (CR 719): solved.
    ('solved: given', ATTRIBUTES, '      object.solved = true;\n', ''),
    ('solved: once', ATTRIBUTES, '      if (object.solved === true) continue;\n      object.solved = true;', '      object.solved = true;'),
    ('solved: the condition', CONDITION, '  if (condition.solved !== undefined && ((source !== null && state.objects[source]?.solved === true) !== condition.solved)) return false;\n', ''),
    ('solved: shown', PROJECTION, '    ...(object.solved === true ? {solved: true} : {}),\n', ''),
    ('look at the top: its condition', PROJECTION, LOOK_CONDITION, '      if (ability.rule === "look-at-top") looked = true;'),

    # "Until end of turn, you may look at the top card of your library any time" (Gwenom): an effect's.
    ('look at the top: by an effect', PROJECTION, LOOK_EFFECT, ''),
    ('look at the top: its player', PERMANENTS, LOOK_PLAYERS, '"damage-doubled"].includes(params.rule)'),

    # "You can't cast additional spells this turn" (Conduit of Worlds).
    ("can't cast: every spell", PERMANENTS, CANT_CAST_ALL, 'spells: {named: params.named},'),
    ("can't cast: allowed", PERMANENTS, CANT_CAST_OK, CANT_CAST_OK.replace(' || params.allSpells === true', '')),
    ("can't cast: you", PERMANENTS, '    const who = params.who === "you" ? [context.controller] : params.who;', '    const who = params.who;'),

    # Rule statics that read their condition now.
    ('condition read: play-from', INDEX, READS, '  "cast-self-from",\n'),
    ('condition read: cast-self-from', INDEX, READS, '  "play-from",\n'),
    ('condition read: extra-land-drop', INDEX, '  "extra-land-drop",\n', ''),
    ('condition read: look-at-top', INDEX, '  "look-at-top"];', '  ];'),
    ('condition keys: castFromYourHand', CONDITION, '  "castFromYourHand", "castByYou",', '  "castByYou",'),
    ('condition keys: solved', CONDITION, '  "solved", "sacrificedNontokenThisTurn"];', '  "sacrificedNontokenThisTurn"];'),
    ('condition keys: sacrificedNontokenThisTurn', CONDITION, '  "solved", "sacrificedNontokenThisTurn"];', '  "solved"];'),
    ('condition problem: castFromYourHand', CONDITION, '  if ("castFromYourHand" in condition && typeof condition.castFromYourHand !== "boolean") problems.push("castFromYourHand is true or false");\n', ''),
    ('condition problem: solved', CONDITION, '  if ("solved" in condition && typeof condition.solved !== "boolean") problems.push("solved is true or false");\n', ''),
    ('condition problem: sacrificedNontokenThisTurn', CONDITION, '  if ("sacrificedNontokenThisTurn" in condition && condition.sacrificedNontokenThisTurn !== true) problems.push("sacrificedNontokenThisTurn is true");\n', ''),

    # The schema.
    ('schema: mayPlay from where', SCHEMA, MAY_PLAY_ZONES, 'if (false) errors.push'),
    ('schema: mayPlay from, no targets', SCHEMA, NAMES_NONE, NAMES_NONE.replace('effect.targets !== undefined || ', '')),
    ('schema: mayPlay from, no zone', SCHEMA, NAMES_NONE, NAMES_NONE.replace(' || effect.zone !== undefined', '')),
    ('schema: mayPlay from, no onlyIf', SCHEMA, NAMES_NONE, NAMES_NONE.replace(' || effect.onlyIf !== undefined', '')),
    ('schema: mayPlay spells a selector', SCHEMA, '    if (effect.spells !== undefined && effect.spells !== true) checkSelector(effect.spells, `${path}.spells`, errors, {choice: true});\n', ''),
    ('schema: mayPlay life its mana value', SCHEMA, '    if (effect.payLife !== undefined && effect.payLife !== "manaValue") errors.push({path: `${path}.payLife`', '    if (false) errors.push({path: `${path}.payLife`'),
    ('schema: mayPlay count', SCHEMA, '    if (effect.count !== undefined && !(Number.isInteger(effect.count) && effect.count >= 1)) errors.push', '    if (false) errors.push'),
    ('schema: spells only from a zone', SCHEMA, FROM_ONLY, FROM_ONLY.replace('"spells", ', '')),
    ('schema: life only from a zone', SCHEMA, FROM_ONLY, FROM_ONLY.replace('"payLife", ', '')),
    ('schema: count only from a zone', SCHEMA, FROM_ONLY, FROM_ONLY.replace(', "count"', '')),
    ("schema: can't cast every spell", SCHEMA, CANT_CAST_SCHEMA, '((effect.named === undefined) || effect.who === undefined\n    || (effect.allSpells !== undefined && effect.allSpells !== true)))'),
    ("schema: can't cast allSpells true", SCHEMA, CANT_CAST_SCHEMA, '((effect.named === undefined) === (effect.allSpells !== true) || effect.who === undefined))'),
    ('schema: solved', SCHEMA, '!["monstrous", "prepared", "solved"].includes(effect.attribute)', '!["monstrous", "prepared"].includes(effect.attribute)'),
    ('schema: solved never taken', SCHEMA, '  if (name === "alterAttribute" && effect.attribute === "solved" && effect.value !== undefined)\n', '  if (false)\n'),
    ("schema: the Demon's life", SCHEMA, '    if (ability.rule === "cast-without-paying" && ability.payLife !== undefined && ability.payLife !== "manaValue")\n', '    if (false)\n'),
    ('schema: perType true', SCHEMA, TRUE_KEYS, '["free", "graveyardToLibraryBottom", "anyMana"]'),
    ('schema: anyMana true', SCHEMA, TRUE_KEYS, '["free", "graveyardToLibraryBottom", "perType"]'),
    ('schema: perType alone', SCHEMA, '      if (ability.perType === true && ability.limit !== undefined) errors.push', '      if (false) errors.push'),
    ("schema: permission's cost a list", SCHEMA, EXTRA_SHAPE, EXTRA_SHAPE.replace('ability.additionalCost.length && ', '')),
    ("schema: permission's cost a sacrifice", SCHEMA, EXTRA_SHAPE, EXTRA_SHAPE.replace('a?.atom === "sacrifice" && ', '')),
    ("schema: permission's cost one each", SCHEMA, EXTRA_SHAPE, EXTRA_SHAPE.replace(' && a.count === undefined', '')),
    ("schema: permission's cost's selector", SCHEMA, '        else ability.additionalCost.forEach(', '        else [].forEach('),
    ("schema: permission's cost not a land's", SCHEMA, '        if (ability.lands) errors.push({path: `${path}.additionalCost`', '        if (false) errors.push({path: `${path}.additionalCost`'),

    # The scenario runner.
    ('runner: as which type', SCENARIO, '    if (step.asType !== undefined) found = found.filter((a) => (a.asType ?? null) === step.asType);\n', ''),
    ('runner: the creatures that may block', SCENARIO, '      if (step.blockers !== undefined) {', '      if (false) {'),
]
