"""ROB-99 review fixes: a redraw must preserve the player's intended keyboard control."""
SUITES = ['tests/table-shared-shell.mjs', 'tests/board-choices.mjs']
BREAKS = [
    ('choice redraw forgets the option index', 'crankmagic-board.js',
     'Object.entries(focusData).every(([key, value]) => el.dataset[key] === value)',
     'Object.entries(focusData).filter(([key]) => key !== "index").every(([key, value]) => el.dataset[key] === value)'),
    ('switching views loses Camera focus', 'crankmagic-board.js',
     'actions["board-view"] = (el) => {setMode(el.dataset.view); document.querySelector("#cm-board [data-action=board-camera]")?.focus({preventScroll: true});};',
     'actions["board-view"] = (el) => {setMode(el.dataset.view);};'),
]
