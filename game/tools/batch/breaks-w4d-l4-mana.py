# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The card load of 2026-10-23, lane L4 (lands and mana): prove each engine change can fail -- exert (Arena of Glory),
a mana ability from the hand (Simian Spirit Guide), mana that gives haste, the damage dealt this turn (Spinerock Knoll),
the chosen color in a layer static (Heraldic Banner), and a search another player controls (Opposition Agent)."""
SUITES = ['tests/engine-lands-and-mana.mjs', 'tests/engine-cards.mjs']
CARDS = 'game/engine/cards/index.mjs'
ACTIONS = 'game/engine/rules/actions.mjs'
TURN = 'game/engine/rules/turn.mjs'
COMBAT = 'game/engine/rules/combat.mjs'
LAYERS = 'game/engine/rules/layers.mjs'
STATICS = 'game/engine/rules/statics.mjs'
AMOUNT = 'game/engine/script/amount.mjs'
RESOURCES = 'game/engine/script/effects/resources.mjs'
ASKING = 'game/engine/script/effects/asking.mjs'
BREAKS = [
 # Arena of Glory: exert (CR 701.43a), and its mana's haste.
 ('exert is a mana cost', CARDS, '    || (a?.atom === "exert" && a.self === true)\n', ''),
 ('exert compiled', CARDS, '...(cost.some((a) => a.atom === "exert" && a.self === true) ? {exertSelf: true} : {}),', ''),
 ('exerting marks it', ACTIONS, 'if (ability.exertSelf) object.exerted = player;', 'if (false) object.exerted = player;'),
 ('exerted skips the untap step', TURN, 'if (o.exerted === state.activePlayer) { delete o.exerted; continue; }', 'if (false) { delete o.exerted; continue; }'),
 ('exert used up by one untap step', TURN, 'if (o.exerted === state.activePlayer) { delete o.exerted; continue; }', 'if (o.exerted === state.activePlayer) { continue; }'),
 ('exert is a play', ACTIONS, '"exileFromGraveyard", "exertSelf", "exileSelf"];', '"exileFromGraveyard", "exileSelf"];'),
 ('mana that gives haste is a rider', CARDS, 'const gains = Array.isArray(when?.gains)', 'const gains = false && Array.isArray(when?.gains)'),
 ('rider mana gives haste', ACTIONS, 'if (rider.whenSpent.gains) { for (const keyword of rider.whenSpent.gains) if (!gains.includes(keyword)) gains.push(keyword); continue; }', 'if (rider.whenSpent.gains) continue;'),
 # Simian Spirit Guide: a mana ability of a card in hand.
 ('exile from the hand is a mana cost', CARDS, '    || (a?.atom === "exile" && a.self === true && ability.zone === "hand"))) return "unbuilt";', '    || false)) return "unbuilt";'),
 ('hand mana compiled', CARDS, '...(cost.some((a) => a.atom === "exile" && a.self === true) ? {zone: "hand", exileSelf: true} : {}),', ''),
 ('hand mana offered', ACTIONS, 'for (const id of cardsIn(state, "hand", player)) {\n    const object = state.objects[id];\n    for (const ability of object.abilities ?? []) {', 'for (const id of []) {\n    const object = state.objects[id];\n    for (const ability of object.abilities ?? []) {'),
 ('not from the battlefield', ACTIONS, 'if (ability.kind !== "mana" || ability.zone === "hand") continue;', 'if (ability.kind !== "mana") continue;'),
 ('the card is exiled', ACTIONS, 'if (ability.exileSelf) frame.costs.push(', 'if (false) frame.costs.push('),
 ('hand mana is a play', ACTIONS, '"exileFromGraveyard", "exertSelf", "exileSelf"];', '"exileFromGraveyard", "exertSelf"];'),
 # Spinerock Knoll: the damage each player was dealt this turn.
 ('noncombat damage counted', RESOURCES, '    state.players[toPlayer].damagedThisTurn = (state.players[toPlayer].damagedThisTurn ?? 0) + proposal.amount;\n', ''),
 ('combat damage counted', COMBAT, '        state.players[hit.toPlayer].damagedThisTurn = (state.players[hit.toPlayer].damagedThisTurn ?? 0) + hit.amount;\n', ''),
 ('counted for this turn only', TURN, 'if (player.damagedThisTurn) player.damagedThisTurn = 0;', 'if (false) player.damagedThisTurn = 0;'),
 ('an amount kind', AMOUNT, '  "damageTakenThisTurn",\n', ''),
 ('names a player', AMOUNT, '  if ("damageTakenThisTurn" in value && !["you", "that player", "an opponent"].includes(value.damageTakenThisTurn)) problems.push(\'damageTakenThisTurn is "you", "that player" or "an opponent"\');\n', ''),
 ('the most one opponent was dealt, not all together', AMOUNT, 'Math.max(0, ...state.players.filter((p) => p.id !== context.controller && !p.lost).map((p) => p.damagedThisTurn ?? 0))', 'state.players.filter((p) => p.id !== context.controller && !p.lost).reduce((n, p) => n + (p.damagedThisTurn ?? 0), 0)'),
 ("a player's own", AMOUNT, '      n = player !== null ? state.players[player]?.damagedThisTurn ?? 0 : 0;', '      n = 0;'),
 # Heraldic Banner: the chosen color in a layer static.
 ('the chosen color read as its symbol', LAYERS, 'includes(CHOSEN_COLOR_LETTER[color] ?? color)', 'includes(color)'),
 # Opposition Agent: control of a search (CR 722.1), its finds exiled and playable.
 ('a rule a static may change', STATICS, '  "controls-searches": "script/effects/asking.mjs",\n', ''),
 ('the Agent found', STATICS, 'if (ability.kind !== "static" || ability.rule !== "controls-searches") continue;', 'if (true) continue;'),
 ('opponents only', STATICS, '      if (!compileSelector(ability.affects)(state, player, {controller: holder.controller, source: holderId})) continue;\n', ''),
 ('the latest controls', STATICS, 'if (found === null || holder.timestamp > state.objects[found].timestamp) found = holderId;', 'if (found === null) found = holderId;'),
 ('library searches only', ASKING, 'const agent = zone === "library" || zones?.includes("library") ? searchController(state, player) : null;', 'const agent = searchController(state, player);'),
 ("put to the Agent's controller", ASKING, 'if (agent !== null) Object.assign(awaiting, {searcher: player, player: state.objects[agent].controller, opposition: state.objects[agent].card});', 'if (false) Object.assign(awaiting, {});'),
 ("the searcher's library shuffled", ASKING, 'const player = awaiting.searcher ?? awaiting.player;\n    const tops', 'const player = awaiting.player;\n    const tops'),
 ('its finds exiled', ASKING, 'const exiling = chosen.map((id) => awaiting.opposition !== undefined && state.objects[id]?.zone === "library");', 'const exiling = chosen.map(() => false);'),
 ('its finds playable', ASKING, 'if (exiling[i] && moved !== null && state.objects[moved]?.zone === "exile")', 'if (false)'),
 ('with mana of any color', ASKING, 'anyMana: true, until: "ever", madeOnTurn: state.turn, sourceController: awaiting.player});', 'until: "ever", madeOnTurn: state.turn, sourceController: awaiting.player});'),
]
