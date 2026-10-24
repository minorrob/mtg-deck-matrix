# Navigation must move only the intended viewport and survive a room redraw.
SUITES = ['tests/board-r3-zone-navigation.mjs']
BREAKS = [
    ('wheel no longer reaches later cards', 'crankmagic-board.js', 'row.scrollLeft += (event.deltaX || event.deltaY) * unit;', 'row.scrollLeft += 0;'),
    ('redraw drops the zone position', 'crankmagic-board.js', 'if(pos){el.scrollLeft=pos[0];el.scrollTop=pos[1];}', 'if(false){el.scrollLeft=pos[0];el.scrollTop=pos[1];}'),
    ('blank drag no longer scrolls', 'crankmagic-board.js', 'row.scrollLeft=start.left-(next.clientX-start.x)*row.offsetWidth/box.width;', 'row.scrollLeft=start.left;'),
]
