# ROB-98: Full-view land reachability

October 18, 2026. Proposal tested against PR #754, head `b538be8e`, before production changes.

## Rob's call

ROB-98 says "Rob picks from screenshots." Recommend **48px of additional bottom padding inside the front mat**.
This is the smallest tested candidate; 72px and 96px also clear the sampled targets but move more of the mat.
The camera remains at 40 degrees, Zoom 100%, Cards 100%; the hand's placement and size are unchanged.
The comparison was presented in the Codex chat and recorded on ROB-98. Approval is pending.

| Viewport | Before | Proposed spacing |
| --- | --- | --- |
| 1280 x 720 | [T08/T11 before](screenshots/rob-98-1280x720-before.png) | [T08/T11 after](screenshots/rob-98-1280x720-spacing-48.png) |
| 1024 x 768 | [Before](screenshots/rob-98-1024x768-before.png) | [After](screenshots/rob-98-1024x768-spacing-48.png) |
| 1400 x 900 | [Before](screenshots/rob-98-1400x900-before.png) | [After](screenshots/rob-98-1400x900-spacing-48.png) |

T08 identifies the lands row; T11 identifies the hand fan. These are recorded-room previews with a synthetic nine-card
hand, not a live match. The existing [390 x 844 phone baseline](screenshots/rob-99-phone-baseline.png) belongs to slice 1;
this proposal applies only inside the desktop Full-view mat. Phone interaction remains ROB-18.

## Reproduction and limits

Run `node ui-prototypes/rob98-land-spacing.mjs` from the repository root with `GEOMETRY_REQUIRED=1` and `UAT_CHROME`
pointing to Chromium. It starts the existing isolated tabletop preview, adds candidate CSS only in the browser, and
writes comparison images plus measured rectangles and hit-test results under ignored `work/rob98/`.

For every front-row land, the check samples its upper center at 10%, 25% and 45% of the bounding-box height, at rest
and during each of the seven visible hand-card hovers. Pointer movement uses an already visible hit target, avoiding
Playwright's automatic scroll of clipped hand cards. Nine cards are in the hand; two are offscreen in the carousel.

On the shared-shell baseline, 1400 x 900 and 1024 x 768 already pass these samples. At 1280 x 720, two hand-card hovers
cover a sampled land target. All three sizes pass with 48px. The harness asserts both the passing candidate and the
failing baseline, so removing the spacing cannot masquerade as proof of a fix.

No production CSS has changed. Before shipping: Rob's choice, a production browser assertion, a deliberate regression
in a breaks file, the affected board/accessibility suites, current main merged, pins, review, CI, then an engine-owned
staging release. Physical phones, hardware WebGL and legal mana activation on a live table are unproven.
