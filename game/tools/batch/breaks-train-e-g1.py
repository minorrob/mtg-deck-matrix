# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Train E wave 3, worker g1: sixteen of Rob's v43 library cards (Moment of Reckoning; Narset, Parter of Veils; Nissa, Leyline
Tamer; Nobody; Oracle's Restoration; Page, Loose Leaf; Poisoner's Apprentice; Procrastinate; Proctor's Gaze; Radiant Strike;
Raging Ravine; Rancorous Archaic; Rank Rat; Rearing Embermare; Restoration Seminar; Rig for War). One break for each engine
change they needed -- each guard, each branch -- and the suite that catches it:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-train-e-g1.py
"""
SUITES = [
    'tests/engine-train-e-g1.mjs',
    'tests/engine-cards.mjs',
]

INDEX = 'game/engine/cards/index.mjs'
ACTIONS = 'game/engine/rules/actions.mjs'
STACK = 'game/engine/rules/stack.mjs'
STATICS = 'game/engine/rules/statics.mjs'
TURN = 'game/engine/rules/turn.mjs'
BIND = 'game/engine/script/bind.mjs'
CONDITION = 'game/engine/script/condition.mjs'
RESOLUTION = 'game/engine/script/resolution.mjs'
SCHEMA = 'game/engine/script/schema.mjs'
ASKING = 'game/engine/script/effects/asking.mjs'
ZONES = 'game/engine/script/effects/zones.mjs'
ROOM = 'game/room/room.mjs'

FORBIDDEN_COUNT = '  if ((state.players[player]?.drawnThisTurn ?? 0) + count <= 1) return false;'
FORBIDDEN_RULE = '  return playerRuleChanged(state, "cant-draw-more-than-one", player);'
DRAW_ONE = '''  if (drawForbidden(state, player)) return;
  const library = cardsIn(state, "library", player);
  if (library.length === 0) { state.players[player].drewFromEmpty = true; return; }'''
REFUSED_WHEN = '  if (first?.effect !== "draw" || first.who !== undefined || chooser !== context.controller) return false;'
REFUSED_COUNT = '  return drawForbidden(state, chooser, typeof count === "number" ? count : amountOf(state, count, context));'
MODES_FILTER = '    const modes = (params.modes ?? []).filter((mode) => !(done && mode.once === true) && !drawRefused(state, mode, chooser, context));'
ONLY_NO = '    if (modes.length === 0 || ((done || refused) && modes.every((mode) => !(mode.effects ?? []).length))) return false;'
FIRST_HOLDS = '  if (condition.firstResolution === true && resolvedBefore !== 0) return false;'
FIRST_PROBLEM = '  if ("firstResolution" in condition && condition.firstResolution !== true) problems.push("firstResolution is true: the first time this ability has resolved this turn");\n'
ASKS = '''export const asksFirstResolution = (effects) => JSON.stringify(effects ?? []).includes('"firstResolution"');'''
COUNTED_ONLY = '  if (!asksFirstResolution(script.effects)) return undefined;\n'
TURN_AFRESH = '  if (state.resolutions?.turn !== state.turn) state.resolutions = {turn: state.turn, counts: {}};'
KEY = '  const key = `${entry.cardId}:${entry.abilityId}`, before = state.resolutions.counts[key] ?? 0;'
INCREMENT = '  state.resolutions.counts[key] = before + 1;\n'
HANDED = '    ...(resolvedBefore !== undefined ? {resolvedBefore} : {})}, rng);'
CARRIED = '      ...(context.resolvedBefore !== undefined ? {resolvedBefore: context.resolvedBefore} : {})},'
EFFECT_CONDITION = '      resolvedBefore: resolving.context.resolvedBefore})) {'
BRANCH_IF = 'lastKnown: resolving.context.lastKnown, resolvedBefore: resolving.context.resolvedBefore});'
SAME_MODE_SCHEMA = ('    if (effect.sameMode !== undefined && !(effect.sameMode === true && (effect.chooseUpTo !== undefined'
                    ' || (Number.isInteger(effect.choose) && effect.choose >= 2))))')
CHOOSE_ZERO_SCHEMA = '    if (effect.choose === 0 && effect.chooseUpTo === undefined)'
MODAL_ONLY = '    if (effect?.effect !== "modal") continue;\n    /* Or exactly so many, two or more'
OWN_CONDITION = '  if ((ability.condition && typeof ability.condition === "object" && "firstResolution" in ability.condition)'
NOT_SPELL = '    || (!["triggered", "activated"].includes(ability.kind) && asksFirstResolution(ability.effects)))'
LEAST = '  const least = exactly ?? (modal.choose === 0 ? 0 : Math.max(1, modal.choose ?? 1));'
MOST = '  const most = exactly ?? (modal.sameMode ? modal.upTo ?? least : Math.min('
PICK = '    for (let i = from; i < modal.modes.length; i += 1) pick(modal.sameMode ? i : i + 1, [...chosen, i]);'
EACH = '  const each = (spec) => (modal.sameMode === true && spec.count === undefined ? {...spec, count: {min: 1, max: 1}} : spec);'
NO_MODES = '''parts.push(a.modes.length ? a.modes.map((i) => modal?.modes?.[i]?.text ?? `mode ${i + 1}`).join(" + ") : "no modes");'''

BREAKS = [
    # "Each opponent can't draw more than one card each turn" (Narset, Parter of Veils; CR 121.2b): the static, read where cards
    # are drawn and where a choice to draw is offered.
    ('draw limit: a static rule the engine knows', STATICS, '  "cant-draw-more-than-one": "script/effects/zones.mjs",\n', ''),
    ('draw limit: the first card allowed', STATICS, FORBIDDEN_COUNT, FORBIDDEN_COUNT.replace('<= 1', '<= 0')),
    ('draw limit: the second card not', STATICS, FORBIDDEN_COUNT, FORBIDDEN_COUNT.replace('<= 1', '<= 2')),
    ('draw limit: only the players it names', STATICS, FORBIDDEN_RULE, '  return true;'),
    ("draw limit: an effect's draw", ZONES, '  if (drawForbidden(state, player)) return;\n', ''),
    ('draw limit: no draw tried from an empty library', ZONES, DRAW_ONE,
     '''  const library = cardsIn(state, "library", player);
  if (library.length === 0) { state.players[player].drewFromEmpty = true; return; }
  if (drawForbidden(state, player)) return;'''),
    ("draw limit: the draw step's draw", TURN, '  if (drawForbidden(state, player)) return null;\n', ''),
    ('draw choice: only a mode that begins with a draw', ASKING, REFUSED_WHEN, REFUSED_WHEN.replace('first?.effect !== "draw" || ', '')),
    ("draw choice: only the chooser's own draw", ASKING, REFUSED_WHEN, REFUSED_WHEN.replace(' || first.who !== undefined', '')),
    ('draw choice: only when the chooser draws', ASKING, REFUSED_WHEN, REFUSED_WHEN.replace(' || chooser !== context.controller', '')),
    ('draw choice: a "No" with no effects', ASKING, REFUSED_WHEN, REFUSED_WHEN.replace('first?.effect', 'first.effect')),
    ('draw choice: as many as it draws', ASKING, REFUSED_COUNT, '  return drawForbidden(state, chooser, 1);'),
    ('draw choice: a counted draw counted', ASKING, REFUSED_COUNT, '  return drawForbidden(state, chooser, typeof count === "number" ? count : 1);'),
    ('draw choice: the refused mode gone', ASKING, MODES_FILTER, MODES_FILTER.replace(' && !drawRefused(state, mode, chooser, context)', '')),
    ('draw choice: only "No" left, nothing asked', ASKING, ONLY_NO, ONLY_NO.replace('(done || refused)', 'done')),

    # "If this is the first time this ability has resolved this turn" (Nissa, Leyline Tamer): the condition, its count, and
    # where it may be said.
    ('first resolution: a condition key', CONDITION, '  "firstResolution",\n', ''),
    ('first resolution: false once it has resolved', CONDITION, FIRST_HOLDS, ''),
    ('first resolution: false when uncounted', CONDITION, FIRST_HOLDS, FIRST_HOLDS.replace('resolvedBefore !== 0', 'resolvedBefore > 0')),
    ('first resolution: only true', CONDITION, FIRST_PROBLEM, ''),
    ('first resolution: asked by an effect', CONDITION, ASKS, ASKS.replace("'\"firstResolution\"'", "'\"nothing\"'")),
    ('first resolution: counted only where asked', STACK, COUNTED_ONLY, ''),
    ('first resolution: a new turn counts afresh', STACK, TURN_AFRESH, '  if (!state.resolutions) state.resolutions = {turn: state.turn, counts: {}};'),
    ("first resolution: by its source's object", STACK, KEY, KEY.replace('${entry.cardId}:', '')),
    ('first resolution: each counted', STACK, INCREMENT, ''),
    ('first resolution: handed to the resolution', STACK, HANDED, '    }, rng);'),
    ('first resolution: kept by the resolution', RESOLUTION, CARRIED, '},'),
    ("first resolution: an effect's condition", RESOLUTION, EFFECT_CONDITION, '      resolvedBefore: undefined})) {'),
    ("first resolution: a branch's if", RESOLUTION, BRANCH_IF, 'lastKnown: resolving.context.lastKnown});'),
    ("first resolution: never an ability's own condition", SCHEMA, OWN_CONDITION, '  if ((false)'),
    ('first resolution: a condition not an object refused, not thrown', SCHEMA, OWN_CONDITION, OWN_CONDITION.replace(' && typeof ability.condition === "object"', '')),
    ("first resolution: never a spell's", SCHEMA, NOT_SPELL, '    || (false))'),
    ("first resolution: an activated ability's too", SCHEMA, NOT_SPELL, NOT_SPELL.replace('["triggered", "activated"]', '["triggered"]')),

    # "Choose up to four. You may choose the same mode more than once" (Moment of Reckoning; CR 700.2d).
    ('same mode: compiled', INDEX, '          ...(only.sameMode === true ? {sameMode: true} : {}),\n', ''),
    ('same mode: true only', SCHEMA, SAME_MODE_SCHEMA, SAME_MODE_SCHEMA.replace('effect.sameMode === true && ', '')),
    ('same mode: beside chooseUpTo only', SCHEMA, SAME_MODE_SCHEMA,
     SAME_MODE_SCHEMA.replace(' && (effect.chooseUpTo !== undefined || (Number.isInteger(effect.choose) && effect.choose >= 2))', '')),
    ('same mode: a malformed effect refused, not thrown', SCHEMA, MODAL_ONLY, MODAL_ONLY.replace('effect?.effect', 'effect.effect')),
    ('up to: choose 0 only beside chooseUpTo', SCHEMA, CHOOSE_ZERO_SCHEMA, '    if (false)'),
    ('up to: none chosen is offered', ACTIONS, LEAST, '  const least = exactly ?? Math.max(1, modal.choose ?? 1);'),
    ('same mode: as many as it says', ACTIONS, MOST, MOST.replace('(modal.sameMode ?', '(false ?')),
    ('same mode: a mode again', ACTIONS, PICK, PICK.replace('modal.sameMode ? i : i + 1', 'i + 1')),
    ('same mode: each target its own counted one', BIND, EACH, EACH.replace('modal.sameMode === true && ', 'false && ')),
    ('same mode: a counted target keeps its count', BIND, EACH, EACH.replace(' && spec.count === undefined', '')),
    ('no modes: said so at the table', ROOM, NO_MODES, '''parts.push(a.modes.map((i) => modal?.modes?.[i]?.text ?? `mode ${i + 1}`).join(" + "));'''),
]
