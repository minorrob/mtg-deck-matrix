# Navigation must move only the intended viewport and survive a room redraw.
SUITES = ['tests/board-r3-zone-navigation.mjs']
BREAKS = [
    ('wheel no longer reaches later cards', 'crankmagic-board.js', 'else row.scrollTop+=event.deltaY*unit;', 'else row.scrollTop+=0;'),
    ('redraw drops the zone position', 'crankmagic-board.js', 'if(pos){el.scrollLeft=pos[0];el.scrollTop=pos[1];}', 'if(false){el.scrollLeft=pos[0];el.scrollTop=pos[1];}'),
    ('blank drag no longer scrolls', 'crankmagic-board.js', 'row.scrollTop=start.top-(next.clientY-start.y)*row.offsetHeight/box.height;', 'row.scrollTop=start.top;'),
    ('planeswalkers leave the leading group', 'crankmagic-board.js', 'c.types.includes("Creature") || c.types.includes("Planeswalker")', 'c.types.includes("Creature")'),
    ('whole card rows stop wrapping', 'crankmagic-stage.css', 'grid-template-columns:repeat(auto-fill,var(--zone-cell-width,var(--bc)));', 'grid-template-columns:repeat(100,var(--zone-cell-width,var(--bc)));'),
    ('row preview disappears', 'crankmagic-board.js', 'peek=Math.max(10,Math.round(cellHeight*.16))', 'peek=0'),
    ('tapped cards turn sideways again', 'crankmagic-stage.css', '[data-card-section]>.cm-bcard.is-tapped{transform:rotate(30deg)}', '[data-card-section]>.cm-bcard.is-tapped{transform:rotate(90deg)}'),
    ('card image is cropped again', 'crankmagic-stage.css', '#matrix-v2 .cm-board .cm-bcard img{object-fit:contain}', '#matrix-v2 .cm-board .cm-bcard img{object-fit:cover}'),
]
