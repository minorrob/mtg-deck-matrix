# CrankMagic release journeys

Run `node tests/uat/journeys.mjs` with the repo served on port 8790. The runner executes
`../browser-geometry.mjs` (the geometry pass: no sideways scroll, no tap target under 32px
and no header overlap at 320, 375, 390, 430, 768 and 1400 across the app's views — it serves the
repo itself, so it needs no port, and it is required rather than skippable here),
`crankmagic-journeys.mjs` (new-user assembly, exact prints, source correction, concurrency,
quota abort, backup/restore, construction, graph, offline and mobile) and `tour-walk.mjs`
(every step of all seven guided tours, asserting each one points at something real).

`play-journeys.mjs` is Play's journey through the real UI (Part 7's G-B, `docs/plan-to-done-2026-09-30.md`): two
four-seat tables, Rob at a desk and Maya on a phone held sideways with two AIs, through New table, the invite link,
decks from the library by name (all seven of Rob's decks take a seat), the countdown, the game played through the
board's own buttons, every view at 1280, 1400, 1920 and 2560, the Coach, End game and the record, with the hidden
information read from every frame. It serves itself (no port) and plays the cards as the engine's vanilla versions
of themselves until M4 and G1; `UAT_SHOTS=<dir>` writes each view at each size, and `JOURNEY_TURNS` sets how far each
table plays (6). It runs only when asked, like the release journeys.

`crankmagic-recovery.mjs` and `legacy-journeys.mjs` were removed with the pages they
walked. matrix.html, legacy-decks.html and legacy-graph.html are retired; a journey
through a page nobody can open is not a release gate, and the flows they covered either
moved into CrankMagic or went with the viewer.

Set `UAT_BASE` to override the URL. `UAT_PLAYWRIGHT` can point to an installed Playwright
index.js; `UAT_CHROMIUM` selects its Chromium binary. Windows production journeys also
find Chrome at its normal Program Files path. A missing browser/server fails the release
gate. Each journey uses a fresh isolated browser context; no personal profile is modified.
The 49 Node suites remain separately required via `bash runtests.sh -q`, and CI runs them on every push.
