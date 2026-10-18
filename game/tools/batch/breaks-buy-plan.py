# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The buy plan (2026-10-18, Linear ROB-119): tests/buy-plan.mjs holds buy-plan.js on a dated printings snapshot.
These breaks prove the checks can fail: the weights ignored when choosing among plans (the issue's own break), the
weights ignored when choosing a printing, shipping never charged, the house rules never applied, the snapshot's date
dropped, and an unpriced card silently dropped. From the repository root:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-buy-plan.py
"""
SUITES = ['tests/buy-plan.mjs']
BREAKS = [
    ('the weights ignored among plans', 'buy-plan.js',
     '      const score = weights.cost * Math.min(3, costAxis) + weights.speed * speedAxis + weights.print * printAxis;',
     '      const score = costAxis;'),
    ('the weights ignored for the printing', 'buy-plan.js',
     '        const score = weights.cost * Math.min(3, over) + weights.print * (1 - c.printScore);',
     '        const score = over;'),
    ('shipping never charged', 'buy-plan.js',
     '    const shippingFor = (v, subtotal) => (subtotal <= 0 ? 0 : v.freeOver > 0 && subtotal >= v.freeOver ? 0 : v.shippingFlat);',
     '    const shippingFor = (v, subtotal) => 0;'),
    ('the house rules never applied', 'buy-plan.js',
     '      const flags = rules && typeof rules.warnings === "function" ? rules.warnings({price: c.base, paid: c.unit, vendor: v.name}) : [];',
     '      const flags = [];'),
    ("the snapshot's date dropped", 'buy-plan.js',
     '      generatedAt: snapshot.generatedAt || null,\n      weights:',
     '      generatedAt: null,\n      weights:'),
    ('an unpriced card dropped in silence', 'buy-plan.js',
     '      if (!cands.length) { unpriced.push(n.name); continue; }',
     '      if (!cands.length) { continue; }'),
]
