# The Spreadsheet view of the Collection page

*A plan, written 2026-09-13, for the next build session. Nothing here is built yet.*

## What Rob asked for

> Given this Master sheet is what I keep going back to, a table view of a definitive list of
> distinct cards I own, where I can see side by side the per-deck allocation target and then
> assign the owned count per card to each of the decks by clicking in a cell and typing the
> number.

One row per distinct card. The columns are the Master sheet's own: how many you own, how
many are on order, how many are still to buy, and for each of the six decks the target
count and the count assigned to it. Click a cell, type a number, and the library changes
the way it would if you had done it row by row from the Actions menu — through the same
collection-model commands, with the same confirmations where something would be lost.

## What exists to build on

- **The roster.** `crankmagic-collection.js` already renders one table for lots, requirements,
  draft rows, suggestions and planned cards, with search, filters, grouping, folding of
  printings into one row (`foldPrints`), ticks and batch actions, and in-place edits of two
  cells (`EDITS = {paid, quantity}` → `cell-edit` → the count stepper). The Spreadsheet is a
  third *list type* of that page, not a new page: same toolbar, same filters, same ticks.
- **The projection.** `M.projection(state)` gives every copy record with its placement
  (In deck box / Reserved / Bench / Unassigned) and every open requirement (`need` rows).
  `M.readiness(state, deck)` gives target / owned / ordered / placed / toBuy per deck. The
  Spreadsheet is a pivot of those two, keyed by card.
- **The commands.** Everything a cell edit needs already exists as a reviewed command:
  `acquire` (new copies at a status), `allocate` (reserve a copy to a slot), `bulk place` /
  `bulk bench` (physical box), `release`, `dispose`, `removePending`, `quantity` (a lot's
  count), `acquireSlots` (record copies against a deck's rows). A cell edit is a small
  planner that turns "make this number N" into one of those, or refuses with the model's
  own reason.
- **The Master as the reference.** `tools/build-live-load.mjs` documents exactly what each
  Master column means in model terms (Own, Buy Count, Ordered, D-T, D-A). The Spreadsheet
  shows those same six-plus-twelve numbers, so what Rob reads in the app is what he would
  read in Excel, and the CSV export gives the columns back in the workbook's order.

## The view

### Rows

One row per **card identity** (printings folded, as the roster's *Fold prints* does; unfold
to see one row per exact printing). A card appears when any of these is true: a copy record
exists at any status, a finalized deck lists it, a group plans it. Basics appear like any
other card (they are the rows with quantities above one). Archived decks and their copies
are left out.

### Columns

| Column | Meaning in the model | Master column |
|---|---|---|
| Card | name, colour pips, type on hover; click opens the card | A |
| Own | Σ owned copies, anywhere | P |
| Ordered | Σ `ordered` + `incoming` copies | S |
| To buy | Σ shortfall over finalized decks' committed slots (derived; read-only) | Q |
| Bench | Own − Σ In box; owned copies not sitting in a deck box | AL |
| D*n* T | the deck's main-slot quantity for the card (0 = not in the list) | W–AB |
| D*n* A | copies **assigned** to the deck: reserved to its slot, in the box or not | — |
| D*n* ▣ | copies **physically in the deck's box** (subset of A) | AE–AJ |
| Flags | Option / Pinned per deck, as small chips | — |

The two per-deck assignment columns are the heart of it. The Master has only "in box"
(A); the app also knows "reserved but still on the bench" and "ordered and reserved", and
readiness runs on assignment, not on the box. Showing both keeps the app's number and the
box's number honest side by side. A **compact toggle** (`Show: Assigned · In box · Both`,
default *Assigned*) keeps the table to Own + 6 deck columns on a laptop screen.

A **totals row** stays pinned at the bottom: per deck Σ T (must read 100), Σ A, Σ ▣, and the
count of rows short. It is the same arithmetic as the Master's row 2, and it is where a
mistake shows first.

### Editing a cell

Click a cell (or focus it and press Enter) → it becomes a number input with the current
value selected. Enter or Tab commits; Escape reverts; Tab and Shift-Tab move along the row,
arrows move between rows. The commit goes through the same `C.review` sheet the batch bar
uses whenever the change loses something (a copy leaving a box, a reservation released, a
copy deleted); a plain raise commits directly and can be undone from History.

What each edit turns into, given old value *o* and new value *n*:

| Cell | n > o | n < o |
|---|---|---|
| Own | `acquire` (n − o) owned copies on the bench; if the row was a requirement or a plan, `acquireSlots` so they are reserved to the deck that needs them | pick the copies to remove: bench first, then reserved, then in-box, listing each; goes through the existing *Delete… (sold, traded, lost)* flow with the count pre-filled |
| Ordered | `acquire` (n − o) at `ordered` | `removePending` on the newest ordered lots (cancel), never a received copy |
| D*n* A (assigned) | needs (n − o) free copies: unallocated owned first, then ordered/incoming; each becomes `allocate` to the deck's slot. If the deck's T is 0 the cell is read-only with the reason ("not in the list; add it from the deck page"). If free copies run out, the review sheet offers the copies reserved to *other* decks (named), and taking one is a `release` there + `allocate` here — the model's `eligibility` reasons are shown verbatim | `release` (o − n) copies; a copy in the box is moved to the bench as part of it (the confirm names it) |
| D*n* ▣ (in box) | (n − o) copies assigned to this deck but on the bench → `bulk place`; if fewer are assigned than needed the review offers to assign first (same as raising A) | `bulk bench` (o − n) copies; reservation kept unless the *also release* tick is set |
| D*n* T | read-only in the first version: a target is the deck list, which the deck page edits with its legality checks. The one exception worth doing early is a basic land's quantity, which is a `quantity` change on the slot | — |
| To buy, Bench | derived, read-only | — |

Rules the planner enforces, all of them the model's existing ones: never assign more than
T; never assign a wanted/watching copy; never touch a locked deck's reservations without
saying so; never place in a box a copy not reserved to that deck.

### Filters and scope

The toolbar's search and Group-by work unchanged (group by colour, type, or by deck, which
here means "rows this deck lists"). Two filters are specific to the Spreadsheet: **Short
only** (rows where any deck's A < T) and **Boxed ≠ assigned** (rows where a deck's ▣ < A —
the pull list). The deck scope (`?deck=`) limits the columns to that one deck plus Own /
Ordered / To buy.

### Export

*Export view* writes the visible rows as CSV with the Master's headers and order — `Card,
Own, Buy Count, Ordered, D1-T … D6-T, D1-A … D6-A` — so a round trip into the workbook is
a paste, and `tools/build-live-load.mjs` reads the result back.

### Phone

Under 640px the first column is sticky, the six deck columns scroll sideways under a
sticky header, and the compact toggle defaults to *Assigned*. Editing works the same; the
number keypad opens.

## The model side

One new pure function, `M.matrix(state)`, so the view is a renderer and the numbers are
testable without a browser:

```
matrix(state) -> {
  decks: [{id, name, target}],                    // finalized, unarchived, in priority order
  rows:  [{cardId, card, own, ordered, toBuy, bench,
           perDeck: {[deckId]: {t, a, boxed, slotId, lotIds: [...], option, pinned}},
           flags}],
  totals: {[deckId]: {t, a, boxed, short}}
}
```

Invariants to pin in `tests/collection-model.mjs`: Σ `perDeck[d].a` over rows equals
`readiness(state, d).owned + ordered + incoming`; Σ `boxed` equals `readiness.placed`; Σ `t`
equals `readiness.target`; `own` equals `counters.owned` summed over rows; every `lotIds`
entry is a lot allocated to that slot. And a planner function, `M.plan(state, {cardId,
deckId, column, value})`, that returns the command list (or the refusal) without applying
it, so the tests can assert "typing 3 in D4 A for Sol Ring with two free copies returns two
allocates and an offer naming the third copy's deck" and the view only renders what it
returns.

## Build order

1. **`M.matrix` and `M.plan`, with tests.** Pure, no UI. Half a day.
2. **Read-only Spreadsheet list type** on the Collection page: rows, columns, compact toggle,
   totals row, the two filters, CSV export, phone layout, geometry test at 1400 and 390.
   Ship it — it is already the side-by-side view Rob asked for.
3. **Own and Ordered cells editable** (adds, removals through the existing delete flow).
4. **Per-deck A and ▣ cells editable**, with the review sheet for anything that takes from
   another deck or a box, keyboard movement along the row, and a journey step that types a
   number and checks the reservation landed.
5. **Basic-land T cells**, then decide from use whether other T cells are worth it.

Each step is its own PR with `?v=` bumps and the six gates. The whole of it is on the
order of 500 lines of JavaScript plus the two model functions.

## Open questions for Rob

- Default *Assigned* or *In box* for the per-deck column? (Plan says *Assigned*: it is what
  readiness runs on.)
- Should a raise of Own default the new copies to the bench, or to the deck that is short
  of that card when exactly one is? (Plan says: to the deck when exactly one, bench
  otherwise, and say which in the toast.)
- Is the CSV export enough, or should the view also read a pasted Master range (the
  importer's job today)?
