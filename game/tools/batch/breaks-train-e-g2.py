# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Train E, wave 3, worker g2: sixteen of Rob's v43 library cards (Roiling Canopy; Rooftop Percher; Samut, Hazoret's Champion;
Shredder's Revenge; Skycoach Waypoint; Skystinger; Sleight of Hand; Snarl Song; Sneering Shadewriter; Snooping Page; Social Snub;
Solitary Cell; Solve for Disappointment; Spectacle Summit; Spirit Mascot; Splatter Technique). One break for each engine change
they needed -- each guard, each branch -- and the suite that catches it:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-train-e-g2.py
"""
SUITES = [
    'tests/engine-train-e-g2.mjs',
    'tests/engine-cards.mjs',
    'tests/engine-schema.mjs',
]

INDEX = 'game/engine/cards/index.mjs'
TRIGGER = 'game/engine/rules/trigger.mjs'
SCHEMA = 'game/engine/script/schema.mjs'

WHILE_ASKED = '    if (!conditionHolds(state, condition.while, {controller, source: sourceId})) return [];\n'
SCHEMA_WHILE_ON = '      if (!["spell cast", "attacks"].includes(on)) errors.push({path: `${path}.trigger.while`, message: "\\"While\\" a condition holds is read by a spell cast trigger and an attack trigger alone"});\n'
SCHEMA_WHILE_GRAMMAR = '      for (const message of conditionProblems(ability.trigger.while ?? null)) errors.push({path: `${path}.trigger.while`, message});\n'
BLOCKED_FILTER = 'matchesSelector({what: "permanent", ...(condition.blocked ?? {})}, state, b.blocking?.cardId, {controller, source: sourceId}))'
COMPILE_BLOCKED_ON = ('        if (ability.trigger.on !== "blocks") problems.push(`${ability.text}: the creature blocked is read by a blocks trigger, and by no other`);\n'
                      '        else if (')
COMPILE_BLOCKED_FLAG = 'problems.push(`${ability.text}: the creature blocked is a selector`);'
COMPILE_BLOCKED_GRAMMAR = 'else try { compileSelector({...blocked, what: "permanent"}); }'

BREAKS = [
    # Social Snub: "when you cast this spell while you control a creature" -- a spell cast trigger's `while`, asked as the spell
    # is cast and not again (cards/index.mjs, rules/trigger.mjs; CR 603.4 is the intervening "if" it is not).
    ('while: carried by the spell cast trigger', INDEX, '    ...(t.while ? {while: t.while} : {}),\n', ''),
    ('while: asked as the spell is cast', TRIGGER, WHILE_ASKED, ''),
    ('while: asked of its controller', TRIGGER, WHILE_ASKED, WHILE_ASKED.replace('{controller, source: sourceId}', '{controller: null, source: sourceId}')),
    ('schema while: on a spell cast trigger alone', SCHEMA, SCHEMA_WHILE_ON, ''),
    ('schema while: held to the condition grammar', SCHEMA, SCHEMA_WHILE_GRAMMAR, ''),
    ('schema while: checked at all', SCHEMA, '    if (ability.trigger?.while !== undefined) {', '    if (false) {'),

    # Skystinger: "whenever this creature blocks a creature with flying" -- a blocks trigger's `blocked`, the attacking creature
    # it blocks, once for each that fits (CR 509.3b; cards/index.mjs, rules/trigger.mjs).
    ('blocked: only with each attacker', INDEX, ' && (t.blocked === undefined || t.each === "attacker")', ''),
    ('blocked: carried by the blocks trigger', INDEX, '      ...(t.blocked ? {blocked: t.blocked} : {})} : null),', '      } : null),'),
    ('blocked: what the attacker must be', TRIGGER, BLOCKED_FILTER, BLOCKED_FILTER.replace('...(condition.blocked ?? {})', '')),
    ('blocked: the attacker, not the blocker', TRIGGER, BLOCKED_FILTER, BLOCKED_FILTER.replace('b.blocking?.cardId', 'b.card?.cardId')),
    ('compile blocked: checked at all', INDEX, '      if (ability.trigger.blocked !== undefined) {', '      if (false) {'),
    ('compile blocked: a blocks trigger alone', INDEX, COMPILE_BLOCKED_ON, '        if ('),
    ('compile blocked: a selector, not a flag', INDEX, COMPILE_BLOCKED_FLAG, 'void 0;'),
    ('compile blocked: held to the selector grammar', INDEX, COMPILE_BLOCKED_GRAMMAR, 'else try { }'),
]
