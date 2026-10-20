# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The inherited solo journey must not exempt an unknown library top.
Run with GAMES=1, REAL_DECKS_REQUIRED=1 and UAT_CHROME set:
python game/tools/batch/breaks.py game/tools/batch/breaks-solo-visibility.py
"""
SUITES = ["tests/uat/solo-vs-ai.mjs"]
BREAKS = [
    ("unknown first private card silently exempted", "tests/uat/solo-vs-ai.mjs",
     '.filter(card => card.name && !allowed.has(visibilityKey(v, owner, zone, card)))',
     '.filter((card, index) => index > 0 && card.name && !allowed.has(visibilityKey(v, owner, zone, card)))'),
]
