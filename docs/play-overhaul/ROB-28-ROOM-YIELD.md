# ROB-28: Yield turn follows the room

Branch: `codex/play-room-yield`, based on `origin/main` `d7eadfe1`.

The October 20 handoff puts play-test friction first. The board currently uses
its local Skip to end loop for an opponent's turn, stopping at every stack item.
Replace that opponent-turn path with the room's `yield` frame and render
`mayYield` and `yielding` from the acknowledged view. Required decisions remain
the player's; Stop yielding affects future passes once the room acknowledges it.

The opponent-turn control now sends `{type: "yield", on: true|false}`. It shows
Requesting yield or Stopping yield until the room acknowledges the change; the
active indication always comes from `view.yielding`. It names the current turn
and explains that required choices remain the player's. Reconnect reads the
room's policy without repeating an uncertain request. The player's own Skip to
end retains its existing local behavior.

Proven locally:

- `GEOMETRY_REQUIRED=1 node tests/board-yield.mjs`: start/stop frames, delayed
  acknowledgment, no automatic priority or required-choice answers, refusal,
  two tabs, reload, socket reconnect, same-player extra-turn expiry, legacy and
  finished games. Mouse hit tests use `document.elementFromPoint` before clicking
  at 1024x768, 1280x720, 1400x900 and 390x844, without scrolling controls into view.
- `node tests/room-yield-turn.mjs`: 43 room checks, including required blockers,
  extra turns, elimination, storage and replay.
- `node tests/table-board.mjs`: 281 checks, including Start and Stop through the
  real GameTable socket and the other seat's policy remaining private.
- `python game/tools/batch/breaks.py game/tools/batch/breaks-board-yield.py`:
  all six deliberately broken implementations caught; `missed: []`.
- `node tests/a11y-board.mjs`: 298 checks; the first run caught a duplicate
  live region in the new status text, removed before the passing run.
- `node tests/settings-r3.mjs`: 68 checks; `tests/table-shared-shell.mjs` passes.
- `node tests/table-tabletop.mjs`: geometry and browser interaction pass.
- `node tests/uat/solo-vs-ai.mjs`: all three deck combinations finish through
  the board in 38, 34 and 41 turns. All mid-game reloads return the same pending
  question. All records replay identically: 585 oracle checks, 598 browser
  frames, zero privacy leaks and zero refused AI answers.
- Feature wiring: 124 checks; breaks anchors: 9 checks, all 2,172 anchors found;
  data integrity and readout validation pass. Asset versions: 125; service
  worker: 9. Pins: board 55, stage CSS 22, service worker 496, app 513.

`codex review --uncommitted` identified the pending asset cascade (now completed)
and a gap in the inherited solo-game harness: it exempted the first projected
library card without checking whether it was public. This PR adopts that harness
from #796 and strengthens it: download the complete record through the board,
replay through the existing privacy oracle, and accept private-zone identities
only for the exact revision, owner, zone, object and name the oracle approved.
Each game also deliberately injects a hidden library-top identity and asserts
that the browser-frame check rejects it. With `GAMES=1`,
`python game/tools/batch/breaks.py game/tools/batch/breaks-solo-visibility.py`
catches the reintroduced first-card exemption; `missed: []`.

The browser commands use Playwright 1.56 with installed Chrome through
`UAT_CHROME`. Screenshots identify the Yield control as Y01:
[desktop](screenshots/rob-28-yield-1280x720.png) and
[phone](screenshots/rob-28-yield-390x844.png). These use synthetic public fixture
frames and stubbed card images. The phone still has the pre-ROB-18 rotated
layout. Physical touch, hardware WebGL, and this change on staging are
**unproven**. ROB-166's misleading early-end banner reproduced in the first two
games; it remains a separate issue. CI and the engine-owned staging release
remain outstanding.

The paused October 18 land-spacing and drawer changes are preserved together in
the stash named `Preserve Oct18 approved ROB-98 and drawer fixes before Oct20 playtest work`.
Their approved designs remain in scope after the play-test fixes.
