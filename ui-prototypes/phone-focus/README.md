# ROB-18: native Focused phone layout for Rob's review

October 18, 2026. This is an isolated layout proposal, not a production phone board. Run from the repository root:

```powershell
$env:GEOMETRY_REQUIRED='1'
$env:UAT_CHROME='C:\Program Files\Google\Chrome\Application\chrome.exe'
node ui-prototypes/phone-focus/preview.mjs
```

The harness starts the existing recorded-table preview and substitutes only the phone function and CSS in its browser.
It uses the current board's controls and public recorded state. Production source files are not changed, and this
folder is not shipped. Screenshots are written under ignored `work/rob18/`.

Recommendation: keep turn controls and seat summaries visible, scroll the battlefield and lands together at full
width, place the card piles below them, and open the hand as a bottom drawer. Portrait and landscape keep the same
Focused view. Camera has no view switch and no Tilt. P01 marks utilities, P02 the turn/action area, P03 the battlefield
and P04 seats. Rob's choice is recorded in ROB-18 and `docs/readout/feeds/codex-play.json`.

The phone function and the initial native layout were ported narrowly from `ebb1dfd4` on the old broad draft,
`codex/ui-playtest-plan-oct15`; that branch is never merged. This prototype adds full-width zones, a bottom hand
drawer, touch-sized close/action controls and phone-specific hand instructions.

The harness checks 390 x 844 portrait and 844 x 390 landscape, native orientation, full viewport fit, no sideways
page overflow, Camera controls, emulated-touch hand opening/closing/swiping, no card selected by a swipe, retained
turn context above the hand, and no outbound game action during this exploration. The mutation harness is:

```powershell
python game/tools/batch/breaks.py game/tools/batch/breaks-phone-focus-prototype.py
```

It must catch a restored quarter-turn and a hand overlay that covers the turn controls. These are layout checks,
not complete feature acceptance. Safe tap-to-inspect on battlefield cards, one utility at a time, keyboard clearance,
real-room choices, complete accessibility, physical phone and hardware WebGL testing remain unproven. No production
phone implementation or staging release is claimed. Broad implementation waits for Rob's visual review.
