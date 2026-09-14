# The Table as a play space — plan and critical assessment

*Written 14 September 2026 at `main` = `235a85b`, from Rob's brief of the same day. Plan only:
nothing here is built yet. Read §1 and §2 before the execution plan — the critique changes
several of the instructions, and each change is argued rather than assumed.*

---

## 1. The one thing that makes it a play space

A physical table has a property this app does not: **picking a card up does not change what it
is.** You slide a card out of a pile, hold it, put it in a think-pile, change your mind, put it
back. Nothing was written down. Status becomes real only when you finally sleeve the card into
the deck box or write it on the buy list.

Today's Tabletop is the opposite. Every drop is a model command with a review dialog, applied
at once. That is why it reads as data entry wearing a card-shaped skin rather than as play.

So the Confirm button in Rob's brief is not one feature among twelve. It is *the* feature, and
everything else — the middle zone, the think piles, the restore arrows, the neutral cards —
follows from it:

> **The table is a sandbox over the library. Moves are proposals. Confirm makes them facts.**

Adopting that sentence answers most of the ambiguities below consistently, and it is the single
change that most serves the stated intent. Every recommendation in §2 is derived from it.

**A second finding, from Rob's own closing paragraph.** He lists what he is trying to produce:
(1) the reserved hundred, (2) the buy list, (3) substitutes and what replaces them, (4) the
physical deck, (5) watched cards for later, (6) what he ordered while working. Those are, in
order, six of the seven statuses the model already has, and they are already what the status
band along the bottom shows in "workflow order". **His process is the status band.** That is
worth saying because it settles the duplication question in §2.11 and tells us the band is
right and should not be redesigned — only re-roled.

---

## 2. Critical assessment, and the decisions it produced

*Revised 14 September with Rob's answers. Items marked **Decided** carry his call; §6 is the
summary table if you want it in one place.*

Each item states the instruction, what goes wrong if taken literally, and the recommendation.

### 2.1 "All statuses except owned are cleared" is undefined for most rows

**The instruction.** A card dropped in the middle has "all statuses except for owned status"
cleared.

**The problem.** "Status" is not a field. It is derived (`statusOf`) from three facts: the
copy's `source` (`owned` · `ordered` · `watching`), its `allocation` (which deck and slot
reserve it), and its `location` (bench, or a deck's box). And five different row kinds reach
the table:

| Row | What it is | "Clear all but owned" would mean |
|---|---|---|
| owned lot | a real copy you hold | release its reservation, take it out of the box → a Bench copy. **Sound.** |
| ordered lot | a copy in flight | demote to owned — **claims a card arrived that has not.** Never. |
| To buy need | a deck slot with nothing filling it; not a copy | release the slot — **changes the deck's list**, which is not what "lift a card" should do |
| Suggestion / Planned / Draft row | a line on a list; not a copy | nothing to clear |

**Recommendation.** The middle is a **holding area, not a mutation**. Dropping a card there
records only *lifted from <where it was>* and renders it neutral — no status pill, because it
is in your hand. Nothing in the library changes. This is both the physical truth and the safe
one, and it makes the per-card restore arrow trivial: put it back where it came from.

### 2.2 Watched has to cover a card you own — and the mechanism is already there, unnamed

**Rob's question, 14 September.** *"If the card is owned and in the middle, what category
indicates I'm considering a card I own for the deck but haven't yet chosen to move it into the
physical 100? We need that category or a definition of a category, like Watched expanded to
include owned."*

**The gap is real.** Reserved is the nearest thing, but a reservation attaches a copy to a
*slot*, so the deck's list has to name the card already — and a card you are merely considering
is precisely one the list does not name yet. Meanwhile `source: 'watching'` means *you hold no
copy*, so it cannot describe a card you own. Between them there is no way to say "I own this and
I am thinking about it for this deck."

**But the app already has the mechanism, without a name for it.** Every deck owns a collection
group, and `readiness()` already counts a deck's watched cards as three things: its non-main
slots (options and upgrades), the planned entries in its group, and the `watching` copies filed
in that group. *Filed in this deck's group* is therefore already how the app says "this card
belongs to this deck's world without being in its hundred."

**So the category is a definition, not a new field:**

> **Watched** — a card you are considering for a deck: filed in that deck's collection group,
> reserving nothing and moving nothing. You may own a copy or you may not.

Two small changes give it effect, with no schema change and no migration:

1. `statusOf` returns **Watched** for an owned copy that is on the Bench and filed in a deck's
   group. Reserved, Substitute and Physical deck still win — those are commitments, and this is
   deliberately not one.
2. `readiness().watched` counts those owned copies as well, beside the planned entries and the
   watching copies it counts today.

**What it costs on the day it ships: nothing.** In the live library 260 owned Bench rows (568
copies) sit in no deck group at all, so not one card changes status. The category starts empty
and fills only as he uses it. It also sharpens Bench, which becomes *owned, reserved by no deck
and shortlisted for none* — genuinely spare cards.

**And it settles the middle.** An owned card left in the middle at Confirm becomes **Watched for
the deck the table is calibrating**: filed in its group, still on the Bench, still owned,
reserving nothing. That replaces the Bench-plus-a-group-entry workaround this plan carried
before, which was a way around the missing category rather than the category itself.

### 2.3 The trays mean Reserved — and confirming one edits the deck's list

**Decided:** "Wanted" is **Reserved**.

**The consequence to be clear about.** A reservation needs a seat: `allocate()` refuses unless
the deck's list has an unfulfilled slot for that card. While he is *building* the hundred, most
tray cards will be ones the list does not name yet. So confirming a tray does two things, not
one:

> add the card to the deck's main list, then reserve your copy for that seat.

That is the right reading of "calibrate a deck visually" — the table is where the list gets built
— but the receipt has to say it, because it changes the deck and not only the copy:

> *Adds 4 cards to D1's list and reserves your copies. D1's list goes from 98 to 102 — two over
> a hundred.*

The scoreboard carries the same ceiling: past 100 the count reads **101 of 100** in amber, and
`M.legality` names the breach in the receipt. A tray is a proposal like everything else on the
table, so going over while thinking is fine; confirming over is the thing that gets flagged.

### 2.4 Navigation: arrows under the stack, one click to lay out, a back arrow at every level

**Decided**, and it replaces what this plan proposed (moving the two-up view onto the card):

- **Left and right arrows sit directly under the draw pile's picture** and step through the stack
  one card at a time. Flipping is an explicit control, not a click on the picture.
- **A single click on any pile** opens its tabular presentation — the laid-out rows and columns
  the table already has.
- **Every level carries a back arrow in its top right corner**: the laid-out pile back to the
  board, the single card back to its pile (shipped in #206).
- **No double click anywhere.**

This is better than the proposal it replaces. A click keeps one meaning everywhere on the table,
the gesture conflict disappears instead of being arbitrated, and the flip becomes a control a
finger can find rather than a gesture to discover.

### 2.5 The sides grow by the number of columns they need

**Confirmed by Rob**, and reading the brief as a fixed 3 × 3 was my error: the sides were always
meant to grow with the number of piles. The numbers below are why it matters that they grow
rather than standing at three.

**The arithmetic.** A pile with its placard is about 104px wide with gaps; three
columns is ~312px, two sides ~624px. The middle must hold a draw pile (~140px) plus up to four
trays (~440px) plus margins. At 1400px the middle gets ~700px and only just fits; at 1250px it
stops fitting; on a laptop at 1152px it is unusable. Meanwhile the common groupings produce
5–8 piles, so three columns a side would stand mostly empty on the default view.

**How it works.** Columns **grow on demand**: one column per side until the count needs more,
capped by what the width allows, filling in Rob's order (left column 1, right column 1, left
column 2, right column 2 …). Below about 1100px the sides collapse to a single scrolling shelf
across the top and the whole rest of the canvas becomes the play space. Below 760px (the
phone) the play space is not offered at all and the table keeps today's arrangement — dragging
cards between three zones with a thumb is not a thing worth building.

Keep the 16-pile cap with the existing "folded" tail pile rather than 24 empty spots.

### 2.6 One sandbox, three lenses, never out of step

**Decided:** *moves are staged, facts are immediate.*

- **Staged** — anything that moves a card between the destinations, on any lens: a drop, a Status
  fly-out, a batch-bar status change, a tray, the middle.
- **Immediate** — field edits: price, paid, notes, box label, print details. A price correction
  waiting on a Confirm would be friction with no upside, and it would put two meanings behind one
  button.

**And a sharpening from Rob that decides the architecture:** *"I want to avoid List, Sheet and
Table not always being in agreement with each other; never independently manipulated out of sync
with one another. We're, after all, always talking about the same cards and decks, just different
lenses, states and positioning."*

So the sandbox is **one object owned by the app, not one per view**. Concretely:

- it lives on the app shell (`C.sandbox`), beside the state and the catalog, not inside the
  tabletop module;
- **every lens reads the library through it**. One function — the projection with the pending
  moves laid over it — and List, Sheet and Table all call it. Nothing is allowed to read the raw
  projection while a sitting is open, which is what makes divergence impossible rather than
  merely unlikely;
- the pending bar is the same bar in the same place on all three: *N moves pending · Review and
  confirm · Discard*;
- switching lens mid-sitting changes nothing but the drawing. The Table, the Sheet and the List
  are three ways of looking at one pending truth.

### 2.7 The sitting survives a reload, and still never touches the library

**Decided:** it persists.

The two requirements pull against each other — survive a reload, never half-apply to the library
— so they are met separately:

- the sitting is **a list of intended moves**, never applied to the library until Confirm (§2.8);
- it is written to **`localStorage`**, not to the library's store, so a crash, a reload or a
  closed tab can never leave the library partly changed. The same place card size and the Bench
  fold already live;
- it is stamped with **the library revision it was staged against**. On load, if the library has
  moved on — another tab confirmed something, a backup was restored — every staged move is
  re-validated and the ones that no longer apply are dropped, with a line naming them. Silent
  loss is the thing to avoid, not loss;
- a **Discard** is always one click away, and leaving the page with moves pending warns first.

The honest cost: a sitting is per device and per browser, because `localStorage` is. That matches
how the rest of the app already treats per-device facts, and a sitting is a working session
rather than a record.

### 2.8 Confirm has to re-validate, and it is one undo

**The problem.** Between staging and Confirm the model's guards may refuse a move: the deck has
no matching unfulfilled requirement, the deck is not finalized, the quantity is no longer
available. Staging cannot assume they will still pass.

**Recommendation.** Check `accepts()` at drop time for the immediate red/green feel, then at
Confirm run the whole batch through the model on a copy and show **one receipt** with the full
effect — the review dialog the app already has, once instead of forty times. Moves that would
fail are listed by name with the reason, and he chooses to drop those or cancel. The receipt
says out loud that Undo takes **all** the moves back together.

This also removes forty dialogs from the current flow, which is a simplification in its own
right.

### 2.9 The draw pile must not render hundreds of cards

**Recommendation.** Draw the top six faces plus a count; flipping moves an index. A stack of
300 is a number, not 300 absolutely-positioned pictures.

### 2.10 Backgrounds: generate them, do not fetch them

**The problem.** The page's content policy admits no external images, and shipping someone
else's table art — or Wizards' card frames, mana symbols or artwork as decoration — is a
licensing problem, not a design one.

**Recommendation.** Four canvases, drawn in CSS and inline SVG, no files, no network:

| Canvas | What it is |
|---|---|
| **Slate** | today's mat, kept as the default |
| **Green felt** | card-table baize: a woven weave at 3px, a vignette, a warm rail |
| **Celestial** | deep indigo, a slow star field, a faint ecliptic band |
| **Parchment** | warm paper with a soft grain, for reading at a desk |

The "MtG themed" request is best served by the app's own five-colour palette used abstractly —
a quiet WUBRG rosette watermark — rather than anything from the game's art. Whatever the canvas,
the three zones keep their own opaque surfaces, so the cards' contrast never depends on which
background is chosen.

### 2.11 The duplication he named, and the duplication he did not

**His observation.** "The status columns and the group piles by columns are all too duplicative
of each other."

**The answer.** They are not two lists of the same thing. They are **sources** and
**destinations**. What makes them read as duplicates is that they are drawn identically, in two
rows of look-alike piles. Fix it structurally rather than by deleting either:

```
┌──────────────────────────────────────────────────────────────┐
│ SOURCE SHELVES          THE PLAY SPACE          SOURCE SHELVES│
│ (group piles by …)    draw pile · trays …     (group piles by)│
├──────────────────────────────────────────────────────────────┤
│ DESTINATIONS — Physical deck · Substitute · Reserved ·        │
│                Ordered · Watched · To buy                     │
└──────────────────────────────────────────────────────────────┘
```

Sides, middle and band get three different surfaces, so their roles are legible before a word
is read. That is the brief's own instruction, and it is the right one.

**The duplication he did not name.** Four of the eleven statuses — Draft list, Suggestion,
Planned, Unassigned — are *readings of a plan*, not places a card can be. They are already
demoted to chips, and they should stop being pile-shaped entirely: they belong as **filters on
the source shelves** ("show me the suggestions"), not as things on the table. That removes four
look-alike objects from the canvas and is the cleanest answer to the complaint.

### 2.12 The model fact his workflow needs and does not have

**His step 3.** "The necessary temp substitutes (and tag which card they'll get replaced by
when that card comes in)."

**The gap.** Nothing records it. The Change List (`crankmagic-change.js`) *infers* the pairing —
the option slot that names the seat, then the same primary type, then the nearest mana value —
because there is nothing stored to read.

**Recommendation.** Add `standInFor` (the slot id) to a substitute lot, set when a card is
dropped into a deck as a substitute while that deck has an unfilled seat, and shown on the card.
The Change List then reads the recorded pairing and falls back to inference only where none was
recorded. Small model change, and it turns a guess into a fact.

### 2.13 "Lock Pile Placement" unchecked implies stored positions

**Recommendation.** Unlocked means free placement with positions **remembered per grouping, per
device** (the same localStorage treatment card size and the Bench fold already get) — positions
are per grouping so changing the grouping does not drop piles on each other. A *Tidy up* button
returns everything to the grid. Locked stays the default.

### 2.14 Four things worth adding that the brief does not ask for

Each is cheap and each serves "as though one were physically doing it":

1. **Step back** (⌘Z / Ctrl-Z) inside the sandbox. The per-card restore arrow is good; a general
   undo of the last move is what a hand does naturally.
2. **The sitting survives a detour.** Go to Discover to check a card, come back, the table is as
   you left it — in memory, for the session.
3. **A live scoreboard.** The whole point is to reach a hundred: *Reserved 96 of 100 ·
   Substitutes 4 · To buy 4 · $28 to finish*, updating as cards move, from the same
   `M.readiness` the deck page reads — but computed on the sandbox, so it shows where he will
   be if he confirms.
4. **Pick up several.** Dragging one card at a time through a hundred is the slow part; a
   selection should move as a unit, which the code already supports for selection.

### 2.15 The table has two modes, and they want different destinations

**Rob, 14 September:** *"There are 2 use cases with the table; 1) calibrate a deck visually
(requires a deck be selected), and 2) play with the bench and unreserved ordered and unreserved
other cards in the MtG Commander legal universe; sorting into piles I may want to then save as a
defined group in library (independent of any deck)."*

These are not one screen with a filter on it. They differ in what the destinations *are*, so the
bottom band changes with the mode and everything else stays put.

| | **Deck mode** | **Shelf mode** |
|---|---|---|
| Entered by | picking a deck (`#cards?view=tabletop&deck=…`) | no deck picked |
| Source shelves | that deck's cards, plus the whole Bench (shipped in #206) | the Bench, unreserved ordered copies, and anything searched in from the Commander-legal catalog |
| Destinations along the bottom | the six statuses: Physical deck · Substitute · Reserved · Ordered · Watched · To buy | **collection groups** — the groups that exist, plus *New group…* |
| The trays mean | Reserved for that deck (§2.3) | members of a group you are assembling |
| A card left in the middle at Confirm | Watched for that deck (§2.2) | nothing — it goes back where it came from, because there is no deck to consider it for |
| The scoreboard reads | Reserved *n* of 100 · Substitutes · To buy · $ to finish | the size of each group you are filling |

**The one thing shelf mode needs that does not exist.** "The MtG Commander legal universe" is
31,830 printings. It cannot be dealt onto a table. Shelf mode therefore needs a way to **bring
cards in**: the table's existing search and filters, run against the catalog rather than the
library, with the matches arriving as a source pile. Without that, shelf mode is only the Bench,
which is a useful half but not what was asked for. It is the single largest unbuilt piece in
this plan and it belongs in its own PR.

**What stays identical between the modes:** the three zones, the canvas, the draw pile, the
trays, the arrows and back arrows, the sandbox, and Confirm. Only the band at the bottom and the
words in the receipt change. That is the test of whether the design is right — one table, two
jobs, no second implementation.

---

## 3. Speed is the requirement; motion is a choice

*Rob, 14 September: "fast loading, light animations and other visualizations will mean most on
this lens as compared to any other page in this app, as we're going for an experience that
results in a pragmatic outcome." And, clarifying: "animations and other visuals aren't required,
just something to consider as you critique."*

So this section separates the two. **Speed is a requirement** and it changes an architectural
decision. **Motion and extra visualizations are optional**, and nothing in the execution plan
depends on them: the board is fully usable with every transition turned off, which is also
exactly what a reader with reduced-motion preferences gets.

### 3.1 The render has to stop rebuilding the table — for speed, not for looks

Today `mount()` writes the whole mat with one `innerHTML` on every draw. For a view where a card
moves every few seconds that is the wrong shape, and the costs are all practical ones:

- every node is destroyed and recreated, so **focus and scroll position are lost** on each move
- **images are re-decoded**, which is the visible stutter
- the work grows with the size of the table rather than the size of the change

**The play space renders once and thereafter mutates**: a move changes one card's class and
position and the count on two piles. This is the biggest decision in PR 1, it cannot be
retrofitted cheaply, and it is worth doing for responsiveness alone. That it also makes motion
possible later is a bonus, not the reason.

It is also the second argument for the sandbox (§2.7): a staged move is an array push and a
style change. Committing through the model would mean a command, a re-projection and a full
redraw for every card picked up — the thing that makes the table feel heavy today.

### 3.2 The board at rest is about twenty pictures, not a thousand

The library holds a thousand records. The board at rest shows one face per source pile (up to
16), the top of the draw pile, and one per tray — roughly twenty images. Laying a pile out is the
only place a page of pictures loads, and it already pages.

- Piles keep Scryfall's `small` print (146×204); only the two-up view and a card on the stage take
  `normal`.
- A face that has not loaded shows its name in its frame rather than a gap — already how `no-art`
  works — so nothing pops in late.
- The draw pile draws its top six and a count (§2.9); a stack of three hundred is a number.

### 3.3 The budget, in numbers

| Moment | Budget | How it is held |
|---|---|---|
| Board painted after the model is in hand | **under 150 ms** | one build, ~20 images, no per-card model calls |
| Dragging | **60 fps** | position the dragged card with `transform` only |
| A card dropped | **under 16 ms of main thread** | an array push and a class change; no model apply, no reprojection |
| Laying out a pile | **under 250 ms to first row** | the existing pager; rows past the first page are not built |
| Confirm | it may take its time | one batch, one receipt; a spinner is honest here |

One rule holds most of this: nothing touches `top`, `left`, `width` or `height` during an
interaction. Those force layout; `transform` and `opacity` do not.

### 3.4 What counts as feedback, and what counts as decoration

A line worth drawing, because only one side of it is needed.

**Feedback — build it, because without it drag-and-drop is guesswork:** the dragged card follows
the cursor; the pile under it shows whether it will accept the card (the green and red rings the
drop contract already provides); a card that has been lifted looks lifted; a refused drop says
why. None of this is animation — it is state you can see.

**Decoration — optional, and only if it stays inside §3.3:** cards that ease into place rather
than jumping, the draw pile's top card sliding off on a flip, a settling rotation. If it is ever
built, the discipline is: nothing over 250 ms, `transform` and `opacity` only, at most 60 things
moving at once (the recombine animation already holds that line), nothing animated on first paint
because the board at rest is what a glance should read, and `prefers-reduced-motion` turns all of
it into instant state changes.

My recommendation is to ship PRs 1–3 with feedback only and no transitions at all, then decide
with the real table in front of you whether a 180 ms ease on a moving card makes it feel better
or just slower. That judgment is much easier to make against something working than in advance.

### 3.5 The one visualization that earns its place

**A live scoreboard on the sandbox**, because it is what makes the outcome pragmatic. As cards
move it reads

> Reserved **96** of 100 · Substitutes 4 · To buy 4 · **$28** to finish

from the same `M.readiness` the deck page uses, but computed on the sandbox — so it says where he
will be *if he confirms*, not where he is. It needs no animation whatsoever: they are numbers that
change, beside the readiness bar he already knows.

That closes the loop the brief describes. The purpose of the sitting is to reach a hundred, and
the table should say how close he is without his leaving it. A compact mana-curve strip beside it
is worth considering in PR 3 *after* the scoreboard is proven — it would let the distribution
check he describes doing on the deck page happen while the cards are still in his hands — but it
is the first thing to cut if the middle is tight.

Nothing else on the table should draw attention to itself. A table where several things move at
once is a toy; a table where only the card you are touching changes is an instrument.

---

## 4. What gets built, in order

Six pull requests. Each is merged green before the next starts, and each is usable on its own.

### PR 1 — The board

The layout and the surfaces, with no behaviour change to the model.

- Three zones with three surfaces: source shelves left and right, the play space in the middle,
  the destination band along the bottom (§2.11).
- Group piles in columns, growing on demand in Rob's fill order, adaptive to width (§2.5); the
  readings become filters rather than chips (§2.11).
- **Choose canvas**: Slate · Green felt · Celestial · Parchment, generated (§2.10), remembered
  per device.
- **Lock pile placement** beside the status-order select; unlocked gives free placement with
  remembered positions and a *Tidy up* (§2.13).
- Glossary definitions on hover for every *Group piles by* label and every status name, with the
  missing terms written (the glossary is `data/commander-glossary.json`; Card type, Colour,
  Primary Purpose, Role, Mechanic, Mana value and Price band need entries).
- **The render change of §3.1**: the board is built once and thereafter mutated. It belongs here
  because it is what makes the table respond at the speed of a hand, and retrofitting it later
  means rewriting PR 3.
- Checks: the geometry suite at six widths; a new `tests/crankmagic-tabletop.mjs` block for the
  column fill order and the adaptive column count, which is pure arithmetic; a walk that asserts
  the board paints inside the budget of §3.3 and that a drop mutates the board rather than
  rebuilding it.

### PR 2 — The sandbox

The mechanism, with the existing interactions moved onto it. This is the piece the rest needs.

- A pending-move list in memory: `{id, rowId, from, to, action, at}`, applied to a copy of the
  projection for display (§2.7).
- The bar on Table, Sheet and List: *N moves pending · Review and confirm · Discard* (§2.6).
- Confirm builds one batch, re-validates through the model on a copy, shows one receipt naming
  what will change and what it refuses, and applies as a single undoable revision (§2.8).
- **The sitting persists** in `localStorage`, stamped with its revision and re-validated on load,
  dropping what no longer applies and naming it (§2.7).
- **One overlay every lens reads through**, so List, Sheet and Table cannot diverge (§2.6).
- Step back inside the sandbox; a warning when leaving the page with moves pending (§2.14).
- Checks: a new pure module `crankmagic-sandbox.js` with a Node suite — staging never mutates,
  the same move twice is idempotent, a refused move is reported and not applied, Confirm's batch
  equals the moves in order. Journeys: stage three moves, leave and come back, discard; stage
  three, confirm, one undo takes them all back.

### PR 3 — The play space

- The draw pile in the middle: neutral cards, the top six drawn plus a count, click to flip
  (§2.1, §2.4, §2.9).
- Left and right arrows under the draw pile; one click lays a pile out; a back arrow top right at
  every level (§2.4).
- The per-card restore arrow and **Restore all** in the top right (§2.1).
- Trays: a 1–4 counter with left/right arrows, card outlines, drag between trays, the draw pile
  and any destination (§2.3).
- The live scoreboard on the sandbox (§2.14).
- **Watched, expanded**: `statusOf` returns Watched for an owned Bench copy filed in a deck's
  group, and `readiness().watched` counts it (§2.2). The model change is small enough to ride
  here because the middle's Confirm depends on it.
- Checks: model suite for the Watched definition (it changes nothing in the live library today);
  journeys for lift → neutral → restore; lift → confirm → Watched for the deck; tray → confirm →
  the card joins the list and the copy is reserved, with the receipt naming both.

### PR 4 — Shelf mode

The table's second job (§2.15): no deck picked, collection groups along the bottom, the trays as
group buckets. Its one hard part is bringing cards in from the catalog rather than the library —
decide first whether that is a search box on the table or a *Send to the table* from Discover
(§6, still open 1), because it changes what this PR is.

### PR 5 — The substitute's partner

- `standInFor` on the lot, set on the drop, shown on the card, read by the Change List (§2.12).
- Checks: the model suite; the Change List suite reads the recorded pairing in preference to the
  inferred one.

### PR 6 — The sweep

- The tour gains the play space; the README and the help entry describe it; the page-budget and
  geometry numbers are re-recorded with reasons; `docs/crankmagic-tabletop-plan.md` is updated
  so one document describes the table.

---

## 5. What I would not build, and why

- **A Confirm over field edits** (price, paid, notes). Two meanings behind one button, friction
  with no upside (§2.6).
- **24 fixed pile spots.** The common groupings make 5–8 piles; three columns a side would stand
  empty and cost the middle the room it needs (§2.5).
- **An eleventh status called Wanted.** Reserved already is it, and a synonym is the duplication
  the brief objects to (§2.3).
- **The play space on a phone.** Three zones and drag-and-drop do not survive 390px; the phone
  keeps today's table (§2.5).
- **Fetched or licensed background art.** Generated canvases instead (§2.10).

---

## 6. Decided, 14 September — and what is still open

Rob answered the open questions and revised three of the recommendations. Everything in this
table is settled; the sections named carry the reasoning.

| Question | Decided | Where |
|---|---|---|
| What holds a card in the middle? | It **holds**, it does not mutate. Nothing changes until Confirm | §2.1 |
| What category is "I own this and I'm considering it for this deck"? | **Watched, expanded to cover owned copies** — defined as *filed in that deck's collection group*, which the app already counts and had never named. No new field, and nothing in the live library changes status on the day it ships | §2.2 |
| What do the trays tag? | **Reserved** — and confirming one **adds the card to the deck's list** as well as reserving the copy, which the receipt must say | §2.3 |
| How do the gestures work? | **Arrows under the draw pile** step through it; **one click on a pile** lays it out; **a back arrow top right at every level**; no double click anywhere | §2.4 |
| How wide are the sides? | They **grow by the number of columns needed** — always the instruction; reading it as a fixed 3 × 3 was my error | §2.5 |
| What is staged? | **Moves are staged, facts are immediate** — and the sandbox is **one object all three lenses read through**, so List, Sheet and Table can never be manipulated out of sync | §2.6 |
| Does a sitting survive a reload? | **Yes.** Persisted in `localStorage`, never in the library, stamped with the revision it was staged against and re-validated on load | §2.7 |
| Is Confirm per deck or per table? | **Per table** | §2.8 |
| How many jobs does the table have? | **Two**: calibrate a deck (a deck is picked) and sort the shelf into groups (no deck) | §2.15 |
| Do animations matter? | Optional. **Speed is the requirement**; feedback is built, decoration is judged later against the real table | §3 |

### Still open, and worth deciding before PR 3

1. **How cards are searched into shelf mode.** §2.15 names the gap: the Commander-legal catalog
   cannot be dealt onto a table, so shelf mode needs a way to bring matches in. Is that the
   table's existing search box pointed at the catalog, or the Discover graph's selection sent
   over ("take these twelve to the table")? The second fits the workflow he describes — Lab, then
   the tracer, then the table — and costs a button rather than a search UI.
2. **What happens to a sitting when the library changes underneath it.** The plan re-validates
   and drops what no longer applies, naming it. The alternative is to refuse to load the sitting
   at all and keep it for inspection. The first is friendlier; the second never surprises.
3. **Whether the deck's list may grow past 100 on the table.** The plan allows it while thinking
   and flags it at Confirm (§2.3). The stricter alternative refuses the 101st tray card outright.
   Allowing it matches a physical table, where you can hold more than a hundred cards while you
   decide which to put down.
