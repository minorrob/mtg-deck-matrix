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

## 2. Critical assessment: where the brief needs a decision

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

### 2.2 "Tag them watched to the deck they were in" cannot be literal for a copy you own

**The problem.** Watched is `source === 'watching'` — a card you are considering and do not
own. Applying it to an owned copy would erase the fact that you own it.

**Recommendation.** Decide the outcome by what the card is, and say so in the Confirm receipt:

| Left in the middle at Confirm | Becomes |
|---|---|
| an owned copy | goes to the **Bench**, and a **Watched entry is filed in that deck's collection group**, so the consideration is remembered without lying about ownership |
| a To buy need, a Suggestion, a Planned line | **Watched** for that deck — which is exactly what Watched means |
| an ordered copy | **unchanged**, with a line in the receipt: an order in flight is not something the table can put back |

"The deck they were in" is the deck the card was lifted from; if it was lifted from the Bench,
the deck the table is scoped to; if neither, it simply returns to the Bench.

### 2.3 "Wanted" is not a status in this app

**The problem.** The brief tags the think-pile cards "wanted". The model's statuses are
Physical deck, Substitute, Reserved, Bench, Ordered, Watched, To buy, Draft list, Suggestion,
Planned, Unassigned. There is no Wanted.

**Recommendation.** Rob's own step 1 is "the target (reserved) 100 cards", so **wanted =
Reserved**. Name the think piles something physical — **trays** — and let their outcome be
Reserved for the scoped deck. Inventing an eleventh status for the same idea is exactly the
duplication he is complaining about.

### 2.4 Single click and double click on the same pile cannot both work

**The instruction.** Clicking a pile flips to the next card; double-clicking any pile opens the
side-by-side card view. Today a single click lays a pile out.

**The problem.** A double click always fires a single click first. Resolving it with a delay
makes every click feel broken, which is the opposite of play.

**Recommendation.** Put the two gestures on different objects, following the physical metaphor:

- **single click a pile** → lay it out (today's behaviour; it is what a person does)
- **double click a card** → the two-up card view (you pick a card up to look at it closely)
- **single click the draw pile in the middle** → flip to the next card, because that is what a
  stack of cards does, and the draw pile has nothing to lay out

No gesture then has two meanings.

### 2.5 Three columns a side eats the table

**The instruction.** 3 columns × 3 rows each side, up to 4 rows, max 24 piles.

**The problem, in numbers.** A pile with its placard is about 104px wide with gaps; three
columns is ~312px, two sides ~624px. The middle must hold a draw pile (~140px) plus up to four
trays (~440px) plus margins. At 1400px the middle gets ~700px and only just fits; at 1250px it
stops fitting; on a laptop at 1152px it is unusable. Meanwhile the common groupings produce
5–8 piles, so three columns a side would stand mostly empty on the default view.

**Recommendation.** Columns **grow on demand**: one column per side until the count needs more,
capped by what the width allows, filling in Rob's order (left column 1, right column 1, left
column 2, right column 2 …). Below about 1100px the sides collapse to a single scrolling shelf
across the top and the whole rest of the canvas becomes the play space. Below 760px (the
phone) the play space is not offered at all and the table keeps today's arrangement — dragging
cards between three zones with a thumb is not a thing worth building.

Keep the 16-pile cap with the existing "folded" tail pile rather than 24 empty spots.

### 2.6 Staging across Table, Sheet and List is three different problems

**The instruction.** "No moves lock in while on the table, sheet or list view until pressed."

**The problem.** The Table's drops are moves. The Sheet's cells and the List's inline fields
are *edits* — a price, a paid amount, a box label, a quantity. Making a price correction wait
for a Confirm is friction with no upside, and it puts two different meanings behind one button.

**Recommendation.** One rule, easy to say: **moves are staged, facts are immediate.**

- **Staged** (the sandbox): anything that moves a card between the seven destinations, on any
  of the three views — a drop, a Status fly-out, a batch-bar status change.
- **Immediate**: field edits — price, paid, notes, box label, print details.

One bar, on all three views: *N moves pending · Review and confirm · Discard*. It is the same
bar in the same place whichever view he is in, so the sandbox is one idea, not three.

### 2.7 Never write the sandbox to the library

**The problem.** "Edit the data entries for each card for the user, until after they press
Confirm" could be read as writing and then undoing. That would pollute the audit trail, fight
the cross-tab revision check, and leave a half-applied library if the tab dies.

**Recommendation.** The sandbox is **an in-memory list of intended commands**, applied to a
*copy* of the projection for display only. Consequences to accept deliberately:

- a reload loses the sitting and the library is untouched — the safe failure
- a second tab shows the real library, because it is the real library
- leaving the page with pending moves warns first
- Discard is always available and always instant

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

Five pull requests. Each is merged green before the next starts, and each is usable on its own.

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
- Step back inside the sandbox; a warning when leaving the page with moves pending (§2.14).
- Checks: a new pure module `crankmagic-sandbox.js` with a Node suite — staging never mutates,
  the same move twice is idempotent, a refused move is reported and not applied, Confirm's batch
  equals the moves in order. Journeys: stage three moves, leave and come back, discard; stage
  three, confirm, one undo takes them all back.

### PR 3 — The play space

- The draw pile in the middle: neutral cards, the top six drawn plus a count, click to flip
  (§2.1, §2.4, §2.9).
- The per-card restore arrow and **Restore all** in the top right (§2.1).
- Trays: a 1–4 counter with left/right arrows, card outlines, drag between trays, the draw pile
  and any destination (§2.3).
- Double click a card for the two-up view (§2.4).
- The live scoreboard on the sandbox (§2.14).
- Checks: journeys for lift → neutral → restore; lift → confirm → Bench plus a watched entry;
  tray → confirm → Reserved.

### PR 4 — The substitute's partner

- `standInFor` on the lot, set on the drop, shown on the card, read by the Change List (§2.12).
- Checks: the model suite; the Change List suite reads the recorded pairing in preference to the
  inferred one.

### PR 5 — The sweep

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

## 6. Two questions only Rob can answer

1. **Does a sitting survive a reload?** The recommendation is no — in memory, so a crash can
   never leave the library half-changed. If he wants a sitting to survive the browser closing,
   that is a persisted draft and a bigger piece: it needs its own store, its own migration, and
   an answer for what happens when the library changes underneath it.
2. **Is Confirm per deck or per table?** If he works one deck at a time, the receipt is simple
   and the scoreboard means something. If one sitting can move cards for three decks, the
   receipt has to be grouped by deck and the scoreboard needs a deck picker. The plan above
   assumes **per table, grouped by deck in the receipt**, which costs nothing now and keeps both
   doors open.
