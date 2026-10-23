# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The card load of 2026-10-23, lane L5 (tokens, counters and sacrifice): one break for each engine change.

- Counters divided at activation (The Earth Crystal; CR 601.2d): script/amount.mjs `dividedAmong`, the targets as chosen
  carried to the resolution (rules/stack.mjs, script/resolution.mjs), and cards/index.mjs refusing a division that would
  be a choice.
- "Repeat the following process X times" (Torment of Hailfire): script/resolution.mjs `times`, cards/index.mjs refusing it
  where nothing asks; unlessPays offering a sacrifice or a discard (script/effects/asking.mjs).
- Exactly X targets (Curse of the Swine): script/bind.mjs countOf, script/schema.mjs, rules/actions.mjs offerSpecs.
- multiplyCounters by selector and kind (Bristly Bill), layer affects nonSupertypes and commander (Flowering of the White
  Tree, Bastion Protector), "not chosen this turn" (Monument to Endurance), mostSharingName (Mechanized Production),
  unlessPays `atMost` (Well of Lost Dreams) and tapping "that card" (Charismatic Conqueror).

Run from the repository root, with nothing else editing the worktree:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-w4d-l5-tokens.py
"""
SUITES = ['tests/engine-w4d-tokens.mjs', 'tests/engine-cards.mjs']
AM = 'game/engine/script/amount.mjs'
RE = 'game/engine/script/resolution.mjs'
ST = 'game/engine/rules/stack.mjs'
IX = 'game/engine/cards/index.mjs'
AS = 'game/engine/script/effects/asking.mjs'
BI = 'game/engine/script/bind.mjs'
SC = 'game/engine/script/schema.mjs'
AC = 'game/engine/rules/actions.mjs'
LA = 'game/engine/rules/layers.mjs'
RS = 'game/engine/script/effects/resources.mjs'
TR = 'game/engine/rules/trigger.mjs'
BREAKS = [
    # The Earth Crystal: the division
    ('a division counted as the whole total for each target', AM,
     'n = among > 0 ? Math.floor(value.dividedAmong.total / among) : 0;', 'n = value.dividedAmong.total;'),
    ('a division counted from the targets still legal', ST,
     '    ...(entry.targets ? {targetsChosen: entry.targets} : {}),\n', ''),
    ('the targets as chosen lost as the resolution begins', RE,
     '      ...(context.targetsChosen ? {targetsChosen: context.targetsChosen} : {}),\n', ''),
    ('a malformed division taken for an amount', AM,
     'if ("dividedAmong" in value && !(Number.isInteger', 'if (false && !(Number.isInteger'),
    ('a division that would be a choice let through', IX,
     'problems.push(`${ability.text}: a total divided among targets where the division would be a choice`);', ';'),
    # Torment of Hailfire
    ('a round repeated once whatever X is', RE,
     'const times = effect.times === undefined ? 1 : amountOf(state, effect.times, resolving.context);', 'const times = 1;'),
    ('times let through on a round that asks nothing', IX,
     'problems.push("repeatFor: `times` repeats a round of effects that ask, for each of what it ranges over");', ';'),
    ('a sacrifice-or-discard offering the sacrifice alone', AS,
     '    if (!awaiting.discard) return sacrifices;\n', '    return sacrifices;\n'),
    ('the sacrifice-or-discard question worded as a discard', AS,
     '  const other = awaiting.discard && awaiting.sacrifice ? `sacrifice ${awaiting.sacrifice.nonTypes?.includes("Land") ? "a nonland permanent" : noun(awaiting.sacrifice)} or discard ${discardNoun(awaiting.discard)}`\n    : awaiting.discard',
     '  const other = awaiting.discard'),
    # Curse of the Swine
    ('exactly X read as up to X', BI,
     'min: count.min === "X" ? x : count.min ?? 0', 'min: 0'),
    ('min "X" refused by the schema', SC,
     ' || (count.min === "X" && count.max === "X"))\n  && (count.max', ')\n  && (count.max'),
    ('max "X" beside min "X" refused by the schema', SC,
     '(x && count.max === "X" && (count.min ?? 0) === 0) || (count.min === "X" && count.max === "X") ||', '(x && count.max === "X" && (count.min ?? 0) === 0) ||'),
    ('the X of an offer not known as its targets are picked', AC,
     ', ...(Number.isInteger(action.x) ? {x: action.x} : {})};', '};'),
    # Bristly Bill
    ('multiplyCounters by selector doubling nothing', RS,
     'params.selector ? selectMatching(state, params.selector, context) : params.targets ?? []', 'params.targets ?? []'),
    ('multiplyCounters doubling every kind', RS,
     'if (n > 0 && (params.counter === undefined || kind === params.counter))', 'if (n > 0)'),
    # Flowering of the White Tree, Bastion Protector
    ('nonlegendary read as any creature', LA,
     '  if (rule.nonSupertypes && rule.nonSupertypes.some((t) => (current.supertypes ?? []).includes(t))) return false;\n', ''),
    ('a commander anthem on every creature', LA,
     '  if (rule.commander === true && state.objects[current.id]?.commander !== true) return false;\n', ''),
    ('nonSupertypes and commander no layer affects keys', LA,
     '"attacking", "zone", "nonSupertypes", "commander"]);', '"attacking", "zone"]);'),
    # Monument to Endurance
    ('unchosen "turn" refused', IX,
     '!((effect.unchosen === true || effect.unchosen === "turn") && ability.kind', '!((effect.unchosen === true) && ability.kind'),
    ('unchosen "turn" read as ever', IX,
     '...(lone.unchosen === true || lone.unchosen === "turn" ? {unchosen: lone.unchosen} : {}),', '...(lone.unchosen ? {unchosen: true} : {}),'),
    ('the modes of an earlier turn still taken', TR,
     '  if (unchosen === "turn" && object.modesChosenOn?.[abilityId] !== state.turn) return [];\n', ''),
    ('the turn of the modes chosen not kept', TR,
     '      if (modal.unchosen === "turn") source.modesChosenOn = {...(source.modesChosenOn ?? {}), [entry.abilityId]: state.turn};\n', ''),
    # Mechanized Production
    ('the most sharing a name counted as the names', AM,
     'n = Math.max(0, ...byName.values());', 'n = byName.size;'),
    # Well of Lost Dreams
    ('X offered past its most', AS,
     'for (let x = 0; x <= most && canPayGeneric(state, player, x); x += 1)', 'for (let x = 0; canPayGeneric(state, player, x); x += 1)'),
    ('atMost not counted', AS,
     '      ...(params.amountX === true && params.atMost !== undefined ? {mostX: Math.max(0, amountOf(state, params.atMost, context))} : {}),\n', ''),
    # Charismatic Conqueror
    ('"that card" not the permanent to tap', AS,
     '      ...(params.tap === "that card" ? {tapIds: context.about?.card !== undefined && context.about.card !== null ? [context.about.card] : []} : {}),\n', ''),
    ('the permanent to tap offered to nobody', AS,
     '  if (awaiting.tapIds) return awaiting.tapIds.filter', '  if (false) return awaiting.tapIds.filter'),
    ('tapping that card worded as tapping a permanent', AS,
     '    : awaiting.tapIds ? `tap ${awaiting.tapIds.map((id) => state.objects[id]?.card ?? "that permanent").join(", ") || "that permanent"}`\n', ''),
    ('"that card" read as a selector by the schema', SC,
     '    if (effect.tap !== "that card") checkSelector(effect.tap, `${path}.tap`, errors);', '    checkSelector(effect.tap, `${path}.tap`, errors);'),
]
