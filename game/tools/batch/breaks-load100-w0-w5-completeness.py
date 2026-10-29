# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
SUITES = ['tests/engine-load100-mana.mjs', 'tests/engine-tap-to-cast.mjs', 'tests/engine-mana-riders.mjs', 'tests/engine-mana-provenance.mjs']
MANA = 'game/engine/rules/mana.mjs'
BREAKS = [
    ('funding search cannot hide late legal plans', MANA,
     'export const SEARCH_LIMIT = Infinity;', 'export const SEARCH_LIMIT = 4000;'),
    ('larger source budgets remain choices', MANA,
     'budget <= Math.min(size, ordered.length) && result.length < limit && steps <= SEARCH_LIMIT',
     'budget <= Math.min(size, ordered.length) && !result.length && steps <= SEARCH_LIMIT'),
    ('revisited plans remain unique', MANA,
     'if (!foundKeys.has(key)) { foundKeys.add(key); result.push({taps, payment, key}); }',
     'result.push({taps, payment, key});'),
    ('all rider-source payments remain offered', 'game/engine/rules/restricted-mana.mjs',
     'ways = ways.flatMap((way) => here.map((ids) => [...way, ...ids]));',
     'ways = ways.flatMap((way) => here.map((ids) => [...way, ...ids])).slice(0, 16);'),
]
