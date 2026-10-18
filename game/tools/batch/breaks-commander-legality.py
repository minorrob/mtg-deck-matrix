# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Commander legality (2026-10-18, Linear ROB-104): tests/commander-legality.mjs holds commander-legality.js on a
failing and a passing case per rule. One break per rule proves each check can go silent and be caught: the size
rule, the missing commander, eligibility, the pairing rule, the banned list, a card's own legality, color identity,
the singleton rule, and the derivation of identity from a mana cost (hybrid symbols). From the repository root:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-commander-legality.py
"""
SUITES = ['tests/commander-legality.mjs']
BREAKS = [
    ('the size rule silenced', 'commander-legality.js',
     '    if (size !== DECK_SIZE) {',
     '    if (false) {'),
    ('a missing commander allowed', 'commander-legality.js',
     '    if (!commanders.length) problem("commander",',
     '    if (false) problem("commander",'),
    ('any card may lead the deck', 'commander-legality.js',
     '      } else if (!eligible(c)) {',
     '      } else if (false) {'),
    ('any two cards may pair', 'commander-legality.js',
     '      if (!(named || generic || friends || background || doctors)) {',
     '      if (false) {'),
    ('Partner with pairs with anyone', 'commander-legality.js',
     '  const partner = (c) => !partnerWith(c) && (',
     '  const partner = (c) => (true) && ('),
    ('the banned list ignored', 'commander-legality.js',
     '      if (isBanned) { problem("banned",',
     '      if (false) { problem("banned",'),
    ("a card's own legality ignored", 'commander-legality.js',
     '      if (c.legal !== null && c.legal !== "legal") problem("not-legal",',
     '      if (false) problem("not-legal",'),
    ('color identity unchecked', 'commander-legality.js',
     '        if (outside.length) problem("identity",',
     '        if (false) problem("identity",'),
    ('copies uncounted', 'commander-legality.js',
     '        if (copies > allowed) problem("singleton",',
     '        if (false) problem("singleton",'),
    ('the cost forgotten when deriving identity', 'commander-legality.js',
     '    symbols(card.mana);\n',
     ''),
    ('a Background alone accepted', 'commander-legality.js',
     '        if (commanders.length === 1) problem("eligible", c.name,',
     '        if (false) problem("eligible", c.name,'),
]
