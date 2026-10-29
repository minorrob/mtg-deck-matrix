# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""ROB-210 audit of actual saved blink/search cards: original wordings stay unchanged."""
SUITES = ['tests/engine-playtest-blink.mjs']
B = 'game/engine/script/bind.mjs'
Z = 'game/engine/script/effects/zones.mjs'
A = 'game/engine/script/effects/asking.mjs'
C = 'game/engine/script/condition.mjs'
BREAKS = [
    ('zero counted blink targets become mandatory', B,
     'min: Math.min(count.min, options.length)', 'min: Math.min(Math.max(1, count.min), options.length)'),
    ('any-number blink is capped at one', B,
     'max: count.max === null ? options.length : Math.min(count.max, options.length)',
     'max: count.max === null ? Math.min(1, options.length) : Math.min(count.max, options.length)'),
    ('immediate blink never returns its exiled cards', Z,
     'moved !== null && params.andReturn && state.objects[moved]', 'false'),
    ('return tracks the old object instead of the exiled card', Z,
     'const back = {effect: "moveZone", targets: [moved], to: "battlefield",',
     'const back = {effect: "moveZone", targets: [id], to: "battlefield",'),
    ('under-your-control blink returns to the owner instead', Z,
     '...(params.under === "you" ? {controller: context.controller} : {})', ''),
    ('Plains search is wrongly restricted to basic lands', A,
     'const matchers = alternatives.map((one) => compileSelector({...one, what: "card", zone}));',
     'const matchers = alternatives.map((one) => compileSelector({...one, supertypes: ["Basic"], what: "card", zone}));'),
    ('Plains search ignores the required card quality', A,
     'const fitting = greatestOf(state, params.greatest, pool.filter(fits));',
     'const fitting = greatestOf(state, params.greatest, pool);'),
    ('quality search cannot legally fail to find', A,
     'const min = params.upTo || (!faceUp && hasQuality(params.selector)) ? 0 : Math.min(count, cards.length);',
     'const min = Math.min(count, cards.length);'),
    ('the searched land loses its enters-tapped instruction', A,
     'destinations: params.destinations ?? [{to: params.to ?? "hand", ...(params.tapped ? {tapped: true} : {})}],',
     'destinations: params.destinations ?? [{to: params.to ?? "hand"}],'),
    ('fail-to-find search is never recorded for the final shuffle', A,
     'const searched = awaiting.zone === "library" ? {searched: true} : {};', 'const searched = {};'),
    ('declining both searches still shuffles the library', C,
     '  if (condition.searched === true && searched !== true) return false;\n', ''),
    ('land equality still repeats the catch-up search', C,
     'if (compare.moreThan !== undefined && !(n > than(compare.moreThan))) return false;',
     'if (compare.moreThan !== undefined && !(n >= than(compare.moreThan))) return false;'),
    ('Brago triggers on its actual noncombat damage', 'game/engine/rules/trigger.mjs',
     'if (condition.on === "GameEventPlayerDamaged") {\n    if (condition.combat && fields.combat !== true) return [];',
     'if (condition.on === "GameEventPlayerDamaged") {'),
    ('another creature combat hit incorrectly triggers Brago', 'game/engine/rules/trigger.mjs',
     'if (condition.monarch === "you" && state.monarch !== controller) return [];\n    if (!fits(state, source, condition, sourceId, controller)) return [];',
     'if (condition.monarch === "you" && state.monarch !== controller) return [];'),
    ('next-end-step return incorrectly happens immediately', Z,
     'if (params.andReturn === "end step") delayedTrigger(state,', 'if (false) delayedTrigger(state,'),
]
