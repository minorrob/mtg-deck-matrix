# R2 review must remain private, current, and separate from inspection.
SUITES = ['tests/board-r2-actions-inspection.mjs', 'tests/board-fullscreen-notes.mjs']
BREAKS = [
    ('a selection commits before confirmation', 'crankmagic-board.js', '      picked = [index];', '      return send({indices:[index]});'),
    ('a new revision keeps an obsolete draft', 'crankmagic-board.js', 'if (was?.revision !== next.revision || was?.matchId !== next.matchId || was?.seat !== next.seat) {picked = []; amounts = []; draftRevision = null; actionCard = null;}', 'if (false) {picked = []; amounts = []; draftRevision = null; actionCard = null;}'),
    ('touch inspection selects the card beneath it', 'crankmagic-board.js', 'if (inspectedPress && performance.now() - inspectedPress < 900 && event.detail > 0)', 'if (false)'),
    ('the land row ignores wheel scrolling beside inspection', 'crankmagic-board.js', 'row.scrollLeft += (event.deltaX || event.deltaY) * unit;', 'row.scrollLeft += 0;'),
]
