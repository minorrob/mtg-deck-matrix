# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Train D, worker b: Rob's v43 cards Nylea, Keen-Eyed; Eldrazi Monument; Simic Ascendancy; Ezuri, Claw of Progress.

The engine changes they needed, each broken in turn:
  - the "counter added" trigger on any permanent a filter describes, about it and that many (cards/index.mjs,
    rules/trigger.mjs) and the amount `countersPut` (script/amount.mjs) -- Simic Ascendancy;
  - counters put on players, putCounter's `who` (effects/resources.mjs), counted by `countersOn: "you"` (script/amount.mjs),
    the compiler's refusals (cards/index.mjs), and the credit for "Your experience counters" (game/tools/engine-constructs.mjs)
    -- Ezuri, Claw of Progress.

Run from the repository root, with nothing else editing the worktree:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-train-d-b.py
"""
SUITES = ['tests/engine-counters-put.mjs', 'tests/engine-cards.mjs', 'tests/generators.mjs']
INDEX = 'game/engine/cards/index.mjs'
TRIGGER = 'game/engine/rules/trigger.mjs'
AMOUNT = 'game/engine/script/amount.mjs'
RESOURCES = 'game/engine/script/effects/resources.mjs'
BREAKS = [
    # ---- Simic Ascendancy: "whenever one or more +1/+1 counters are put on a creature you control" ----
    ('counter added: not on any permanent', INDEX,
     ': t.who === "any" && t.each === undefined ? {on: "GameEventCardCounters", counterAdded: true, counter: t.counter, who: "any", ...(t.filter ? {filter: t.filter} : {})} : null),',
     ': null),'),
    ('counter added: once for each counter beside any', INDEX,
     ': t.who === "any" && t.each === undefined ? {',
     ': t.who === "any" ? {'),
    ('counter added: its filter dropped', INDEX,
     ', who: "any", ...(t.filter ? {filter: t.filter} : {})} : null),',
     ', who: "any"} : null),'),
    ('counter added: no kind of counter', INDEX,
     '"counter added": (t) => (typeof t.counter !== "string" ? null : (t.who ?? "self") === "self" ?',
     '"counter added": (t) => ((t.who ?? "self") === "self" ?'),
    ('about the creature and that many: not said', TRIGGER,
     '  if (condition.on === "GameEventCardCounters" && condition.counterAdded && condition.who === "any")\n'
     '    return matches(state, event, condition, sourceId, controller) ? [{card: fields.card?.cardId, amount: (fields.newValue ?? 0) - (fields.oldValue ?? 0)}] : [];\n',
     ''),
    ('that many: all it has, not those put on', TRIGGER,
     'amount: (fields.newValue ?? 0) - (fields.oldValue ?? 0)}] : [];',
     'amount: fields.newValue ?? 0}] : [];'),
    ('on any permanent: read as on this one', TRIGGER,
     '(condition.who === "any" ? fits(state, fields.card?.cardId, condition, sourceId, controller) : fields.card?.cardId === sourceId)',
     'fields.card?.cardId === sourceId'),
    ('on any permanent: the filter not asked', TRIGGER,
     'condition.who === "any" ? fits(state, fields.card?.cardId, condition, sourceId, controller) :',
     'condition.who === "any" ? true :'),
    ('countersPut: counts nothing', AMOUNT,
     '  else if ("countersPut" in value) n = context.about?.amount ?? 0;\n',
     ''),
    ('countersPut: anything accepted', AMOUNT,
     '  if ("countersPut" in value && value.countersPut !== true) problems.push("countersPut is true");\n',
     ''),
    # ---- Ezuri, Claw of Progress: "you get an experience counter", "the number of experience counters you have" ----
    ('countersOn: any word accepted', AMOUNT,
     '''  if ("countersOn" in value && typeof value.countersOn === "string" && !["self", "that card", "remembered", "you"].includes(value.countersOn))\n'''
     '''    problems.push('countersOn is "self", "that card", "remembered", "you" or a target');\n''',
     ''),
    ('countersOn "you": not a player', AMOUNT,
     '(value.countersOn === "you" || targetPlayer(value.countersOn, context) !== null)',
     '(targetPlayer(value.countersOn, context) !== null)'),
    ('countersOn "you": the first player, whoever counts', AMOUNT,
     'value.countersOn === "you" ? context.controller : targetPlayer(value.countersOn, context)',
     'value.countersOn === "you" ? 0 : targetPlayer(value.countersOn, context)'),
    ('counters on players: never put on', RESOURCES,
     'for (const player of params.who !== undefined ? playersFor(state, params.who, context.controller) : []) {\n'
     '    const count = playerCountersPlaced(',
     'for (const player of []) {\n'
     '    const count = playerCountersPlaced('),
    ('counters on players: no replacement asked', RESOURCES,
     'const count = playerCountersPlaced(state, player, params.counter, params.count ?? 1, putterOf(params, context));',
     'const count = params.count ?? 1;'),
    ('counters on players: put by the first player', RESOURCES,
     'params.count ?? 1, putterOf(params, context));',
     'params.count ?? 1, 0);'),
    ('counters on players: none put on, a kind kept', RESOURCES,
     'if (count > 0) counters[params.counter] = ',
     'counters[params.counter] = '),
    ('compiler: counters on players of any kind', INDEX,
     'if (effect.effect === "putCounter" && effect.who !== undefined && !(typeof effect.counter === "string" && !["chosen", "+1/+1", "poison"].includes(effect.counter)))',
     'if (false)'),
    ('compiler: counters on players of no kind', INDEX,
     '!(typeof effect.counter === "string" && !["chosen", "+1/+1", "poison"].includes(effect.counter))',
     '!(!["chosen", "+1/+1", "poison"].includes(effect.counter))'),
    ('compiler: counters on players of a chosen kind', INDEX,
     '!["chosen", "+1/+1", "poison"].includes(effect.counter)',
     '!["+1/+1", "poison"].includes(effect.counter)'),
    ('compiler: +1/+1 counters on players', INDEX,
     '!["chosen", "+1/+1", "poison"].includes(effect.counter)',
     '!["chosen", "poison"].includes(effect.counter)'),
    ('compiler: poison counters by putCounter', INDEX,
     '!["chosen", "+1/+1", "poison"].includes(effect.counter)',
     '!["chosen", "+1/+1"].includes(effect.counter)'),
    ('credit: your experience counters not built', 'game/tools/engine-constructs.mjs',
     'YourCountersExperience: {name: "Your experience counters", status: "built", engine: "amount {countersOn: \\"you\\", counter: \\"experience\\"} (script/amount.mjs); putCounter\'s who gives them"},',
     'YourCountersExperience: {name: "Your experience counters", status: "missing"},'),
]
