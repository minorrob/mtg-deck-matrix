# ROB-18: upright Focused phone proposal

October 18, 2026. Branch `codex/play-phone-focus`, following #754 and #765. Production phone code is unchanged.

Rob's call, as the issue's P02 requires before broad implementation: use one native Focused layout with turn controls
and seats kept visible, the full-width battlefield and lands scrolling together, and the hand in a bottom drawer.
The recommendation and pending choice are mirrored in Linear ROB-18 and the Play feed.

- [Portrait, 390 x 844](screenshots/rob-18-390x844.png)
- [Landscape, 844 x 390](screenshots/rob-18-844x390.png)
- [Portrait hand drawer](screenshots/rob-18-390x844-hand.png)
- [Landscape hand drawer](screenshots/rob-18-844x390-hand.png)
- [Portrait Camera](screenshots/rob-18-390x844-camera.png)
- [Desktop boundary, 1280 x 720](screenshots/rob-18-1280x720-desktop-baseline.png)

P01 utilities, P02 turn/action, P03 battlefield, P04 seats; T10 Camera and H01 desktop header.

`node ui-prototypes/phone-focus/preview.mjs`, with `GEOMETRY_REQUIRED=1` and `UAT_CHROME` set, passes both phone
orientations and the desktop boundary. It proves native orientation, viewport fit, no sideways page overflow, no
phone view switch or Tilt, opening/closing Camera and the hand by emulated touch, a native touch swipe browsing the
hand without selecting a card, a 44px close target, retained turn context above the hand, and no outbound game action
during this exploration. Screenshots wait for visible card images to decode.

`python game/tools/batch/breaks.py game/tools/batch/breaks-phone-focus-prototype.py` passes its unmodified baseline
and catches both regressions, `missed: []`: a restored quarter-turn and a hand overlay covering the turn controls.
The [prototype README](../../ui-prototypes/phone-focus/README.md) records the narrow port's source and how to rerun it.

This is layout proof, not complete mobile acceptance. Safe tap-to-inspect on battlefield cards, one utility at a time,
keyboard clearance, real-room decisions, complete accessibility, a physical phone and hardware WebGL remain unproven.
No production assets or pins are changed by this proposal; staging remains engine-owned. Rob's visual review is pending.
