# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The simplifications labeled per hundred (2026-10-18, Linear ROB-116 step 1): tests/sim-engine.mjs holds
simplificationsFor, which pairs each of the model's sixteen simplifications with the cards in a list it touches, and
tests/crankmagic-sim.mjs holds the pack that carries them. These breaks prove the checks can fail: a row paired with
its neighbor's sentence, the tutor rule reading nothing, the rows dropped from the pack. From the repository root:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-sim-labels.py
"""
SUITES = ['tests/sim-engine.mjs', 'tests/crankmagic-sim.mjs']
BREAKS = [
    ('a row paired with its neighbor\'s sentence', 'sim-engine.js',
     '      return {n: index + 1, says, kind: rule.kind, removable: Boolean(rule.removable), scope: rule.scope, count: names.length, cards: names};',
     '      return {n: index + 1, says: SIMPLIFICATIONS[(index + 1) % SIMPLIFICATIONS.length], kind: rule.kind, removable: Boolean(rule.removable), scope: rule.scope, count: names.length, cards: names};'),
    ('the tutor rule reading nothing', 'sim-engine.js',
     '    {kind: "reading", removable: true, scope: "tutors", touches: (p) => p.isTutor},',
     '    {kind: "reading", removable: true, scope: "tutors", touches: () => false},'),
    ('the rows dropped from the pack', 'crankmagic-sim.js',
     '      simplifications: result.simplifications || [],',
     '      simplifications: [],'),
]
