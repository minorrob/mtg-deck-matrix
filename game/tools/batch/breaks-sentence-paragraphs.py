# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
# A paragraph is one ability (CR 113.2c) in what the sentence library writes for the writer to finish: Gemstone Caverns'
# "{T}: Add {C}." never written without the luck counter's "instead". python3 game/tools/batch/breaks.py <this file>
SUITES = ['tests/engine-compile.mjs', 'tests/sentence-library.mjs']

SENTENCES = 'game/engine/cards/sentences.mjs'

BREAKS = [
    ('a paragraph known in part is not kept', SENTENCES,
     'const kept = unspell.filter((s) => !open.has(paragraph(s.start)));', 'const kept = unspell;'),
    ('a keyword word is its own ability', SENTENCES,
     'const open = new Set(atoms.filter((a) => !a.keyword && !inside(a, unspell))', 'const open = new Set(atoms.filter((a) => !inside(a, unspell))'),
    ('a keyword word is marked', SENTENCES,
     'end: lineStart + a + lead + x + pl + piece.trim().length, keyword: true});', 'end: lineStart + a + lead + x + pl + piece.trim().length});'),
    ('a paragraph asked as one piece', SENTENCES,
     "if (last && !a.keyword && last.paragraph === paragraph(a.start)) { last.end = a.end; continue; }", ''),
    ('a keyword line asked word by word', SENTENCES,
     "if (last && !a.keyword && last.paragraph", "if (last && last.paragraph"),
]
