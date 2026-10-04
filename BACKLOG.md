# Backlog — bigger changes, for Rob to weigh

Everything here came out of one question: *sitting at the table with the cards in front of
me, does this app get the right hundred into the box and keep it there?* The small answers
are already shipped. These are the ones that change how something works rather than what it
says, so they wait for a decision.

Ordered by how much they'd change a build night, not by effort.

---

## 1 · Autosave to a file you can see

**The gap.** Everything lives in this browser's localStorage until you press Export. Clear
site data, switch browsers, or hand the tablet to someone who tidies up, and an evening of
ticked boxes is gone. Export is a manual habit, and habits fail on exactly the night you
were concentrating on the cards.

**What it would take.** The File System Access API lets the page hold a handle to a real
file and write to it on every change — pick `mtg-state.json` once, and from then on the file
IS the state. Chrome and Edge support it; Safari and Firefox do not, so the Export button
stays as the fallback rather than being replaced.

**Why it is not minor.** It changes where the truth lives. Today the file is a snapshot of
the app; afterwards the app is a view of the file, and Load Active, Import and Reset all have
to mean something coherent against a file that is being written continuously.

*Shipped in the meantime:* a one-shot undo for a load, and a header chip saying how long ago
you last exported.

---

## 2 · ~~"Three cards you own could fill this slot"~~ — shipped

**Built.** Open a slot that still needs a card and it now names up to three cards you already
own that would do that slot's job, ranked, with the reasoning shown. Pressing one files it as
a Manual pick on that slot.

**How it decides.** `Slot.slotFit` scores a candidate on three things, in the order they
matter: type (a Creature slot wants a creature), what the card is FOR, and cost. The role
tests are lifted from `sim-engine.js` and pinned against it across all 1,761 cards, so
"this is removal" means the same thing in the slot as in the simulation. Color identity is
a gate rather than a score — an out-of-identity card is not a worse fit, it is illegal.

**Two things keep it quiet.** It only appears on a slot whose card you would still have to
buy, or an empty one; a slot holding a card in your hand does not want alternatives. And a
slot whose own card has a role only offers cards that share it, which is the difference
between six useful suggestions and fifty-nine readings of "also a creature".

**Still open.** It ranks against the loose pool only. It does not consider what removing a
card would do to the deck's curve or its color sources — see item 5.

---

## 3 · ~~A pull sheet for building at the table~~ — shipped

**Built.** `#pull?deck=` (Deck page → Pull sheet, Shop → Deck assembly): the deck's reserved
copies grouped by where they sit, a tick per row that commits the placement, *Mark all found
in box*, print and export. See `crankmagic-pull.js`.

**The gap.** The Deck page is organized by the deck's structure — slots grouped by the job
each one does. Physically pulling a hundred cards is a different task: you want them ordered
the way they are actually sitting, so building is a walk through your boxes rather than
eighty-five separate searches.

**What it would take.** A print-and-tick view grouped by where each card lives — this deck's
box, another deck's box, the bench, still to buy — then by set or color inside that. It
would also want a "found it" tick that syncs back, so the walk itself records progress.

**Why it is not minor.** It is a new view with its own layout, print styles and a second way
of ticking cards that has to agree with the first.

---

## 4 · Copies as things, not counts

**The gap.** Ownership is a number per card name: four Sol Rings. Which four, what condition,
whether one is foil, which physical box each is in, whether one is lent out — none of that
can be said. The copy allocation added recently hands copies to decks in a fixed order, which
is right arithmetic and silent about which actual card is where.

**Why it matters here.** With 80 of each basic and a growing pile of duplicates, "I own four"
stops being the useful fact and "the foil one is in deck 3" starts being it.

**Why it is not minor.** Every count in the app — the tally, the Shop's need figures, the
bench, the allocation — reads a number today. Making copies real means every one of those
reads a list instead.

---

## 5 · Curve and role coverage in the readiness strip

**The gap.** The strip now answers *is it legal* and *can it cast itself*. It does not answer
*is it a functioning deck* — enough ramp, enough draw, enough interaction, a curve that is
not all fives.

**What exists already.** `sim-engine.js` classifies every card into those roles, and
`tests/lineup-compliance.mjs` already asserts role floors against them. The numbers are
computed; nothing shows them.

**Why it is not minor.** sim-engine is a Node-only module of eleven hundred lines. Getting
role classification into the page means either shipping it to the browser or maintaining a
second copy — and this session already shows what a second copy costs: the mana rules had to
be pinned card-for-card against the engine to stop them drifting.

---

## 6 · ~~What changed since I last sleeved this deck~~ — shipped as the pull sheet's third group

**Built.** The pull sheet's *Remove from this box* group lists every owned copy physically
in the deck's box that the list no longer reserves, with *To bench* per row; the model's
`readiness.remove` is the count. No snapshot is needed: the box location and the reservation
are both recorded, and the diff between them is the answer.

**The gap.** Re-sleeving after a rung change means comparing a hundred cards against a
hundred cards by eye. The app knows both lists and could simply say: pull these four, add
these four.

**Why it is not minor.** It needs a remembered "as sleeved" snapshot per deck, taken at a
moment you choose, plus somewhere sensible to show a diff. That is new state with its own
lifecycle — when is it taken, when is it stale, what happens when a card leaves the
collection.

## 7 · A user profile page

**Asked for.** Rob, 2026-09-28: "We also need a user profile page, but this will be built later; backlog for now."

**What it would hold.** The signed-in account (name, address, sign out), the theme (today in Settings ›
Appearance; `docs/plan-appearance.md`), and whatever else follows the person rather than the device. Settings
keeps the device's own choices (card size, reduce motion).

**Why it waits.** The four themes land first, in Settings, and move or are linked here when the page exists.

---

## 8 · Delete and add cards in the Library

**Asked for.** Rob, 2026-10-04: "I should be able to delete cards ... I should also be able to 'Add Card' ... Add both of
these as backlog items we will take up later."

**Delete.** In Library, check one card's row, or every card's, and press **Delete**, which sits beside **Offer for
Sell/Trade**. The cards are gone from the profile at once, whatever they were: in a deck, reserved, owned, ordered.

**Add Card.** A pop-up with a search bar and a results window: search by all or part of a card's name, and pick the one
meant from the results. Right under the search bar, **Upload list** slides a panel out of the pop-up's side. Paste a list
in the format a new commander deck takes ("1 Azorius Signet") and press Save. The panel then shows how each line was
read, the card it became, and asks Rob to confirm any it is unsure of. The list, or the one card picked from the search,
then comes back to the pop-up to be given:
- a status;
- a group (Bench, unless another is picked);
- a deck, if it goes in one (it need not);

and Save adds them.

**Where it goes.** The bar that appears when rows are ticked (`crankmagic-collection.js`, beside its `batch-offer`
button).

**To settle when it is built.**
- Whether a delete wants an undo, given "immediately deleted".
- What a deck shows for a card deleted out of it: the hole it leaves.
- Whether Upload list reads lines exactly as the new-deck import does. It should: one reader, one set of rules.

---

## 9 · A deck's commander, changed -- and Build from Deck's error in production

**Asked for.** Rob, 2026-10-04: "the build from Deck selection when creating a new deck throws an error in prod. And we
should have a way of changing the commander on a deck ... Add both of these as backlog items we will take up later."

**The error.** Creating a new deck from **Build from Deck** throws an error on production. It is not reproduced yet. When
this is taken up, it comes first: reproduce it on crankmagic.com or staging, then fix it under a test that fails
without the fix.

**Changing the commander.** On a deck, remove the commander and leave the seat empty, or pick a new one. When the new
commander's color identity is not the old one's, a card outside it can no longer be in the deck (CR 903.4, 903.5c). The
deck screen then:
- shows how many such cards it holds;
- makes removing and replacing them the next recommended action.

In the Library, filtered to that commander, each such card's row has a faint, transparent red fill and a red outline.

**Why it waits.** Rob is taking it up later. The production error is the part not to leave long.
