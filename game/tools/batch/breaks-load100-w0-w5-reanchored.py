# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Run the reanchored original behavioral mutations against the union of every original suite, once per baseline."""
import runpy

SOURCES = {
    'breaks-prepared-room.py': ['prepared copy excluded from mana funding'],
    'breaks-roblists-p2-food.py': ['X tapped for, paid', 'X paid'],
    'breaks-wave4b-j4.py': ['x life: one offer for each X', 'x life: its lands tapped for it'],
    'breaks-wave4c-k2.py': ['delve: offered', 'delve: a card to exile', 'delve: generic mana to pay',
                          'delve: no more than the graveyard', 'delve: announced X counted'],
    'breaks-wave4b-j2.py': ['token enters tapped: by a replacement', 'token entry: untapped costs life'],
    'breaks-pooled-taps.py': ['the search given no steps'],
}
SUITES = ['tests/engine-load100-mana.mjs']
BREAKS = []
for name, labels in SOURCES.items():
    original = runpy.run_path('game/tools/batch/' + name)
    for suite in original['SUITES']:
        if suite not in SUITES:
            SUITES.append(suite)
    selected = [entry for entry in original['BREAKS'] if entry[0] in labels]
    if len(selected) != len(labels):
        raise RuntimeError('Missing original mutation in ' + name)
    BREAKS.extend(selected)
