# CrankMagic Tabletop: the collection as piles on a table

Definition and plan for the third view of the Cards page Rob described on 14 September 2026.
The Cards page has a list and a sheet; this is the view where the cards are cards. Mock-ups:
`docs/mockups/tabletop-piles.html` (the table at rest), `docs/mockups/tabletop-laid-out.html`
(a pile opened, two cards selected, the selection on the mat mid-drag). TB1–TB4 are built
(the table at rest; lay out, page, select; drag to a pile; polish — 14 September).

The app is for anyone building any deck: the piles are the statuses and groupings the model
already has, so the view needs no data of its own and works on any library.

## 1. What it is

A tabletop that holds **every card the library knows about, as cards**:

- every owned copy (a real card),
- a **ghost card** for every ordered copy, and — with a deck selected — a ghost for every
  card that is legal for that deck and not owned (the graph's Commander-legal cards inside
  the deck's colour identity and bracket ceiling; ghosts are outlines, never counted as held).

**Down front: the status piles**, in the order the work happens — *Physical deck · Reserved ·
Ready to add · Ordered · To buy · Substitute*, each a stack whose height is its count and
whose top card is its most recent change. **Along the top edge: the Bench**, a long rail of
the copies that belong to no deck, fanned so their edges show. **Behind the status piles, in a
semicircle: the group piles**, whose grouping is a dropdown — card type, colour, mechanic
(with sub-groups where a mechanic family splits: sacrifice → outlets / fodder / payoffs),
role, Primary Purpose, mana value, price band, collection group, deck. Each pile carries its
label and count on a small placard.

**Search and filters** (the same six visible filters as the list, the rest under *More
filters*) sit above the table and apply to every pile at once: a filtered table shows only
the matching cards in each pile and greys the placards that go empty.

**The surface.** No felt. The table is a **slate sorting mat** in the app's own palette
(`#1c2434` falling to `#121927`), with a fine dot grid every 24 px so laid-out rows and columns
read as placed rather than floated, one soft light from the top left, and a dark bevelled edge.
The Bench rides on a **raised ledge** along the back edge with a brass hairline under it. Each
pile stands in a **shallow slot** cut into the mat, so an emptied pile still shows where it
lives. The paper placards are the one warm element; the selection stage glows gold; ghost cards
are dashed in the muted ink. Everything else is the slate, the line and the accent the rest of
CrankMagic already uses, so the Tabletop reads as a view of the app and not a different game.

## 2. Interaction, step by step

1. **Click a pile** → its cards **lay out in straight rows and columns** across the mat
   (the other piles slide to the edges and shrink), sorted by the pile's natural order (mana
   value then name; the Bench by name; Ordered by order date). More cards than fit → **pages**
   (a page is what fits the viewport at the current card size; the page strip says *1–48 of
   131*). A card size control (S · M · L) changes what fits.
2. **Click a card to select it**; shift-click or a tick in the corner extends to
   **multi-select**. On the first selection the other cards **recombine into their pile** —
   a short animation, each card sliding back to the stack — and the **selection stays on the
   centre of the mat**, fanned if more than one, face up, at large size, with the card's
   name, status pill, price and deck beneath.
3. **Drag the selection onto any pile.** A status pile = the status change the Status
   fly-out performs today (*Physical deck*, *Bench*, *Ordered*, *Wanted*, …) — the same
   `CrankCollection.apply` commands, previewed the same way (the receipt dialog for anything
   that changes money or a deck, no dialog for a bench ↔ box move). A group pile = the
   grouping's action where one exists (a collection group pile files the copy into that
   group; a deck pile reserves the copy for that deck or, for a ghost, adds a To buy row;
   a card-type or colour pile is not a target and says so on hover). Drop outside a pile =
   the selection returns to where it came from.
4. **Right-click or long-press** a selected card → the row's ⋯ menu from the list (Inspect,
   Replacements & options, Flag as option, Pin, Delete).
5. **Escape** or click the mat → clear the selection; click the pile's placard again → close
   the layout and return to the table at rest.

Ghost cards can be selected and dragged like real ones; dropping a ghost onto *Ordered*
records an order, onto *Physical deck* or *Bench* records an owned copy (the same commands
Add a card uses today), so the tabletop is also the fastest way to record a purchase.

## 3. Phone

The table becomes two rows: the status piles as a horizontal strip you swipe, the group
piles as a second strip under the grouping dropdown; a tapped pile lays out at card size S
in a three-across grid with the page strip pinned at the bottom; a selected card floats
above the grid with a **Move to…** button that lists the piles, because drag-and-drop on a
phone is unreliable and a menu is honest about it. The Bench rail is the first item of the
status strip.

## 4. What the model already has, and what it needs

Already there: every pile is a query the model answers today — `projection()` rows carry
`placement` (Physical deck · Reserved · Substitute · Bench · Unassigned), `source` (owned ·
ordered · watching), `kind` (lot · need · draft · option · entry), deck and group ids;
`readiness()` gives the counts the placards show; the classifier gives type, colour, role,
Primary Purpose and mechanics for every card; the Status fly-out's commands are the drop
targets.

Needs, all small and all worth settling in the data-model evaluation first:

- **A stable per-row id across views** (`recordId` exists for lots and needs; ghosts for
  deck-legal cards need a synthetic `ghost:<deck>:<card>` id so a selection survives a
  re-render).
- **One status vocabulary in one place.** The list's `statusOf`, the pill kinds in the app
  shell and the readiness bar's segments each name the statuses; the tabletop is a fourth
  consumer. Move the vocabulary (id, label, colour token, order) into the model so all four
  read it.
- **Grouping as data.** The sheet's *Group rows by* choices and the tabletop's grouping
  dropdown must be the same list, with each grouping's key function and sub-group rule in
  one module (`crankmagic-groupings.js`), so a new grouping appears in both.
- **A drop-target contract.** Each pile declares `accepts(rows) → command | null`; the same
  contract lets the list's batch actions and the tabletop share their previews.
- **Card art at scale.** A laid-out pile of 48 cards is 48 images; the image cache
  (`card-images.js`) needs a small-size variant and a viewport-aware loader so the page does
  not fetch the whole pile at once. Ghosts render from the same art at reduced opacity.
- **Animation budget.** The recombine is transforms only (no layout), capped at ~60 cards
  moving; beyond that the rest fade. `prefers-reduced-motion` skips it.

## 5. Execution plan

- **TB0 — vocabulary and groupings** (with the data-model work): status vocabulary and
  grouping module in the model, consumed by the list and the sheet first; tests.
- **TB1 — the table at rest.** `crankmagic-tabletop.js`: the mat, the status piles, the
  Bench rail, the semicircle of group piles, the grouping dropdown, search and filters
  applied; counts against `readiness()` in a test; the view switch on Cards gains
  *Tabletop*. Walk at 1400 and 390.
  *Shipped 14 September (#189).* `CrankTabletop.table(rows, {groupBy, statuses, statusOrder,
  value})` is pure and tested (`tests/crankmagic-tabletop.mjs`: every row lands in exactly one
  status pile or the Bench, the piles sum to the projection, nine groupings, no empty or
  unlabelled band); `mount()` draws the mat. The status piles are `M.STATUS` in its order,
  which answers TB0's vocabulary question without a new module: the list, the pills, the
  readiness bar and the tabletop all read the same list. Ghosts are the copies the library
  knows about but does not hold — Ordered, Watched, To buy, Draft list, Suggestion, Planned —
  and no more: the deck-legal catalogue ghosts of §1 wait for TB3, where a ghost first becomes
  an order. The grouping list is the tabletop's own `GROUPINGS` for now; folding the sheet's
  *Group rows by* into it is the `crankmagic-groupings.js` item in §4, still open. A tap on
  a pile names its top six cards; laying it out is TB2.
- **TB2 — lay out, page, select.** Click a pile → rows and columns with pages and card
  size; select and multi-select; the recombine animation; the selection on the mat.
  *Shipped 14 September (#190).* `pileOrder` and `layout` are pure (the test holds the pages
  to the pile: eight across at M on 960, three across on a phone, a page past the end clamps).
  When a pile is open the group piles stand back as a shelf of placards under the ledge
  rather than sliding to the edges — the arch has no room to shrink into and the shelf keeps
  every pile one click away; the status piles keep the front because TB3 drops onto them.
  A tick in the corner or shift-click extends the selection while the pile stays laid out;
  a plain click chooses (with whatever is ticked) and the rest recombine — transforms only,
  sixty in motion, the rest fading, skipped under reduced motion — before the selection
  stands on the stage at L size with name, status, price and deck beneath. *Back to ‹pile›*
  reopens the layout; Escape or a click on the mat is the table at rest. Right-click opens
  the list's row menu; long-press on a phone waits for TB3 with *Move to…*, and the phone's
  page strip sits above the grid (and again below when there is more than one page) rather
  than pinned, which TB4 can revisit. The recombine's home is the open pile's own element
  (its slot, its shelf placard, or the ledge).
- **TB3 — drag to a pile.** The drop-target contract on every pile, previews through the
  existing receipt, ghosts becoming orders or copies, the phone's Move to… menu. Journeys:
  move a card Bench → Physical deck and back through the tabletop and read the same counts
  on the list; drop a ghost on Ordered and see it on the Orders tab.
  *Shipped 14 September (#191).* `CrankTabletop.accepts(pile, rows)` is the contract, pure and
  held to the live library's rows in the test: an action id (`source:owned`, `source:ordered`,
  `source:watching`, `place`, `standin`, `bench`, `reserve`, `release`, `group`), the words the
  drag's badge and the Move to… menu show, or the reason a pile is not a target. The Cards page
  turns the action into the command the row menu and the ticked-rows bar already send — the
  same `bulk`, `acquireSlots`, `allocate` and `groupLots` — through `C.review` for anything that
  changes a deck or money (question 3 answered: a copy dragged out of a physical deck asks), a
  plain save for filing into a group. Ghosts: a To buy requirement or a draft-list row dropped
  on Ordered or the Bench becomes a copy filed with its deck, as *Set status* does; the deck-legal
  catalogue ghosts of §1 are still not drawn (question 1 stands: a deck first, and that is TB4
  or later). A suggestion or a planned group entry is never a copy here; its row menu sets its
  status. The drag is pointer events (mouse, pen, finger) on the stage's fan with an eight-pixel
  slop, a badge with the count and the contract's words, green for a target and red for a
  refusal; the phone's *Move to…* button is on the stage for every screen. The journey drops a
  ghost on Ordered and reads the Ordered and To buy piles rather than the Orders tab: an
  ordered copy without an order record is not an order, so the Orders tab is right not to
  list it until one is placed.
- **TB4 — polish.** Card size memory per device, pile order preference, keyboard model
  (arrow keys between piles, Enter opens, Space selects), print of a laid-out pile.
  *Shipped 14 September (#192).* The card size lives in `localStorage` (a fact about the
  screen, not the library); the status piles' order — workflow or fullest first — is a
  library preference beside the grouping; the arrows walk a row of piles (ledge, group piles
  or their shelf, status piles) and step between rows, and in a laid-out pile walk the cards
  with Home, End, PageUp and PageDown, Space ticking and Enter choosing; *Print* puts the whole
  pile on paper as a numbered list with type, mana value, status, price, deck and copies
  (`printSheet`, pure). The plan is complete. Still open after TB4, in the order they would
  matter: the deck-legal catalogue ghosts of §1 (question 1: a deck first); long-press on a
  phone for the row menu (*Move to…* covers the move); the phone's page strip pinned rather
  than repeated; and folding the sheet's *Group rows by* and the tabletop's groupings into one
  module (§4).

Sizing at the pace of Phases A–C: TB0 with the data-model work, TB1 two sessions, TB2 two,
TB3 two, TB4 one.

## 6. Open questions for Rob

1. Should a deck be *required* before ghosts for legal-but-unowned cards appear (the whole
   legal catalogue is 31,830 cards; with a deck it is a few thousand)? **Recommended: yes,
   ghosts only with a deck selected; without one, only ordered ghosts.**
2. Is the Bench rail the bench in the model's sense (owned, in no deck) or "everything not in
   a physical deck"? **Recommended: the model's Bench, so the rail agrees with the Bench
   count everywhere else.**
3. Drag a card *out of* Physical deck onto Bench: does that ask, since it changes what a deck
   can play? **Recommended: yes, through the same receipt the fly-out shows.**
