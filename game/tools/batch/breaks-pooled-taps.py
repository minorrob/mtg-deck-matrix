# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Floating mana and a source's whole output paying a cast together (`pooledTaps`; Rob's playtest, 2026-10-15: a
commander should be castable with what is on the board): rules/actions.mjs, rules/mana.mjs (sourceTapPlans,
quickTapPlan), the pod key through state/index.mjs, cards/scenario.mjs, room.mjs and table.mjs, and the command-zone
commander's tax in the view (projection.mjs).

Run from the repository root, with nothing else editing the worktree:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-pooled-taps.py
"""
SUITES = ['tests/engine-tap-to-cast.mjs', 'tests/room-pooled-taps.mjs', 'tests/game-table.mjs']
BREAKS = [
    ('every match pooled, those launched before too', 'game/engine/rules/actions.mjs',
     'const pooledTaps = (state) => state.pooledTaps === true;',
     'const pooledTaps = (state) => true;'),
    ('no match pooled', 'game/engine/rules/actions.mjs',
     'const pooledTaps = (state) => state.pooledTaps === true;',
     'const pooledTaps = (state) => false;'),
    ('the asked ways in the order the search found them', 'game/engine/rules/actions.mjs',
     'return quick ? [quick, ...found.filter((w) => w.key !== quick.key)].slice(0, limit) : found;',
     'return quick && !found.some((w) => w.key === quick.key) ? [quick, ...found].slice(0, limit) : found;'),
    ('a source alike to the one before tapped as a way of its own', 'game/engine/rules/mana.mjs',
     'const alike = ordered.map((u, i) => i > 0 && kind(u) === kind(ordered[i - 1]));',
     'const alike = ordered.map(() => false);'),
    ('the search given no steps', 'game/engine/rules/mana.mjs',
     'export const SEARCH_LIMIT = Infinity;',
     'export const SEARCH_LIMIT = 0;'),
    ('the generic paid from the biggest rock, whatever it wastes', 'game/engine/rules/mana.mjs',
     'const next = fits[0] ?? left.sort((a, b) => out(a) - out(b))[0];',
     'const next = left.sort((a, b) => out(b) - out(a))[0];'),
    ('a colored symbol paid from a rock before a land', 'game/engine/rules/mana.mjs',
     'for (const pick of [single, (u) => !single(u)]) for (const u of ordered) {',
     'for (const pick of [(u) => !single(u), single]) for (const u of ordered) {'),
    ('the floating mana not counted first', 'game/engine/rules/mana.mjs',
     '  let available = {...pool};\n  const taps = [], used = new Set(), held = {};',
     '  let available = {};\n  const taps = [], used = new Set(), held = {};'),
    ('a scenario never pooled', 'game/engine/cards/scenario.mjs',
     '...(scenario.pooledTaps === true ? {pooledTaps: true} : {})',
     '...({})'),
    ('the game not told by its pod', 'game/engine/state/index.mjs',
     '    ...(pod?.pooledTaps === true ? {pooledTaps: true} : {}),\n',
     ''),
    ('the room not passing the key to its game', 'game/room/room.mjs',
     'const pooled = {...(pod && pod.pooledTaps === true ? {pooledTaps: true} : {}),',
     'const pooled = {...({}),'),
    ('the saved match without the key, so a replay plays it the old way', 'game/room/room.mjs',
     'await store.saveMatch({pod: {seats, ...rules, ...beats, ...pooled, ...(seated',
     'await store.saveMatch({pod: {seats, ...rules, ...beats, ...(seated'),
    ('a table\'s new match not asking for it', 'game/room/table.mjs',
     '      pooledTaps: true,\n',
     ''),
    ('the view without the commander\'s tax', 'game/engine/projection.mjs',
     '{commanderTax: commanderTax(state, object.owner, id)}',
     '{}'),
    ('the tax read from the wrong player', 'game/engine/projection.mjs',
     '{commanderTax: commanderTax(state, object.owner, id)}',
     '{commanderTax: commanderTax(state, 1 - object.owner, id)}'),
]
