# ROB-97: Table's Board cards control belongs in Camera

October 18, 2026. Branch `codex/play-table-camera`, dependent on the shared shell in PR #754.

The shared shell already puts Board cards in Camera. Table still draws the previous copy in its row divider.
The focused new browser check fails on the two controls where exactly one belongs. Remove the divider's copy in
both its horizontal and vertical forms, retaining the divider's pointer and keyboard resizing.

The current four-seat preview does not reproduce an overlap at 1024 x 768, 1280 x 720 or 1400 x 900. The issue's
requested Camera ownership is still unmet. Verification will enforce exclusive ownership and separate geometry
checks so an overlap regression is caught even if the duplicate remains absent.

Acceptance: the Camera slider changes real battlefield card size; keyboard adjustment and reload preserve its
value; all slider boxes fit and stay clear of the center life dial at all three widths; existing two-seat resizing
and independent Board/Hand scaling remain covered by `tests/table-board.mjs`. Screenshots use T10 Camera and M02
life dial, plus the 390 x 844 phone baseline. A breaks file must catch a restored duplicate and a moved Camera.

The implementation removes both row-divider copies. A related real scrolling check also failed: enlarging the hand
and scrolling Table could carry Camera behind the header. Table and Focus now keep Camera fixed below that header,
with the existing right-drawer offset; Full's nested camera is unchanged. The new check requires actual scrolling
and hit-tests the Camera button before opening it.

Static reviews of the slider move and scrolling repair found no actionable regressions. With `GEOMETRY_REQUIRED=1`
and the installed Chrome selected through `UAT_CHROME`, the following passed locally:

- `node tests/table-camera-layout.mjs`: four-seat Camera ownership, actual card sizing, keyboard adjustment, reload,
  slider/dial separation at 1024/1280/1400, and hit-tested Camera access while the enlarged hand makes Table scroll.
- `node tests/table-board.mjs`: 277 checks through a real game between two local browser clients, including the
  two-seat divider and independent Board/Hand sizing. The migrated walk closes the profile before returning to Camera.
- `node tests/a11y-board.mjs`: 298 checks, all 30 mats in both themes; the moved slider retains explicit focus-ring
  and life-dial reachability coverage. Lowest text contrast 4.87:1; focus rings meet 3:1.
- `node tests/settings-r3.mjs`: 63 checks; `node tests/table-tabletop.mjs` and `node tests/table-shared-shell.mjs`: pass.
- `python game/tools/batch/breaks.py game/tools/batch/breaks-table-camera.py`: all four caught, `missed: []`.
  Regressions restore the duplicate in four-seat Table and two-seat Table, move Camera onto the dial, and make Camera
  scroll behind the header. The unmodified baseline passes before any mutation.
- Data integrity, feature wiring (124), service worker (9), readout, asset versions (125), and mutation anchors
  (72 files, 1,879 anchors) pass. README names 521 root Node suites.

Pins: board 54, stage CSS 18, service worker 484, app 500. No preference key, range, default or game action changes.
Screenshots: [1280 x 720 Camera](screenshots/rob-97-1280x720.png),
[scrolled Table](screenshots/rob-97-1280x720-scrolled.png), [1024](screenshots/rob-97-1024x768.png),
[1400](screenshots/rob-97-1400x900.png), [390 x 844 phone baseline](screenshots/rob-97-phone-baseline.png).

Full CI and the engine-owned staging release remain pending. Physical phones and hardware WebGL are unproven.
ROB-98's separate spacing proposal awaits Rob; its proposed CSS is confined to the comparison browser.
