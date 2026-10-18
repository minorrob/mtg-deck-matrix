# ROB-97: restore either duplicate or put Camera over the life dial.
SUITES = ['tests/table-camera-layout.mjs', 'tests/table-board.mjs']
BREAKS = [
    ('four-seat Table restores its duplicate slider', 'crankmagic-board.js',
     '${grip("rows", "The rows\' sizes: drag, or use the arrow keys", Math.round(rowShare() * 100), [ROWS[0] * 100, ROWS[1] * 100])}</div>`;',
     '${grip("rows", "The rows\' sizes: drag, or use the arrow keys", Math.round(rowShare() * 100), [ROWS[0] * 100, ROWS[1] * 100])}${scaleSlider("board", "Board cards")}</div>`;'),
    ('two-seat Table restores its duplicate slider', 'crankmagic-board.js',
     '${grip("rows", "The boards\' widths: drag, or use the arrow keys", Math.round(rowShare() * 100), [ROWS[0] * 100, ROWS[1] * 100], "vertical")}</div>`',
     '${grip("rows", "The boards\' widths: drag, or use the arrow keys", Math.round(rowShare() * 100), [ROWS[0] * 100, ROWS[1] * 100], "vertical")}${scaleSlider("board", "Board cards")}</div>`'),
    ('Camera covers the life dial', 'crankmagic-stage.css',
     '.cm-board[data-shell="shared"]>.cm-stage-camera{position:fixed;top:68px}',
     '.cm-board[data-shell="shared"]>.cm-stage-camera{position:fixed;top:30%;right:40%}'),
    ('Camera scrolls behind the header', 'crankmagic-stage.css',
     '.cm-board[data-shell="shared"]>.cm-stage-camera{position:fixed;top:68px}',
     '.cm-board[data-shell="shared"]>.cm-stage-camera{position:absolute;top:68px}'),
]
