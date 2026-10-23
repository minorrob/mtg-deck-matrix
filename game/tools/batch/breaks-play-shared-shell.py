# ROB-99: each regression must be caught by the real browser shell walk.
SUITES = ['tests/table-shared-shell.mjs']
BREAKS = [
    ('Table loses the shared header', 'crankmagic-board.js',
     '${boardHeader()}${tableView()}', '${tableView()}'),
    ('Focus loses Camera', 'crankmagic-board.js',
     '${focusView()}${cameraMenu()}${boardDrawers()}', '${focusView()}${boardDrawers()}'),
    ('Tilt leaks outside Full', 'crankmagic-board.js',
     '${stageEnabled() ? `<label>Rotation ', '${true ? `<label>Rotation '),
    ('closed drawers lose focus isolation on redraw', 'crankmagic-board.js',
     '!!fan || (el.matches(".cm-stage-rail, .cm-stage-side") && !el.classList.contains("is-open"))', '!!fan'),
    ('drawer width is forgotten', 'crankmagic-board.js',
     '    keep(PANELW_KEY, w);\n', ''),
    ('nested profile menus run offscreen', 'crankmagic-stage.css',
     '.cm-profile-menu .cm-board-menu{left:auto;right:0;', '.cm-profile-menu .cm-board-menu{left:0;right:auto;'),
    ('Escape closes the background before the hand', 'crankmagic-board.js',
     '    if (event.key === "Escape" && showing) {', '    if (false) {'),
]
