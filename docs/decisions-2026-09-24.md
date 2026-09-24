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
sideways scroll. The bar has no track and lives in the bottom 10pt of the zone.

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

## 8. Two lanes on the battlefield: creatures, then everything else

> "Is it possible to set board cards that are supposed to be in row 2 of the battlefield skipping
> columns where row 1 pushes down over row 2 (e.g. Goblin Tokens stack in this screenshot), but
> putting cards in the second row where a card space is available (e.g. Skirk Prospector, below that
> card, then the next below Sol Ring (though sol ring would go to second row as it's not a creature)?"

Creatures (dorks and creature tokens included) run along the first row; artifacts, enchantments and
the rest along the second. A first-row stack deeper than one card reaches into the second row and
takes its column; a single card leaves the slot beneath it, and second-row cards fill those slots left
to right before opening columns past the last creature. On his board: Sol Ring under Skirk Prospector,
nothing under the token stack, Thornbite Staff in the next column. `planLanes` in
`game/ui/card-layout.mjs`.

Two details the geometry forced. At the commander's size two cards and two group labels were about ten
pixels taller than the battlefield, so **a second-row label overlaps the foot of the card above it**,
left-aligned and short, clear of that card's power and toughness. And the second row has room for one
card and not a fan, so two enchantments stand side by side. A group that has to split now splits
evenly — five at a depth of four is three and two — so a stack never sheds one stray card.

When only one kind of card is on the battlefield, or the zone is too short for two rows (the four-up's
small boards), the one-lane layout of section 3 applies.

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

## Found on the way: the four-up had been blank

At `ad65ad7`, before any of the above, a live pod showed **every board on the four-up empty** —
mats collapsed to 7×4px, seats shrunk to their headings (396×223). `c115df4` had made the mat
`width:auto` and centered it; a mat is inline-size contained, so an auto width is zero. Seats now
take their height from the viewport (the rule `tests/wireframe-conformance.mjs` already held) and
their width from 16:9, and the mat grows into the height under its heading with its width from its
ratio.
