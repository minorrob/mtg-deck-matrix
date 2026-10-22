# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The library card load of 2026-10-21, lane L6: spells, draws and discards -- a player's hexproof from a color and "spells
you control can't be countered this turn" (Veil of Summer; CR 702.11d), and "each player may put a land card ..., then each
opponent who didn't draws a card" (Kynaios and Tiro of Meletis; CR 101.4). One break for each engine change -- each guard,
each branch -- and the suite that catches it:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-libload-l6-spells.py
"""
SUITES = [
    'tests/engine-libload-l6.mjs',
    'tests/engine-cards.mjs',
]

PROTECTION = 'game/engine/rules/protection.mjs'
FILTER = 'game/engine/script/filter.mjs'
PERMANENTS = 'game/engine/script/effects/permanents.mjs'
STATICS = 'game/engine/rules/statics.mjs'
BIND = 'game/engine/script/bind.mjs'
ASKING = 'game/engine/script/effects/asking.mjs'
INDEX = 'game/engine/cards/index.mjs'

BREAKS = [
    # ---- a player's hexproof from a color (Veil of Summer; CR 702.11d) ----
    ('player hexproof from: an opponent\'s only', PROTECTION,
     '  if (!state.objects[sourceId] || player === chooser) return false;\n',
     '  if (!state.objects[sourceId]) return false;\n'),
    ('player hexproof from: no source, no color', PROTECTION,
     '  if (!state.objects[sourceId] || player === chooser) return false;\n',
     '  if (player === chooser) return false;\n'),
    ('player hexproof from: the rule', PROTECTION,
     'e.rule === "hexproof-from" && (e.players',
     'e.rule === "hexproof-from-not" && (e.players'),
    ('player hexproof from: the players it names', PROTECTION,
     '(e.players ?? []).includes(player) && (e.colors ?? []).some((c) => colors.includes(c))',
     '(e.colors ?? []).some((c) => colors.includes(c))'),
    ('player hexproof from: its colors', PROTECTION,
     '(e.players ?? []).includes(player) && (e.colors ?? []).some((c) => colors.includes(c))',
     '(e.players ?? []).includes(player)'),
    ('player hexproof from: read where a player is targeted', FILTER,
     '      if (selector.target === true && playerHexproofFrom(state, id, chooser, context.source ?? null)) return false;\n',
     ''),
    ('player hexproof from: targets only', FILTER,
     'if (selector.target === true && playerHexproofFrom(',
     'if (playerHexproofFrom('),
    ('hexproof from: its players', PERMANENTS,
     '...(params.rule === "hexproof-from" && !params.targets',
     '...(params.rule === "hexproof-from-not" && !params.targets'),
    ('hexproof from: no players over targets', PERMANENTS,
     '"hexproof-from" && !params.targets && !params.selector',
     '"hexproof-from" && !params.selector'),
    ('hexproof from: no players over a selector', PERMANENTS,
     '"hexproof-from" && !params.targets && !params.selector',
     '"hexproof-from" && !params.targets'),
    # ---- "spells you control can't be countered this turn" (Veil of Summer) ----
    ('uncounterable this turn: read', STATICS,
     '  if ((state.effects ?? []).some((e) => e.rule === "cant-be-countered" && matchesSelector(e.affects, state, spellId, {controller: e.sourceController}))) return true;\n',
     ''),
    ('uncounterable this turn: only the spells it describes', STATICS,
     'e.rule === "cant-be-countered" && matchesSelector(e.affects, state, spellId, {controller: e.sourceController})',
     'e.rule === "cant-be-countered"'),
    ('uncounterable this turn: "you" its controller', STATICS,
     '{controller: e.sourceController}))) return true;',
     '{controller: -1}))) return true;'),
    # ---- "then each opponent who didn't draws a card" (Kynaios and Tiro of Meletis) ----
    ("each opponent who didn't: the words", BIND,
     'if (value === "each opponent who didn\'t")',
     'if (value === "each opponent who did not")'),
    ("each opponent who didn't: not who did", BIND,
     ' && !(context.whoDid ?? []).includes(p.id)).map',
     ').map'),
    ("each opponent who didn't: opponents", BIND,
     '.filter((p) => p.id !== context.controller && !(context.whoDid',
     '.filter((p) => !(context.whoDid'),
    ("each opponent who didn't: no game, nobody", BIND,
     'return (state?.players ?? []).filter((p) => p.id !== context.controller',
     'return state.players.filter((p) => p.id !== context.controller'),
    ('did: asked for', ASKING,
     '      ...(params.did === true ? {did: true} : {}),\n',
     ''),
    ('did: only a player who chose a card', ASKING,
     'awaiting.did === true && chosen.length > 0 ?',
     'awaiting.did === true ?'),
    ('did: reported', ASKING,
     '{events, ...searched, ...did, ...(awaiting.remember',
     '{events, ...searched, ...(awaiting.remember'),
    ('did: said beside remember', INDEX,
     'if (effect.effect === "chooseCard" && effect.did !== undefined && !(effect.did === true && effect.remember))',
     'if (false)'),
    ('did: true, not any value', INDEX,
     'effect.did !== undefined && !(effect.did === true && effect.remember))',
     'effect.did !== undefined && !(effect.remember))'),
]
