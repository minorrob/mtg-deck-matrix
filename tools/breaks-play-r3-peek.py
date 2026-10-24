# Escape should dismiss a control explanation without a drawer redraw reopening it.
SUITES = ['tests/board-control.mjs']
BREAKS = [
    ('Escape redraw reopens the control explanation', 'crankmagic-board.js',
     'controlPeek(null); event.preventDefault(); event.stopImmediatePropagation();',
     'controlPeek(null);'),
]
