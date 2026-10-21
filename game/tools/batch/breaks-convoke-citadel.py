# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Convoke through Bolas's Citadel (Oct 21, the stress run's seed 115): a spell cast for life rather than its mana cost has
no mana for a creature to pay, so its convoke asks for none. tests/engine-play-permission.mjs.

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-convoke-citadel.py
"""
SUITES = ['tests/engine-play-permission.mjs']
A = 'game/engine/rules/actions.mjs'
BREAKS = [
    ('convoke priced at the mana cost through the Citadel', A,
     'action.tax ?? 0, false, action.lifeInstead !== undefined ? "" : null, action.extraMana ?? "", action.targets);',
     'action.tax ?? 0, false, null, action.extraMana ?? "", action.targets);'),
]
