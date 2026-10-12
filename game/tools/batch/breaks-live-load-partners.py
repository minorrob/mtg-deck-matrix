# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""A workbook's decks named by hand, two partners among the commanders (Rob's v43, 2026-10-12): tools/live-load.js and
tools/build-live-load.mjs --decks.

Run from the repository root, with nothing else editing the worktree:

    python3 game/tools/batch/breaks.py game/tools/batch/breaks-live-load-partners.py
"""
SUITES = ['tests/live-load.mjs']
BREAKS = [
    ('three commanders allowed', 'tools/live-load.js',
     'leads.length>=1&&leads.length<=2&&',
     'leads.length>=1&&'),
    ('a partner not in its hundred', 'tools/live-load.js',
     '      for(const lead of leads)ensure(d.cards.some(r=>fold(r[0])===fold(lead)&&r[1]===1),',
     '      for(const lead of leads.slice(0,1))ensure(d.cards.some(r=>fold(r[0])===fold(lead)&&r[1]===1),'),
    ('only the first partner made a commander', 'tools/live-load.js',
     'commanders:commandersOf(d).map(idOf),',
     'commanders:commandersOf(d).slice(0,1).map(idOf),'),
    ('the decks named by hand ignored', 'tools/build-live-load.mjs',
     "let dk=named?namedDecks(named):starTable(",
     "let dk=false?namedDecks(named):starTable("),
]
