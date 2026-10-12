# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Train D, worker c: "for each opponent, destroy up to one target creature or planeswalker that player controls" (Lich's
Relic's reflexive trigger; script/bind.mjs `forEach`, script/schema.mjs). Each break must turn a suite red.

    python game/tools/batch/breaks.py game/tools/batch/breaks-train-d-c.py
"""
SUITES = ['tests/engine-target-constraints.mjs', 'tests/engine-cards.mjs']
BIND = 'game/engine/script/bind.mjs'
SCHEMA = 'game/engine/script/schema.mjs'
BREAKS = [
    # bind.mjs: the spec key set aside from the selector.
    ('forEach is no selector key', BIND, '"share", "forEach"]);', '"share"]);'),
    # Only what an opponent controls.
    ('an opponent\'s only', BIND, '...(forEachOpponent(spec) ? {controller: "opponent"} : {}), ', ''),
    # As many as there are opponents: no most but the cap.
    ('as many as the opponents', BIND, '  if (forEachOpponent(spec)) return {min: 0, max: null};\n', ''),
    # One of each opponent's: the cap, its key on each option, and the refusal.
    ('the cap', BIND, 'const capped = oneOfEach(spec) ?', 'const capped = spec?.differentControllers === true ?'),
    ('each option\'s controller', BIND, '...(oneOfEach(spec) && c.kind === "object"', '...(spec?.differentControllers === true && c.kind === "object"'),
    ('two of one opponent\'s refused', BIND, '  if (!oneOfEach(spec)) return null;\n', '  if (spec?.differentControllers !== true) return null;\n'),
    # Each kept with the opponent it was chosen for, and held to that player as it resolves (CR 608.2b).
    ('the opponent it was chosen for', BIND, 'const target = forEachOpponent(spec) ? {...c, forPlayer: controllerOf(state, c.id)} : c;', 'const target = c;'),
    ('held to that player as it resolves', BIND,
     '  if (forEachOpponent(spec) && state.objects[chosen.id] && controllerOf(state, chosen.id) !== chosen.forPlayer) return false;\n', ''),
    ('a target gone is not asked whose it is', BIND, 'if (forEachOpponent(spec) && state.objects[chosen.id] && controllerOf', 'if (forEachOpponent(spec) && controllerOf'),
    # The words.
    ('the question\'s words', BIND, 'const words = forEachOpponent(spec) ?', 'const words = false ?'),
    ('the cap\'s words', BIND, 'differentControllersCap(state, options, name, forEachOpponent(spec))', 'differentControllersCap(state, options, name)'),
    ('the refusal\'s words', BIND, '    if (seen.has(p)) return forEachOpponent(spec)\n', '    if (seen.has(p)) return false\n'),
    # schema.mjs: a reflexive trigger's target may say it, in the one form built.
    ('the schema reads it', SCHEMA, 'const {count, forEach, ...selector} = spec && typeof spec', 'const {count, ...selector} = spec && typeof spec'),
    ('the schema refuses another form', SCHEMA, 'if (forEach !== undefined && !(forEach === "opponent"', 'if (false && !(forEach === "opponent"'),
    ('for each opponent, not each player', SCHEMA, '!(forEach === "opponent" && (count?.min', '!((count?.min'),
    ('none at least', SCHEMA, '(count?.min ?? 0) === 0 && count?.max === 1', 'count?.max === 1'),
    ('up to one', SCHEMA, '&& count?.max === 1\n', '\n'),
    ('of permanents', SCHEMA, '.every((one) => (one?.what ?? "permanent") === "permanent")))', '.every(() => true)))'),
]
