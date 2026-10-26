# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""A report sends its weakest component to Explore, not the strongest one."""
SUITES = ['tests/deck-page-r3.mjs']
BREAKS = [
    ('strongest score component chosen', 'crankmagic-decks.js',
     '.sort((a,b)=>a.points/a.max-b.points/b.max)[0]', '.sort((a,b)=>b.points/b.max-a.points/a.max)[0]'),
]
