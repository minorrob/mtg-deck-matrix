# ROB-97: Table's Board cards control belongs in Camera

October 18, 2026. Branch `codex/play-table-camera`, dependent on the shared shell in PR #754.

The shared shell already puts Board cards in Camera. Table still draws the previous copy in its row divider.
The focused new browser check fails on the two controls where exactly one belongs. Remove the divider's copy in
both its horizontal and vertical forms, retaining the divider's pointer and keyboard resizing.

The current four-seat preview does not reproduce an overlap at 1024 x 768, 1280 x 720 or 1400 x 900. The issue's
requested Camera ownership is still unmet. Verification will enforce exclusive ownership and separate geometry
checks so an overlap regression is caught even if the duplicate remains absent.

Planned proof: the Camera slider changes real battlefield card size; keyboard adjustment and reload preserve its
value; all slider boxes fit and stay clear of the center life dial at all three widths; existing two-seat resizing
and independent Board/Hand scaling remain covered by `tests/table-board.mjs`. Screenshots use T10 Camera and M02
life dial, plus the 390 x 844 phone baseline. A breaks file must catch a restored duplicate and a moved Camera.

No production change in this initial draft. Review, browser suites, deliberate regressions, asset pins and CI remain.
ROB-98's separate spacing proposal awaits Rob; its proposed CSS is confined to the comparison browser.
