# ROB-26: direct blocking

Branch: `codex/play-direct-blocking`, source `4a6551b1`, PR #801. Based on main 17a1218c,
with the #799 confirmed-combat dependency; #799 merged as 27fba609 after
exact-head CI 39459768526 passed.

Select a defending creature on the Full mat or in the blocker row, then
select its legal attacker thumbnails. Each pair is visible in a private
draft, can be removed, or can be cleared with the rest of that blocker's
assignments. All block options remain available in a keyboard-accessible
list. Confirm blocks submits the complete draft. No blocks clears it and
requires Confirm no blocks. Neither action changes life or resolves combat
locally. The shared combat strip still displays confirmed assignments only.

The decision's `legalBlocks` and option indices are authoritative. Actual
room decisions have no `kind` field; the UI recognizes their many-choice
mode and `legalBlocks`. The board does not infer menace, flying, reach,
blocking capacity or mandatory blocks. Every complete draft is sent through
`{type:"check", choiceId, indices}`. Every returned reason is shown.

Only one check is in flight, because `checked` echoes a choice ID without a
request/draft ID. Validation is keyed by match, revision, decision, legal
pairs and exact indices. Editing a draft queues its latest form and rejects
a late old result. New matches or changed legal pairs clear stale picks.
Reconnect requires fresh validation. A receipt before the next view cannot
re-enable an already submitted draft. Transport refusals offer Check again.

## Evidence

- `tests/board-direct-blocking.mjs`: Full 1024x768, 1280x720, 1400x900;
  Table/Focus 1280x720; Focused phone 390x844. Stable objects 72001-72014;
  crowded rows use 73000-73013 and 74000-74013. Mouse wheel and real mouse
  clicks are preceded by three-point `document.elementFromPoint` checks.
  Keyboard fallback preserves focus. No Playwright click scrolls hidden
  overflow to establish reach.
- The phone keeps its decision within the existing bottom-third area. Its
  body scrolls; Confirm stays visible and the defending creature stays
  reachable. An earlier expanded panel failed the combat-display reach
  assertion and was corrected.
- `tests/room-block-check.mjs`: 30 checks passed, including real menace,
  multiple reasons, unchanged state/journal and private room checks.
- `game/tools/batch/breaks-direct-blocking.py`: all sixteen regressions caught, `missed: []`. The final receipt,
  crowded-row and phone mutations were run again against the completed source.
- `tests/table-board.mjs`: 281; `a11y-board.mjs`: 298; `settings-r3.mjs`: 68;
  `table-tabletop.mjs` and `board-combat-display.mjs` pass. All browser runs
  used `GEOMETRY_REQUIRED=1` with installed Chrome.
- `REAL_DECKS_REQUIRED=1 node tests/uat/solo-vs-ai.mjs`: three full games
  using all six Shared decks, 42 checks, turns 38/34/41, identical replays,
  585 privacy checks over 598 frames, 78 combat comparisons, no AI refusals.
  The first two games still reproduce the known ROB-166 loss banner.
- Readout 1099, wiring 124, data integrity and breaks-anchor checks pass.
- Read-only `codex review --uncommitted`: found missing final cache pins and
  horizontal row scroll reset. Both are fixed: row positions are scoped to decision and selected blocker,
  with an actual-wheel crowded-row test and a caught regression.

Screenshots: `screenshots/rob-26-blocking-1280x720.png` and
`screenshots/rob-26-blocking-390x844.png`. Synthetic socket fixtures identify
objects explicitly; unavailable art falls back to names. Real physical
phone interaction remains unproven. Browser geometry is proven only at the
sizes above.

Final pins above main and parked #800: board 59, stage CSS 25, service
worker 500, app 517. The manifest was regenerated once at the end after LF
normalization; 125 asset hashes and nine service-worker checks pass.
Main 27fba609 is merged into this branch. Exact-head CI and Engine-owned
staging acceptance remain outstanding. Production is held. #795/#796 belong to Rob's other harness;
ROB-171/#800 remains parked for Engine ROB-172.

## October 20, later: the question held to the window in Table and Focus (Claude, holding the lane)

Codex's exact-head run (Actions 39468706080, head `d6f5e554`) failed one assertion: in Focus at 1280x720, after
"All block options" opened, No blocks measured y 700–742 in a 720-high window. Locally the same case passed.
CI's Linux fonts set lines taller than this desktop's, and the question floats 52px into a board that scrolls,
so its foot ran below the window. Reproduced here by setting every line to twice its height: Focus lost Confirm
at 1.7x, and Table lost it at 2x.

- **The fix:** the board's `fit()`, run last after everything above the question has its size, sets the question's
  `max-height` to what the window leaves below its top (minus 12px). Focus starts it lower than Table, so the room is
  measured, not assumed. `crankmagic-stage.css` makes the question a shrinkable column whose middle scrolls, for Table
  (`.cm-board-tabletop>.cm-board-ask`) and Focus (`.cm-board-main>.cm-board-ask`), as #793 did for Full. The title and
  the No blocks and Confirm buttons stay on screen.
- **The proof on any machine:** `tests/board-direct-blocking.mjs` adds Table and Focus at 1280x720 with every line at
  twice its height (`BLOCK_CASE=table-1280-tall`, `focus-1280-tall`). Shot:
  `screenshots/rob-26-blocking-1280x720-focus-tall.png`.
- **Breaks:** two new entries in `breaks-direct-blocking.py` were each applied by hand. Each fails both tall cases:
  * the cap removed;
  * the middle no longer scrolling.
- **Pins:** board 60, stage CSS 26, service worker 501, app 518.
