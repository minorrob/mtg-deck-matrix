# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The composition model (2026-10-18, Linear ROB-114): tests/deck-composition.mjs holds deck-composition.js on cards
whose roles are not in doubt, on the targets file, and on the six staging decks' pinned counts. These breaks prove each
class of check can fail: a counterspell reading narrowed to creature spells, a hybrid pip counted once, a threat that
needs four power, a playstyle shift ignored, a target range inverted in the data. From the repository root:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-deck-composition.py
"""
SUITES = ['tests/deck-composition.mjs']
BREAKS = [
    ('a counterspell reading narrowed to creature spells', 'deck-composition.js',
     'const COUNTERSPELL = /counter target (?:spell|ability|activated ability|triggered ability|noncreature spell|creature spell|instant|sorcery|artifact|enchantment|planeswalker)/;',
     'const COUNTERSPELL = /counter target creature spell/;'),
    ('a hybrid pip counted once', 'deck-composition.js',
     '      for (const part of s.split("/")) if (out[part] !== undefined) out[part] += 1;',
     '      const part = s.split("/")[0]; if (out[part] !== undefined) out[part] += 1;'),
    ('a threat that needs four power', 'deck-composition.js',
     '(isCreature(card) && (powerOf(card) >= 3 ||',
     '(isCreature(card) && (powerOf(card) >= 4 ||'),
    ('the playstyle shift ignored', 'deck-composition.js',
     '      min = Math.max(0, min + num(s.min)); max = Math.max(min, max + num(s.max));',
     '      min = Math.max(0, min); max = Math.max(min, max);'),
    ('a target range inverted in the data', 'data/composition-targets.json',
     '"ramp": {"min": 10, "max": 14, "why": "the house floor is 10; past 14 the deck runs out of things to spend it on"}',
     '"ramp": {"min": 16, "max": 14, "why": "the house floor is 10; past 14 the deck runs out of things to spend it on"}'),
]
