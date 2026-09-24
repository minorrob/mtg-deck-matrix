# The board, decided while looking at it — 2026-09-24

Rob made these calls on 2026-09-24 while reviewing screenshots of the Focus view and the four-up
table, one iteration at a time. **This file is the record.** Where code carries one of them, the
comment quotes him and points here rather than restating the reasoning.

Every screenshot was taken against a fixture board (the Play Focus Mock's Krenko goblins, real card
images from `data/cards.json`) on a spare host, and the four-up was checked again in live native-AI
pods (`game/tools/qa-pod.mjs`). Measurements below are at 1920×1080 unless they say otherwise.

---

## 1. The Play Focus Mock is not being built

`docs/design/2026-09-24-table/` (the Claude Design handoff) was extracted and briefly started. Shown
the current Focus with a developed board, Rob: *"So that screenshot is pretty good as is. Only
changes are…"* — and the four changes below. **The mock's grid layout, header strip and hand tray
are not the plan.** The handoff folder stays as source material. This supersedes item 2 of
`docs/handoff-2026-09-24.md`.

Two answers were given before that, for the rebuild, and one still stands: **the left pane shows
each opponent's real board in miniature**, not the mock's tinted boxes (Rob had asked for "a small
exact image of each player's board" earlier the same day).

## 2. Every card on the mat is the commander's size, always

> "The card sizes in battlefield are bigger than the lands, commander, etc. Every card on the play
> mat should be exactly the same size, always. The size of the commander card in the above
> screenshot is correct proportions to mat size."

Measured before: battlefield cards 240 and 279px, lands 125–145px, commander 188px. Now one width —
the card that fits the Command frame — for battlefield, lands, piles and free cards, on every mat.
`alignToPiles()` in `game/ui/review.mjs` measures it; `game/ui/card-layout.mjs` only arranges cards
of that width.

**Consequence: the table's "Board card size" slider is gone.** It existed to make battlefield
cards a different size from the piles. A board is resized as a whole instead (the resize handle on
your board; the board-size bar in Focus), and every card moves with it.

**The lands outline moved to make room for one.** At the commander's width a card was taller than
the outline (261px in 233). Its bottom now sits level with Library and Graveyard — the same rule as
the battlefield ending level with Command and Exile (2026-09-23) — and its top rises only as far as
a card and its padding need, never into the Lands label.

## 3. Nothing goes below a zone's bottom edge; one row scrolls sideways instead

> "The horizontal scroll bar for battlefield is needed, and those in a second+ row pushed below the
> battlefield bottom boundary should rearrange into a single row with the side-to-side scroll bar
> (no border around the window that scrolls, just the scroll bar)."

Two causes, both fixed. The card list was `position:relative`, so its inset never applied and it
grew with its cards (702px of list in a 578px battlefield). And the stacking depth was worked out
from the total card count, so groups each rounding up came out as more items than columns — 14 cards
in six groups became eight items at five columns. Now: if every card fits the rows the zone holds,
they wrap; otherwise it is one row, groups fan only as deep as the height allows, and the rest is a
sideways scroll. The bar has no track and lives in the bottom 10pt of the zone. Where the
battlefield has room for two rows — Focus — section 8's rules govern instead.

## 4. The 10pt padding scales with the board below Focus size

Asked, because the one-size rule made the four-up's cards 13–24px: the fixed 10pt (Rob, 2026-09-23)
and the Lands label left almost no height on a 208px board. Rob chose **scale the padding to the
board**: 10pt on the Focus board at 1920×1080 (1653px wide) and anything larger, in proportion below
that. The four-up's cards came out 33–43px.

## 5. The left pane: taller boards, a divider, tiles that hug their boards

- **Widen rather than stretch.** Asked what should fill the pane, Rob chose **widen the pane**:
  `clamp(200px, 23vw, 480px)`, about 440px at 1920×1080, where three boards and their names fill it.
- **The divider is the player's.** *"Let's make the left side pane dynamically adjustable by the end
  user adjusting the column width by adjusting the divider between their board and the side pane,
  down to whatever is about 50% of the current size."* Drag, arrow keys, or double-click to restore;
  kept as a share of the default so it means the same at any window size; remembered per browser.
- **No filler.** *"The containers on the left side bar for each of the mats should not result in all
  of that additional white space in each container above/below each mat."* And: *"When the user
  resizes the side bar, not only should the mat expand/contract, but the entire container should
  resize with it. Keep the Seat name the same size regardless."* A tile is its name, its commander
  and its board at the playmat's own proportions, nothing else.

## 6. A board-size bar replaces S / M / L

> "I still see S, M, L at the top and not the gradient size scale bar, which will give the end user
> greater control and optionality."

Measured first: **S, M and L all drew the same 1411×833 board** — two later rules out-weighed the
ones they set, so the switch had never done anything. The bar (50–200%) sets the focused mat's own
width, carrying the id, and every card scales with it. This supersedes 2f's three named sizes.

## 7. The table notice is one row and the card

> "The pop-up should have nearly nothing around the card other than the header (e.g. "You - Plains"),
> then in the same row justified to the right should be the action that took place (e.g. "drew a
> card") and at to it's right a green check mark to acknowledge and close the window (removing the
> huge "Ok" button)."

The backlog count that sat beside OK rides the check as a small "+N" badge. `qa-pod.mjs` clicks the
check now, since it no longer finds an OK button.

## 8. The battlefield's rules: reading order, creatures first

It took two passes. The first kept creatures on row 1 and everything else on row 2 — Rob's first
question, *"Is it possible to set board cards that are supposed to be in row 2 of the battlefield
skipping columns where row 1 pushes down over row 2 … but putting cards in the second row where a card
space is available"* — and it left row-1 cells empty above row-2 cards. His correction:

> "The creature cards should be on the first row, only going to the second row once the first row is
> full in the visible pane. You have empty spots next to the Goblin token stack on row 1 (above row 2
> cards). Think through how the mechanics of the battleground should be designed to support the
> flexibility. And perhaps articulate to me the rules that govern that space."

On seeing the result: *"This is good!"* The rules, as built (`planTwoRows` and `orderGroups` in
`game/ui/card-layout.mjs`, each held by a test that was broken on purpose and went red):

1. **Reading order.** Row 1 fills left to right across the visible width, then row 2 left to right. No
   cell stays empty while a card further along has a place, and nothing goes past the right edge while
   a visible cell is free.
2. **Creatures first.** Creatures, mana creatures, creature tokens; then mana rocks, artifacts,
   enchantments, other tokens (Treasure and the like), the rest. A group the player made goes with
   its creatures if it has any. Within a group, the order the engine lists the cards.
3. **A cell holds one card.** A stack is taller than a row, so it takes its whole column; a single
   card leaves the cell under it for the next card in order.
4. **Stack only as deep as you must.** Every card stands alone if the visible cells can hold them;
   otherwise groups stack, evenly, only as deep as it takes to fit. A group that reaches row 2 stands
   its cards up one per cell there.
5. **Scroll only when the cards do not fit.** Past the deepest stacks the zone allows, the grid goes
   on beyond the right edge a column at a time, and the zone scrolls sideways.
6. **One row when there is room for one.** The four-up's small boards are too short for two; they
   keep one row in the same order, stacking and scrolling by the same rules.

On his board: row 1 is the creatures stack, Skirk Prospector, the Goblin token stack, Sol Ring and
Thornbite Staff; row 2 is Shared Animosity under Skirk and Impact Tremors under Sol Ring; nothing
scrolls. At the commander's size two cards and two labels were about ten pixels taller than the
battlefield, so **a row-2 card's group label overlaps the foot of the card above it**, short and
left-aligned, clear of that card's power and toughness.

**A consequence worth knowing:** because creatures come first, a creature entering the battlefield
moves the cards after it along one cell — a non-creature at the end of row 1 can drop to row 2.
Tapping never moves anything; a tapped card only tilts where it is.

## 9. The hand has its own size, twice the frame's by default

> "Hand cards can be bigger than cards on the mat. They should have their own card re-sizing slider
> bar. By Default they should be 2x what you have currently in the screenshots."

Measured first: the four-up's hand and Focus's hand both drew 68px cards, because
`body.table-view .hand-track .card` out-weighed all three of Focus's own hand rules. Now one variable,
`--hand-card-width`, 136px by default, with a "Hand size" bar (50–250%) in the hand's heading in both
views, remembered per browser. The four-up's `--board-chrome` grows by the extra height a bigger card
brings, so the hand stays above the fold and the boards give up the room: at the default they are
about 448×252 (533×300 with the old 68px hand). In Focus the hand sits below the board, as it did;
the board-size bar trades one against the other.

## 10. Lands: one row, basics in piles

> "Also, can we stack basic mana cards in the Land section, then when 1 is tapped that single card in
> the stack tilts slightly"

Basic lands of one name are one pile, overlapping sideways so a slice of every card shows; each card
in the pile is still its own card to click, and a tapped one tilts where it lies without moving the
rest. Basics come first in W U B R G order, then the other lands as they arrived. The lands zone is
one card tall, so it is one row, and it scrolls sideways when the row is wider than the zone.
`planLandRow` in `game/ui/card-layout.mjs`.

## Found on the way: the four-up had been blank

At `ad65ad7`, before any of the above, a live pod showed **every board on the four-up empty** —
mats collapsed to 7×4px, seats shrunk to their headings (396×223). `c115df4` had made the mat
`width:auto` and centered it; a mat is inline-size contained, so an auto width is zero. Seats now
take their height from the viewport (the rule `tests/wireframe-conformance.mjs` already held) and
their width from 16:9, and the mat grows into the height under its heading with its width from its
ratio.
