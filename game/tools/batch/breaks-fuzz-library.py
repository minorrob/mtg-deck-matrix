# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""G1 over Rob's whole library (tools/fuzz-live.mjs decksFromLibrary, --library) and the two stalls it found: one break a guard.

Run from the repository root, with nothing else editing the worktree:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-fuzz-library.py
"""
SUITES = ['tests/engine-waterbend.mjs', 'tests/engine-amass.mjs', 'tests/fuzz-library.mjs']
TOOL = 'tools/fuzz-live.mjs'
BREAKS = [
    ('amass makes its subtype a card type again', 'game/engine/script/effects/asking.mjs',
     'apply: {addSubtypes: [params.subtype]}, until: "ever"}', 'apply: {addTypes: [params.subtype]}, until: "ever"}'),
    ('a waterbend offer names its rider mana again', 'game/engine/rules/actions.mjs',
     '(payment.payWays || payment.waterbend ? null : riderChoices(', '(payment.payWays ? null : riderChoices('),
    ('a game that throws ends the run', TOOL,
     '  catch (error) {return {exception: String(error?.message ?? error)};}', '  catch (error) {throw error;}'),
    ('any color identity', TOOL,
     'const within = (ci, n) => (oracle(n).ci || []).every((c) => ci.includes(c));', 'const within = () => true;'),
    ('no basics to 99', TOOL,
     'for (let i = 0; deck.length < 99; i += 1) deck.push(', 'for (let i = 0; deck.length < 0; i += 1) deck.push('),
    ('more than twelve lands', TOOL,
     'pick(mine.filter(isLand), 12)', 'pick(mine.filter(isLand), 99)'),
    ('a card the table does not play', TOOL,
     'return Boolean(definition);', 'return true;'),
    ('any creature commands', TOOL,
     'playable.filter((n) => commanderLegal(definitions.get(n)))', 'playable.filter((n) => (definitions.get(n)?.types ?? []).includes("Creature"))'),
    ('a colorless commander given Plains', TOOL,
     ': "Wastes");\n    return {name: commander', ': "Plains");\n    return {name: commander'),
]
