# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Wave 4c, lane k4: spells, draws and discards -- affinity (CR 702.41a), a cast or a copy making a trigger trigger again
(CR 603.2d), draws replaced (CR 614.11: "you win the game instead", "draw two cards instead"), a mana choice among some
colors as a spell resolves, a hand looked at (CR 701.20e), "each player who can't" after a sacrifice that must be made, a
fixed life payment as one of an additional cost's choices (CR 119.4, 601.2b), and a sacrificed creature's power as it last
was (CR 608.2h). One break for each engine change -- each guard, each branch, each credit -- and the suite that catches it:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-wave4c-k4.py
"""
SUITES = [
    'tests/engine-spells-draws-4c.mjs',
    'tests/engine-vocabulary.mjs',
    'tests/engine-cards.mjs',
]

INDEX = 'game/engine/cards/index.mjs'
VOCAB = 'game/engine/vocabulary.mjs'
CONSTRUCTS = 'game/tools/engine-constructs.mjs'
TRIGGER = 'game/engine/rules/trigger.mjs'
SCHEMA = 'game/engine/script/schema.mjs'
STATICS = 'game/engine/rules/statics.mjs'
ZONES = 'game/engine/script/effects/zones.mjs'
TURN = 'game/engine/rules/turn.mjs'
RESOLUTION = 'game/engine/script/resolution.mjs'
ASKING = 'game/engine/script/effects/asking.mjs'
PROJECTION = 'game/engine/projection.mjs'
ACTIONS = 'game/engine/rules/actions.mjs'
AMOUNT = 'game/engine/script/amount.mjs'

BREAKS = [
    # ---- affinity (CR 702.41a; Thought Monitor) ----
    ('affinity: the keyword compiled', INDEX,
     'if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "affinity") {',
     'if (ability.kind === "keyword" && String(ability.keyword).toLowerCase() === "affinity-not") {'),
    ('affinity: its caster\'s permanents', INDEX,
     '      const counted = {...(of ?? {}), what: "permanent", controller: "you"};\n',
     '      const counted = {...(of ?? {}), what: "permanent"};\n'),
    ('affinity: what it counts said', INDEX,
     '      if (!(of && typeof of === "object" && !Array.isArray(of) && of.controller === undefined && of.what === undefined))\n        problems.push(',
     '      if (false)\n        problems.push('),
    ('affinity: a selector the grammar knows', INDEX,
     '      else try { compileSelector(counted); } catch (error) { problems.push(`${ability.text}: ${error.message}`); }\n', ''),
    ('affinity: a keyword a script may say', VOCAB, '  "affinity",\n', ''),
    ('affinity: credited', CONSTRUCTS, '  Affinity: "rules/statics.mjs", Kicker: "rules/actions.mjs",', '  Kicker: "rules/actions.mjs",'),

    # ---- a cast or a copy making a trigger trigger again (CR 603.2d; Veyran, Voice of Duality) ----
    ('cast or copy: a cause read', TRIGGER, '  if (cause.event === "cast or copy") {', '  if (false) {'),
    ('cast or copy: its controller\'s casting or copying only', TRIGGER,
     '    if ((cast ? fields.si?.actor?.playerId : fields.playerId) !== context.controller) return false;\n', ''),
    ('cast or copy: a copy by who copied it', TRIGGER,
     '(cast ? fields.si?.actor?.playerId : fields.playerId) !== context.controller', 'fields.si?.actor?.playerId !== context.controller'),
    ('cast or copy: a copy watched', TRIGGER,
     '    if (!cast && event.kind !== "GameEventSpellCopied") return false;\n', '    if (!cast) return false;\n'),
    ('cast or copy: an instant or sorcery', TRIGGER,
     '    return Boolean(state.objects[spell]) && matchesSelector({...(cause.filter ?? {}), what: "spell"}, state, spell, context);\n', '    return true;\n'),
    ('cast or copy: a cause the schema takes', SCHEMA, '"attacks", "enters or leaves", "cast or copy"].includes(ability.cause?.event)', '"attacks", "enters or leaves"].includes(ability.cause?.event)'),

    # ---- "you win the game instead" (CR 614.11, 121.6a; Laboratory Maniac) ----
    ('empty draw wins: an effect\'s draw', ZONES,
     '  if (library.length === 0 && emptyDrawWins(state, player)) { winGame(state, {who: [player]}, {controller: player}); return; }\n', ''),
    ('empty draw wins: only from an empty library', ZONES,
     '  if (library.length === 0 && emptyDrawWins(state, player)) {', '  if (emptyDrawWins(state, player)) {'),
    ('empty draw wins: replaced, no draw from an empty library', ZONES,
     '{ winGame(state, {who: [player]}, {controller: player}); return; }\n  /* "DRAW TWO', '{ winGame(state, {who: [player]}, {controller: player}); }\n  /* "DRAW TWO'),
    ('empty draw wins: the draw step\'s draw', TURN,
     '    if (emptyDrawWins(state, player)) { winGame(state, {who: [player]}, {controller: player}); return null; }\n', ''),
    ('empty draw wins: the players it names', STATICS,
     '  return playerRuleChanged(state, "empty-draw-wins", player);', '  return state.players.length > 0;'),

    # ---- "draw two cards instead" (CR 614.11a, 614.5; Teferi's Ageless Insight) ----
    ('draws more: the draw replaced', ZONES,
     '  if (more) { for (let i = 0; i < more.count; i += 1) drawOne(state, player, events, [...replaced, more.key]); return; }\n', ''),
    ('draws more: each once to a draw (CR 614.5)', ZONES,
     '  const more = drawsMore(state, player).find((m) => !replaced.includes(m.key));', '  const more = drawsMore(state, player).find(() => true);'),
    ('draws more: that many', ZONES, 'for (let i = 0; i < more.count; i += 1) drawOne', 'for (let i = 0; i < 1; i += 1) drawOne'),
    ('draws more: the draw step\'s first excepted', STATICS,
     '      if (ability.exceptFirstInDrawStep === true && first) continue;\n', ''),
    ('draws more: only in its own draw step', STATICS,
     'const first = state.phase === "DRAW" && state.activePlayer === player && ', 'const first = state.phase === "DRAW" && '),
    ('draws more: this turn\'s count', STATICS, '!(steps?.turn === state.turn && steps.count > 0)', '!(steps?.count > 0)'),
    ('draws more: the players it names', STATICS,
     '      if (compileSelector({what: "player", ...ability.affects})(state, player, {controller: holder.controller, source: holderId}))\n        found.push({key: `${holderId}:${ability.id}`, count: ability.count});',
     '      found.push({key: `${holderId}:${ability.id}`, count: ability.count});'),
    ('draws more: two or more cards', SCHEMA,
     '      if (!(Number.isInteger(ability.count) && ability.count >= 2)) errors.push(', '      if (false) errors.push('),
    ('draws more: exceptFirstInDrawStep is true', SCHEMA,
     '      if (ability.exceptFirstInDrawStep !== undefined && ability.exceptFirstInDrawStep !== true) errors.push(', '      if (false) errors.push('),

    # ---- a mana choice among some colors (Culling Ritual) ----
    ('colors: asked as it resolves', RESOLUTION,
     '    if (effect?.effect === "addMana" && Array.isArray(effect.colors) && effect.mana === undefined) {', '    if (false) {'),
    ('colors: how many', RESOLUTION,
     '      resolving.queue[0] = {effect: "manaColors", count: Number.isInteger(effect.count) ? effect.count : 1, colors: [...effect.colors]};',
     '      resolving.queue[0] = {effect: "manaColors", count: 1, colors: [...effect.colors]};'),
    ('colors: carried to the question', ASKING,
     ',\n      ...(Array.isArray(params.colors) ? {colors: [...params.colors]} : {})};', '};'),
    ('colors: only those offered', ASKING,
     'const colorsOffered = (awaiting) => (Array.isArray(awaiting.colors) ? MANA_COLORS.filter(([color]) => awaiting.colors.includes(color)) : MANA_COLORS);',
     'const colorsOffered = () => MANA_COLORS;'),
    ('colors: said in the title', ASKING,
     '    const of = Array.isArray(awaiting.colors) ? `${named.slice(0, -1).join(", ")} or ${named[named.length - 1]}` : "any color";',
     '    const of = "any color";'),
    ('colors: what may be said', INDEX,
     '      if (effect.effect === "addMana" && effect.colors !== undefined && !(Array.isArray(effect.colors) && effect.colors.length >= 2',
     '      if (false && effect.effect === "addMana" && effect.colors !== undefined && !(Array.isArray(effect.colors) && effect.colors.length >= 2'),

    # ---- a hand looked at (CR 701.20e; Gitaxian Probe) ----
    ('hand look: asked as it resolves', RESOLUTION, '    if (effect?.effect === "peekAndReveal" && effect.zone === "hand") {', '    if (false) {'),
    ('hand look: never run on its own', ZONES,
     '  if (params.zone === "hand") throw new Error("A look at a hand is shown to its looker as a resolution reaches it; it is not run on its own");\n', ''),
    ('hand look: not the looker\'s own', ASKING,
     '.filter((p) => p !== context.controller && cardsIn(state, "hand", p).length > 0)', '.filter((p) => cardsIn(state, "hand", p).length > 0)'),
    ('hand look: not an empty hand', ASKING,
     '.filter((p) => p !== context.controller && cardsIn(state, "hand", p).length > 0)', '.filter((p) => p !== context.controller)'),
    ('hand look: in turn order (CR 101.4)', ASKING, '\n      .sort((a, b) => apnap(a) - apnap(b));\n    if (!hands.length) return false;', ';\n    if (!hands.length) return false;'),
    ('hand look: hand after hand', ASKING,
     '    if (next.length) {\n      state.awaiting = {...awaiting, from: next[0], remaining: next.slice(1), cards: cardsIn(state, "hand", next[0])};',
     '    if (false) {\n      state.awaiting = {...awaiting, from: next[0], remaining: next.slice(1), cards: cardsIn(state, "hand", next[0])};'),
    ('hand look: not one who has left', ASKING,
     '    const next = (awaiting.remaining ?? []).filter((p) => !state.players[p].lost);', '    const next = awaiting.remaining ?? [];'),
    ('hand look: nothing chosen from it', ASKING,
     '    if ((indices ?? []).length !== 0) throw new Error("Nothing is chosen from a hand you look at: say you have seen it");\n', ''),
    ('hand look: a looker who leaves', ASKING,
     '  /* The looker has left the game (CR 800.4a): the spell left with them, and nobody looks. */\n  left() {\n    return [];\n  },\n', ''),
    ('hand look: shown to the looker', PROJECTION,
     ' || (asking?.handLookedBy === viewer && asking.cards.includes(id))', ''),
    ('hand look: to the looker alone', PROJECTION,
     ' || (asking?.handLookedBy === viewer && asking.cards.includes(id))', ' || (asking?.handLookedBy !== undefined && asking.cards.includes(id))'),
    ('hand look: what may be said', INDEX,
     '      if (effect.effect === "peekAndReveal" && effect.zone !== undefined && !(effect.zone === "hand"',
     '      if (false && effect.effect === "peekAndReveal" && effect.zone !== undefined && !(effect.zone === "hand"'),
    ('hand look: credited', CONSTRUCTS, '  RevealHand: "peekAndReveal",\n', ''),

    # ---- "each player who can't" (Plaguecrafter) ----
    ('who can\'t: what follows a sacrifice that must be made', ASKING,
     '    else if (Array.isArray(params.ifNot)) Object.assign(asked, {ifNot: structuredClone(params.ifNot), named: everyone});\n', ''),
    ('who can\'t: nobody able', ASKING,
     '      if (asked.optional || asked.named) return {events: [], splice: unrefused(state, asked, [])};', '      if (asked.optional) return {events: [], splice: unrefused(state, asked, [])};'),
    ('who can\'t: after the sacrifices', ASKING,
     '    const refused = awaiting.optional || awaiting.named ? unrefused(state, awaiting, decided) : null;', '    const refused = awaiting.optional ? unrefused(state, awaiting, decided) : null;'),
    ('who can\'t: the players named', ASKING, '(awaiting.everyone ?? awaiting.named).filter(', 'awaiting.everyone.filter('),
    ('who can\'t: a list of effects', SCHEMA,
     '      if (!Array.isArray(effect.ifNot) || !effect.ifNot.length || effect.keep !== undefined', '      if (!Array.isArray(effect.ifNot) || effect.keep !== undefined'),
    ('who can\'t: never beside keeping', SCHEMA,
     ' || effect.keep !== undefined || effect.keepTypes !== undefined || effect.keepPowerAtMost !== undefined)\n        errors.push({path: `${path}.ifNot`',
     ')\n        errors.push({path: `${path}.ifNot`'),

    # ---- "pay 5 life or pay {2}" (CR 119.4, 601.2b; Redirect Lightning) ----
    ('life choice: the life a choice costs', ACTIONS,
     ',\n      ...(option.some(fixedLife) ? {life: (v.life ?? 0) + option.filter(fixedLife).reduce((n, a) => n + a.amount, 0)} : {})})));', '})));'),
    ('life choice: no cost to pick', ACTIONS, '...option.filter((a) => a.atom !== "mana" && !fixedLife(a))]', '...option.filter((a) => a.atom !== "mana")]'),
    ('life choice: what it leaves for the rest', ACTIONS, 'life - extraLife - (back?.life ?? 0) - (way?.life ?? 0) - (paidLife ?? 0) - aimLife;',
     'life - (back?.life ?? 0) - (way?.life ?? 0) - (paidLife ?? 0) - aimLife;'),
    ('life choice: on the offer', ACTIONS, ' ...(extraLife ? {extraLife} : {}),', ''),
    ('life choice: paid', ACTIONS, '  return (action.extraLife ?? 0) + lifeIncrease(', '  return lifeIncrease('),
    ('life choice: another action', ACTIONS, '  && (a.extraLife ?? 0) === (b.extraLife ?? 0)\n', ''),
    ('life choice: an additional cost paid', ACTIONS, ' || action.extraMana || action.extraLife || action.escalate > 0', ' || action.extraMana || action.escalate > 0'),
    ('life choice: the ways the pool pays', ACTIONS, ' - (lifeCost ?? 0) - (action.extraLife ?? 0), x: x + (action.x ?? 0) * cost.variable}, PAY_CHOICES);', ' - (lifeCost ?? 0), x: x + (action.x ?? 0) * cost.variable}, PAY_CHOICES);'),
    ('life choice: a choice of life the compiler takes', INDEX, '            } else if (one?.atom === "payLife") {', '            } else if (false) {'),
    ('life choice: a whole number, 1 or more', INDEX,
     '              if (!(Number.isInteger(one.amount) && one.amount >= 1)) problems.push(', '              if (false) problems.push('),

    # ---- a sacrificed creature's power as it last was (CR 608.2h; Disciple of Freyalise) ----
    ('moved power: as it last was', AMOUNT,
     ' : movedFigure(value.powerOf, context, "power")\n      ?? cardFigure(', ' : cardFigure('),
    ('moved power: what was remembered moving it', AMOUNT,
     ' && was.length === (context.remembered ?? []).length ? ', ' ? '),
    ('moved power: something moved', AMOUNT, 'ref === "remembered" && was.length > 0 && ', 'ref === "remembered" && '),
]
