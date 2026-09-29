# Decisions of 2026-09-29 — the Play board against the r3 wireframes

Rob, on staging.crankmagic.com, 2026-09-29: *"the play screens are all entirely wrong from the wireframes provided
... Follow them exactly for the play screens ... Look for the patterns in the wireframes. Replicate them. Check
against the intent of the play board."* The board's first cut (#410, #411) had drawn the three views as lists on
felt: no 16:9 mat, the hand a row below the fold, the Table view's boards without their piles, Full screen's board
without a Library, the hover card at the top right. This record is what the rebuild follows, and the calls Rob
made with it.

## The views, as the wireframes have them (2e, 2f, the Play Focus mock, Wireframes v2)

| | |
| --- | --- |
| **The surface** | The game fills the window. The app's rail is under it and comes back from ☰ in the strip; Panel ▸ and the Coach slide over the surface and never narrow it. |
| **The strip** | One 48px line: ☰ · Turn · the step as a brass chip · n / 7 ▾ · Next: … · Pass priority · Skip to end · You can also ▾ · Table \| Focus \| Full screen · History ▾ · Tools ▾ · Panel ▸. |
| **The playmat** | One component at four sizes: Battlefield over Lands on the left; Command over Library and Exile over Graveyard as card-shaped frames on the right; in Focus the History band between the two pairs. The header carries name · vitals · commander, and on your own Focus board the step ribbon. |
| **Table view** | Four identical 16:9 boards in a 2×2 (2 · 3 / 4 · 1, you bottom right), each header on its outer edge, measured to the largest that fit the tabletop; the living mat and the active player's color fan behind; the wand logo at the true center opens Table vitals; your hand along the foot. |
| **Focus view** | Your board is the largest 16:9 that fits beside the 168px pane; the hand docks over its bottom edge on a slate tray, cards peeking and lifting on hover, the Lands kept clear; the pane ends in My board · Table view · Coach and collapses ◂. |
| **Full screen** | A 44px rail; up to three opponents across the top 40%; the big board across the lower 60%, full bleed and frameless, zones implied by where cards sit; the right column: every seat's vitals, the card under the pointer large with what it can do, and the log. |

## Rob's calls

1. **The card pop-up is centered on the screen, and larger.** Hovering a card in Table or Focus shows it at the
   center of the window at 400px (it was 320px at the top right). In Full screen the right column is the pop-up,
   as the wireframe draws it. A right click or a long press still opens Card zoom with what can be done.
2. **Full screen has ⟳ Rotate.** It walks the big board round the table — you, then each opponent in seat order,
   then you — the way a camera would move from chair to chair. Never a hand: the room sends no other seat's hand,
   so there is nothing to show. The strip's corner says *Viewing Nina* with ⟳ and **My board**, and the view opens
   on your own board every time, because the big board is your playable space.
3. **Skip to end** (the wireframe's second decision beside Pass priority) passes priority for you through the rest
   of the turn. It stops by itself when the turn ends, when anything is on the stack, or when the room asks you
   something that is not priority: a decision is never made for you (AGENTS.md).
4. **Priority floats nothing over the board.** The cards you can use are bright; what else can be done is under
   **You can also ▾** beside Pass priority. Only a decision that is not priority (Keep this hand?, blockers, an
   order, damage) floats under the strip where the prompt is.

## What is measured, not guessed

`fit()` in `crankmagic-board.js` sets `--board-w` (Table view), `--mat-w` and `--mat-reserve` (Focus), `--full-w`
and `--opp-w` (Full screen) from the window, and `--lap` on any row of cards that would run past its zone, so cards
fan before a board ever scrolls or grows (DELTA D2). `tests/table-board.mjs` reads the boards back: identical 16:9
in Table view and the largest that fit; the Focus mat 16:9 and the largest beside the pane, the hand over its
bottom edge with the Lands clear; the board the whole viewport; the Library drawn on every board; the pop-up at the
center, 400px; ⟳ in Full screen; Skip to end passing unasked and putting itself away at the turn's end.
