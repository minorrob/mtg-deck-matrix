# Read this first: the standing brief for every CrankMagic design

For Claude Design and anyone else drawing CrankMagic. It applies to every screen, wireframe, token file,
note and label in a handoff. Where a handoff disagrees with it, this wins, and the difference is refused at
intake rather than built.

## The United States, always

Rob, 2026-09-25: *"I NEVER WANT ANYTHING, grammar, currency, etc. from anywhere except The US."* And:
*"Stop defaulting to Europe stuff."* CrankMagic is made in the US, for players in the US.

| | Write | Never |
| --- | --- | --- |
| Spelling | color, gray, center, catalog, canceled, labeled, license, organize, favorite, defense, judgment | colour, grey, centre, catalogue, cancelled, labelled, licence, organise, favourite, defence, judgement |
| Email | email, emailed | e-mail |
| Money | US dollars only: $1,234.56 | EUR, €, £, any other currency, and any currency switch or toggle |
| Numbers | 1,024 and 3.5 (comma for thousands, period for decimals) | 1.024 or 3,5 |
| Dates | Sep 25, 2026 · September 25, 2026 · 9/25/2026 | 25 Sept 2026, 25/09/2026, or a bare 2026-09-25 on screen |
| Times | 2:42 PM | 14:42 |
| Words | email, zip code, cell (phone) | post code, mobile, fortnight, whilst, towards |

Card names are the one exception: a card is printed with its name, so "Gandalf the Grey" stays as printed.

**What went wrong before, so it does not again.** The r3 handoff drew a USD/EUR switch on Settings, and the
first handoffs arrived in UK spelling. Both were caught and removed. The EUR switch was built into a
recommendation before anyone asked why. Don't draw either.

## Sizes are sliders, never steps

Rob, 2026-09-26: anywhere a reader picks a size, draw **a slider** (drag to any point on a scale), never
S · M · L or a row of named sizes. Draw both ends: the smallest must keep every word legible and the largest
must still fit the screen and the layout. Say the range for a phone and for a desktop if they differ.

| | Draw | Never |
| --- | --- | --- |
| Card size, picture size, text size | A slider with its minimum and maximum marked, and the current value | S · M · L chips, "Card / Larger / Large / Full" buttons, a size dropdown |

## Where the rest of the rules live

- `AGENTS.md`, "The United States, always": the same rule for the code, and the tests that hold it
- `AGENTS.md`, "Sizes are sliders, never steps": the slider rule for the code, and the suite that drags each slider to both ends
  (`tests/feature-wiring.mjs` fails on any UK spelling, any "e-mail", any other currency, and any number or
  date not formatted as `en-US`).
- `docs/design/README.md`: where a handoff lands and how it is taken in.
- The newest `docs/design/<date>/INTAKE.md`: what the last handoff decided, and what was refused.
