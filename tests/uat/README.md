# CrankMagic release journeys

Run `node tests/uat/journeys.mjs` with the repo served on port 8790. The runner executes
`../browser-geometry.mjs` (the geometry pass: no sideways scroll, no tap target under 32px
and no header overlap at 320, 375, 390, 430, 768 and 1400 across the app's views — it serves the
repo itself, so it needs no port, and it is required rather than skippable here),
`crankmagic-journeys.mjs` (new-user assembly, exact prints, source correction, concurrency,
quota abort, backup/restore, construction, graph, offline and mobile) and `tour-walk.mjs`
(every step of all seven guided tours, asserting each one points at something real).

`crankmagic-recovery.mjs` and `legacy-journeys.mjs` were removed with the pages they
walked. matrix.html, legacy-decks.html and legacy-graph.html are retired; a journey
through a page nobody can open is not a release gate, and the flows they covered either
moved into CrankMagic or went with the viewer.

Set `UAT_BASE` to override the URL. `UAT_PLAYWRIGHT` can point to an installed Playwright
index.js; `UAT_CHROMIUM` selects its Chromium binary. Windows production journeys also
find Chrome at its normal Program Files path. A missing browser/server fails the release
gate. Each journey uses a fresh isolated browser context; no personal profile is modified.
The 49 Node suites remain separately required via `bash runtests.sh -q`, and CI runs them on every push.
