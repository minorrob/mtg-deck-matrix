# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Train E, wave 3, worker g4: sixteen of Rob's v43 library cards (Thalia, the Survivor; Thirst for Identity; Thornfist Striker;
Thoughtweft Lieutenant; Topiary Lecturer; Triceraton Commander; Venser, Fervent Forger; Vinelasher Adept; Virus Beetle; Vraska's
Final Mercy; Vraska, the Cutting Glare; Wild Ricochet; Winter, Team Player; Winter, Tormented Loner; Wisdom of Ages; Zoo
Escapees). One break for each engine change three of them needed -- each guard, each branch -- and the suite that catches it:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-train-e-g4.py
"""
SUITES = [
    'tests/engine-train-e-g4.mjs',
    'tests/engine-cards.mjs',
]

ASKING = 'game/engine/script/effects/asking.mjs'
PERM = 'game/engine/script/effects/permanents.mjs'
STATICS = 'game/engine/rules/statics.mjs'

FITS = 'const discardFits = (state, discard, id, player) => typeof discard !== "object" || compileSelector({...discard, what: "card", zone: "hand"})(state, id, {controller: player});'
NOUN = 'const discardNoun = (discard) => (typeof discard === "object" ? `${noun(discard)} card` : "a card");'
OPTIONS = '  if (awaiting.discard) return cardsIn(state, "hand", player).filter((id) => discardFits(state, awaiting.discard, id, player))\n'
WORDS = 'const other = awaiting.discard ? `discard ${discardNoun(awaiting.discard)}` : awaiting.sacrificeCount'

MAY = '''    if (params.may === true) {
      const questions = entry.targets.map((t, index) => ({stackId: entry.stackId, index, list: Array.isArray(t)}))
        .filter((q) => !q.list && (retargetOptions(state, q)?.others ?? []).length > 0).map(({stackId, index}) => ({stackId, index}));
      if (!questions.length) return false;
      state.awaiting = {kind: "effect-choice", effect: "changeTargets", player: context.controller, questions};
      return true;
    }
'''
CHOICE = '''    if (awaiting.questions) {
      const question = awaiting.questions[0], entry = state.stack.find((e) => e.stackId === question.stackId);
      const many = (entry ? specsOf(state, entry) : []).length > 1;
      return {...copySpell.choice(state, awaiting), id: `changeTargets:${question.stackId}:${question.index}`,
        title: `${entry?.name ?? "The spell"}: keep ${many ? `its ${ordinal(question.index)} target` : "its target"}, or choose a new one?`};
    }
'''
APPLY = '    if (awaiting.questions) return copySpell.apply(state, awaiting, indices);\n'

PLAYERS = '["protection", "life-cant-change", "no-maximum-hand-size", "damage-doubled", "look-at-top"].includes(params.rule)'
EFFECTS = '  return (state.effects ?? []).some((effect) => effect.rule === rule && (effect.players ?? []).includes(player));'

BREAKS = [
    # Thirst for Identity: "then discard two cards unless you discard a creature card" (effects/asking.mjs, unlessPays'
    # `discard` a selector of the card).
    ('discard kind: only the cards it describes', ASKING, OPTIONS, OPTIONS.replace('.filter((id) => discardFits(state, awaiting.discard, id, player))', '')),
    ('discard kind: any card without a selector', ASKING, FITS, FITS.replace('typeof discard !== "object" ||', 'typeof discard === "object" &&')),
    ('discard kind: the selector read', ASKING, FITS, FITS.replace('compileSelector({...discard, what: "card", zone: "hand"})', 'compileSelector({what: "card", zone: "hand"})')),
    ('discard words: a kind of card', ASKING, NOUN, NOUN.replace('`${noun(discard)} card`', '"a card"')),
    ('discard words: a card without a selector', ASKING, NOUN, NOUN.replace('typeof discard === "object" ?', 'true ?')),
    ('discard words: said in the question', ASKING, WORDS, WORDS.replace('`discard ${discardNoun(awaiting.discard)}`', '"discard a card"')),

    # Wild Ricochet: "you may choose new targets for target instant or sorcery spell" (effects/asking.mjs, changeTargets' `may`).
    ('may: each target kept or changed', ASKING, MAY, ''),
    ('may: a counted list kept', ASKING, MAY, MAY.replace('!q.list && ', '')),
    ('may: a target with no other choice not asked about', ASKING, MAY, MAY.replace(' && (retargetOptions(state, q)?.others ?? []).length > 0', '')),
    ('may: nothing to ask, nobody asked', ASKING, MAY, MAY.replace('      if (!questions.length) return false;\n', '')),
    ('may: its controller asked', ASKING, MAY, MAY.replace('player: context.controller, questions', 'player: entry.playerId, questions')),
    ('may: copySpell\'s question', ASKING, CHOICE, ''),
    ('may: the question\'s words', ASKING, CHOICE, CHOICE.replace(', or choose a new one?`', '?`')),
    ('may: which target', ASKING, CHOICE, CHOICE.replace('ordinal(question.index)', 'ordinal(0)')),
    ('may: one target said as its target', ASKING, CHOICE, CHOICE.replace('.length > 1;', '.length > 0;')),
    ('may: answered as a copy\'s', ASKING, APPLY, ''),

    # Wisdom of Ages: "you have no maximum hand size for the rest of the game" (effects/permanents.mjs, effectUntil's
    # `players`; rules/statics.mjs, playerRuleChanged).
    ('hand size: the players it is for', PERM, PLAYERS, PLAYERS.replace(' "no-maximum-hand-size",', '')),
    ('hand size: an effect read', STATICS, EFFECTS, '  return false;'),
    ('hand size: its own rule', STATICS, EFFECTS, EFFECTS.replace('effect.rule === rule && ', '')),
    ('hand size: the players it names', STATICS, EFFECTS, EFFECTS.replace('(effect.players ?? []).includes(player)', 'true')),
]
