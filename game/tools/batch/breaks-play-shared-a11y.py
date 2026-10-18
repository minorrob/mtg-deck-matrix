"""ROB-99: shared controls keep readable ink and preserve choice highlights.
Run with GEOMETRY_REQUIRED=1 A11Y_FAIL_FAST=1; the baseline must pass first.
"""
SUITES = ['tests/a11y-board.mjs']
BREAKS = [
    ('the shared header uses light-theme ink on its dark ground', 'crankmagic-stage.css',
     '.cm-stage-top{color:#edf6ef}', '.cm-stage-top{color:var(--v-ink)}'),
    ('History inherits the dark profile ink on its light panel', 'crankmagic-stage.css',
     '.cm-profile-menu .cm-board-menu{color:var(--v-ink)}', ''),
    ('closed previews mark every played card selected', 'crankmagic-board.js',
     'if ((previewSide === "left" && stageRail) || (previewSide === "right" && stageSide)) {selected = id; drawPick();}',
     'if (previewSide) {selected = id; drawPick();}'),
    ('Camera view buttons inherit unreadable theme ink', 'crankmagic-stage.css',
     '#matrix-v2 .cm-stage-camera .cm-board-views .v-button{height:38px;color:#edf6ef;background:#1c302e}',
     '#matrix-v2 .cm-stage-camera .cm-board-views .v-button{height:38px;background:#1c302e}'),
    ('Camera slider rows collapse around their output', 'crankmagic-stage.css',
     'gap:4px;height:auto;padding:6px 8px;border-radius:6px',
     'gap:4px;height:22px;padding:6px 8px;border-radius:6px'),
]
