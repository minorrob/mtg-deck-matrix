# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Train D, worker a: Countersculpt, Jace's Machinations, Way of the Wildspeaker, Glen Elendra Guardian, Ricochet Trap and
Pestermite. One break for each engine change they needed -- each guard, each branch -- and the suite that catches it:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-train-d-a.py
"""
SUITES = [
    'tests/engine-empower-jace.mjs',
    'tests/engine-entered-this-turn.mjs',
    'tests/engine-history-records.mjs',
    'tests/engine-compile.mjs',
    'tests/engine-cards.mjs',
]

AMOUNT = 'game/engine/script/amount.mjs'
FILTER = 'game/engine/script/filter.mjs'
TRIGGER = 'game/engine/rules/trigger.mjs'
ACTIONS = 'game/engine/rules/actions.mjs'
STATICS = 'game/engine/rules/statics.mjs'
COMPILE = 'game/engine/cards/compile.mjs'

OPPONENTS = 'n = Math.max(0, ...state.players.filter((p) => p.id !== context.controller && !p.lost).map((p) => castBy(p.id)));'

BREAKS = [
    # Ricochet Trap: "if an opponent cast a blue spell this turn" (script/amount.mjs, spellsCastThisTurn "an opponent").
    ('an opponent: the branch', AMOUNT,
     '    if (value.spellsCastThisTurn === "an opponent")\n',
     '    if (false)\n'),
    ('an opponent: not its controller', AMOUNT, OPPONENTS,
     'n = Math.max(0, ...state.players.filter((p) => !p.lost).map((p) => castBy(p.id)));'),
    ('an opponent: still in the game', AMOUNT, OPPONENTS,
     'n = Math.max(0, ...state.players.filter((p) => p.id !== context.controller).map((p) => castBy(p.id)));'),
    ('an opponent: the most of one, not all of them added', AMOUNT, OPPONENTS,
     'n = state.players.filter((p) => p.id !== context.controller && !p.lost).map((p) => castBy(p.id)).reduce((a, b) => a + b, 0);'),
    ('an opponent: the schema takes it', AMOUNT,
     '!["you", "that player", "an opponent"].includes(value.spellsCastThisTurn)',
     '!["you", "that player"].includes(value.spellsCastThisTurn)'),
    ('an opponent: the schema still refuses anyone else', AMOUNT,
     '!["you", "that player", "an opponent"].includes(value.spellsCastThisTurn)',
     'false'),
    # A last known snapshot's colors (script/filter.mjs): the spells cast this turn, as each was cast.
    ('colors: a key a snapshot answers', FILTER,
     '  "keywords", "counters", "colors"];',
     '  "keywords", "counters"];'),
    ('colors: read', FILTER,
     '  if (s.colors && !s.colors.every((color) => (lki.colors ?? []).includes(color))) return false;\n',
     ''),
    # And what entered this turn keeps its colors too, so a filter's colors is never read as none (rules/trigger.mjs).
    ('entered: its colors kept', TRIGGER,
     ',\n      colors: [...(now.colors ?? [])]});',
     '});'),
    # Jace's Machinations: loyalty abilities at instant speed (rules/statics.mjs, rules/actions.mjs).
    ('loyalty at instant speed: read', ACTIONS,
     ' && !(ability.loyalty !== undefined && ruleChanged(state, "loyalty-at-instant-speed", id))) continue;',
     ') continue;'),
    ('loyalty at instant speed: loyalty abilities only', ACTIONS,
     '!(ability.loyalty !== undefined && ruleChanged(state, "loyalty-at-instant-speed", id))',
     '!ruleChanged(state, "loyalty-at-instant-speed", id)'),
    ('loyalty at instant speed: in the closed list', STATICS,
     '  "loyalty-at-instant-speed": "rules/actions.mjs",\n',
     ''),
    # Countersculpt's smoke game: a Jace card to behold, a planeswalker type no changeling has (cards/compile.mjs).
    ('smoke: a Jace to behold', COMPILE,
     '((a.selector?.subtypes ?? []).includes("Jace") ? "Smoke Jace" : "Smoke Changeling")',
     '"Smoke Changeling"'),
]
