# Changed-control cards (ROB-171)

Rob's October 20 request: put the actual card on its current controller's board with a distinctive
marker, and leave an inspection-only ghost on the board of the player who lost control. The ghost
must identify the controller and quote the responsible Oracle effect, including its return condition.

## Contract boundary

Current `CrankRoomView@1` groups Battlefield cards by owner and supplies their current derived
`controller`. Play can draw each real card on that controller's board and label its owner.
It cannot determine the previous controller or responsible control effect from this view.

Engine request ROB-172, mirrored in ACTIVE Requests row 11 and ROB-11, asks for public control
provenance, the displaced controller and exact Oracle wording/duration. Chained steals, effects
ending in timestamp order, permanent control, entering under another player's control and face-down
sources must be defined. The UI must not promise that killing a source returns a card to its owner.

The branch `codex/play-control-markers`, draft PR #800, implements the existing-contract slice:

- One real card, with its original object ID and legal actions, on its current controller's mat.
- A double blue border and ownership label distinguish that card from cards the controller owns.
- A faded, dashed ownership ghost on its owner's mat, with a separate inspection identity so it
  cannot cast, tap, select a target, enter an animation snapshot, or reorder as a playable object.
- Hover/focus/tap inspection names the current controller and owner. Open details update when
  control changes, returns or the object leaves; keyboard focus survives a redraw by object ID.
- Battlefield counts and land resources follow current control, excluding ghosts.

The ghost currently anchors **ownership**, not a claimed previous controller. For a first steal
from an owner these coincide. For chained steals or entering under another player's control
they can differ. The complete lost-controller ghost and Oracle return explanation remain blocked
on ROB-172 reaching main. The current inspection explicitly says "Return condition unavailable."
This is an incomplete draft, not the finished requested feature.

## Proof

Browser fixture `tests/board-control.mjs` uses C171, objects #71001–71004 and fictitious seats.
It covers Full at 1024x768, 1280x720 and 1400x900; Table and Focus at 1280x720; phone Focus at
390x844; card-size endpoints; the controller's first frame with no browser history; resource
and card counts; face-down privacy; keyboard focus; read-only inspection and changing control.
Reach assertions use `document.elementFromPoint`, not Playwright's implicit scrolling.

Screenshots: `screenshots/rob-171-control-1280x720.png` and `rob-171-control-390x844.png`.
Card art is stubbed; these show the named fallback. The existing phone board is rotated.

Review caught labels below 10px; the labels and endpoint checks are corrected. A further browser
check caught a stationary pointer replacing the focused ghost's explanation after a redraw;
keyboard focus now takes precedence, with its own deliberate regression.

Local checks with `GEOMETRY_REQUIRED=1` and installed Chrome:

- `node tests/board-control.mjs`: all layouts, card-size endpoints, stable focus, contrast,
  mouse/touch inspection, current-controller counts and legal-action highlights pass.
- `python game/tools/batch/breaks.py game/tools/batch/breaks-board-control.py`: all 14 deliberate
  regressions caught, none missed (11 initial cases, then contrast/match identity, then legal glow).
- `node tests/table-board.mjs`: 281 checks.
- `node tests/a11y-board.mjs`: 298 checks; `node tests/settings-r3.mjs`: 68.
- `node tests/table-tabletop.mjs`: passes. An earlier run stopped at the existing drawer History
  drag assertion (line 185), before any control scenario. The unchanged rerun passed; no assertion
  was weakened. The intermittent drag failure remains recorded.
- Feature wiring: 124; data integrity passes. The readout and breaks anchors are validated.

`node tests/uat/solo-vs-ai.mjs` passes all 39 checks: one person against three Normal AIs, all six
Shared decks over three games, ending at turns 38/34/41, identical replays, 585 privacy checks
over 598 browser frames and zero refused AI answers. Games 1 and 2 still reproduce ROB-166's
incorrect early-end banner. This harness uses the in-process room and a real browser; it does
not prove deployed Workers/Access behavior or the missing control-provenance contract.

Source commit: `ef071f2a`. Pins are above main and the pending combat-display slice: board 58,
stage CSS 24, service worker 499, app 516. All 125 asset hashes and nine service-worker checks
pass. The source bytes use LF, matching Git's committed bytes. Readout: 1100 checks; breaks
anchors: nine checks, 101 files, 2189 anchors. README inventory: 541 Node / 36 Online suites.

The draft started from main `17a1218c`; pending combat PR #799 is not integrated here. Merge
current main (including ROB-172) before completing this feature and marking #800 ready.

Staging, actual control-source Oracle explanations, displaced-controller ghosts, physical phones
and hardware WebGL are unproven. Production remains held.
