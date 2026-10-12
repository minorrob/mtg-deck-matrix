# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Train E wave 2, worker f1: sixteen of Rob's v43 library cards (Ajani's Response; Akroma, Angel of Fury; April O'Neil,
Kunoichi Trainee; Arni, Renowned Champion; Assert Perfection; Aziza, Mage Tower Captain; Banishing Betrayal; Bebop, Warthog
Warrior; Blooming Stinger; Boggart Prankster; Bogwater Lumaret; Bring to Light; Burrog Banemaker; Burrog Barrage; Champion
of the Weird; Chase Inspiration). One break for each engine change they needed -- each guard, each branch -- and the suite
that catches it:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-train-e-f1.py
"""
SUITES = [
    'tests/engine-train-e-f1.mjs',
    'tests/engine-disguise.mjs',
    'tests/engine-catalog.mjs',
    'tests/engine-cards.mjs',
]

INDEX = 'game/engine/cards/index.mjs'
ACTIONS = 'game/engine/rules/actions.mjs'
STACK = 'game/engine/rules/stack.mjs'
STATICS = 'game/engine/rules/statics.mjs'
TRIGGER = 'game/engine/rules/trigger.mjs'
STATE = 'game/engine/state/index.mjs'
AMOUNT = 'game/engine/script/amount.mjs'
BIND = 'game/engine/script/bind.mjs'
CONDITION = 'game/engine/script/condition.mjs'
VOCAB = 'game/engine/vocabulary.mjs'
TIMING = 'game/engine/keywords/timing.mjs'
ROOM = 'game/room/room.mjs'

FACE_DOWN_AS = 'const castFaceDownAs = (card) => ((card?.abilities ?? []).some((a) => a?.kind === "static" && a.rule === "morph") ? FACE_DOWN : FACE_DOWN_DISGUISED);'
BEHOLD_EXILES = 'if (beholding.length && additionalAtom(object.spell?.additionalCost, "behold")?.exile === true) {'
OWN_FILTER = ('&& matchesLastKnown(value.filter ?? {}, {types: state.objects[context.source].types ?? [], colors: state.objects[context.source].colors ?? [], '
              'controller: context.controller}, {controller: context.controller}) ')
OWN = '    const own = value.another === true && context.cast && state.objects[context.source]\n      ' + OWN_FILTER + '? 1 : 0;'
FACT_NOW = '  if (fact === undefined || state === null || !FROM_NOW.includes(key)) return fact;'
GONE = '    else if (waiting.about?.card === gone.cardId) waiting.about.lastKnown = gone;'

BREAKS = [
    # Morph (Akroma, Angel of Fury; CR 702.37): compiled as disguise is (cards/index.mjs), offered and turned face up as disguise
    # is (rules/actions.mjs), a 2/2 with no text -- no ward -- face down (state/index.mjs), and said so at the table (room.mjs).
    ('morph: compiled', INDEX, 'if (word === "disguise" || word === "morph") {', 'if (word === "disguise") {'),
    ('morph: its own static rule', INDEX, 'abilities.push({id, kind: "static", rule: word, text: ability.text, cost: structuredClone(cost), affects: {what: "card", self: true}});',
     'abilities.push({id, kind: "static", rule: "disguise", text: ability.text, cost: structuredClone(cost), affects: {what: "card", self: true}});'),
    ('morph: its keyword named', INDEX, 'keywords.push(word === "morph" ? "Morph" : "Disguise");', 'keywords.push("Disguise");'),
    ('morph: its problems named', INDEX, 'problems.push(`${ability.text}: a ${word} cost of mana, without X`);', 'problems.push(`${ability.text}: a disguise cost of mana, without X`);'),
    ('morph: a static rule the engine knows', STATICS, '  "morph": "rules/actions.mjs",\n', ''),
    ('morph: a keyword of the vocabulary', VOCAB, '  "morph",\n', ''),
    ('morph: built, in the pay family', TIMING, '"Disguise", "Morph", "Warp"', '"Disguise", "Warp"'),
    ('morph: offered face down and turned face up', ACTIONS, '(a.rule === "disguise" || a.rule === "morph")) ?? null;', 'a.rule === "disguise") ?? null;'),
    ('morph: no ward face down', STATE, FACE_DOWN_AS, 'const castFaceDownAs = (card) => FACE_DOWN_DISGUISED;'),
    ('morph: disguise keeps its ward', STATE, FACE_DOWN_AS, 'const castFaceDownAs = (card) => FACE_DOWN;'),
    ('morph: shown face down by its keyword', STATE, '...structuredClone(castFaceDownAs(object)), faceDown: true', '...structuredClone(FACE_DOWN_DISGUISED), faceDown: true'),
    ('morph: a face-down permanent by its keyword', STATE, '...(disguised ? castFaceDownAs(from) : FACE_DOWN), ...kept', '...(disguised ? FACE_DOWN_DISGUISED : FACE_DOWN), ...kept'),
    ('morph: a face-down spell by its keyword', STATE, 'return addObject(state, {...castFaceDownAs(from), ...kept, faceDown: true, disguised: true, faceDownCard}, zone, player);',
     'return addObject(state, {...FACE_DOWN_DISGUISED, ...kept, faceDown: true, disguised: true, faceDownCard}, zone, player);'),
    ('morph: the table finds its cost', ROOM, '(b.rule === "disguise" || b.rule === "morph"));', 'b.rule === "disguise");'),
    ('morph: the table says no text', ROOM, '?.rule === "morph" ? "face down for {3}, a 2/2 with no text" : "face down for {3}, a 2/2 with ward {2}"',
     '?.rule === "never" ? "face down for {3}, a 2/2 with no text" : "face down for {3}, a 2/2 with ward {2}"'),
    ('morph: the table names the keyword', ROOM, 'turn face up for its ${way?.rule ?? "disguise"} cost', 'turn face up for its disguise cost'),

    # "Behold a Goblin and exile it" (Champion of the Weird; CR 701.4a, 607.2q).
    ('behold exile: compiled only true, only in a plain additional cost', INDEX,
     'const exile = atom.exile === undefined || (exiles && atom.exile === true);', 'const exile = true;'),
    ('behold exile: true, never false', INDEX,
     'const exile = atom.exile === undefined || (exiles && atom.exile === true);', 'const exile = atom.exile === undefined || exiles;'),
    ('behold exile: a spell\'s own additional cost', INDEX, 'problems.push(...beholdProblems(atom, {exiles: true}));', 'problems.push(...beholdProblems(atom));'),
    ('behold exile: exiled as the cost is paid', ACTIONS, BEHOLD_EXILES, 'if (false) {'),
    ('behold exile: only when it says so', ACTIONS, BEHOLD_EXILES, 'if (beholding.length) {'),
    ('behold exile: exiled this turn', ACTIONS, '      for (const id of exiled) state.objects[id].exiledTurn = state.turn;\n', ''),
    ('behold exile: kept against the spell', ACTIONS,
     '      if (exiled.length) (state.links ??= {})[entry.objectId] = [...(state.links[entry.objectId] ?? []), ...exiled];\n', ''),
    ('behold exile: carried to the permanent', STACK, '      state.links[arrived] = state.links[entry.objectId];\n', ''),
    ('behold exile: the spell\'s link spent', STACK, '      delete state.links[entry.objectId];\n', ''),

    # "If you've cast another instant or sorcery spell this turn" (Burrog Barrage): spellsCastThisTurn's `another`.
    ('another: a key of the grammar', AMOUNT, '"controlledBy", "named", "another"];', '"controlledBy", "named"];'),
    ('another: refused but for "you"', AMOUNT,
     '''  if ("another" in value && !(value.another === true && value.spellsCastThisTurn === "you")) problems.push('another is true, beside spellsCastThisTurn: "you"');\n''', ''),
    ('another: its own cast left out', AMOUNT, OWN, '    const own = 0;'),
    ('another: only when it says so', AMOUNT, OWN, OWN.replace('value.another === true && ', '')),
    ('another: a copy was not cast', AMOUNT, OWN, OWN.replace('context.cast && ', '')),
    ('another: only a spell the filter fits', AMOUNT, OWN, OWN.replace(OWN_FILTER, '')),
    ('another: subtracted', AMOUNT, 'n = player !== null ? castBy(player) - own : 0;', 'n = player !== null ? castBy(player) : 0;'),
    ('another: the cast reaches a compare', CONDITION, '      ...(cast !== undefined ? {cast} : {})};', '      };'),

    # "Where X is that creature's power" (Arni, Renowned Champion; CR 608.2h).
    ('that creature gone: kept as it left', TRIGGER, GONE + '\n', ''),
    ('that creature gone: only the trigger about it', TRIGGER, GONE, '    else if (waiting.about) waiting.about.lastKnown = gone;'),
    ('that creature gone: its power read', AMOUNT, '(aboutWas(value.powerOf, context)?.power ?? context.lastKnown?.power ?? 0)', '(context.lastKnown?.power ?? 0)'),
    ('that creature gone: its toughness read', AMOUNT, '(aboutWas(value.toughnessOf, context)?.toughness ?? context.lastKnown?.toughness ?? 0)', '(context.lastKnown?.toughness ?? 0)'),
    ('that creature gone: only "that card"', AMOUNT, 'const aboutWas = (ref, context) => (ref === "that card" ? context.about?.lastKnown ?? null : null);',
     'const aboutWas = (ref, context) => context.about?.lastKnown ?? null;'),

    # A target's power and toughness as it now is (Assert Perfection, Burrog Barrage; CR 608.2h).
    ('target now: read as it is', BIND, FACT_NOW, '  return fact;'),
    ('target now: power and toughness alone', BIND, FACT_NOW, '  if (fact === undefined || state === null) return fact;'),
    ('target now: given the state', BIND, '    const fact = factValue(value, context, state);', '    const fact = factValue(value, context);'),
    ('target now: only while it is the same object', BIND, '  if (!state.objects[id]) return fact;\n', ''),
    ('target now: toughness too', BIND, '  return key === "powerOf" ? powerOf(state, id) : toughnessOf(state, id);', '  return key === "powerOf" ? powerOf(state, id) : fact;'),
]
