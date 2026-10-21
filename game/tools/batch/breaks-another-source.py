# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""A condition about "another" creature, asked as a trigger resolves whose source has left: other than the source as it last
existed (CR 113.7a, 608.2h). Canopy Gargantuan destroyed in response to its own upkeep trigger threw "A selector using
`another` needs the source it is another than" and stopped a game of Rob's staging decks (fuzz-live, Oct 21: D4 Felothar,
D2 Chulane, D6 Krenko, D5 Teysa Karlov, seed 1). tests/engine-cards.mjs plays the card's scenario.

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-another-source.py
"""
SUITES = ['tests/engine-cards.mjs']
C = 'game/engine/script/condition.mjs'
BREAKS = [
    ('a condition asked without the source as it last existed', C,
     'condition.is ?? {}, {controller, source, lastKnown},',
     'condition.is ?? {}, {controller, source},'),
]
