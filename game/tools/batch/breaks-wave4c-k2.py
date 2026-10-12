# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Wave 4c, lane k2: the graveyard and combat -- delve, dredge, the rest of a dig on the bottom in any order, a dig's card put
on top, protection from the colors outside your commander's identity, a flashback cost that sacrifices, fabricate, a creature
tapped for mana without {T}, and the subtypes a lost card type takes with it (Treasure Cruise, Dig Through Time, Life from the
Loam, Growing Rites of Itlimoc, Thassa's Oracle, Commander's Plate, Dread Return, Marionette Apprentice, Relic of Legends,
Darksteel Mutation). One break for each engine change -- each guard, each branch -- and the suite that catches it:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-wave4c-k2.py
"""
SUITES = [
    'tests/engine-wave4c-k2.mjs',
    'tests/engine-dig-reveal.mjs',
    'tests/engine-cards.mjs',
]

ACTIONS = 'game/engine/rules/actions.mjs'
ASKING = 'game/engine/script/effects/asking.mjs'
ZONES = 'game/engine/script/effects/zones.mjs'
RESOLUTION = 'game/engine/script/resolution.mjs'
TURN = 'game/engine/rules/turn.mjs'
MANA = 'game/engine/rules/mana.mjs'
PROTECTION = 'game/engine/rules/protection.mjs'
LAYERS = 'game/engine/rules/layers.mjs'
INDEX = 'game/engine/cards/index.mjs'
SCHEMA = 'game/engine/script/schema.mjs'
STATICS = 'game/engine/rules/statics.mjs'
TIMING = 'game/engine/keywords/timing.mjs'
VOCAB = 'game/engine/vocabulary.mjs'
CONSTRUCTS = 'game/tools/engine-constructs.mjs'
ROOM = 'game/room/room.mjs'
SCENARIO = 'game/engine/cards/scenario.mjs'

BREAKS = [
    # ---- the rest of a dig on the bottom in any order (CR 401.4) ----
    ('dig order: asked at all', ASKING,
     '  if ((awaiting.rest ?? "bottom") !== "bottom" || awaiting.random === true || left.length < 2) return false;\n', '  return false;\n'),
    ('dig order: never for a random order', ASKING, ' || awaiting.random === true || left.length < 2) return false;', ' || left.length < 2) return false;'),
    ('dig order: never for one card', ASKING, '|| awaiting.random === true || left.length < 2) return false;', '|| awaiting.random === true || left.length < 1) return false;'),
    ('dig order: never for the rest put elsewhere', ASKING, '  if ((awaiting.rest ?? "bottom") !== "bottom" || awaiting.random', '  if ((awaiting.rest ?? "bottom") === "nowhere" || awaiting.random'),
    ('dig order: as answered', ASKING, 'digRest(state, awaiting.player, inOrder(awaiting.cards, indices).filter(', 'digRest(state, awaiting.player, awaiting.cards.filter('),
    ('dig order: an answer naming no card refused', ASKING,
     '      if ((indices ?? []).some((i) => awaiting.cards[i] === undefined) || new Set(indices ?? []).size !== (indices ?? []).length) throw new Error("Invalid selection");\n', ''),
    ('dig order: what was taken remembered after', ASKING,
     '      return awaiting.remember ? {events, remembered: (awaiting.found ?? []).filter((id) => state.objects[id])} : events;', '      return events;'),
    ('dig order: kept for remember', ASKING, '    ...(awaiting.remember ? {remember: true, found: [...found]} : {})};', '    };'),
    ('dig order: the choice is an order', ASKING, 'the first you choose highest",\n      mode: "order",', 'the first you choose highest",\n      mode: "many",'),
    ('dig order: when nothing may be taken', ASKING,
     '      if (digRestAsked(state, {player: context.controller, rest: params.rest, random: params.random === true}, looked, [])) { state.resolving?.events.push(...events); return true; }\n', ''),
    ('dig order: when every land is taken (all)', ASKING,
     '      if (digRestAsked(state, taking, looked.filter((id) => !offered.includes(id)), found)) { state.resolving?.events.push(...events); return true; }\n', ''),
    ('dig order: after a total of mana value', ASKING,
     '  if (digRestAsked(state, awaiting, awaiting.cards.filter((id) => !chosen.includes(id)), found)) return {events, again: true};\n', ''),
    ('dig order: after the cards taken', ASKING,
     '    if (digRestAsked(state, awaiting, awaiting.cards.filter((id) => !taken.has(id)), found)) return {events, again: true};\n', ''),
    # ---- a dig's card put on top (Thassa's Oracle) ----
    ('dig top: lifted to the top', ASKING, '  library.splice(at, 1);\n  library.unshift(id);\n  return id;', '  library.splice(at, 1);\n  library.push(id);\n  return id;'),
    ('dig top: no zone change', ASKING, '    if (where.to === "top") { if (digToTop(state, awaiting.player, id) !== null) found.push(id); continue; }\n', ''),
    ('dig top: one card (schema)', SCHEMA, '  if (name === "dig" && effect.to === "top" && !((effect.take ?? 1) === 1', '  if (name === "dig" && effect.to === "top" && !((effect.take ?? 1) >= 1'),
    # ---- dredge (CR 702.52a) ----
    ('dredge: not a forbidden draw', ZONES, '  if (!state.players[player] || state.players[player].lost || drawForbidden(state, player)) return [];',
     '  if (!state.players[player] || state.players[player].lost) return [];'),
    ('dredge: enough cards in the library', ZONES, '&& rule.amount >= 1 && rule.amount <= library ? [{id, amount: rule.amount}] : [];', '&& rule.amount >= 1 ? [{id, amount: rule.amount}] : [];'),
    ('dredge: its owner\'s graveyard', ZONES, '  return cardsIn(state, "graveyard", player).flatMap((id) => {\n    const rule =', '  return cardsIn(state, "graveyard").flatMap((id) => {\n    const rule ='),
    ('dredge: mills its N', ZONES, '  events.push(...mill(state, {who: [player], count: could.amount}, {controller: player, source: cardId}));',
     '  events.push(...mill(state, {who: [player], count: 1}, {controller: player, source: cardId}));'),
    ('dredge: the card returned', ZONES, '  if (state.objects[cardId]?.zone === "graveyard") moveOne(state, cardId, "hand", events, {owner: player});\n', ''),
    ('dredge: only a card that could', ZONES, '  if (!could) return false;\n', ''),
    ('dredge: Alms Collector\'s single draws', ZONES, '      draws.push(...[you, player].sort((a, b) => rank(a) - rank(b)));', '      draws.push(player);'),
    ('dredge: one for each card', ZONES, '    for (let i = 0; i < count; i += 1) draws.push(player);\n  }\n  return draws;', '    draws.push(player);\n  }\n  return draws;'),
    ('dredge: the draw step asks', TURN,
     '    if (dredgers(state, state.activePlayer).length) state.awaiting = {kind: "dredge-draw", player: state.activePlayer};\n    else if (state.drawBeat)',
     '    if (state.drawBeat)'),
    ('dredge: the draw step dredges', TURN, '    else dredgeInstead(state, awaiting.player, could[index - 1].id, events);', '    else draw(state, awaiting.player, events);'),
    ('dredge: the draw step draws', TURN, '    if (index === 0) draw(state, awaiting.player, events);\n    else dredgeInstead', '    if (index === 0) {}\n    else dredgeInstead'),
    ('dredge: the draw step refuses another answer', TURN, '!(Number.isInteger(index) && index >= 0 && index <= could.length)) throw new Error("Invalid selection");\n    const events = [];\n    state.awaiting = null;\n    if (index === 0) draw',
     '!(Number.isInteger(index) && index >= 0 && index <= could.length + 1)) throw new Error("Invalid selection");\n    const events = [];\n    state.awaiting = null;\n    if (index === 0) draw'),
    ('dredge: the draw step is no beat button', TURN, '    return {id: `dredge-draw:${state.turn}`, title:', '    return {id: `dredge-draw:${state.turn}`, kind: "draw", title:'),
    ('dredge: an effect\'s draw split', RESOLUTION,
     '      resolving.queue.splice(0, 1, ...singleDraws(state, effect, resolving.context).map((player) => ({effect: "dredgeDraw", player})));',
     '      resolving.queue.splice(0, 1, {...effect, count: 0});'),
    ('dredgeDraw: none, a plain draw', ASKING, '    if (!dredgers(state, params.player).length) return {events: drawEffect(state, {who: [params.player], count: 1}, context)};',
     '    if (!dredgers(state, params.player).length) return {events: []};'),
    ('dredgeDraw: drawn when chosen', ASKING, '    if (index === 0) return drawEffect(state, {who: [awaiting.player], count: 1}, {controller: awaiting.player});',
     '    if (index === 0) return [];'),
    ('dredgeDraw: dredged when chosen', ASKING, '    if (!dredgeInstead(state, awaiting.player, awaiting.cards[index - 1], events)) throw new Error(', '    if (false) throw new Error('),
    ('dredgeDraw: another answer refused', ASKING, '!(Number.isInteger(index) && index >= 0 && index <= awaiting.cards.length)) throw new Error("Invalid selection");',
     '!(Number.isInteger(index) && index >= 0 && index <= awaiting.cards.length + 1)) throw new Error("Invalid selection");'),
    ('dredge: the keyword\'s number', INDEX, '      abilities.push({id, kind: "static", rule: "dredge", text: ability.text, amount: ability.amount ?? 0,',
     '      abilities.push({id, kind: "static", rule: "dredge", text: ability.text, amount: 1,'),
    ('dredge: the keyword needs its number', INDEX, '      if (!(Number.isInteger(ability.amount) && ability.amount >= 1)) problems.push(`${ability.text}: dredge needs its number, 1 or more`);\n', ''),
    ('dredge: a rule of the closed list', STATICS, '  "dredge": "script/effects/zones.mjs",\n', ''),
    ('dredge: built', TIMING, '"Unearth", "Suspend", "Dredge"]),', '"Unearth", "Suspend"]),'),
    ('dredge: declared', VOCAB, '  "dredge"];', '  ];'),
    # ---- delve (CR 702.66a) ----
    ('delve: offered', ACTIONS, '    const delves = delvers.length > 0 && cost.generic + x > 0 && canPay(', '    const delves = false && canPay('),
    ('delve: a card to exile', ACTIONS, '    const delves = delvers.length > 0 && cost.generic + x > 0 && canPay(', '    const delves = cost.generic + x > 0 && canPay('),
    ('delve: generic mana to pay', ACTIONS, '    const delves = delvers.length > 0 && cost.generic + x > 0 && canPay(', '    const delves = delvers.length > 0 && canPay('),
    ('delve: no more than the graveyard', ACTIONS, 'lessGeneric(cost, x, Math.min(delvers.length, cost.generic + x)), {life: lifeLeft});', 'lessGeneric(cost, x, cost.generic + x), {life: lifeLeft});'),
    ('delve: not with X', ACTIONS, '    const delvers = X === null && hasDelve(state, id)', '    const delvers = hasDelve(state, id)'),
    ('delve: its own keyword', ACTIONS, 'const hasDelve = (state, id) => keywordsOf(state, id).includes("Delve");', 'const hasDelve = (state, id) => keywordsOf(state, id).includes("Convoke");'),
    ('delve: never the spell itself', ACTIONS, 'const delvable = (state, player, id) => cardsIn(state, "graveyard", player).filter((c) => c !== id);',
     'const delvable = (state, player, id) => cardsIn(state, "graveyard", player);'),
    ('delve: the offer says so', ACTIONS, '...(convoke === "delve" ? {delve: true} : {}),', ''),
    ('delve: the fewest, one at least', ACTIONS, '  for (let n = 1; n <= most; n += 1) if (canPay(pool, lessGeneric(cost, extra, n), {life})) return {least: n, most};',
     '  for (let n = 0; n <= most; n += 1) if (canPay(pool, lessGeneric(cost, extra, n), {life})) return {least: n, most};'),
    ('delve: the most, its generic', ACTIONS, '  const most = Math.min(cost.generic + extra, delvable(state, player, action.objectId).length);',
     '  const most = delvable(state, player, action.objectId).length;'),
    ('delve: picks of the graveyard', ACTIONS, ' || !list.every((id) => yard.includes(id)) || list.length > cost.generic + extra)', ' || list.length > cost.generic + extra)'),
    ('delve: no more picks than its generic', ACTIONS, ' || !list.every((id) => yard.includes(id)) || list.length > cost.generic + extra)', ' || !list.every((id) => yard.includes(id)))'),
    ('delve: one pick at least', ACTIONS, '  if (!Array.isArray(list) || !list.length || new Set(list).size', '  if (!Array.isArray(list) || new Set(list).size'),
    ('delve: no card twice', ACTIONS, '  if (!Array.isArray(list) || !list.length || new Set(list).size !== list.length || !list.every((id) => yard.includes(id))',
     '  if (!Array.isArray(list) || !list.length || !list.every((id) => yard.includes(id))'),
    ('delve: the pool question asked', ACTIONS, '!Array.isArray(action.delveExile) || (action.payWith === undefined && delveWays(state, player, action).length > 1))) {',
     '!Array.isArray(action.delveExile))) {'),
    ('delve: the pool question', ACTIONS, '    if (Array.isArray(action.delveExile)) {\n      const ways = delveWays(state, player, action);', '    if (false) {\n      const ways = delveWays(state, player, action);'),
    ('delve: the cards asked', ACTIONS, '    if (action.kind === "cast" && action.delve === true && (!Array.isArray(action.delveExile) ||', '    if (action.kind === "cast" && action.delve === true && (false ||'),
    ('delve: the delved payment', ACTIONS, ': convoke ? convoke.payment : delve ? delve.payment', ': convoke ? convoke.payment : delve ? {mana: {}, life: 0}'),
    ('delve: the cards exiled', ACTIONS, 'for (const id of [...exiling, ...othersExiling, ...(delve?.ids ?? [])]) if', 'for (const id of [...exiling, ...othersExiling]) if'),
    ('delve: another offer than the pool\'s', ACTIONS, '  && (a.delve === true) === (b.delve === true)\n', ''),
    ('delve: picked from a range', ACTIONS, '["convoke", "tapAny", "waterbend", "delve"].includes(choice.cost)', '["convoke", "tapAny", "waterbend"].includes(choice.cost)'),
    ('delve: the picks carried', ACTIONS, ': choice.cost === "delve" ? {delveExile: ids} :', ':'),
    ('delve: the total cost\'s generic', MANA, '  return {...cost, generic: cost.generic + extra - n};', '  return {...cost, generic: cost.generic - n};'),
    ('delve: built', TIMING, '"Warp", "Sneak", "Delve"]),', '"Warp", "Sneak"]),'),
    ('delve: declared', VOCAB, '  "delve",\n', ''),
    ('delve: the scenario step', SCENARIO, '    found = found.filter((a) => (a.delve ?? false) === (step.delve ?? false));\n', ''),
    ('delve: said to the player', ROOM, '    if (a.delve) parts.push("delving, exiling cards you choose from your graveyard");\n', ''),
    # ---- protection from the colors outside the commander's identity (Commander's Plate) ----
    ('plate: the colors outside', PROTECTION, '  return ["W", "U", "B", "R", "G"].filter((color) => !identity.includes(color));', '  return ["W", "U", "B", "R", "G"].filter((color) => identity.includes(color));'),
    ('plate: none without a commander', PROTECTION, '  if (!Number.isInteger(holder) || !hasCommander(state, holder)) return [];', '  if (!Number.isInteger(holder)) return [];'),
    ('plate: the static\'s controller', PROTECTION, '    if (!hasQuality(state, ability.from, sourceId, controller)) continue;', '    if (!hasQuality(state, ability.from, sourceId)) continue;'),
    ('plate: named colors still read', PROTECTION, '  if (from?.outsideCommanderIdentity !== true) return from?.colors ?? [];', '  if (from?.outsideCommanderIdentity !== true) return [];'),
    ('plate: the compiler', INDEX, '      && !(ability.from.outsideCommanderIdentity === true && Object.keys(ability.from).length === 1))', '      && false)'),
    # ---- a flashback cost that sacrifices (Dread Return) ----
    ('flashback sacrifice: an atom', INDEX, 'const FLASHBACK_ATOMS = ["mana", "payLife", "tapCreature", "discard", "behold", "sacrifice"];', 'const FLASHBACK_ATOMS = ["mana", "payLife", "tapCreature", "discard", "behold"];'),
    ('flashback sacrifice: the compiler', INDEX,
     '      if (sacrifices.length > 1 || sacrifices.some((atom) => !(Number.isInteger(atom.count) && atom.count >= 1) || !atom.selector || typeof atom.selector !== "object" || atom.self !== undefined))',
     '      if (false)'),
    ('flashback sacrifice: the cost carries it', ACTIONS, '    ...(sacrifice ? {sacrifice: {count: sacrifice.count ?? 1, selector: sacrifice.selector ?? {}}} : {})};', '    };'),
    ('flashback sacrifice: enough to sacrifice', ACTIONS,
     '\n  && (!back.sacrifice || sacrificeChoices(state, player, null, back.sacrifice.selector).length >= back.sacrifice.count);', ';'),
    ('flashback sacrifice: asked', ACTIONS,
     '    if (action.kind === "cast" && action.flashback === true && !Array.isArray(action.flashbackSacrifice) && flashbackCost(state, player, action.objectId)?.sacrifice) {',
     '    if (false) {'),
    ('flashback sacrifice: the question', ACTIONS, '  if (sacrificing && !Array.isArray(action.flashbackSacrifice)) {', '  if (false) {'),
    ('flashback sacrifice: in the card\'s words', ACTIONS, '  return `${type ? type.toLowerCase() : "permanent"}${n === 1 ? "" : "s"}`;', '  return `permanent${n === 1 ? "" : "s"}`;'),
    ('flashback sacrifice: the picks carried', ACTIONS, ': choice.cost === "flashbackSacrifice" ? {flashbackSacrifice: ids} :', ':'),
    ('flashback sacrifice: no permanent twice', ACTIONS, '  if (!Array.isArray(list) || list.length !== sacrifice.count || new Set(list).size !== list.length || !list.every((id) => fitting.includes(id)))',
     '  if (!Array.isArray(list) || list.length !== sacrifice.count || !list.every((id) => fitting.includes(id)))'),
    ('flashback sacrifice: sacrificed', ACTIONS, '    for (const id of sacrificing) if (state.objects[id]?.zone === "battlefield") sacrificeOne(state, id, events);\n', ''),
    ('flashback sacrifice: said to the player', ROOM, '${sacrifice ? `, sacrificing ${inWords(sacrifice.count)} you choose` : ""}`);', '`);'),
    # ---- fabricate (CR 702.123a) ----
    ('fabricate: compiled', INDEX, '    if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "fabricate") {', '    if (false) {'),
    ('fabricate: the Servos once it has left', INDEX, '        effects: [{effect: "branch", if: {present: {self: true}}, otherwise: [servos],', '        effects: [{effect: "branch", if: {present: {self: true}}, otherwise: [],'),
    ('fabricate: its N counters', INDEX, '[{effect: "putCounter", targets: "self", counter: "+1/+1", count: n}]},', '[{effect: "putCounter", targets: "self", counter: "+1/+1", count: 1}]},'),
    ('fabricate: needs its number', INDEX, '      if (!(Number.isInteger(ability.amount) && ability.amount >= 1)) problems.push(`${ability.text}: fabricate needs its number, 1 or more`);\n', ''),
    ('fabricate: declared', VOCAB, '  "fabricate",\n', ''),
    ('fabricate: credited', CONSTRUCTS, '  Fabricate: "createToken",\n', ''),
    # ---- a creature tapped for mana without {T} (Relic of Legends) ----
    ('relic: no {T} needed', INDEX, '|| (a?.atom === "tapCreature" && (a.count ?? 1) === 1 && Boolean(a.selector) && typeof a.selector === "object")',
     '|| (a?.atom === "tapCreature" && (a.count ?? 1) === 1 && Boolean(a.selector) && typeof a.selector === "object" && cost.some((t) => t?.atom === "{T}"))'),
    ('relic: itself, without {T}', ACTIONS, 'state.zones.battlefield.filter((id) => (!tapsSelf || id !== sourceId) && !state.objects[id].tapped', 'state.zones.battlefield.filter((id) => id !== sourceId && !state.objects[id].tapped'),
    ('relic: whether it taps itself', ACTIONS, 'manaTappers(state, player, id, ability.tapCreature, ability.tapSelf === true)', 'manaTappers(state, player, id, ability.tapCreature, true)'),
    # ---- the subtypes a lost card type takes with it (CR 205.3d; Darksteel Mutation) ----
    ('205.3d: land types', LAYERS, '(isLandType(subtype) && !has("Land")) || ', ''),
    ('205.3d: planeswalker types', LAYERS, ' || (isPlaneswalkerType(subtype) && !has("Planeswalker"))', ''),
    ('205.3d: enchantment types', LAYERS, '      || (isEnchantmentType(subtype) && !has("Enchantment")) || ', '      || '),
    ('205.3d: creature types', LAYERS, ' || (isCreatureType(subtype) && !has("Creature") && !has("Kindred"))));', '));'),
    ('205.3d: a changeling no creature type', LAYERS, '    if (!has("Creature") && !has("Kindred")) current.everyCreatureType = false;\n', ''),
    ('205.3d: the compiler', INDEX, '      && !(ability.apply.correspondingSubtypes === true && ability.layer === 4 && Array.isArray(ability.apply.setTypes)))', '      && false)'),
    # ---- the credits ----
    ('credit: protection', CONSTRUCTS, '  Protection: "effectUntil",\n', ''),
    ('credit: threshold', CONSTRUCTS, '  Threshold: {name: "Threshold (seven cards in your graveyard)", status: "built",', '  Threshold: {name: "Threshold (seven cards in your graveyard)", status: "missing",'),
    ('credit: a library\'s count', CONSTRUCTS, '  ValidLibrary: {name: "Cards in a library", status: "built",', '  ValidLibrary: {name: "Cards in a library", status: "missing",'),
]
