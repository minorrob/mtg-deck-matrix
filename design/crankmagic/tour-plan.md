# The guided tour: seven journeys, one engine

## What this is

A **Take a tour** button beside Send Feedback. Pressing it opens a chooser — not a list of
screens, a list of *things you might be trying to do*. You pick the job you came for and the
tour walks you through it, spotlighting real controls on the real page with your real data.

Every tour ends on a **"You now have…"** card that says what the journey actually got you.
That card is the point of the whole feature: a tour that ends with "that's the end of the
tour" has taught you where the buttons are; one that ends with "you now have a 100-card list,
a measured score you can compare, and a buy list priced at today's cheapest paper printing"
has taught you what the app is *for*.

## The engine

Ported from `app.js` (the legacy `matrix.html` viewer), which already solved this properly.
Four things in that implementation are hard-won and are carried over verbatim in intent:

1. **Find and measure in the same breath.** The original positioned once inside a double
   `requestAnimationFrame`, which is right for a rendered view and wrong for one still
   arriving. The retry decision is made on the *measurement*, not on the find — a target that
   vanishes between attempts simply fails that attempt, and the next picks up whatever
   replaced it. Without this the hand-off steps spotlight a "Loading…" box that is gone by
   the time it is measured, and every rect on a detached element is zero.
2. **Scope selectors to the step's own view first.** `querySelector` returns the first match
   in document order, so once two views both had a `.cm-empty` a step in one spotlighted the
   other's hidden copy and drew a 1px box.
3. **Record which selector won** on the layer as `data-tour-hit`. A tour pointing at the
   wrong thing is otherwise undebuggable from outside: the only symptom is a box in the wrong
   place, and every explanation for that looks equally plausible.
4. **Acts**: a step may open the thing it is about to describe. Deck Lab's sections and the
   Collection's filter panel are collapsed by default — correct for reading, wrong for a tour.

Two things are new, because this app is not that one:

- **The chooser.** The legacy tour started from whatever tab you were on. Here you pick a
  job, and the tour navigates across views on your behalf.
- **A precondition step.** Four of the seven tours describe work on a deck you have. Someone
  who takes "Understand how a deck performs" with an empty library gets a tour of an empty
  state. Each such tour opens by saying what is missing and pointing at the control that
  fixes it, then carries on — the legacy `TOUR_EMPTY_FIRST` idea, generalised.

## The chooser

Seven cards, ordered by where a new user actually starts. Each names the job, not the screen,
and carries the one-line promise of what they will have at the end.

| # | Tour | The job | Ends with |
|---|------|---------|-----------|
| 1 | **Build a deck from scratch** | I have a commander in mind, or none, and want a 100-card list | A saved deck, its 99 chosen and priced |
| 2 | **Refine a deck with the simulator** | I have a list; make it better and tell me how much better | A measured score, a report, and swaps the engine proved |
| 3 | **Find cards you didn't know about** | Show me what actually works with my commander | Cards added to a deck that you found by relationship, not by search |
| 4 | **Organize what you own** | Get my collection into the app and into groups | A library the app knows, grouped, with every card assigned |
| 5 | **Read a deck's performance** | Is this deck good, and good at what? | A read on power, speed and consistency, and what to change |
| 6 | **Buy what a deck still needs** | Turn a list into cards in a box | A priced buy list, and a way to shop it at a booth |
| 7 | **Move your library between devices** | Back it up, take it to a convention, bring the changes home | A backup file, an Excel export, and a phone and desktop that agree |

## The seven journeys, screen by screen

Notation: **view** · `selector` · *act*. Copy is the real copy, not a placeholder.

---

### 1 · Build a deck from scratch → **Deck Lab**

*Precondition: none. This is the tour for an empty library.*

| Step | View · anchor | Says |
|---|---|---|
| 1 | decks · `[data-action=open-lab]` | Every deck starts here. The Lab takes a commander and builds the other 99 around it — or takes a list you already have and works from that. |
| 2 | lab · `.cm-lab-start` | One question first, and it changes everything below it: are you starting from a commander, or from cards you already have? |
| 3 | lab · `#cm-lab-commander` *(open)* | Search or enter a commander from among the 3,400+ legal ones. Filters here only choose the commander — they do not constrain the 99. |
| 4 | lab · `#cm-lab-results` | Matches, ordered by how often people actually play them. **Inspect** shows the card and what it wants to do before you commit. |
| 5 | lab · `#cm-lab-definition` *(open)* | This is where you say what kind of deck you want: a price cap, a bracket, how fast, how mean. The draft obeys the caps and treats the rest as direction. |
| 6 | lab · `#cm-lab-run-pane` | Five steps, in order. Exactly one button is blue — it is the one to press next. A step you cannot take yet says what it is waiting for. |
| 7 | lab · `#cm-lab-run` | Press 1. The Lab picks 99 cards, fetches their real text, and shows you the list. Nothing is saved yet — you can throw it away. |
| 8 | lab · `#cm-lab-save` | Only this writes to My Decks. Nothing has been bought, owned or reserved; a deck is a plan until you say otherwise. |
| — | **You now have** | A commander, 99 cards chosen for it, and a saved plan with a price on it. Nothing has left your wallet, and the list is yours to edit. |

---

### 2 · Refine a deck with the simulator → **Deck Lab**

*Precondition: a draft or a saved deck. Otherwise step 0 points at `[data-action=open-lab]`.*

| Step | View · anchor | Says |
|---|---|---|
| 1 | lab · `#cm-step-2` | Refining is measured, not guessed. It plays the deck, drops what it could never cast, and keeps a swap only when a fresh measurement says the score went up. |
| 2 | lab · `[data-action=lab-refine]` | One pass: a few dozen swaps screened on the quick protocol. Fast enough to try, small enough that it is not the number you publish. |
| 3 | lab · `[data-action=lab-loop]` | Or let it run until a whole round finds nothing better. This is the one to leave going while you make coffee. |
| 4 | lab · `[data-action=lab-measure]` | The publishable run: six seeds, 20,000 games each. This is the only score comparable with another deck's. |
| 5 | lab · `#cm-lab-sim-status` | Change a card and the published score is dropped with it. A score is a claim about an exact list — it never outlives the list it measured. |
| 6 | lab · `#cm-step-4` | The report names what it could **not** see, above the score, not below it: a win the engine cannot model is disclosed before you read a number that ignores it. |
| — | **You now have** | A score you can put beside another deck's, a list of swaps that each earned their place, and an honest note about what the engine cannot watch. |

---

### 3 · Find cards you didn't know about → **Discover**

| Step | View · anchor | Says |
|---|---|---|
| 1 | discover · `#cm-graph-query` | Start from a card you already play. Every Commander-legal card is in here, including printings under a different name. |
| 2 | discover · `#cm-graph` | Lines are relationships, not similarity: this **triggers** that, that **multiplies** this. It is why the graph finds cards a search never would. |
| 3 | discover · `#cm-depth` | Depth is how far from your card to look. One step is the obvious partners; two or three is where the deck you had not thought of lives. |
| 4 | discover · `#cm-facet-summary` *(open)* | Narrow by role, colour, type or mechanic — so "what goes with my commander" becomes "what goes with my commander *and* costs under three". |
| 5 | discover · `#cm-card-view` | Click a card to read it, see what it connects to, and add it straight to a deck or your collection from here. |
| 6 | discover · `[data-action=add-card]` | Adding from Discover puts it where you say: a deck's plan, a group, or your wish list. |
| — | **You now have** | Cards in your deck that you found by how they interact, not by remembering them — and the reason each one is in there. |

---

### 4 · Organize what you own → **Collection**

| Step | View · anchor | Says |
|---|---|---|
| 1 | collection · `[data-action=import-list]` | Start by telling the app what you own. Paste a list, upload a CSV or a spreadsheet, or type names — it resolves them to real cards. |
| 2 | collection · `#cm-roster-table` | One row per card, with what it is, what it costs and where it lives. Click a row to see the card. |
| 3 | collection · `[data-action=roster-filters]` *(open)* | Filter by anything in the table, and group by deck, source, type, colour or allocation. Grouping is how you find the eleven copies of the same land. |
| 4 | collection · `[data-action=new-group]` | A group is a box of cards that is not yet a deck: a precon you took apart, a trade binder, the pile you bought at a convention. |
| 5 | collection · `[data-action=roster-columns]` | Choose what the table shows. What you pick here is what an export carries. |
| 6 | collection · `[data-action=add-card]` | Add one card at a time when you buy it — including cards you do not own yet, marked as wanted. |
| — | **You now have** | Every card you own known to the app, grouped the way you actually store them, and each one either assigned to a deck or explicitly on the bench. |

---

### 5 · Read a deck's performance → **My Decks**

*Precondition: at least one deck. Otherwise step 0 points at `[data-action=new-deck]`.*

| Step | View · anchor | Says |
|---|---|---|
| 1 | decks · `.cm-deck-grid` | Every deck you have, with its score and what it still needs. |
| 2 | decks · `.cm-deck-hero` | Open one. The header is the summary: what it plays, what it costs, how it measured. |
| 3 | decks · *score block* | The score is points on a fixed protocol — six seeds of 20,000 games against sampled opponents. It is comparable only with another score from the same protocol. |
| 4 | decks · *report link* | The report breaks it down: how often you win, how fast, how much you cast, and the turn the games ended. |
| 5 | decks · *per-card rows* | Per-card cast rates are where the actionable part lives. A card cast in 2% of games is a card to replace. |
| 6 | decks · `[data-action=compare-decks]` | Compare two decks side by side — but only when both carry the same protocol. The app will say so if they do not. |
| — | **You now have** | A read on whether the deck is good, at what, and against what — plus the specific cards to change and the evidence for each. |

---

### 6 · Buy what a deck still needs → **Shop**

*Precondition: a deck with cards you do not own. Otherwise step 0 points at `[data-action=open-lab]`.*

| Step | View · anchor | Says |
|---|---|---|
| 1 | shop · `#cm-roster-table` | Everything your decks need and you do not have, priced at the cheapest paper printing the app could find. |
| 2 | shop · `[data-action=shop-mode]` | Switch between the acquisition list — what to buy — and deck assembly, which is what to pull off the shelf once it arrives. |
| 3 | shop · `[data-action=roster-filters]` | Filter to one deck, one colour, one price band. At a booth you want "the red cards under five dollars", not the whole list. |
| 4 | shop · *a Buy button* | **Buy** marks it owned and assigns it. On a phone this is the whole interface: name, colour, type, rarity, price, Buy. |
| 5 | shop · `[data-action=export-view]` | Export exactly what you are looking at — filters, grouping and columns — as a list you can print or take to a shop. |
| 6 | shop · `.cm-user-menu` | Or e-mail it to yourself, which is how the list gets from your desktop into your pocket. |
| — | **You now have** | A priced list of exactly what is missing, filtered to what you are shopping for today, and one tap per card to mark it bought. |

---

### 7 · Move your library between devices → **User Functions**

The one the user described most fully, and the one with a genuinely non-obvious payload:
a round trip. Desktop → phone → convention → phone → desktop, without losing what changed.

| Step | View · anchor | Says |
|---|---|---|
| 1 | any · `#cm-user-functions` *(open)* | Everything about your data lives in one menu: back it up, restore it, export it, and move it between machines. |
| 2 | menu · `[data-action=backup]` | A backup is one file holding your whole library — decks, collection, groups, prices, every status. Saved in this browser only; the file is the copy that outlives it. |
| 3 | menu · `[data-action=share-export]` | E-mail that file to yourself. This is the desktop→phone leg: open the mail on the phone and restore from the attachment. |
| 4 | menu · `[data-action=restore]` | Restoring replaces this device's library with the file's. Do this on the phone before you leave for the convention. |
| 5 | shop · *the compact Shop* | At the booth you mark cards bought on the phone. Those changes live in the phone's browser and nowhere else until you move them. |
| 6 | menu · `[data-action=share-export]` | Same button, other direction. Export from the phone, mail it home, restore on the desktop — the statuses you set at the booth land back on the machine you build on. |
| 7 | menu · `[data-action=export-excel]` | Excel is the other kind of export: your library plus everything the app worked out about it — real prices, colours, types, what each card is for. Cards in, metadata out. |
| 8 | menu · `[data-action=mirror]` | Or point it at a file once and it keeps that file current, so the backup is never something you forgot to do. |
| — | **You now have** | A backup you can restore anywhere, a spreadsheet of your collection enriched with everything the app knows, and a phone and desktop that can hand work back and forth without either forgetting what the other did. |

---

## The "You now have" card

Not a step with a spotlight — a centred card with no target, the same shape the engine already
draws when a step has nothing solid to point at. Title is the tour's name, body is the
sentence above, and the two buttons are **Done** and **Take another tour** (back to the
chooser). Progress reads *"Build a deck · finish"* rather than a step count, because it is not
one of the steps.

## Files

- `crankmagic-tour.js` — new. The engine, the chooser, and `TOURS`. Registers as a
  `CrankFeatures` module like every other view module, so it gets `C` and can call `C.go`.
- `crankmagic.css` — the layer, spotlight, popover and chooser grid.
- `index.html` / `crankmagic.html` — the **Take a tour** button beside Send Feedback, and the
  tour layer element.
- `tests/tour.mjs` — new. Holds the content honest: every tour has at least four steps and a
  finish card; every step names a view the app actually registers; every selector is a
  syntactically valid one; no tour promises a "You now have" it does not carry.

## What the test cannot check, and what does instead

A test can prove every selector *parses*. It cannot prove one *matches* — that needs the app
running with data. `tests/uat/journeys.mjs` already drives a real browser, so the tour's
"does it point at anything" check belongs there: open each tour, walk every step, and assert
`data-tour-hit` is never `none`. That is the check that would have caught all four of the
legacy bugs the comments above describe.
