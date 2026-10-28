# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
# Every changed sentence binding and combat assignment is exercised by a played regression.
SUITES = ['tests/sentence-load100-w0.mjs', 'tests/engine-load100-w0-combat.mjs']
SENTENCES = 'game/engine/cards/sentences.mjs'
COMBAT = 'game/engine/rules/combat.mjs'
BREAKS = [
    ('count noun comes after for each', SENTENCES,
     'const countStart = each ? startAfter(each.index + each[0].length) : 0;', 'const countStart = 0;'),
    ('effect noun comes after cost', SENTENCES,
     'const effectStart = ["activated", "mana"].includes(ability.kind) && colon >= 0 ? startAfter(colon + 1) : 0;', 'const effectStart = 0;'),
    ('word ranges exclude earlier nouns', SENTENCES,
     'const matching = list.filter((slot) => slot.i >= start);', 'const matching = list;'),
    ('scoped words used for abstraction', SENTENCES,
     'const w = pop(wordsAfter(wordStart), v);', 'const w = pop(words, v);'),
    ('selector arrays keep noun scope', SENTENCES,
     'depth === 1 && key === "targets" ? targetStarts[index] ?? wordStart : wordStart',
     'depth === 1 && key === "targets" ? targetStarts[index] ?? wordStart : 0'),
    ('each target keeps its own noun', SENTENCES,
     'targetStarts[index] ?? wordStart', 'wordStart'),
    ('implicit count multiplier is learned', SENTENCES,
     'v = {...v, times: 1};', 'v = {...v};'),
    ('one blocker permits trample division', COMBAT,
     'standing.length === 1 && hasNow(state, a.attacker, "Trample")', 'standing.length === 2 && hasNow(state, a.attacker, "Trample")'),
    ('departed walker is not an assignment recipient', COMBAT,
     'toAttacked(state, a, 1) !== null && power(state, a.attacker)', 'true && power(state, a.attacker)'),
    ('no division when there is no excess', COMBAT,
     'power(state, a.attacker) > lethalNeededFrom(state, a.attacker, standing[0])', 'true'),
    ('single blocker uses chosen assignment', COMBAT,
     'standing.length === 1 && attack.assignment?.step !== step', 'standing.length === 1'),
]
