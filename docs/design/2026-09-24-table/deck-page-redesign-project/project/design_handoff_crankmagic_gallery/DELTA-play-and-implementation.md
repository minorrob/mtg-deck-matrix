# DELTA — changes since the first handoff (Play surface + implementation guidance)
Apply on top of the earlier handoff. Files referenced live in this folder. Where this file and the earlier README disagree, this file wins.

## A. Read first
- `IMPLEMENTATION-GUIDE.md` — the token migration and shell/tile restructure, with the literal→token map. The first build pass recoloured buttons only; this is why. Do steps 1–3 before any Play work.

## B. Play — Lobby (wireframe 2b)
1. Table = one full-width container, four quadrants (2 · 3 / 4 · 1, you bottom-right). Quadrant fill = the seat's status element (`table-sea.js`, fixed element: empty=mist · invite sent=wheat · pending acceptance=wheat dark · pending deck=ocean · ready=leaves · error=fire). No legend — the status pill is the legend.
2. Once a commander is chosen, a 90° **colour-identity fan** (SVG, one wedge per colour in WUBRG order, ~60% opacity, thin light seams; mono = one wash) radiates **from the quadrant's inner corner** (touching the centre panel) outward to the player's edges.
3. Quadrant layout: seat label + status pill in the **outer top corner**; full-height commander card (488:680, ~76% of quadrant height) in the **outer bottom corner**, dashed "?" frame until a deck is chosen, click → card pop-up; detail column beside it running to the inner seam minus 12px (long names wrap to two lines, never clip).
4. **All player actions on the player's own quadrant only**: Change deck · **Choose mat** (new) · Ready / Not ready · Leave seat; host adds Invite (email/QR) on an empty quadrant and the AI configurator on AI quadrants. Other quadrants + centre panel are read-only state.
5. Centre panel (~24% width, white, faint greyscale wand stamp bottom-right): Table rules (bracket, cap, AI pilot, remote guests — "set by the host") and a read-only line "Launches when all four are ready · n to go". **No Launch button**: auto-launch with the 10 s countdown when `/api/table/readiness` is empty. Host-only tools under **Host tools ▾** in the action row (rules edit, End table, force-advance).
6. Action row: Game history · Host tools ▾. Host doctor strip stays above the table.
7. **Change deck** (2d) opens over the table: deck strip (art, colours, bracket, real-in-box bar), tabs Saved deck · Lab list · Bring a list (paste / CSV / Archidekt under the third), snapshot + Forge-support summary, one primary "Use <deck> at Seat n".
8. **Choose mat**: same pattern as Change deck — a strip of playmat art (bundled + user uploads, letterboxed to 16:9), live preview of the zone frames over it, remembered per player.

## C. Play — Table view (wireframe 2e)
- Whole window is the surface. Rail hidden (☰ → overlay), right panel closed (**Panel ▸** slides over; never narrows the mat).
- **Top strip, one line, never wraps**: turn · seat · current phase as a brass chip "Main 3/6 ▾" (click → full 6-step strip) · "Next: …" (ellipsised) · **Pass priority** (brass) · **Skip to end** · divider · **History ▾** (log drop-down: newest first, search, phase/card filter) · **Tools ▾** (Recommended, Tracker, Combat, View options, Hold priority / Yield) · **Panel ▸**. No bottom strip.
- Four boards in a 2×2 grid of **equal 16:9 tracks, always identical size**; content clips inside a board and never grows it. Each board header rides its **outer edge** (top edge on the top row, bottom edge on the bottom row), ⤢ Focus on the outer corner — so the counter can overlap boards without covering a control. Your own board carries a compact "Steps" chip row.
- **Centre counter** on the table's true centre: four quadrants tinted by seat identity, one life total each (tabular); inner disc with the logo — clicking cycles the clicking player's own view: life → commander damage taken from each → poison from each (brief mode label; others unaffected).
- **Tabletop**: living mat (random cycle, ~45%) with the **active player's** colour fan from their corner across the whole table; crossfade ≈600ms on turn change.
- Hand strip along the mat's bottom edge on a slate tray (`rgba(26,24,21,.55)` + 3px blur, radius 8), ‹ › paging.

## D. Play — Focus view (wireframe 2f)
- Focused board large (16:9, as large as fits); other three as small aspect-locked tiles in a **left pane** (name + commander, "● active"); click swaps focus. Pane ends with **My board** (brass, always one click), **⊞ Table view**, **CrankMagic Coach** (aether-blue outline, wand mark → slide-over assistant; stub the logic). Pane collapses ◂/▸.
- The board is a **playmat** over the chosen mat art: Battlefield over Lands (left, wide frames); **Command Zone · Exile over Library · Graveyard as card-shaped frames (488:680)** in two narrow right columns, pile inside with top card + count. Thin 1px ~55%-white frames, italic serif zone name bottom-left. **The band between the two card-shaped pairs (right column, between Command/Exile and Library/Graveyard) is the live History log** on a dark translucent strip — newest first, one event per line, fading with age, click → search and phase/card filter. In Focus the top-strip History ▾ opens this same log expanded. The printed steps list and life box are omitted.
- Board header band: name · life · priority, the **turn-step ribbon** (Untap · Upkeep · Draw · Main 1 · Combat · Main 2 · End; done struck/dim, current brass, slides on advance) and **S · M · L card size** at the right.
- **Retain every existing control**: card zoom (hover / long-press), drag-to-group, pile galleries returning to the same scroll, hand arrows, View options, Show board / My board, History, Tracker, Combat, Recommended, Yield / Skip to end / Hold priority, End current game (Host tools).
- Same top strip and hand tray as Table view.

## D2. Card size on the boards
Cards are read at the size of a real card on a real mat — not thumbnails. At the default **M** size a card is **≈13–15% of its board's width** (Table view: 80×111 on a 600px board, two rows of permanents fit; Focus: 112×156 on a ~1060px board, the hand at the same size). **S = 0.75×, L = 1.3×**; the size is per player and remembered. Card-shaped zones (Command, Exile, Library, Graveyard) are one card wide at the current size plus 8px, so they grow and shrink with S/M/L. When a zone overflows at the chosen size, cards overlap (fan) horizontally before the board ever scrolls; boards never grow.

## E. Files in this delta
- `IMPLEMENTATION-GUIDE.md` (new)
- `wireframes/Wireframes.dc.html` — turn 2 boards 2b, 2d, 2e, 2f updated; turn 3 mat elements; turn 4 dialogs
- `wireframes/Sea Options.dc.html`, `screens/table-sea.js` — mat elements (wind → leaves)
- `README.md` — Play addendum, Playmats section, extrapolation guide
