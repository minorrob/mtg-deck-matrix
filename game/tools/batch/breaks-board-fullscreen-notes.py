# Copyright (c) 2026 Rob Minor. All rights reserved. See LICENSE.
"""Rob's fullscreen notes on the board (Oct 21; crankmagic-board.js, crankmagic-stage.css): a card played by its click in
every view, a land just played taken back by its double-click, the actions large over the table in Full screen, the
others' plays held up for ten seconds, the two priority choices, the tabletop to 200%, the commander tax below the title.
tests/board-fullscreen-notes.mjs.

    GEOMETRY_REQUIRED=1 python3 game/tools/batch/breaks.py game/tools/batch/breaks-board-fullscreen-notes.py
"""
SUITES = ['tests/board-fullscreen-notes.mjs']
B = 'crankmagic-board.js'
C = 'crankmagic-stage.css'
J = 'crankmagic-stage.js'
BREAKS = [
    ('a click in Full screen only shows the card', B,
     '    if (mode === "full" && !phone()) {selected = id; hover = null; drawPick(); draw();}\n',
     '    if (mode === "full" && !phone()) {selected = id; hover = null; drawPick(); draw(); return;}\n'),
    ('a double-click playing twice', B,
     '    if (event && event.detail >= 2) {',
     '    if (event && event.detail >= 2 && false) {'),
    ('the double-click taking nothing back', B,
     '      if (back && view.decision && !sending) send({indices: [back.index]});',
     '      void back;'),
    ('the single click not waiting', B,
     'if (takeBackOf(id) && event && event.detail === 1) {clickLater',
     'if (false) {clickLater'),
    ('the take-back a button under You can also', B,
     'if (o.act === "pass" || o.act === "resolve-all" || o.act === "undo-land") continue;',
     'if (o.act === "pass" || o.act === "resolve-all") continue;'),
    ('the actions left in the strip', B,
     '${stageEnabled() ? "" : `${passButton()}${resolveAllButton()}${skipControl(true)}`}',
     '${passButton()}${resolveAllButton()}${skipControl(true)}'),
    ('the actions small', C,
     '#matrix-v2 .cm-stage-actions .v-button{min-height:49px;',
     '#matrix-v2 .cm-stage-actions .v-button{min-height:20px;font-size:11px!important;'),
    ('your own plays held up', B,
     '(x.kind === "cast" || x.kind === "land") && x.player !== next.seat && x.card && x.card.name',
     '(x.kind === "cast" || x.kind === "land") && x.card && x.card.name'),
    ('a play shown twice', B,
     '    const fresh = all.filter((x) => !playsSeen.has(playKey(next.matchId, x)));\n',
     '    const fresh = all;\n'),
    ('opponent previews ignore the available gap', B,
     'layer.style.setProperty("--plays-left", `${Math.max(8, Math.round(left))}px`);',
     'layer.style.setProperty("--plays-left", "56px");'),
    ('preview margins cover the drawer before the card needs to', B,
     'gap >= width ? start + (gap - width) / 2',
     'gap >= width + 24 ? start + (gap - width) / 2'),
    ('the plays never fading', B,
     '      const run = () => {since = performance.now(); timer = setTimeout(gone, left);};',
     '      const run = () => {since = performance.now();};'),
    ('the checkbox huge again', C,
     '#matrix-v2 .cm-board-hold input[type=checkbox]{flex:none;width:16px;height:16px;',
     '#matrix-v2 .cm-board-hold input[type=checkbox]{flex:none;width:64px;height:64px;'),
    ('Skip not told to the room', B,
     '    keep(SKIP_KEY, event.target.checked ? "on" : "off");\n    prefer();\n',
     '    keep(SKIP_KEY, event.target.checked ? "on" : "off");\n'),
    ('the tabletop held to 150%', B,
     '  const CAMERA_MAX = 200;',
     '  const CAMERA_MAX = 150;'),
    ('the tax over the mana cost', C,
     '.cm-bcard-tax{position:absolute;right:4%;top:13%;',
     '.cm-bcard-tax{position:absolute;right:4%;top:4%;'),
]
