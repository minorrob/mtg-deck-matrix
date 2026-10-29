# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Wave 4b, lane j2: changing targets (CR 115.7), the top of a library put back in any order, "whenever you cast or copy"
(CR 707.10) and an amount a delayed trigger remembers -- and what the rest of the lane's cards needed: a spell's mana value
with X on the stack (CR 202.3e), "lose hexproof and indestructible" (Shadowspear), a basic land type's mana ability (CR
305.7), a token entering tapped (CR 111.1, 614.12). One break for each engine change -- each guard, each branch, each
credit -- and the suite that catches it:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-wave4b-j2.py
"""
SUITES = [
    'tests/engine-rearrange-copies-4b.mjs',
    'tests/engine-vocabulary.mjs',
    'tests/engine-cards.mjs',
]

INDEX = 'game/engine/cards/index.mjs'
TRIGGER = 'game/engine/rules/trigger.mjs'
STATE = 'game/engine/state/index.mjs'
BIND = 'game/engine/script/bind.mjs'
AMOUNT = 'game/engine/script/amount.mjs'
ASKING = 'game/engine/script/effects/asking.mjs'
EFFECTS = 'game/engine/script/effects/index.mjs'
VOCAB = 'game/engine/vocabulary.mjs'
LAYERS = 'game/engine/rules/layers.mjs'
PROTECTION = 'game/engine/rules/protection.mjs'
REPLACEMENT = 'game/engine/rules/replacement.mjs'
PERM = 'game/engine/script/effects/permanents.mjs'
CONSTRUCTS = 'game/tools/engine-constructs.mjs'

BREAKS = [
    # ---- "whenever you cast or copy" (magecraft) ----
    ('cast-or-copy: the trigger keeps orCopy', INDEX,
     '    ...(t.orCopy === true ? {orCopy: true} : {}),\n', ''),
    ('cast-or-copy: a copy event watched', TRIGGER,
     'const copied = condition.orCopy === true && condition.on === "GameEventSpellAbilityCast" && event.kind === "GameEventSpellCopied";',
     'const copied = false;'),
    ('cast-or-copy: only a copy you made', TRIGGER,
     '    if (!whoseIs(condition.caster ?? "you", copier, controller)) return [];\n', ''),
    ('cast-or-copy: only an instant or sorcery copied', TRIGGER,
     '    if (condition.filter && !matchesSelector({...condition.filter, what: "spell"}, state, spell, {controller, source: sourceId})) return [];\n    return [{card: spell, player: copier, ...spellWas(state, spell)}];',
     '    return [{card: spell, player: copier, ...spellWas(state, spell)}];'),

    # ---- "at the beginning of your next main phase" (Mana Drain) ----
    ('next main: a moment a delayed trigger may wait for', INDEX,
     '"your next declare attackers", "your next main"];', '"your next declare attackers"];'),
    ('next main: the postcombat main phase is a moment', TRIGGER,
     'MAIN1: "precombat main", MAIN2: "postcombat main", COMBAT_END', 'MAIN1: "precombat main", COMBAT_END'),
    ('next main: due at either main phase', TRIGGER,
     '        || ((moment === "precombat main" || moment === "postcombat main") && d.at === "your next main" && d.controller === turnOf)\n', ''),
    ('next main: its controller\'s turn only', TRIGGER,
     '(moment === "precombat main" || moment === "postcombat main") && d.at === "your next main" && d.controller === turnOf)',
     '(moment === "precombat main" || moment === "postcombat main") && d.at === "your next main")'),

    # ---- X on the stack (CR 202.3e) ----
    ('X on the stack: its chosen value', STATE,
     '  return (state?.stack ?? []).find((e) => e.objectId === id)?.x ?? 0;\n', '  return 0;\n'),
    ('X on the stack: a fact read with it', BIND,
     'manaValue(parseManaCost(valueCostOf(o)), {x: xOnStack(state, t.id)})', 'manaValue(parseManaCost(valueCostOf(o)))'),
    ('X on the stack: an amount read with it', AMOUNT,
     'manaValue(parseManaCost(valueCostOf(state.objects[id])), {x: xOnStack(state, id)})', 'manaValue(parseManaCost(valueCostOf(state.objects[id])))'),

    # ---- rearrangeTop ----
    ('rearrangeTop: no player, nothing', ASKING,
     '    const [owner] = playersFor(state, params.who, context.controller);\n    if (owner === undefined) return false;\n',
     '    const [owner] = playersFor(state, params.who, context.controller);\n'),
    ('rearrangeTop: an empty library, nothing', ASKING,
     '    if (looked.length === 0) return false;\n    if (looked.length === 1) { knowsTop', '    if (looked.length === 1) { knowsTop'),
    ('rearrangeTop: one card, no question', ASKING,
     '    if (looked.length === 1) { knowsTop(state, context.controller, owner, looked); return false; }\n', ''),
    ('rearrangeTop: one card, looked at', ASKING,
     '{ knowsTop(state, context.controller, owner, looked); return false; }', '{ return false; }'),
    ('rearrangeTop: whose library, said', ASKING,
     'const whose = awaiting.owner === awaiting.player ? "your"', 'const whose = true ? "your"'),
    ('rearrangeTop: the order answered', ASKING,
     '    const back = inOrder(awaiting.cards, indices).filter((id) => library.includes(id));',
     '    const back = awaiting.cards.filter((id) => library.includes(id));'),
    ('rearrangeTop: a card gone is left where it went', ASKING,
     '    const back = inOrder(awaiting.cards, indices).filter((id) => library.includes(id));',
     '    const back = inOrder(awaiting.cards, indices);'),
    ('rearrangeTop: the looker knows the new top', ASKING,
     '    library.unshift(...back);\n    knowsTop(state, awaiting.player, awaiting.owner, back);\n', '    library.unshift(...back);\n'),
    ('rearrangeTop: a looker who left', ASKING,
     '  /* The looker has left the game (CR 800.4a): the cards stay where they are, in the order they were. */\n  left() {\n    return [];\n  },',
     '  /* The looker has left the game (CR 800.4a): the cards stay where they are, in the order they were. */\n  left(state, awaiting) {\n    return {another: awaiting};\n  },'),
    ('rearrangeTop: it asks', EFFECTS, '  "explore",\n  /* "Look at the top three', '  "explore"]);\n  /* "Look at the top three'),
    ('rearrangeTop: in the vocabulary', VOCAB, '    "rearrangeTop",\n  ]),', '  ]),'),

    # ---- "lose hexproof and indestructible" (Shadowspear) ----
    ('lose keywords: taken away', LAYERS,
     '    current.keywords = current.keywords.filter((word) => since.has(word) || !change.removeKeywords.includes(word));\n', ''),
    ('lose keywords: a keyword counter put on since keeps its keyword', LAYERS,
     'const since = new Set((current.counterKeywords ?? []).filter(([, stamp]) => stamp > (effect.timestamp ?? 0)).map(([word]) => word));\n    current.keywords = current.keywords.filter',
     'const since = new Set();\n    current.keywords = current.keywords.filter'),
    ('lose keywords: remembered for the later layers', LAYERS,
     '    current.keywordsLost = [...(current.keywordsLost ?? []), {words: [...change.removeKeywords], timestamp: effect.timestamp ?? 0}];\n', ''),
    ('lose keywords: a pump older than it gives nothing', LAYERS,
     '    if (!current.keywords.includes(word) && !(current.keywordsLost ?? []).some((lost) => lost.words.includes(word) && lost.timestamp > (effect.timestamp ?? 0))) current.keywords.push(word);',
     '    if (!current.keywords.includes(word)) current.keywords.push(word);'),
    ('lose keywords: a pump newer than it gives its keyword', LAYERS,
     'lost.words.includes(word) && lost.timestamp > (effect.timestamp ?? 0)', 'lost.words.includes(word)'),
    ('lose hexproof: "hexproof from" with it', PROTECTION,
     '  const lostAt = Math.max(-1, ...(state.effects ?? []).filter((e) => (e.apply?.removeKeywords ?? []).includes("Hexproof") && (e.affects?.ids ?? []).includes(id)).map((e) => e.timestamp ?? 0));',
     '  const lostAt = -1;'),
    ('lose hexproof: one given after it is had', PROTECTION,
     'e.rule === "hexproof-from" && (e.timestamp ?? 0) > lostAt && ', 'e.rule === "hexproof-from" && lostAt < 0 && '),

    # ---- a basic land type's mana ability (CR 305.7) ----
    ('basic land types: their mana abilities', LAYERS,
     '      if (layer === 4) intrinsicMana(state, id, current);\n', ''),
    ('basic land types: not the ones it prints', LAYERS,
     '    if (!color || (own.includes(type) && !current.lostAbilities)) continue;', '    if (!color) continue;'),
    ('basic land types: abilities change with them', LAYERS,
     '\n    || [...(apply.addSubtypes ?? []), ...(apply.setSubtypes ?? [])].some((type) => BASIC_LAND_MANA[type])));', '));'),

    # ---- a token entering tapped (CR 111.1, 614.12) ----
    ('token enters tapped: by a replacement', PERM,
     ' || entry.prepared.entering.tapped === true;', ';'),
    ('token entry: untapped costs life', 'game/engine/rules/pre-entry.mjs',
     'emitRuleEvents(state, runEffect(state, {effect: "loseLife", amount: data.life}, {controller: frame.player, source: frame.objectId}));', ''),
    ('token enters tapped: read as a permanent', REPLACEMENT,
     '      if (entering.zone === "battlefield" && entering.token === true)\n        return entering.id !== holder.id && compileSelector',
     '      if (false)\n        return entering.id !== holder.id && compileSelector'),
    ('token enters tapped: never by its own ability for others', REPLACEMENT,
     '        return entering.id !== holder.id && compileSelector', '        return compileSelector'),

    # ---- "change a target ... to this creature" (Spellskite) ----
    ('to this: the form', ASKING, '    if (params.to === "self") {', '    if (false) {'),
    ('to this: never a target another must differ from', ASKING,
     '        && !specs.some((spec, j) => j !== index && (spec?.distinctFrom ?? []).includes(index) && [].concat(entry.targets[j] ?? []).some(isSelf))\n', ''),
    ('to this: read against its other targets', ASKING,
     'retargetOptions(state, {stackId: entry.stackId, index}, {withOthers: true})', 'retargetOptions(state, {stackId: entry.stackId, index})'),
    ('to this: one it could be, no question', ASKING,
     '      if (indices.length === 1) return {events: changeTargets.retarget(state, entry, indices[0], {kind: "object", id: self})};\n', ''),
    ('to this: which one, when more could', ASKING,
     'options: indices.map((index, i) => ({index: i, label:', 'options: indices.slice(0, 1).map((index, i) => ({index: i, label:'),
    ('to this: the one answered', ASKING,
     'changeTargets.retarget(state, entry, option.targetIndex, {kind: "object", id: awaiting.toSelf.self})',
     'changeTargets.retarget(state, entry, awaiting.toSelf.indices[0], {kind: "object", id: awaiting.toSelf.self})'),

    # ---- the catalog's credits ----
    ('credit: RearrangeTopOfLibrary', CONSTRUCTS, '  RearrangeTopOfLibrary: "rearrangeTop",\n', ''),
    ('credit: SpellCastOrCopy', CONSTRUCTS, '  SpellCastOrCopy: "spell cast",\n', ''),
    ('credit: ChangeTargets', CONSTRUCTS, '  ChangeTargets: "changeTargets",\n', ''),
]
