# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The card load of 2026-10-23, lane L6 (spells, draws and discards): one break for each engine change, each guard and branch.

Run from the repository root, with nothing else editing the worktree:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-w4d-l6-spells.py
"""
SUITES = ['tests/engine-spells-w4d.mjs', 'tests/engine-unless-times.mjs', 'tests/engine-convoke.mjs', 'tests/engine-delayed-mana.mjs', 'tests/engine-cards.mjs']
STATE = 'game/engine/state/index.mjs'
TURN = 'game/engine/rules/turn.mjs'
ZONES = 'game/engine/script/effects/zones.mjs'
FILTER = 'game/engine/script/filter.mjs'
EFFECTS = 'game/engine/script/effects/index.mjs'
TRIGGER = 'game/engine/rules/trigger.mjs'
CARDS = 'game/engine/cards/index.mjs'
ASKING = 'game/engine/script/effects/asking.mjs'
ACTIONS = 'game/engine/rules/actions.mjs'
STACK = 'game/engine/rules/stack.mjs'
RESOURCES = 'game/engine/script/effects/resources.mjs'
STATICS = 'game/engine/rules/statics.mjs'
SCHEMA = 'game/engine/script/schema.mjs'
TIMING = 'game/engine/keywords/timing.mjs'
VOCAB = 'game/engine/vocabulary.mjs'
CONSTRUCTS = 'game/tools/engine-constructs.mjs'
BREAKS = [
    # Sylvan Library: the cards drawn this turn.
    ('a drawn card is not marked', STATE,
     '  if (id !== null && state.objects[id]) state.objects[id].drawn = true;\n', ''),
    ('the draw step does not say which card', TURN,
     'drawNumber: recordDraw(state, player, moved),', 'drawNumber: recordDraw(state, player),'),
    ('an effect\'s draw does not say which card', ZONES,
     'fields.drawNumber = recordDraw(state, player, moved);', 'fields.drawNumber = recordDraw(state, player);'),
    ('drawnThisTurn fits any card', FILTER,
     'if (selector.drawnThisTurn === true && !(object.zone === "hand" && object.drawn === true && object.arrivedTurn === state.turn)) return false;', ''),
    ('drawn on any turn', FILTER,
     'object.drawn === true && object.arrivedTurn === state.turn)) return false;', 'object.drawn === true)) return false;'),
    ('repeatFor over the remembered ranges over nothing', EFFECTS,
     'if (each === "remembered") return (context.remembered ?? [])', 'if (each === "remembered") return ([])'),
    ('repeatFor may not range over the remembered', EFFECTS,
     '"creature", "remembered"]);', '"creature"]);'),
    # High Tide: "that player adds".
    ('the tapper\'s extra mana goes to the trigger\'s controller', TRIGGER,
     'player: mana.toTapper === true ? fields.player?.playerId ?? d.controller : d.controller,', 'player: d.controller,'),
    ('"that player" is not compiled', CARDS,
     'on.manaAbility = {mana: {...adds.mana}, ...(adds.who === "that player" ? {toTapper: true} : {})};', 'on.manaAbility = {mana: {...adds.mana}};'),
    # Expressive Iteration: the rest left on top.
    ('dig\'s rest "stay" moves them', ASKING,
     '  if (rest === "stay") return;\n', ''),
    # Kicker.
    ('kicker is no additional cost', CARDS,
     '  if (kicker !== null) spell = {', '  if (false) spell = {'),
    ('kicker records no cost', CARDS,
     '      kicker = String(ability.cost ?? "");\n      keywords.push("Kicker");', '      kicker = null;\n      keywords.push("Kicker");'),
    ('kicker {X} is allowed', CARDS,
     'parsed.variable > 0) problems.push(`${ability.text}: kicker is a mana cost`);', 'false) problems.push(`${ability.text}: kicker is a mana cost`);'),
    ('a kicked script is not compiled', CARDS,
     '...(ability.kicked ? {kicked: {targets: ability.kicked.targets ?? [], effects: ability.kicked.effects ?? []}} : {})};', '};'),
    ('a kicked script with no effects passes', CARDS,
     'if (ability.kicked && (modal || !(ability.kicked.effects ?? []).length)) problems.push', 'if (false) problems.push'),
    ('a kicked script without kicker passes', CARDS,
     'if (spell?.kicked && kicker === null) problems.push', 'if (false) problems.push'),
    ('no kicked cast is offered', ACTIONS,
     'variants = variants.flatMap((v) => [v, {...v, mana: v.mana + (atom.cost ?? ""), kicked: 1}]);', 'variants = variants.flatMap((v) => [v]);'),
    ('a kicked cast is offered the unkicked targets', ACTIONS,
     '(variant.kicked && object.spell?.kicked ? object.spell.kicked : object.spell)', 'object.spell'),
    ('a kicked spell does what the unkicked one does', STACK,
     '    if (entry.kicked && spell?.kicked) return spell.kicked;\n', ''),
    ('a copy of a kicked spell is not kicked', STACK,
     '  if (original.kicked) entry.kicked = original.kicked;\n', ''),
    # Convoke with {X}.
    ('convoke\'s cost leaves X out', ACTIONS,
     '  const paying = xCounted(cost, action.x ?? 0);', '  const paying = cost;'),
    ('the convoked cast pays no X', ACTIONS,
     'convoked(state, player, action, {...xCounted(cost, action.x ?? 0), generic: xCounted(cost, action.x ?? 0).generic + x})', 'convoked(state, player, action, {...cost, generic: cost.generic + x})'),
    ('X no higher than the pool pays', ACTIONS,
     'const convokesX = !lifeX && cost.variable > 0', 'const convokesX = false && cost.variable > 0'),
    ('no convoke with X', ACTIONS,
     'const helpers = (X === null || !lifeX) &&', 'const helpers = X === null &&'),
    ('the convoke offer weighs no X', ACTIONS,
     'const convoking = X === null ? cost : xCounted(cost, X);', 'const convoking = cost;'),
    # Cut a Deal, Syphon Mind.
    ('draw remembers nothing', ZONES,
     'if (params.remember) context.remembered = events.map((e) => e.data?.fields)', 'if (false) context.remembered = events.map((e) => e.data?.fields)'),
    ('discard remembers only its controller\'s', ASKING,
     '(player === awaiting.controller || awaiting.rememberAll === true)', '(player === awaiting.controller)'),
    ('remember "all" is not carried', ASKING,
     '...(params.remember === "all" ? {rememberAll: true} : {}),', ''),
    # Bloodletter of Aclazotz.
    ('life loss is never doubled', RESOURCES,
     '  if (delta < 0) delta = -lifeLost(state, player, -delta);\n', ''),
    ('doubled on every turn', STATICS,
     '      if (ability.duringYourTurn === true && state.activePlayer !== holder.controller) continue;\n', ''),
    ('more-life-loss times 1 passes', SCHEMA,
     'if (["more-life", "more-life-loss"].includes(ability.rule) &&', 'if (["more-life"].includes(ability.rule) &&'),
    ('more-life-loss is no rule', STATICS,
     '  "more-life-loss": "script/effects/resources.mjs",\n', ''),
    # Crackle with Power.
    ('up to X targets is refused on a spell', SCHEMA,
     '!countValid(count, {x: ability.kind === "spell" && manaX})', '!countValid(count)'),
    ('up to X targets on a spell with no {X}', SCHEMA,
     'const manaX = /\\{X\\}/.test(String(script.identity?.manaCost ?? ""));', 'const manaX = true;'),
    ('a counted target\'s question has no X', ACTIONS,
     'chosenTargets: action.targets ?? [], ...(Number.isInteger(action.x) ? {x: action.x} : {})};', 'chosenTargets: action.targets ?? []};'),
    ('the counted targets are checked without X', ACTIONS,
     'const count = countOf(spec, context), chosen', 'const count = countOf(spec), chosen'),
    ('the offer\'s targets have no X', ACTIONS,
     ', cast, ...(Number.isInteger(X) && !lifeX ? {x: X} : {})}, aim)', ', cast}, aim)'),
    # Improvise.
    ('printed improvise is not read', ACTIONS,
     'const hasImprovise = (state, player, id) => keywordsOf(state, id).includes("Improvise")', 'const hasImprovise = (state, player, id) => keywordsOf(state, id).includes("Improvised")'),
    ('Inspiring Statuary gives nothing', ACTIONS,
     'playerStatics(state, "spells-have-improvise", player)', 'playerStatics(state, "spells-have-improvised", player)'),
    ('artifacts never help', ACTIONS,
     'spell !== null && hasImprovise(state, player, spell) ? untappedOf(state, player, "Artifact")', 'false ? untappedOf(state, player, "Artifact")'),
    ('improvise offers no cast', ACTIONS,
     'const helpsCast = (state, player, id) => hasConvoke(state, id) || hasImprovise(state, player, id);', 'const helpsCast = (state, player, id) => hasConvoke(state, id);'),
    ('improvise asks for creatures', ACTIONS,
     ': `${name}: tap artifacts to improvise it`', ': `${name}: tap creatures to convoke it`'),
    ('improvise has no behavior', TIMING,
     '"Sneak", "Delve", "Improvise"]),', '"Sneak", "Delve"]),'),
    ('spells-have-improvise is no rule', STATICS,
     '  "spells-have-improvise": "rules/actions.mjs",\n', ''),
    # Cascade.
    ('cascade is not compiled', CARDS,
     'String(ability.keyword).toLowerCase() === "cascade") {', 'String(ability.keyword).toLowerCase() === "cascades") {'),
    ('digUntil remembers only the card found', ZONES,
     '(params.remember === "all" ? all : found)', '(found)'),
    # Isochron Scepter.
    ('the exiled card is not copied', ASKING,
     'const copying = from === "selector" ? selectMatching(', 'const copying = false ? selectMatching('),
    # The words.
    ('kicker is no keyword', VOCAB, '  "kicker",\n', ''),
    ('improvise is no keyword', VOCAB, '  "improvise",\n', ''),
    ('cascade is no keyword', VOCAB, '  "cascade",\n  /* Rob', '  /* Rob'),
    ('kicker is not credited', CONSTRUCTS, 'Affinity: "rules/statics.mjs", Kicker: "rules/actions.mjs",', 'Affinity: "rules/statics.mjs",'),
    ('cascade is not credited', CONSTRUCTS, '  Cascade: "digUntil",\n', ''),
]
