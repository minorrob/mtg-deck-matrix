# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Build from criteria (2026-10-18, Linear ROB-109): tests/deck-criteria.mjs holds deck-criteria.js on six criteria
sets. These breaks prove the checks can fail: the budget constraint dropped (the issue's own break), the colors
asked for ignored when suggesting a commander, the pins dropped, the fence dropped, the seed's jitter removed (two
seeds build the same deck), owned copies no longer preferred, and the legality check skipped. From the repository
root:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-deck-criteria.py
"""
SUITES = ['tests/deck-criteria.mjs']
BREAKS = [
    ('the budget constraint dropped', 'deck-criteria.js',
     '      baseBracket: criteria.bracket, bracketCeiling: criteria.bracket, budget: criteria.budgetUsd, perCardCap: criteria.perCardCap,',
     '      baseBracket: criteria.bracket, bracketCeiling: criteria.bracket, budget: null, perCardCap: criteria.perCardCap,'),
    ('the colors asked for ignored when suggesting', 'deck-criteria.js',
     '      if (c.colors && identity.some((x) => !c.colors.includes(x))) continue;',
     '      if (false) continue;'),
    ('the pins dropped', 'deck-criteria.js',
     '      pinned.push({cardId: card.id, quantity: 1});',
     '      void card;'),
    ('the fence dropped', 'deck-criteria.js',
     '    const pool = rows.filter((c) => c !== commander && !never.has(fold(c.name)));',
     '    const pool = rows.filter((c) => c !== commander);'),
    ('the seed makes no difference', 'deck-criteria.js',
     '  const jitter = (seed, id) => (hash(`${seed}|${id}`) % 1000) / 1000 * JITTER;',
     '  const jitter = (seed, id) => 0;'),
    ('owned copies no longer preferred', 'deck-criteria.js',
     '    if (criteria.ownedFirst && lib.size) for (const card of pool) { const n = ownedCount(lib, card); if (n > 0) available[card.id] = n; }',
     '    void lib;'),
    ('the legality check skipped', 'deck-criteria.js',
     '    if (o.legality && typeof o.legality.check === "function") {',
     '    if (false) {'),
]
