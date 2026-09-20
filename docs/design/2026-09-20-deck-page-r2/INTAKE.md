# V.0b intake — the Gallery handoff, revision 2 (2026-09-20, 11:23)

**Received:** the same zip, rewritten: 44 files. Two new documents, three updated. Read in full.
The first revision stays under `../2026-09-20-deck-page/` with its own intake; **this revision
wins where they disagree** (its DELTA says so, and so does this note).

| File | Status | What it is |
|---|---|---|
| `IMPLEMENTATION-GUIDE.md` | **new** | The designer's review of the first build pass and the exact order to apply the redesign: tokens with a literal-to-token map, then the shell, then the deck tiles, then the pages, then the theme switch; a definition of done per page |
| `DELTA-play-and-implementation.md` | **new** | Play: the lobby (2b), the table view (2e) and the focus view (2f) in detail, plus playmats and a "CrankMagic Coach" stub |
| `README.md` | updated (28 lines) | A Play addendum and the playmats section |
| `wireframes/Wireframes.dc.html` | updated | Play boards 2b, 2d, 2e, 2f; mat elements; the dialogs |
| `github.md` | updated | the sync record |

## What the designer said about the first pass, and what is true

The guide opens: *the first attempt recoloured the primary button and the readiness bar and left
everything else navy*. That is a fair description of the V.1b render, with one correction to the
cause: the tokens were not "edited but unconsumed"; V.1b repointed the legacy `--v-*` tokens and
converted the 45 most-used literals, which is why the ground, rail, buttons and links changed
while the tiles, borders and page-specific surfaces did not. The guide's literal-to-token table
names roughly eighty literals; V.1b mapped forty-five of them. **The remaining sweep is the next
step and the guide's table is its spec.**

## Where the guide and the repository must be reconciled (the next session does this first)

1. **Token names.** The guide keeps the app's `--v-*` names and extends them (`--v-field-line`,
   `--v-line-strong`, `--v-decision-*` as five tokens, `--v-aether`, `--v-money`, `--st-watch`,
   `--st-draft`, `--st-reserved`, `--st-physical`, `--v-radius`, `--v-radius-card`,
   `--v-radius-tile`, `--v-display`, `--v-body`). V.1a added the handoff's `--color-*` set and
   V.1b made `--v-*` read it. Keep both: `--color-*` mirrors the designer's token files and is
   held by `tests/design-tokens.mjs`; `--v-*` is what the stylesheets read. Add the guide's extra
   `--v-*` and `--st-*` names to `crankmagic-design.css` as aliases or values, and add the four
   new status rungs to the token suite's expectations.
2. **The font.** The guide asks for a Google Fonts `<link>` and a CSP change. **Rob approved
   self-hosting instead** (2026-09-20): Young Serif is OFL; download the woff2 from Google
   Fonts or the OFL repository into `assets/crankmagic/`, add `@font-face` beside Satoshi, point
   `--v-display` and `--font-display` at it, leave the CSP as it is. If the license turns out
   not to be open, find an open-source display serif of the same character and say so.
3. **The Deep Field block.** The guide says a `#matrix-v2{…--v-bg:#12161f…}` block near the
   top of `crankmagic.css` is the palette that renders. V.1b's mapping converted `#12161f` to a
   token, which is why the ground changed; confirm nothing else in that block still bypasses the
   tokens, then delete the block rather than maintain it.
4. **Mana pips in JavaScript.** The `PIP` map in `crankmagic-decks.js` hard-codes five colors;
   the guide wants them read from `getComputedStyle` as `--mana-*`. That is a small code change
   with a test.
5. **The sweep's acceptance** is the guide's: after step 1, raw hex in `crankmagic.css` drops to
   the handful of true constants. The repository's ratchet (`tests/design-tokens.mjs`, ceiling
   730 today) is how that is held; lower it to the measured count in the same PR.

## The order, restated with the guide's numbering

| Guide step | Track V | Notes |
|---|---|---|
| 1 Tokens and the sweep | V.1c | the literal table above; the font self-hosted; the display face on headings and big figures |
| 2 Shell | V.3 | header removed, 216 px rail with the aether wordmark, Menu ▾ at the rail foot; `tests/uat/geometry.mjs` rewritten for the rail |
| 3 Deck tiles | V.4a | tile CSS replaced wholesale per `screens/Gallery Decks.dc.html`; `--tint` per tile from the commander's first color; the summary line replaces the toolbar |
| 4 Deck page, Library, Explore | V.4b–d | per the README's Screens section |
| 5 Theme switch | done in V.1b | the guide wants "Appearance · Dark / Light / System" under Menu ▾; System is a small addition |
| DELTA B–D Play | V.5 | the lobby quadrants, the table view, the focus view, playmats, the Coach stub |

## What the DELTA adds to Play (V.5), in one paragraph each

- **Lobby (2b):** one full-width table in four quadrants (2 · 3 / 4 · 1, you bottom-right), each
  filled by a status element and, once a commander is chosen, a color-identity fan from the
  quadrant's inner corner; all of a player's actions on their own quadrant; a read-only center
  panel with the rules and "Launches when all four are ready"; no Launch button, the 10 s
  auto-launch from `/api/table/readiness`; host tools under a menu; Change deck and Choose mat
  as overlays.
- **Table view (2e):** the whole window is the surface; one-line top strip that never wraps;
  four equal 16:9 boards; the center life counter that cycles life, commander damage and poison
  for the clicking player only; the living mat with the active player's fan; the hand tray.
- **Focus view (2f):** the focused board large, the other three as tiles in a collapsible left
  pane with My board, Table view and a Coach stub; the board as a playmat with card-shaped
  zone frames; the turn-step ribbon; every existing control retained.
- **The Game Host** (Rob, backlog V.5b) sits on top of this: the announcer voice for the phase
  and "up next" moments.

## Definition of done, from the guide, adopted

Per page: no old-palette literal renders; exactly one accent-filled button; blue only in the
logo, the mist, the focus ring and the graph focus; headings and big figures in the display
face; radii 12 / 18 / 22 only; a screenshot beside the matching `screens/*.dc.html` at 1280 px
within ±4 px. To that the repository adds its own: the suites green with the browser flags, the
ratchets lowered, and the render in chat for Rob.
