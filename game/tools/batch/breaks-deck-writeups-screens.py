# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""The deck write-ups on screen (Decks requirements DPG-2 to DPG-8, 2026-10-23): the header, Overview's How to play, the
edit form and Settings' Apply deck write-ups. Each break must turn the browser suite red. Needs Playwright and Chromium."""
SUITES = ['tests/deck-writeups-screens.mjs']
BREAKS = [
    ('header prints the notes again', 'crankmagic-decks.js',
     '${d.description?`<p class="cm-deck-strategy">${e(d.description)}</p>`:\'\'}', '${d.notes?`<p class="cm-deck-strategy">${e(d.notes)}</p>`:\'\'}'),
    ('Overview without How to play', 'crankmagic-decks.js',
     '    return howToPlayHTML(d)+(d.status', '    return (d.status'),
    ('edit form drops the description', 'crankmagic-decks.js',
     "notes:data.notes,description:data.description,", "notes:data.notes,"),
    ('edit form drops How to play', 'crankmagic-decks.js',
     "howToPlay:data.howToPlay.split('\\n'),", ''),
    ('preview hides the kept notes', 'crankmagic-settings.js',
     "+(plan.matched.some(m=>m.keptNotes)?", "+(false?"),
    ('Apply is not one change', 'crankmagic-settings.js',
     "async()=>{await commit(plan.command);}", "async()=>{for(const x of plan.command.commands)await commit(x);}"),
]
