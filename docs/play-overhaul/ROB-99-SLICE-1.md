# ROB-99 slice 1: shared desktop shell

Branch: `codex/play-shared-shell`, PR #754. Implementation commit `d5a2f18c`;
latest main `41997462` integrated by merge commit `3b981760` after PR #753.

Rob, October 18: "one header and Camera in every view, Tilt only in Full."
The first slice also extracts Settings' Play card into `crankmagic-settings-play.js`.
It ports only the desktop shell from PR #735; phone layout, commander behavior,
and the Babylon renderer remain separate changes in Rob's requested order.

Acceptance: the shared header, profile, Camera view switch and both drawers work
in Full, Table and Focus. Tilt appears only in Full. Settings retains its existing
Play behavior through the extracted module. Browser proof uses
`GEOMETRY_REQUIRED=1`, stable object IDs, and 1280x720 and 390x844 screenshots.
Each changed guard receives a deliberate failing mutation before restoration.

Read on October 18 from PR #740's branch while it remained open: AGENTS, ACTIVE,
the handoff, program charter, Play workstream, readout protocol and the standing
Play design instructions. PR #740's table catalog and readout feed are now
integrated; neither source branch was ported wholesale.

The pre-existing local edits on `codex/ui-playtest-plan-oct15` are preserved in
the Git stash named `Preserve pre-handoff local edits before Codex Play slice 1
(2026-10-18)`. They include Workshop edits and the four pending audio assets.

Implementation: one desktop header, profile menu, Camera and overlay drawers in
Full, Table and Focus. Full retains Tilt, zoom, cards and atmosphere controls;
Table and Focus retain their size controls. The header retains the interactive
turn ribbon, priority, waiting player, resolve-all, connection and skip controls.
Settings' existing Play preferences register through the extracted feature.

Local browser and mutation checks passed with `GEOMETRY_REQUIRED=1`
and installed Chrome through Playwright 1.56:

- `node tests/table-board.mjs`: 276 checks over a real two-seat room.
- `node tests/table-shared-shell.mjs`: Full/Table/Focus at 1024, 1280 and 1400;
  pointer and keyboard drawer resizing, Camera, menu bounds and Escape order.
- `node tests/table-tabletop.mjs`: geometry, wrapping hands, module ownership,
  ordering, saved preferences, private backs, persistent canvas and fallback.
- `node tests/a11y-board.mjs`: 296 checks passed after the review fixes, including Camera in each
  desktop view and Profile/History in both themes. The five mutations in
  `breaks-play-shared-a11y.py` were caught (`missed: []`): header and History
  contrast, choice highlighting, Camera view-button contrast and slider overflow.
- `python game/tools/batch/breaks.py game/tools/batch/breaks-play-shared-shell.py`:
  all seven regressions caught, including lost Camera, Tilt outside Full,
  non-inert closed drawers, forgotten widths, menu bounds and modal Escape order.
- `python game/tools/batch/breaks.py game/tools/batch/breaks-play-settings-extraction.py`:
  Settings baseline green; missing registration and unsaved step preference caught.
- Seven moved compatibility anchors also passed their Settings/board baseline and
  were caught individually: the seven-step ribbon and Resources in `breaks-play-ui.py`;
  own-turn wording and both Settings checks in `breaks-turn-flow-board.py`; Overlay
  persistence in `breaks-play-ui-rest.py`; stack-card visibility in
  `breaks-board-rows-stack.py`. Each source can be run with `breaks.py` and those
  labels. The local combined run used the same anchors and suites once per baseline.

The read-only `codex review` found two keyboard regressions: restoring the wrong
choice option after a redraw, and losing focus when Camera's view switch closes.
New checks failed on both original bugs. The fixes retain the full control dataset
and return view-switch focus to Camera. `breaks-play-shared-focus.py` passes its
baseline and catches both regressions (`missed: []`). The board's Tab-order test
now explicitly starts at the header instead of depending on lost focus.

Across the new and moved checks: 23 deliberate regressions, all caught, none missed.

Additional checks: choices 42, Coach 60, Resolve All 59, feature wiring 124,
data integrity, readout feeds 948, service worker 9 and mutation-anchor checks 9.
The full board rerun passed 276 checks after the review fixes. The latest main
adds deck-legality work without changing the served board; the README now counts
520 root suites. CI results are recorded on PR #754.

Asset pins: board 53, stage CSS 17, Settings 14, new Play Settings 1, service
worker 483 and app shell 499. `node tests/asset-versions.mjs --update` records
125 assets; after main integration the mutation anchor scan finds 1,875 anchors
across 71 breaks files with no problems.

The checks cover pointer and keyboard drawer
resizing, saved widths, nested-menu bounds and Escape order, closed-drawer focus
isolation, real game actions and accessible contrast in both themes. Screenshots
use H01 (header), T10 (Camera), T12/T13 (drawers), T20 (profile) and P01 (phone).
The phone screenshot records the existing baseline; ROB-18 remains outstanding.

Staging, a physical phone and WebGL on real hardware remain unproven. The engine
lane owns release. ROB-98, ROB-97, ROB-18 and ROB-52/ROB-100 follow this slice.
