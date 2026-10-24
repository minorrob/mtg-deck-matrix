# ROB-29 and ROB-169: the commander tax and partners on the board; a look at a hand

October 20–21, 2026, by Claude, holding Codex · Play while Codex is away (Rob: "Open AI is done for the next few days.
Pick up from where we're at."). Branch `claude/play-commander-hand-look`, stacked on #804 (direct blocking).

## What a player sees

- **The commander tax, at the commander's top-right** (ROB-29, Rob: "a small tax badge at the commander's top-right"):
  - a small badge on each commander in the command zone says what it costs more to cast from there: `+0`, then `+2`
    after the first cast, and so on (CR 903.8);
  - it reads the room's `commanderTax`, projected on a command-zone commander (`game/engine/projection.mjs`);
  - its tooltip and the card's spoken label say "commander tax N".
- **Both partners in the command zone.** The pile used to draw only its first card, so Kraum could be cast only from
  "You can also". Now every command-zone card is drawn, the second overlapping the first like a small pile. Each is
  its own button, lit when it can be cast (the same light as a castable card in hand) and inspectable.
- **A look at another player's hand** (ROB-169):
  - "Peek: you look at Maya's hand" (the room's `handLook`, an acknowledgment) used to draw only OK;
  - it now draws the cards above OK, large enough to read, and each opens Card zoom;
  - only the looking seat is sent them, in its own decision.

## Decisions made here

- **The badge is "+2", not "+{2}".** On a 60px card in Full view the braces made the badge wider than half the card. The
  tooltip says the mana in full.
- **Cards with a badge leave it room.** Their name plate stops short of the badge, so the name wraps sooner and never
  lies under the badge. Before this, a11y-board read "Maya General" at 1:1 under the badge.
- **Fixed badge colors:** light on dark in either theme. The theme's ink turns light in dark theme.
- **Not on the rear seats' small cards in Full.** At about 30px wide the badge was wider than the card, so it's hidden there,
  like their names and power. Hover or Card zoom shows an opponent's commander with its badge.
- **In Full view, a click on any lit card selects it.** Its options are in the Card Preview drawer and under "You can also
  ▾", as before. The suite casts Kraum that way in Full, and with a click and its one option elsewhere.

## Proof (Personal-HP, Playwright 1.56 Chromium, `GEOMETRY_REQUIRED=1`)

- **`node tests/board-commander-hand.mjs`** (new): 77 checks, in Full, Table and Focus at 1280x720 and the phone at 390x844.
  - Both partners are drawn together in the command zone. Each badge says its tax and sits at its card's top-right, at
    10px or more, measured in the card's own layout (the phone's board is turned 90 degrees, Full's table tilted).
  - The badge never lies over the name. The tax is said in the label.
  - Kraum is lit, Tymna isn't. Each takes the pointer, by `elementFromPoint`. A click casts Kraum from the command zone.
  - The hand looked at is drawn and named, a shown card opens Card zoom, and OK answers with nothing chosen.
- **`game/tools/batch/breaks-commander-hand.py`:** eight breaks, `missed: []`. Each is caught by the suite:
  - the badge never drawn;
  - the tax not said;
  - only the first partner drawn;
  - the second partner under the first's labels (the bug this pass met: the first card's power and toughness label
    painted over Kraum's middle);
  - the name under the badge;
  - the badge under 10px;
  - the hand not drawn;
  - a shown card opening nothing.
- **Also green:**
  - browser: `a11y-board` 298, `table-board` 281, `board-direct-blocking`, `board-combat-display`;
  - `engine-breaks-anchors`, `feature-wiring` 124, `asset-versions` 125.
- **Pins:** board 61, stage CSS 27, service worker 502, app 519.

## Not proven

- A real phone and touch.
- A live game where a person casts the second partner. The engine's partner tax is separate per commander and covered by
  the engine's commander suites; the board reads it.
