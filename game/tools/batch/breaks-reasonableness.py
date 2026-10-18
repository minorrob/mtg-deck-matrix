# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Reasonableness (2026-10-18, Linear ROB-112): tests/reasonableness.mjs holds the criteria builder's decks to a
tolerance against their references. These breaks are deliberately worse generators, in deck-criteria.js: the Trace
seed dropped (the composition distance roughly doubles), and the seed's jitter made a hundred times larger (the deck
is drawn at random from the pool and the goblin deck's played rate halves). Each takes about a minute, since the suite
builds and measures six decks. From the repository root:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-reasonableness.py
"""
SUITES = ['tests/reasonableness.mjs']
BREAKS = [
    ('the Trace seed dropped', 'deck-criteria.js',
     '        traced = o.trace.trace(commander, traceWorld, o.relate, strategies, {S: o.strategies, beam: TRACE_BEAM, purposeOf: o.classify && o.classify.purposeOf});',
     '        traced = null;'),
    ('the seed made random', 'deck-criteria.js',
     '  const JITTER = 6;',
     '  const JITTER = 600;'),
]
